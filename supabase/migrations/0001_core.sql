-- Dial: core schema, row-level security and server rules.
-- Target: Supabase (Postgres 15+). All Ink, levels and matches are decided here,
-- never on the client. Clients call the rpc functions at the bottom of each section.

create schema if not exists app;

-- ---------------------------------------------------------------------------
-- Economy settings (admin-configurable; the app never hard-codes awards)
-- ---------------------------------------------------------------------------
create table public.economy (
  key   text primary key,
  value integer not null
);

insert into public.economy (key, value) values
  ('ink_profile_complete', 100),
  ('ink_intro_video', 50),
  ('ink_extra_video', 25),
  ('ink_opener_replied', 10),
  ('opener_daily_cap', 3),
  ('ink_level_2', 10),
  ('ink_level_3', 20),
  ('ink_level_4', 30),
  ('ink_level_5', 40),
  ('ink_voice_exchange', 15),
  ('conversation_weekly_cap', 300),
  ('ink_date_confirmed', 200),
  ('ink_date_mutual_positive', 50),
  ('rewarded_dates_per_week', 2),
  ('open_conversation_slots', 8),
  ('rating_min_raters', 5),
  ('max_photos', 10),
  ('max_videos', 3);

create or replace function app.econ(p_key text) returns integer
language sql stable security definer set search_path = public as $$
  select value from public.economy where key = p_key
$$;

-- ---------------------------------------------------------------------------
-- Profiles
-- ---------------------------------------------------------------------------
create table public.profiles (
  id              uuid primary key references auth.users (id) on delete cascade,
  first_name      text not null check (char_length(first_name) between 1 and 40),
  birth_date      date not null check (birth_date <= (current_date - interval '18 years')),
  gender          text not null,
  interested_in   text[] not null default '{}',
  orientation     text,                      -- special category data: explicit consent recorded in consents
  city            text,
  lat_coarse      numeric(5,2),              -- rounded to ~1 km before it is ever stored
  lng_coarse      numeric(5,2),
  occupation      text,
  bio             text check (char_length(bio) <= 500),
  intentions      text,
  interests       text[] not null default '{}',
  traits          jsonb not null default '{}'::jsonb,   -- assessment results, 0..1 per trait
  age_min         integer not null default 18 check (age_min >= 18),
  age_max         integer not null default 99,
  max_distance_km integer not null default 50,
  onboarded       boolean not null default false,
  paused_until    date,
  created_at      timestamptz not null default now()
);

create table public.consents (
  member     uuid not null references public.profiles (id) on delete cascade,
  kind       text not null check (kind in ('orientation','ai_coach','ai_coach_content','leaderboards','feedback_use','read_receipts')),
  granted    boolean not null,
  updated_at timestamptz not null default now(),
  primary key (member, kind)
);

create table public.blocks (
  blocker    uuid not null references public.profiles (id) on delete cascade,
  blocked    uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker, blocked)
);

create table public.reports (
  id         uuid primary key default gen_random_uuid(),
  reporter   uuid not null references public.profiles (id) on delete cascade,
  reported   uuid not null references public.profiles (id) on delete cascade,
  reason     text not null,
  detail     text,
  status     text not null default 'open' check (status in ('open','reviewing','upheld','dismissed')),
  created_at timestamptz not null default now()
);

create or replace function app.is_blocked(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.blocks
                 where (blocker = a and blocked = b) or (blocker = b and blocked = a))
$$;

-- ---------------------------------------------------------------------------
-- Media and the power gauge (each photo or video is rated 0..100)
-- ---------------------------------------------------------------------------
create table public.media (
  id           uuid primary key default gen_random_uuid(),
  owner        uuid not null references public.profiles (id) on delete cascade,
  kind         text not null check (kind in ('photo','video')),
  video_role   text check (video_role in ('intro','personality','lifestyle')),
  storage_path text not null,
  caption      text check (char_length(caption) <= 140),
  position     integer not null default 0,
  moderation   text not null default 'pending' check (moderation in ('pending','approved','rejected')),
  created_at   timestamptz not null default now(),
  check ((kind = 'video') = (video_role is not null))
);
create unique index media_one_video_per_role on public.media (owner, video_role) where kind = 'video';

create or replace function app.media_limits() returns trigger
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  select count(*) into n from public.media where owner = new.owner and kind = new.kind;
  if new.kind = 'photo' and n >= app.econ('max_photos') then
    raise exception 'photo_limit_reached';
  elsif new.kind = 'video' and n >= app.econ('max_videos') then
    raise exception 'video_limit_reached';
  end if;
  return new;
end $$;
create trigger media_limits before insert on public.media
  for each row execute function app.media_limits();

create table public.media_ratings (
  media_id   uuid not null references public.media (id) on delete cascade,
  rater      uuid not null references public.profiles (id) on delete cascade,
  score      integer not null check (score between 0 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (media_id, rater)
);

-- One rating per person per item; re-rating overwrites. You cannot rate yourself.
create or replace function public.rate_media(p_media uuid, p_score integer) returns void
language plpgsql security definer set search_path = public as $$
declare v_owner uuid; v_mod text; me uuid := auth.uid();
begin
  if me is null then raise exception 'not_authenticated'; end if;
  if p_score is null or p_score < 0 or p_score > 100 then raise exception 'score_out_of_range'; end if;
  select owner, moderation into v_owner, v_mod from public.media where id = p_media;
  if v_owner is null then raise exception 'media_not_found'; end if;
  if v_owner = me then raise exception 'cannot_rate_own_media'; end if;
  if v_mod <> 'approved' then raise exception 'media_not_available'; end if;
  if app.is_blocked(me, v_owner) then raise exception 'media_not_available'; end if;
  insert into public.media_ratings (media_id, rater, score) values (p_media, me, p_score)
  on conflict (media_id, rater) do update set score = excluded.score, updated_at = now();
end $$;

-- The owner sees only an average, and only once enough different people have rated.
create or replace function public.my_media_stats()
returns table (media_id uuid, raters integer, average_score numeric)
language sql stable security definer set search_path = public as $$
  select m.id,
         count(r.rater)::integer,
         case when count(r.rater) >= app.econ('rating_min_raters')
              then round(avg(r.score), 1) end
  from public.media m
  left join public.media_ratings r on r.media_id = m.id
  where m.owner = auth.uid()
  group by m.id
$$;

-- Presentation score (0..100) for the scoring engine: mean of per-item averages
-- that have reached the minimum number of raters. Null until there is enough data.
create or replace function app.presentation_score(p_member uuid) returns numeric
language sql stable security definer set search_path = public as $$
  select round(avg(item_avg), 1) from (
    select avg(r.score) as item_avg
    from public.media m join public.media_ratings r on r.media_id = m.id
    where m.owner = p_member
    group by m.id
    having count(*) >= app.econ('rating_min_raters')
  ) s
$$;

-- ---------------------------------------------------------------------------
-- Ink ledger (append-only)
-- ---------------------------------------------------------------------------
create table public.ink_ledger (
  id         bigint generated always as identity primary key,
  member     uuid not null references public.profiles (id) on delete cascade,
  amount     integer not null,
  reason     text not null,
  ref        text not null,          -- dedupe key: the event this award belongs to
  created_at timestamptz not null default now(),
  unique (member, reason, ref)
);
create index ink_ledger_member_time on public.ink_ledger (member, created_at);

create or replace function app.award(p_member uuid, p_amount integer, p_reason text, p_ref text) returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if p_amount is null or p_amount = 0 then return 0; end if;
  insert into public.ink_ledger (member, amount, reason, ref)
  values (p_member, p_amount, p_reason, p_ref)
  on conflict (member, reason, ref) do nothing;
  get diagnostics n = row_count;
  return case when n = 1 then p_amount else 0 end;
end $$;

-- Conversation awards share one weekly cap per member.
create or replace function app.award_conversation(p_member uuid, p_amount integer, p_reason text, p_ref text) returns integer
language plpgsql security definer set search_path = public as $$
declare used integer; remaining integer;
begin
  select coalesce(sum(amount), 0) into used from public.ink_ledger
  where member = p_member and reason like 'conv_%' and created_at >= date_trunc('week', now());
  remaining := greatest(app.econ('conversation_weekly_cap') - used, 0);
  return app.award(p_member, least(p_amount, remaining), p_reason, p_ref);
end $$;

create or replace function app.chapter_for(p_ink integer) returns integer
language sql immutable as $$
  select case when p_ink >= 20000 then 7 when p_ink >= 12000 then 6 when p_ink >= 7000 then 5
              when p_ink >= 3500 then 4 when p_ink >= 1500 then 3 when p_ink >= 500 then 2 else 1 end
$$;

create or replace function public.my_progress()
returns table (ink integer, chapter integer, ink_this_week integer)
language sql stable security definer set search_path = public as $$
  select coalesce(sum(amount), 0)::integer,
         app.chapter_for(coalesce(sum(amount), 0)::integer),
         coalesce(sum(amount) filter (where created_at >= date_trunc('week', now())), 0)::integer
  from public.ink_ledger where member = auth.uid()
$$;

-- ---------------------------------------------------------------------------
-- Likes, matches and open conversation slots
-- ---------------------------------------------------------------------------
create table public.likes (
  id         uuid primary key default gen_random_uuid(),
  from_user  uuid not null references public.profiles (id) on delete cascade,
  to_user    uuid not null references public.profiles (id) on delete cascade,
  media_id   uuid references public.media (id) on delete set null,
  comment    text check (char_length(comment) <= 300),
  created_at timestamptz not null default now(),
  unique (from_user, to_user),
  check (from_user <> to_user)
);

create table public.matches (
  id         uuid primary key default gen_random_uuid(),
  user_a     uuid not null references public.profiles (id) on delete cascade,
  user_b     uuid not null references public.profiles (id) on delete cascade,
  status     text not null default 'open' check (status in ('queued','open','closed','archived')),
  level      integer not null default 0 check (level between 0 and 5),
  closed_by  uuid,
  close_note text,
  voice_exchange_paid boolean not null default false,
  created_at timestamptz not null default now(),
  opened_at  timestamptz,
  unique (user_a, user_b),
  check (user_a < user_b)
);

create or replace function app.open_slots_used(p_member uuid) returns integer
language sql stable security definer set search_path = public as $$
  select count(*)::integer from public.matches
  where status = 'open' and (user_a = p_member or user_b = p_member)
$$;

create or replace function app.promote_queued(p_member uuid) returns void
language plpgsql security definer set search_path = public as $$
declare m record;
begin
  for m in select * from public.matches
           where status = 'queued' and (user_a = p_member or user_b = p_member)
           order by created_at loop
    if app.open_slots_used(m.user_a) < app.econ('open_conversation_slots')
       and app.open_slots_used(m.user_b) < app.econ('open_conversation_slots') then
      update public.matches set status = 'open', opened_at = now() where id = m.id;
    end if;
  end loop;
end $$;

-- Like a person through a specific photo or video. Returns the match id if this completes a match.
create or replace function public.like_profile(p_to uuid, p_media uuid default null, p_comment text default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); a uuid; b uuid; v_match uuid; v_status text;
begin
  if me is null then raise exception 'not_authenticated'; end if;
  if p_to = me then raise exception 'cannot_like_self'; end if;
  if app.is_blocked(me, p_to) then raise exception 'profile_not_available'; end if;
  if p_media is not null and not exists (select 1 from public.media where id = p_media and owner = p_to) then
    raise exception 'media_not_on_profile';
  end if;
  insert into public.likes (from_user, to_user, media_id, comment)
  values (me, p_to, p_media, p_comment)
  on conflict (from_user, to_user) do nothing;

  if not exists (select 1 from public.likes where from_user = p_to and to_user = me) then
    return null;
  end if;

  a := least(me, p_to); b := greatest(me, p_to);
  v_status := case when app.open_slots_used(a) < app.econ('open_conversation_slots')
                    and app.open_slots_used(b) < app.econ('open_conversation_slots')
                   then 'open' else 'queued' end;
  insert into public.matches (user_a, user_b, status, opened_at)
  values (a, b, v_status, case when v_status = 'open' then now() end)
  on conflict (user_a, user_b) do nothing
  returning id into v_match;
  if v_match is null then
    select id into v_match from public.matches where user_a = a and user_b = b;
  end if;
  return v_match;
end $$;

-- Close kindly: frees a slot for both people, costs nothing.
create or replace function public.close_match(p_match uuid, p_note text default null) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); m public.matches;
begin
  select * into m from public.matches where id = p_match;
  if m.id is null or me not in (m.user_a, m.user_b) then raise exception 'match_not_found'; end if;
  if m.status not in ('open','queued') then return; end if;
  update public.matches set status = 'closed', closed_by = me, close_note = left(p_note, 200) where id = p_match;
  perform app.promote_queued(m.user_a);
  perform app.promote_queued(m.user_b);
end $$;

-- ---------------------------------------------------------------------------
-- Messages and conversation levels
-- ---------------------------------------------------------------------------
create table public.messages (
  id          bigint generated always as identity primary key,
  match_id    uuid not null references public.matches (id) on delete cascade,
  sender      uuid not null references public.profiles (id) on delete cascade,
  kind        text not null default 'text' check (kind in ('text','voice','image','video')),
  body        text check (char_length(body) <= 4000),
  is_question boolean not null default false,
  created_at  timestamptz not null default now()
);
create index messages_match_time on public.messages (match_id, created_at);

create table public.meet_intents (
  match_id   uuid not null references public.matches (id) on delete cascade,
  member     uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (match_id, member)
);

-- Recalculate the level from signals both people created. Levels only go up.
create or replace function app.recalc_level(p_match uuid) returns integer
language plpgsql security definer set search_path = public as $$
declare
  m public.matches; new_level integer;
  n_a integer; n_b integer; q_a integer; q_b integer; v_a integer; v_b integer;
  days integer; total integer; share numeric; intents integer; lvl integer;
begin
  select * into m from public.matches where id = p_match;
  select count(*) filter (where sender = m.user_a), count(*) filter (where sender = m.user_b),
         count(*) filter (where sender = m.user_a and is_question), count(*) filter (where sender = m.user_b and is_question),
         count(*) filter (where sender = m.user_a and kind = 'voice'), count(*) filter (where sender = m.user_b and kind = 'voice'),
         count(distinct (created_at at time zone 'UTC')::date), count(*)
    into n_a, n_b, q_a, q_b, v_a, v_b, days, total
  from public.messages where match_id = p_match;
  select count(*) into intents from public.meet_intents where match_id = p_match;
  share := case when total > 0 then greatest(n_a, n_b)::numeric / total else 1 end;

  new_level := 0;
  if n_a >= 1 and n_b >= 1 then new_level := 1; end if;
  if new_level = 1 and n_a >= 10 and n_b >= 10 and days >= 2 then new_level := 2; end if;
  if new_level = 2 and days >= 3 and q_a >= 1 and q_b >= 1 and share <= 0.65 then new_level := 3; end if;
  if new_level = 3 and v_a >= 1 and v_b >= 1 then new_level := 4; end if;
  if new_level = 4 and intents >= 2 then new_level := 5; end if;

  if new_level > m.level then
    update public.matches set level = new_level where id = p_match;
    for lvl in (m.level + 1)..new_level loop
      if lvl >= 2 then
        perform app.award_conversation(m.user_a, app.econ('ink_level_' || lvl), 'conv_level_' || lvl, p_match::text);
        perform app.award_conversation(m.user_b, app.econ('ink_level_' || lvl), 'conv_level_' || lvl, p_match::text);
      end if;
    end loop;
  end if;

  if v_a >= 1 and v_b >= 1 and not m.voice_exchange_paid then
    update public.matches set voice_exchange_paid = true where id = p_match;
    perform app.award_conversation(m.user_a, app.econ('ink_voice_exchange'), 'conv_voice_exchange', p_match::text);
    perform app.award_conversation(m.user_b, app.econ('ink_voice_exchange'), 'conv_voice_exchange', p_match::text);
  end if;
  return greatest(new_level, m.level);
end $$;

create or replace function public.send_message(p_match uuid, p_body text, p_kind text default 'text')
returns bigint
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid(); m public.matches; other uuid; v_id bigint;
  mine_before integer; theirs_before integer; opener uuid; openers_today integer;
begin
  select * into m from public.matches where id = p_match;
  if m.id is null or me not in (m.user_a, m.user_b) then raise exception 'match_not_found'; end if;
  if m.status <> 'open' then raise exception 'conversation_not_open'; end if;
  other := case when me = m.user_a then m.user_b else m.user_a end;
  if app.is_blocked(me, other) then raise exception 'conversation_not_open'; end if;
  if p_kind = 'text' and coalesce(btrim(p_body), '') = '' then raise exception 'empty_message'; end if;

  select count(*) filter (where sender = me), count(*) filter (where sender = other)
    into mine_before, theirs_before
  from public.messages where match_id = p_match;

  insert into public.messages (match_id, sender, kind, body, is_question)
  values (p_match, me, p_kind, p_body, p_kind = 'text' and position('?' in coalesce(p_body, '')) > 0)
  returning id into v_id;

  -- First reply: the person who opened earns Ink, at most 3 times a day.
  if mine_before = 0 and theirs_before > 0 then
    opener := other;
    select count(*) into openers_today from public.ink_ledger
    where member = opener and reason = 'conv_opener_replied' and created_at >= date_trunc('day', now());
    if openers_today < app.econ('opener_daily_cap') then
      perform app.award_conversation(opener, app.econ('ink_opener_replied'), 'conv_opener_replied', p_match::text);
    end if;
  end if;

  perform app.recalc_level(p_match);
  return v_id;
end $$;

-- Private double opt-in: neither person learns of the other's tap until both have tapped.
create or replace function public.ready_to_meet(p_match uuid) returns boolean
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); m public.matches; n integer;
begin
  select * into m from public.matches where id = p_match;
  if m.id is null or me not in (m.user_a, m.user_b) then raise exception 'match_not_found'; end if;
  insert into public.meet_intents (match_id, member) values (p_match, me) on conflict do nothing;
  perform app.recalc_level(p_match);
  select count(*) into n from public.meet_intents where match_id = p_match;
  return n >= 2;
end $$;

-- ---------------------------------------------------------------------------
-- Dates: plan, confirm independently, private feedback
-- ---------------------------------------------------------------------------
create table public.date_plans (
  id          uuid primary key default gen_random_uuid(),
  match_id    uuid not null references public.matches (id) on delete cascade,
  proposed_by uuid not null references public.profiles (id) on delete cascade,
  venue       text not null check (char_length(venue) <= 200),
  starts_at   timestamptz not null,
  status      text not null default 'proposed' check (status in ('proposed','accepted','declined','cancelled','confirmed','held_for_review')),
  ink_paid    boolean not null default false,
  created_at  timestamptz not null default now()
);

create table public.date_confirmations (
  plan_id    uuid not null references public.date_plans (id) on delete cascade,
  member     uuid not null references public.profiles (id) on delete cascade,
  happened   boolean not null,
  created_at timestamptz not null default now(),
  primary key (plan_id, member)
);

create table public.date_feedback (
  plan_id         uuid not null references public.date_plans (id) on delete cascade,
  member          uuid not null references public.profiles (id) on delete cascade,
  enjoyed         integer not null check (enjoyed between 1 and 5),
  conversation    integer not null check (conversation between 1 and 5),
  comfortable     integer not null check (comfortable between 1 and 5),
  matched_profile integer not null check (matched_profile between 1 and 5),
  see_again       integer not null check (see_again between 1 and 5),
  felt_unsafe     boolean not null default false,
  created_at      timestamptz not null default now(),
  primary key (plan_id, member)
);

create or replace function public.propose_date(p_match uuid, p_venue text, p_starts_at timestamptz) returns uuid
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); m public.matches; v_id uuid;
begin
  select * into m from public.matches where id = p_match;
  if m.id is null or me not in (m.user_a, m.user_b) or m.status <> 'open' then raise exception 'match_not_found'; end if;
  if p_starts_at <= now() then raise exception 'date_must_be_in_future'; end if;
  insert into public.date_plans (match_id, proposed_by, venue, starts_at)
  values (p_match, me, p_venue, p_starts_at) returning id into v_id;
  return v_id;
end $$;

create or replace function public.respond_to_date(p_plan uuid, p_accept boolean) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); p public.date_plans; m public.matches;
begin
  select * into p from public.date_plans where id = p_plan;
  select * into m from public.matches where id = p.match_id;
  if p.id is null or me not in (m.user_a, m.user_b) then raise exception 'plan_not_found'; end if;
  if me = p.proposed_by then raise exception 'cannot_respond_to_own_plan'; end if;
  if p.status <> 'proposed' then raise exception 'plan_already_answered'; end if;
  update public.date_plans set status = case when p_accept then 'accepted' else 'declined' end where id = p_plan;
end $$;

-- How much of the date award this pair still earns: full, half, then nothing.
create or replace function app.pair_factor(p_match uuid, p_plan uuid) returns numeric
language sql stable security definer set search_path = public as $$
  select case count(*) when 0 then 1.0 when 1 then 0.5 else 0 end
  from public.date_plans where match_id = p_match and ink_paid and id <> p_plan
$$;

create or replace function public.confirm_date(p_plan uuid, p_happened boolean) returns text
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid(); p public.date_plans; m public.matches;
  yes integer; answers integer; factor numeric; amount integer; who uuid; paid_this_week integer;
begin
  select * into p from public.date_plans where id = p_plan;
  select * into m from public.matches where id = p.match_id;
  if p.id is null or me not in (m.user_a, m.user_b) then raise exception 'plan_not_found'; end if;
  if p.status not in ('accepted','confirmed','held_for_review') then raise exception 'plan_not_accepted'; end if;
  if p.starts_at > now() then raise exception 'date_has_not_happened_yet'; end if;
  insert into public.date_confirmations (plan_id, member, happened) values (p_plan, me, p_happened)
  on conflict (plan_id, member) do nothing;

  select count(*) filter (where happened), count(*) into yes, answers
  from public.date_confirmations where plan_id = p_plan;
  if answers < 2 then return 'waiting'; end if;      -- never reveals the other answer
  if yes < 2 then return 'recorded'; end if;
  if p.ink_paid or p.status = 'held_for_review' then return 'recorded'; end if;

  -- Fake-date check: a date within an hour of matching is held for a person to review.
  if p.starts_at < m.created_at + interval '1 hour' then
    update public.date_plans set status = 'held_for_review' where id = p_plan;
    return 'recorded';
  end if;

  factor := app.pair_factor(p.match_id, p_plan);
  amount := round(app.econ('ink_date_confirmed') * factor);
  foreach who in array array[m.user_a, m.user_b] loop
    select count(*) into paid_this_week from public.ink_ledger
    where member = who and reason = 'date_confirmed' and created_at >= date_trunc('week', now());
    if paid_this_week < app.econ('rewarded_dates_per_week') then
      perform app.award(who, amount, 'date_confirmed', p_plan::text);
    end if;
  end loop;
  update public.date_plans set status = 'confirmed', ink_paid = true where id = p_plan;
  return 'recorded';
end $$;

create or replace function public.submit_date_feedback(
  p_plan uuid, p_enjoyed integer, p_conversation integer, p_comfortable integer,
  p_matched_profile integer, p_see_again integer, p_felt_unsafe boolean default false) returns void
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid(); p public.date_plans; m public.matches; other uuid;
  both_positive boolean; factor numeric; v_amount integer;
begin
  select * into p from public.date_plans where id = p_plan;
  select * into m from public.matches where id = p.match_id;
  if p.id is null or me not in (m.user_a, m.user_b) then raise exception 'plan_not_found'; end if;
  if (select count(*) from public.date_confirmations where plan_id = p_plan and happened) < 2 then
    raise exception 'date_not_confirmed';
  end if;
  other := case when me = m.user_a then m.user_b else m.user_a end;
  insert into public.date_feedback (plan_id, member, enjoyed, conversation, comfortable, matched_profile, see_again, felt_unsafe)
  values (p_plan, me, p_enjoyed, p_conversation, p_comfortable, p_matched_profile, p_see_again, coalesce(p_felt_unsafe, false))
  on conflict (plan_id, member) do nothing;

  -- A safety concern is a report for the safety team. It never touches scoring.
  if coalesce(p_felt_unsafe, false) then
    insert into public.reports (reporter, reported, reason, detail)
    values (me, other, 'felt_unsafe_on_date', 'date_plan ' || p_plan::text);
  end if;

  select count(*) = 2 and bool_and(enjoyed >= 4) into both_positive
  from public.date_feedback where plan_id = p_plan;
  if both_positive and p.ink_paid then
    factor := app.pair_factor(p.match_id, p_plan);
    v_amount := round(app.econ('ink_date_mutual_positive') * factor);
    -- only members who were paid for the date itself receive the bonus
    perform app.award(l.member, v_amount, 'date_mutual_positive', p_plan::text)
    from public.ink_ledger l where l.reason = 'date_confirmed' and l.ref = p_plan::text;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Introductions: who a member may see today
-- ---------------------------------------------------------------------------
create or replace function app.distance_km(lat1 numeric, lng1 numeric, lat2 numeric, lng2 numeric) returns numeric
language sql immutable as $$
  select 6371 * 2 * asin(sqrt(
    power(sin(radians((lat2 - lat1)::float8) / 2), 2) +
    cos(radians(lat1::float8)) * cos(radians(lat2::float8)) * power(sin(radians((lng2 - lng1)::float8) / 2), 2)))::numeric
$$;

create or replace function public.get_introductions(p_limit integer default 12)
returns table (id uuid, first_name text, age integer, city text, occupation text, bio text,
               intentions text, interests text[], traits jsonb, distance_band text, shared_interests integer)
language sql stable security definer set search_path = public as $$
  with me as (select * from public.profiles where id = auth.uid())
  select p.id, p.first_name,
         extract(year from age(p.birth_date))::integer,
         p.city, p.occupation, p.bio, p.intentions, p.interests, p.traits,
         case when d.km is null then null when d.km < 2 then 'Under 2 km' when d.km < 5 then 'Under 5 km'
              when d.km < 15 then 'Under 15 km' else 'Within ' || (ceil(d.km / 10) * 10)::integer || ' km' end,
         (select count(*)::integer from unnest(p.interests) i where i = any (me.interests))
  from public.profiles p cross join me
  cross join lateral (select case when p.lat_coarse is null or me.lat_coarse is null then null
                                  else app.distance_km(me.lat_coarse, me.lng_coarse, p.lat_coarse, p.lng_coarse) end as km) d
  where p.id <> me.id and p.onboarded
    and (p.paused_until is null or p.paused_until < current_date)
    and p.gender = any (me.interested_in) and me.gender = any (p.interested_in)
    and extract(year from age(p.birth_date)) between me.age_min and me.age_max
    and extract(year from age(me.birth_date)) between p.age_min and p.age_max
    and (d.km is null or d.km <= least(me.max_distance_km, p.max_distance_km))
    and not app.is_blocked(me.id, p.id)
    and not exists (select 1 from public.likes l where l.from_user = me.id and l.to_user = p.id)
    and not exists (select 1 from public.matches m where m.user_a = least(me.id, p.id) and m.user_b = greatest(me.id, p.id))
  order by (p.intentions is not distinct from me.intentions) desc,
           (select count(*) from unnest(p.interests) i where i = any (me.interests)) desc,
           p.created_at desc
  limit least(greatest(p_limit, 1), 25)
$$;

-- ---------------------------------------------------------------------------
-- Row-level security. Tables with no write policy are written only by the functions above.
-- ---------------------------------------------------------------------------
alter table public.economy            enable row level security;
alter table public.profiles           enable row level security;
alter table public.consents           enable row level security;
alter table public.blocks             enable row level security;
alter table public.reports            enable row level security;
alter table public.media              enable row level security;
alter table public.media_ratings      enable row level security;
alter table public.ink_ledger         enable row level security;
alter table public.likes              enable row level security;
alter table public.matches            enable row level security;
alter table public.messages           enable row level security;
alter table public.meet_intents       enable row level security;
alter table public.date_plans         enable row level security;
alter table public.date_confirmations enable row level security;
alter table public.date_feedback      enable row level security;

create policy economy_read on public.economy for select to authenticated using (true);

create policy profiles_read on public.profiles for select to authenticated
  using (id = auth.uid() or (onboarded and not app.is_blocked(auth.uid(), id)));
create policy profiles_insert on public.profiles for insert to authenticated with check (id = auth.uid());
create policy profiles_update on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy consents_own on public.consents for all to authenticated using (member = auth.uid()) with check (member = auth.uid());

create policy blocks_own on public.blocks for all to authenticated using (blocker = auth.uid()) with check (blocker = auth.uid());

create policy reports_insert on public.reports for insert to authenticated with check (reporter = auth.uid());
create policy reports_read_own on public.reports for select to authenticated using (reporter = auth.uid());

create policy media_read on public.media for select to authenticated
  using (owner = auth.uid() or (moderation = 'approved' and not app.is_blocked(auth.uid(), owner)));
create policy media_insert on public.media for insert to authenticated
  with check (owner = auth.uid() and moderation = 'pending');
create policy media_update on public.media for update to authenticated
  using (owner = auth.uid()) with check (owner = auth.uid());
create policy media_delete on public.media for delete to authenticated using (owner = auth.uid());

-- Members may read back only the ratings they gave. Nobody can read who rated them.
create policy ratings_read_given on public.media_ratings for select to authenticated using (rater = auth.uid());

create policy ink_read_own on public.ink_ledger for select to authenticated using (member = auth.uid());

create policy likes_read on public.likes for select to authenticated using (from_user = auth.uid() or to_user = auth.uid());

create policy matches_read on public.matches for select to authenticated using (auth.uid() in (user_a, user_b));

create policy messages_read on public.messages for select to authenticated
  using (exists (select 1 from public.matches m where m.id = match_id and auth.uid() in (m.user_a, m.user_b)));

create policy meet_intents_read_own on public.meet_intents for select to authenticated using (member = auth.uid());

create policy date_plans_read on public.date_plans for select to authenticated
  using (exists (select 1 from public.matches m where m.id = match_id and auth.uid() in (m.user_a, m.user_b)));

create policy date_confirmations_read_own on public.date_confirmations for select to authenticated using (member = auth.uid());
create policy date_feedback_read_own on public.date_feedback for select to authenticated using (member = auth.uid());

-- Members cannot approve their own media: moderation is changed only by staff tooling.
create or replace function app.protect_moderation() returns trigger
language plpgsql as $$
begin
  if new.moderation is distinct from old.moderation and current_user = 'authenticated' then
    raise exception 'moderation_is_staff_only';
  end if;
  return new;
end $$;
create trigger protect_moderation before update on public.media
  for each row execute function app.protect_moderation();

-- Privileges: clients reach data through RLS and the public rpc functions only.
revoke all on all functions in schema app from public;
grant usage on schema app to authenticated;
grant execute on function app.is_blocked(uuid, uuid) to authenticated;   -- used inside policies
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated;
grant select on all tables in schema public to authenticated;
grant insert, update on public.profiles to authenticated;
grant insert, update, delete on public.consents, public.blocks to authenticated;
grant insert on public.reports to authenticated;
grant insert, update, delete on public.media to authenticated;

-- Realtime for chat and match updates (publication exists on Supabase).
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.messages, public.matches;
  end if;
end $$;

-- Quick Dial: the streamlined Dial. Same members, photos, blocks and moderation as Dial.
--
-- Each person's Quick set is 11 things, all dialled 1-100:
--   Looks:        5 photos
--   Vibe:         1 talking video (their intro video)
--   Personality:  5 short stories (a prompt and an answer of up to 140 characters)
-- Their score from you is weighted 40% looks, 20% vibe, 40% personality, so it's not just about photos.
--
-- Everyone you dial can message you (one message until the other person replies, unless you're
-- dialled in). When you've both scored each other 70+, it's a mutual. If it happens while you're
-- dialling, you hear straight away; the other person hears in tonight's 8pm drop.
--
-- Scores you *receive* are never shown one by one. You see your own Dial as an average over time
-- (once at least 5 people have dialled you). Others can see your Dial only if you allow it, at least
-- 10 people have dialled you, and they're a Quick+ member.

insert into public.economy (key, value) values
  ('quick_threshold', 70),
  ('quick_photos', 5), ('quick_videos', 1), ('quick_stories', 5),
  ('quick_w_looks', 40), ('quick_w_vibe', 20), ('quick_w_personality', 40),
  ('quick_deck_size', 10),
  ('quick_people_per_day', 5),          -- free (simulation: 5 a day lifts members with a mutual in 2 weeks from 45% to 59%)
  ('quick_high_floor', 55),             -- "top of your own range" never counts below this
  ('quick_people_per_day_plus', 10),    -- Quick+ (£5.99 a month): 10 rounds, 100 people to browse
  ('quick_people_per_day_gold', 999),   -- Quick Gold (£14.99 a month): unlimited
  ('quick_own_dial_min_raters', 5),
  ('quick_their_dial_min_raters', 10),
  ('quick_drop_hour', 20),              -- 8pm UK time
  ('quick_require_verified', 1)
on conflict (key) do nothing;

create or replace function app.qd(k text) returns integer
language sql stable security definer set search_path = public as $$
  select value::integer from public.economy where key = k
$$;

-- ---------------------------------------------------------------------------
-- Verification, visibility and plans
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists verified_at timestamptz,          -- selfie liveness + face match passed
  add column if not exists age_verified_at timestamptz,      -- highly effective age assurance passed
  add column if not exists quick_show_dial boolean not null default true;

-- Members can't mark themselves verified: only the verification webhook (service role) writes these.
create or replace function app.protect_verification() returns trigger language plpgsql as $$
begin
  if current_user = 'authenticated' and (new.verified_at is distinct from old.verified_at or new.age_verified_at is distinct from old.age_verified_at) then
    raise exception 'verification_is_set_by_the_provider';
  end if;
  return new;
end $$;
create trigger protect_verification before update on public.profiles for each row execute function app.protect_verification();

create table public.verifications (
  id          uuid primary key default gen_random_uuid(),
  member      uuid not null references public.profiles (id) on delete cascade,
  provider    text not null,
  reference   text not null unique,              -- the provider's session id
  status      text not null default 'started' check (status in ('started', 'passed', 'failed', 'review')),
  age_over_18 boolean,
  created_at  timestamptz not null default now(),
  decided_at  timestamptz
);
alter table public.verifications enable row level security;
create policy verifications_own on public.verifications for select to authenticated using (member = auth.uid());

-- AI checks log their verdicts in the moderation audit log with no staff member.
alter table public.mod_actions alter column staff drop not null;

-- Plans. Built now, switched on later: until 'quick_plans_live' is 1, everyone is treated as free.
insert into public.economy (key, value) values ('quick_plans_live', 0) on conflict (key) do nothing;
create table public.subscriptions (
  member      uuid primary key references public.profiles (id) on delete cascade,
  tier        text not null check (tier in ('plus', 'gold')),
  renews_at   timestamptz not null,
  source      text not null check (source in ('app_store', 'play_store', 'stripe', 'comp')),
  updated_at  timestamptz not null default now()
);
alter table public.subscriptions enable row level security;
create policy subscriptions_own on public.subscriptions for select to authenticated using (member = auth.uid());

create or replace function app.quick_tier(m uuid) returns text
language sql stable security definer set search_path = public as $$
  select case when app.qd('quick_plans_live') = 0 then 'free'
              else coalesce((select tier from public.subscriptions where member = m and renews_at > now()), 'free') end
$$;

-- Extra rounds bought one at a time for a given day.
create table public.quick_extra_rounds (
  member     uuid not null references public.profiles (id) on delete cascade,
  day        date not null default current_date,
  rounds     integer not null default 0 check (rounds >= 0),
  primary key (member, day)
);
alter table public.quick_extra_rounds enable row level security;
create policy quick_extra_own on public.quick_extra_rounds for select to authenticated using (member = auth.uid());

-- ---------------------------------------------------------------------------
-- Stories: the personality half of a Quick set
-- ---------------------------------------------------------------------------
create table public.quick_stories (
  id          uuid primary key default gen_random_uuid(),
  owner       uuid not null references public.profiles (id) on delete cascade,
  position    smallint not null check (position between 1 and 5),
  prompt      text not null check (char_length(prompt) between 3 and 80),
  answer      text not null check (char_length(answer) between 2 and 140),
  moderation  text not null default 'pending' check (moderation in ('pending', 'approved', 'rejected')),
  created_at  timestamptz not null default now(),
  unique (owner, position)
);
alter table public.quick_stories enable row level security;
create policy quick_stories_own on public.quick_stories for all to authenticated using (owner = auth.uid()) with check (owner = auth.uid());
grant select, insert, update, delete on public.quick_stories to authenticated;
-- Editing a story sends it back for checking.
create or replace function app.story_recheck() returns trigger language plpgsql as $$
begin
  if current_user = 'authenticated' then new.moderation := 'pending'; end if;
  return new;
end $$;
create trigger story_recheck before insert or update on public.quick_stories for each row execute function app.story_recheck();

-- Someone's Quick set: 5 photos, 1 talking video, 5 stories, all approved, in their order.
create or replace function app.quick_items(p_owner uuid)
returns table (item_id uuid, kind text, pos integer)
language sql stable security definer set search_path = public as $$
  (select id, 'photo', row_number() over (order by position, created_at)::integer
   from public.media where owner = p_owner and kind = 'photo' and moderation = 'approved'
   order by position, created_at limit app.qd('quick_photos'))
  union all
  (select id, 'video', 100 from public.media
   where owner = p_owner and kind = 'video' and video_role = 'intro' and moderation = 'approved' limit app.qd('quick_videos'))
  union all
  (select id, 'story', 200 + position from public.quick_stories
   where owner = p_owner and moderation = 'approved' order by position limit app.qd('quick_stories'))
$$;

create or replace function app.quick_set_size() returns integer
language sql stable as $$ select app.qd('quick_photos') + app.qd('quick_videos') + app.qd('quick_stories') $$;

create or replace function app.quick_ready(p_owner uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select (select count(*) from app.quick_items(p_owner)) = app.quick_set_size()
     and (app.qd('quick_require_verified') = 0 or exists (select 1 from public.profiles where id = p_owner and verified_at is not null and age_verified_at is not null))
$$;

-- ---------------------------------------------------------------------------
-- Photobooth: three quick selfies that rotate in your circle on the deck. Not dialled; they're
-- the "hello" before someone taps in. Checked like any photo before anyone sees them.
-- ---------------------------------------------------------------------------
create table public.quick_booth (
  id           uuid primary key default gen_random_uuid(),
  owner        uuid not null references public.profiles (id) on delete cascade,
  position     smallint not null check (position between 1 and 3),
  storage_path text not null,
  moderation   text not null default 'pending' check (moderation in ('pending', 'approved', 'rejected')),
  created_at   timestamptz not null default now(),
  unique (owner, position)
);
alter table public.quick_booth enable row level security;
create policy quick_booth_own on public.quick_booth for all to authenticated using (owner = auth.uid()) with check (owner = auth.uid());
grant select, insert, update, delete on public.quick_booth to authenticated;
create trigger booth_recheck before insert or update on public.quick_booth for each row execute function app.story_recheck();

do $$
begin
  if not exists (select 1 from pg_namespace where nspname = 'storage') then return; end if;
  execute $p$create policy booth_read on storage.objects for select to authenticated
    using (bucket_id = 'media' and exists (
      select 1 from public.quick_booth b where b.storage_path = storage.objects.name
        and (b.owner = auth.uid() or (b.moderation = 'approved' and not app.is_blocked(auth.uid(), b.owner)))))$p$;
end $$;

-- Location: stored rounded to ~1 km, never exact. Distances are shown in whole miles, never below 1.
create or replace function public.set_location(p_lat numeric, p_lng numeric) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_lat not between -90 and 90 or p_lng not between -180 and 180 then raise exception 'bad_location'; end if;
  update public.profiles set lat_coarse = round(p_lat, 2), lng_coarse = round(p_lng, 2) where id = auth.uid();
end $$;

create or replace function public.set_max_distance(p_miles integer) returns void
language sql security definer set search_path = public as $$
  update public.profiles set max_distance_km = greatest(2, least(320, round(p_miles * 1.609)::integer)) where id = auth.uid()
$$;

create or replace function app.miles(p_km numeric) returns integer
language sql immutable as $$ select greatest(1, round(p_km / 1.609))::integer $$;

-- ---------------------------------------------------------------------------
-- Dials and scores
-- ---------------------------------------------------------------------------
create table public.quick_dials (
  rater      uuid not null references public.profiles (id) on delete cascade,
  subject    uuid not null references public.profiles (id) on delete cascade,
  item_id    uuid not null,                      -- a media id or a story id
  kind       text not null check (kind in ('photo', 'video', 'story')),
  score      integer not null check (score between 1 and 100),
  created_at timestamptz not null default now(),
  primary key (rater, item_id)
);
create index quick_dials_subject on public.quick_dials (subject, created_at);

create table public.quick_scores (
  rater       uuid not null references public.profiles (id) on delete cascade,
  subject     uuid not null references public.profiles (id) on delete cascade,
  score       integer not null check (score between 1 and 100),
  looks       integer not null, vibe integer not null, personality integer not null,
  created_at  timestamptz not null default now(),
  primary key (rater, subject),
  check (rater <> subject)
);
create index quick_scores_subject on public.quick_scores (subject, created_at);

create table public.quick_connections (
  user_a     uuid not null references public.profiles (id) on delete cascade,
  user_b     uuid not null references public.profiles (id) on delete cascade,
  status     text not null default 'open' check (status in ('open', 'mutual')),
  opened_at  timestamptz not null default now(),
  mutual_at  timestamptz,
  primary key (user_a, user_b),
  check (user_a < user_b)
);

create table public.quick_messages (
  id         uuid primary key default gen_random_uuid(),
  user_a     uuid not null,
  user_b     uuid not null,
  sender     uuid not null references public.profiles (id) on delete cascade,
  body       text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now(),
  foreign key (user_a, user_b) references public.quick_connections (user_a, user_b) on delete cascade
);
create index quick_messages_pair on public.quick_messages (user_a, user_b, created_at);

-- Push notifications. deliver_at lets mutuals wait for the 8pm drop.
create table public.push_tokens (
  token      text primary key,
  member     uuid not null references public.profiles (id) on delete cascade,
  platform   text not null check (platform in ('ios', 'android')),
  updated_at timestamptz not null default now()
);

create table public.notifications (
  id         uuid primary key default gen_random_uuid(),
  member     uuid not null references public.profiles (id) on delete cascade,
  kind       text not null,
  title      text not null,
  body       text not null,
  data       jsonb not null default '{}'::jsonb,
  deliver_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  sent_at    timestamptz,
  read_at    timestamptz
);
create index notifications_due on public.notifications (deliver_at) where sent_at is null;

alter table public.quick_dials enable row level security;
alter table public.quick_scores enable row level security;
alter table public.quick_connections enable row level security;
alter table public.quick_messages enable row level security;
alter table public.push_tokens enable row level security;
alter table public.notifications enable row level security;

create policy quick_dials_own on public.quick_dials for select to authenticated using (rater = auth.uid());
create policy quick_scores_own on public.quick_scores for select to authenticated using (rater = auth.uid());
create policy quick_connections_member on public.quick_connections for select to authenticated
  using (auth.uid() in (user_a, user_b) and not app.is_blocked(user_a, user_b));
create policy quick_messages_member on public.quick_messages for select to authenticated
  using (auth.uid() in (user_a, user_b) and not app.is_blocked(user_a, user_b));
create policy push_tokens_own on public.push_tokens for all to authenticated using (member = auth.uid()) with check (member = auth.uid());
create policy notifications_own on public.notifications for select to authenticated using (member = auth.uid() and deliver_at <= now());

-- The next 8pm drop, UK time.
create or replace function app.next_drop() returns timestamptz
language sql stable as $$
  select case when (now() at time zone 'Europe/London')::time < make_time(app.qd('quick_drop_hour'), 0, 0)
    then ((now() at time zone 'Europe/London')::date + make_time(app.qd('quick_drop_hour'), 0, 0)) at time zone 'Europe/London'
    else ((now() at time zone 'Europe/London')::date + 1 + make_time(app.qd('quick_drop_hour'), 0, 0)) at time zone 'Europe/London' end
$$;

-- "High" means 70+, or at the top of your own range: selective diallers who rarely give 70 still
-- match when they rate someone in their top 30% (never below 55). In simulation this took selective
-- diallers with a mutual from 4% to 32% without inflating generous diallers.
create or replace function app.is_high(p_rater uuid, p_score integer) returns boolean
language sql stable security definer set search_path = public as $$
  select p_score >= app.qd('quick_threshold')
      or (p_score >= app.qd('quick_high_floor')
          and (select count(*) from public.quick_scores where rater = p_rater) >= 3
          and p_score >= (select percentile_cont(0.7) within group (order by score) from public.quick_scores where rater = p_rater))
$$;

-- Plan perks are open to everyone until plans go live.
create or replace function app.has_perk(m uuid) returns boolean
language sql stable as $$ select app.qd('quick_plans_live') = 0 or app.quick_tier(m) <> 'free' $$;

-- How many people you can dial today, how many you have, and when it resets (midnight UK time).
create or replace function public.quick_today()
returns table (used integer, allowance integer, resets_at timestamptz, tier text, next_drop timestamptz)
language sql stable security definer set search_path = public as $$
  select (select count(*)::integer from public.quick_scores
          where rater = auth.uid() and (created_at at time zone 'Europe/London')::date = (now() at time zone 'Europe/London')::date),
         case app.quick_tier(auth.uid()) when 'gold' then app.qd('quick_people_per_day_gold')
              when 'plus' then app.qd('quick_people_per_day_plus') else app.qd('quick_people_per_day') end
           + coalesce((select rounds from public.quick_extra_rounds
                       where member = auth.uid() and day = (now() at time zone 'Europe/London')::date), 0),
         (((now() at time zone 'Europe/London')::date + 1)::timestamp at time zone 'Europe/London'),
         app.quick_tier(auth.uid()),
         app.next_drop()
$$;

-- ---------------------------------------------------------------------------
-- The deck: ten verified people with a full Quick set whom you could both be interested in.
-- People who already dialled you high come first, then Gold members' weekly spotlight, then a shuffle.
-- (No ranking by how highly people are dialled: that's how apps end up with a looks hierarchy.)
-- ---------------------------------------------------------------------------
create or replace function public.quick_deck()
returns table (id uuid, first_name text, age integer, city text, verified boolean, miles integer, booth jsonb, items jsonb,
               dialled_you boolean, hidden_admirers integer)
language plpgsql stable security definer set search_path = public as $$
declare me public.profiles; v_perk boolean;
begin
  select * into me from public.profiles where profiles.id = auth.uid();
  if me.id is null then raise exception 'not_signed_in'; end if;
  v_perk := app.has_perk(me.id);
  return query
  with deck as (
  select p.id, p.first_name, extract(year from age(p.birth_date))::integer as age, p.city, p.verified_at is not null as verified,
         case when d.km is null then null else app.miles(d.km) end as miles,
         (select jsonb_agg(b.storage_path order by b.position) from public.quick_booth b where b.owner = p.id and b.moderation = 'approved') as booth,
         (select jsonb_agg(jsonb_build_object('id', q.item_id, 'kind', q.kind,
                    'storage_path', m.storage_path, 'caption', m.caption, 'prompt', s.prompt, 'answer', s.answer) order by q.pos)
          from app.quick_items(p.id) q
          left join public.media m on m.id = q.item_id
          left join public.quick_stories s on s.id = q.item_id) as items,
         exists (select 1 from public.quick_scores s where s.rater = p.id and s.subject = me.id and app.is_high(p.id, s.score)) as liked,
         (select count(*) from public.quick_scores s where s.subject = p.id) as seen_total,
         (select count(*) from public.quick_scores s where s.subject = p.id and s.created_at > now() - interval '1 day') as seen_today,
         d.km
  from public.profiles p
  cross join lateral (select case when p.lat_coarse is null or me.lat_coarse is null then null
                                  else app.distance_km(me.lat_coarse, me.lng_coarse, p.lat_coarse, p.lng_coarse) end as km) d
  where p.id <> me.id
    and (p.paused_until is null or p.paused_until < current_date)
    and not app.is_blocked(me.id, p.id)
    and p.gender = any (me.interested_in) and me.gender = any (p.interested_in)
    and extract(year from age(p.birth_date)) between me.age_min and me.age_max
    and extract(year from age(me.birth_date)) between p.age_min and p.age_max
    -- Within both people's distance. If you share your location, so must they.
    and (me.lat_coarse is null or (d.km is not null and d.km <= least(me.max_distance_km, p.max_distance_km)))
    and not exists (select 1 from public.quick_scores s where s.rater = me.id and s.subject = p.id)
    and app.quick_ready(p.id)
  ), ranked as (
    select deck.*, row_number() over (partition by liked order by random()) as liked_rank from deck
  ), chosen as (
    -- Up to 3 people who dialled you high, then Gold spotlight, then fairness: people who've been
    -- dialled least (overall and today) come first, nearer first, with a shuffle. In simulation this
    -- took "never dialled" from 13% to 0.2% and the top 10%'s share of attention from 43% to 11%.
    select * from ranked
    order by (liked and liked_rank <= 3) desc,
             (app.quick_tier(ranked.id) = 'gold') desc,
             seen_total * 0.5 + seen_today * 3
               + coalesce(km, 0) / greatest(me.max_distance_km, 1) * 4
               + random() * 6
    limit app.qd('quick_deck_size')
  )
  select c.id, c.first_name, c.age, c.city, c.verified, c.miles, c.booth, c.items,
         case when v_perk then c.liked else null end,
         case when v_perk then 0 else (select count(*)::integer from chosen x where x.liked) end
  from chosen c;
end $$;

-- Dial one of the 11. When all 11 are in, their score is worked out (weighted), a connection opens,
-- and if they had already dialled you high, it's a mutual.
create or replace function public.quick_dial(p_item uuid, p_score integer)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid(); v_owner uuid; v_kind text; v_done integer;
  v_looks integer; v_vibe integer; v_pers integer; v_score integer; v_theirs integer;
  v_a uuid; v_b uuid; v_mutual boolean := false; v_name_me text; v_name_them text;
begin
  if me is null then raise exception 'not_signed_in'; end if;
  if p_score is null or p_score < 1 or p_score > 100 then raise exception 'score_out_of_range'; end if;
  select owner, kind into v_owner, v_kind from public.media where id = p_item;
  if v_owner is null then select owner, 'story' into v_owner, v_kind from public.quick_stories where id = p_item; end if;
  if v_owner is null then raise exception 'item_not_found'; end if;
  if v_owner = me then raise exception 'cannot_dial_self'; end if;
  if app.is_blocked(me, v_owner) then raise exception 'not_available'; end if;
  if p_item not in (select item_id from app.quick_items(v_owner)) then raise exception 'item_not_in_quick_set'; end if;
  if exists (select 1 from public.quick_scores where rater = me and subject = v_owner) then raise exception 'already_scored'; end if;
  if not exists (select 1 from public.quick_dials where rater = me and subject = v_owner)
     and (select used >= allowance from public.quick_today()) then
    raise exception 'daily_limit';
  end if;

  insert into public.quick_dials (rater, subject, item_id, kind, score) values (me, v_owner, p_item, v_kind, p_score)
  on conflict (rater, item_id) do update set score = excluded.score, created_at = now();

  select count(*) into v_done from public.quick_dials
  where rater = me and subject = v_owner and item_id in (select item_id from app.quick_items(v_owner));
  if v_done < app.quick_set_size() then return jsonb_build_object('complete', false, 'dialled', v_done); end if;

  select round(avg(score) filter (where kind = 'photo'))::integer, round(avg(score) filter (where kind = 'video'))::integer,
         round(avg(score) filter (where kind = 'story'))::integer
    into v_looks, v_vibe, v_pers
  from public.quick_dials where rater = me and subject = v_owner;
  v_score := round((v_looks * app.qd('quick_w_looks') + v_vibe * app.qd('quick_w_vibe') + v_pers * app.qd('quick_w_personality'))::numeric
                   / (app.qd('quick_w_looks') + app.qd('quick_w_vibe') + app.qd('quick_w_personality')))::integer;
  v_score := greatest(1, least(100, v_score));

  insert into public.quick_scores (rater, subject, score, looks, vibe, personality) values (me, v_owner, v_score, v_looks, v_vibe, v_pers);
  v_a := least(me, v_owner); v_b := greatest(me, v_owner);
  insert into public.quick_connections (user_a, user_b) values (v_a, v_b) on conflict do nothing;

  select score into v_theirs from public.quick_scores where rater = v_owner and subject = me;
  if v_theirs is not null and app.is_high(v_owner, v_theirs) and app.is_high(me, v_score) then
    update public.quick_connections set status = 'mutual', mutual_at = now()
    where user_a = v_a and user_b = v_b and status <> 'mutual';
    if found then
      v_mutual := true;
      select first_name into v_name_me from public.profiles where id = me;
      select first_name into v_name_them from public.profiles where id = v_owner;
      -- You're here now, so you hear now. They hear in tonight's drop.
      insert into public.notifications (member, kind, title, body, data, deliver_at) values
        (me, 'quick_mutual', 'You''re dialled in ✦', v_name_them || ' dialled you high too. Say hi while it''s warm.', jsonb_build_object('with', v_owner), now()),
        (v_owner, 'quick_mutual', 'Tonight''s drop ✦', v_name_me || ' dialled you high too. Say hi!', jsonb_build_object('with', me), app.next_drop());
    end if;
  end if;
  return jsonb_build_object('complete', true, 'score', v_score, 'looks', v_looks, 'vibe', v_vibe, 'personality', v_pers, 'mutual', v_mutual);
end $$;

-- Your scorecard: everyone you dialled, with your breakdown. Mutuals from the drop show once delivered.
create or replace function public.quick_card()
returns table (subject uuid, first_name text, age integer, score integer, looks integer, vibe integer, personality integer,
               mutual boolean, dialled_you boolean, scored_at timestamptz)
language sql stable security definer set search_path = public as $$
  select s.subject, p.first_name, extract(year from age(p.birth_date))::integer, s.score, s.looks, s.vibe, s.personality,
         coalesce(c.status = 'mutual', false)
           and not exists (select 1 from public.notifications n where n.member = auth.uid() and n.kind = 'quick_mutual'
                           and (n.data->>'with')::uuid = s.subject and n.deliver_at > now()),
         exists (select 1 from public.quick_scores t where t.rater = s.subject and t.subject = s.rater),
         s.created_at
  from public.quick_scores s
  join public.profiles p on p.id = s.subject
  left join public.quick_connections c on c.user_a = least(s.rater, s.subject) and c.user_b = greatest(s.rater, s.subject)
  where s.rater = auth.uid() and not app.is_blocked(s.rater, s.subject)
  order by s.score desc
$$;

-- Your own Dial: what people give you on average, week by week, and what works best.
-- Nothing until at least 5 people have dialled you, so no single person's score can be worked out.
create or replace function public.my_quick_dial()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid(); v_raters integer; v_out jsonb;
begin
  select count(*) into v_raters from public.quick_scores where subject = me;
  if v_raters < app.qd('quick_own_dial_min_raters') then
    return jsonb_build_object('raters', v_raters, 'needed', app.qd('quick_own_dial_min_raters'));
  end if;
  select jsonb_build_object(
    'raters', v_raters,
    'score', round(avg(score)), 'looks', round(avg(looks)), 'vibe', round(avg(vibe)), 'personality', round(avg(personality)),
    'weeks', (select jsonb_agg(w order by w->>'week') from (
        select jsonb_build_object('week', date_trunc('week', created_at)::date, 'score', round(avg(score)), 'raters', count(*)) w
        from public.quick_scores where subject = me and created_at > now() - interval '12 weeks'
        group by date_trunc('week', created_at) having count(*) >= 3) x),
    'best_item', (select item_id from public.quick_dials where subject = me group by item_id having count(*) >= 3 order by avg(score) desc limit 1),
    'worst_item', (select item_id from public.quick_dials where subject = me group by item_id having count(*) >= 3 order by avg(score) asc limit 1)
  ) into v_out from public.quick_scores where subject = me;
  return v_out;
end $$;

-- Someone else's Dial, for a person you're interested in: only with their permission, from at least
-- 10 people, and for Quick+ or Gold members. Shown as averages, never individual scores.
create or replace function public.quick_their_dial(p_subject uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_raters integer; v_show boolean;
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  if app.is_blocked(auth.uid(), p_subject) then raise exception 'not_available'; end if;
  select quick_show_dial into v_show from public.profiles where id = p_subject;
  if not coalesce(v_show, false) then return jsonb_build_object('available', false, 'reason', 'private'); end if;
  select count(*) into v_raters from public.quick_scores where subject = p_subject;
  if v_raters < app.qd('quick_their_dial_min_raters') then return jsonb_build_object('available', false, 'reason', 'too_new'); end if;
  if not app.has_perk(auth.uid()) then
    return jsonb_build_object('available', false, 'reason', 'upgrade');
  end if;
  return (select jsonb_build_object('available', true, 'raters', v_raters, 'score', round(avg(score)),
            'looks', round(avg(looks)), 'vibe', round(avg(vibe)), 'personality', round(avg(personality)))
          from public.quick_scores where subject = p_subject);
end $$;

-- Your chats: everyone you dialled or who dialled you. Mutuals first.
create or replace function public.quick_chats()
returns table (other uuid, first_name text, age integer, mutual boolean, last_body text, last_at timestamptz, last_from_me boolean)
language sql stable security definer set search_path = public as $$
  select o.id, o.first_name, extract(year from age(o.birth_date))::integer,
         c.status = 'mutual' and not exists (select 1 from public.notifications n where n.member = auth.uid() and n.kind = 'quick_mutual'
                                              and (n.data->>'with')::uuid = o.id and n.deliver_at > now()),
         lm.body, coalesce(lm.created_at, c.opened_at), lm.sender = auth.uid()
  from public.quick_connections c
  join public.profiles o on o.id = case when c.user_a = auth.uid() then c.user_b else c.user_a end
  left join lateral (select body, created_at, sender from public.quick_messages m
                     where m.user_a = c.user_a and m.user_b = c.user_b order by created_at desc limit 1) lm on true
  where auth.uid() in (c.user_a, c.user_b) and not app.is_blocked(c.user_a, c.user_b)
  order by 4 desc, coalesce(lm.created_at, c.opened_at) desc
$$;

create or replace function public.quick_send(p_other uuid, p_body text) returns uuid
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); v_a uuid := least(auth.uid(), p_other); v_b uuid := greatest(auth.uid(), p_other); v_id uuid; v_name text;
begin
  if me is null then raise exception 'not_signed_in'; end if;
  if not exists (select 1 from public.quick_connections where user_a = v_a and user_b = v_b) then raise exception 'no_connection'; end if;
  if app.is_blocked(me, p_other) then raise exception 'not_available'; end if;
  if char_length(trim(coalesce(p_body, ''))) = 0 then raise exception 'empty_message'; end if;
  -- Not dialled in? One message until they reply. Stops anyone flooding an inbox.
  if (select status from public.quick_connections where user_a = v_a and user_b = v_b) <> 'mutual'
     and exists (select 1 from public.quick_messages where user_a = v_a and user_b = v_b and sender = me)
     and not exists (select 1 from public.quick_messages where user_a = v_a and user_b = v_b and sender = p_other) then
    raise exception 'wait_for_reply';
  end if;
  insert into public.quick_messages (user_a, user_b, sender, body) values (v_a, v_b, me, left(trim(p_body), 1000)) returning id into v_id;
  select first_name into v_name from public.profiles where id = me;
  insert into public.notifications (member, kind, title, body, data)
  values (p_other, 'quick_message', v_name, left(trim(p_body), 120), jsonb_build_object('with', me));
  return v_id;
end $$;

create or replace function public.register_push_token(p_token text, p_platform text) returns void
language sql security definer set search_path = public as $$
  insert into public.push_tokens (token, member, platform) values (p_token, auth.uid(), p_platform)
  on conflict (token) do update set member = excluded.member, platform = excluded.platform, updated_at = now()
$$;

create or replace function public.set_quick_show_dial(p_show boolean) returns void
language sql security definer set search_path = public as $$
  update public.profiles set quick_show_dial = p_show where id = auth.uid()
$$;

do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.quick_messages, public.quick_connections, public.notifications;
  end if;
end $$;

grant select on public.quick_dials, public.quick_scores, public.quick_connections, public.quick_messages, public.notifications,
  public.verifications, public.subscriptions, public.quick_extra_rounds to authenticated;
grant select, insert, update, delete on public.push_tokens to authenticated;
grant execute on function public.quick_deck(), public.quick_dial(uuid, integer), public.quick_card(), public.quick_chats(),
  public.quick_send(uuid, text), public.register_push_token(text, text), public.quick_today(), public.my_quick_dial(),
  public.quick_their_dial(uuid), public.set_quick_show_dial(boolean), public.set_location(numeric, numeric), public.set_max_distance(integer) to authenticated;

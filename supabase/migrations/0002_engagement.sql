-- Dial 0002: likes inbox, passes, assessments, daily challenges, weekly board,
-- media moderation on upload.

insert into public.economy (key, value) values
  ('ink_assessment_personality', 100),
  ('ink_assessment_game', 50),
  ('ink_daily_challenge', 15),
  ('ink_weekly_challenge', 50),
  ('auto_approve_media', 0)          -- 1 only for a closed alpha with no moderation provider yet
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- Passes ("not for me") and the likes inbox
-- ---------------------------------------------------------------------------
create table public.passes (
  member     uuid not null references public.profiles (id) on delete cascade,
  passed     uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (member, passed)
);
alter table public.passes enable row level security;
create policy passes_read_own on public.passes for select to authenticated using (member = auth.uid());

create or replace function public.pass_profile(p_to uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  insert into public.passes (member, passed) values (auth.uid(), p_to) on conflict do nothing;
end $$;

-- People who liked me, what they liked and what they said. Hidden once I like back, pass or block.
create or replace function public.incoming_likes()
returns table (like_id uuid, from_id uuid, first_name text, age integer, media_id uuid, comment text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select l.id, p.id, p.first_name, extract(year from age(p.birth_date))::integer, l.media_id, l.comment, l.created_at
  from public.likes l join public.profiles p on p.id = l.from_user
  where l.to_user = auth.uid()
    and not exists (select 1 from public.likes back where back.from_user = auth.uid() and back.to_user = l.from_user)
    and not exists (select 1 from public.passes x where x.member = auth.uid() and x.passed = l.from_user)
    and not app.is_blocked(auth.uid(), l.from_user)
  order by l.created_at desc
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
    and not exists (select 1 from public.passes x where x.member = me.id and x.passed = p.id)
    and not exists (select 1 from public.matches m where m.user_a = least(me.id, p.id) and m.user_b = greatest(me.id, p.id))
  order by (p.intentions is not distinct from me.intentions) desc,
           (select count(*) from unnest(p.interests) i where i = any (me.interests)) desc,
           p.created_at desc
  limit least(greatest(p_limit, 1), 25)
$$;

-- (replaces 0001) Like a person through a specific photo or video. Returns the match id if this completes a match.
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
    return v_match;
  end if;
  -- A comment left with a like becomes the opening message once the match forms.
  insert into public.messages (match_id, sender, body, is_question, created_at)
  select v_match, l.from_user, l.comment, position('?' in l.comment) > 0, l.created_at
  from public.likes l
  where ((l.from_user = me and l.to_user = p_to) or (l.from_user = p_to and l.to_user = me))
    and coalesce(btrim(l.comment), '') <> ''
  order by l.created_at;
  perform app.recalc_level(v_match);
  return v_match;
end $$;


-- ---------------------------------------------------------------------------
-- Assessments: results become traits used by compatibility. Ink is paid once per game.
-- ---------------------------------------------------------------------------
create table public.assessments (
  member       uuid not null references public.profiles (id) on delete cascade,
  kind         text not null check (kind in ('personality','logic','creativity','humour')),
  traits       jsonb not null,
  completed_at timestamptz not null default now(),
  primary key (member, kind)
);
alter table public.assessments enable row level security;
create policy assessments_read_own on public.assessments for select to authenticated using (member = auth.uid());

create or replace function public.submit_assessment(p_kind text, p_traits jsonb) returns integer
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); k text; v jsonb;
  allowed text[] := array['humour','openness','talkative','planner','socialEnergy','activity','replyPace','curiosity','creativity'];
begin
  if me is null then raise exception 'not_authenticated'; end if;
  if p_kind not in ('personality','logic','creativity','humour') then raise exception 'unknown_assessment'; end if;
  if jsonb_typeof(p_traits) <> 'object' then raise exception 'invalid_traits'; end if;
  for k, v in select * from jsonb_each(p_traits) loop
    if not (k = any (allowed)) or jsonb_typeof(v) <> 'number' or (v::text)::numeric < 0 or (v::text)::numeric > 1 then
      raise exception 'invalid_traits';
    end if;
  end loop;
  insert into public.assessments (member, kind, traits) values (me, p_kind, p_traits)
  on conflict (member, kind) do update set traits = excluded.traits, completed_at = now();
  update public.profiles set traits = traits || p_traits where id = me;
  return app.award(me, app.econ(case when p_kind = 'personality' then 'ink_assessment_personality' else 'ink_assessment_game' end),
                   'assessment_' || p_kind, 'once');
end $$;

-- ---------------------------------------------------------------------------
-- Challenges: verified from what actually happened, never self-reported.
-- One daily challenge pays per day, one weekly challenge per week.
-- ---------------------------------------------------------------------------
create or replace function app.challenge_done(p_member uuid, p_code text) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare today timestamptz := date_trunc('day', now()); week timestamptz := date_trunc('week', now());
begin
  return case p_code
    when 'voice_note' then exists (select 1 from public.messages where sender = p_member and kind = 'voice' and created_at >= today)
    when 'ask_question' then exists (select 1 from public.messages where sender = p_member and is_question and created_at >= today)
    when 'specific_like' then exists (select 1 from public.likes where from_user = p_member and media_id is not null
                                        and coalesce(btrim(comment), '') <> '' and created_at >= today)
    when 'different_interests' then exists (
        select 1 from public.likes l join public.profiles them on them.id = l.to_user
        join public.profiles me on me.id = p_member
        where l.from_user = p_member and l.created_at >= today
          and not (them.interests && me.interests))
    when 'move_forward' then exists (select 1 from public.ink_ledger where member = p_member
                                       and reason like 'conv_level_%' and created_at >= week)
    else false end;
end $$;

create or replace function public.my_challenges()
returns table (code text, period text, done boolean, claimed boolean, ink integer)
language sql stable security definer set search_path = public as $$
  with c(code, period) as (values ('voice_note','day'), ('ask_question','day'), ('specific_like','day'),
                                  ('different_interests','day'), ('move_forward','week'))
  select c.code, c.period, app.challenge_done(auth.uid(), c.code),
         exists (select 1 from public.ink_ledger l where l.member = auth.uid()
                 and l.reason = 'challenge_' || c.period
                 and l.ref = case when c.period = 'day' then current_date::text else date_trunc('week', now())::date::text end),
         app.econ(case when c.period = 'day' then 'ink_daily_challenge' else 'ink_weekly_challenge' end)
  from c
$$;

create or replace function public.claim_challenge(p_code text) returns integer
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); v_period text;
begin
  if me is null then raise exception 'not_authenticated'; end if;
  v_period := case when p_code = 'move_forward' then 'week'
                   when p_code in ('voice_note','ask_question','specific_like','different_interests') then 'day' end;
  if v_period is null then raise exception 'unknown_challenge'; end if;
  if not app.challenge_done(me, p_code) then raise exception 'challenge_not_done'; end if;
  -- the ledger's unique key means only the first claim of the day (or week) pays
  return app.award(me,
    app.econ(case when v_period = 'day' then 'ink_daily_challenge' else 'ink_weekly_challenge' end),
    'challenge_' || v_period,
    case when v_period = 'day' then current_date::text else date_trunc('week', now())::date::text end);
end $$;

-- ---------------------------------------------------------------------------
-- Weekly leaderboard: opt-in only, first name and Chapter only.
-- ---------------------------------------------------------------------------
create or replace function public.weekly_board(p_local boolean default false)
returns table (rank integer, first_name text, chapter integer, ink integer, is_me boolean)
language sql stable security definer set search_path = public as $$
  with me as (select * from public.profiles where id = auth.uid()),
  members as (
    select p.id, p.first_name,
           coalesce((select sum(amount) from public.ink_ledger l where l.member = p.id), 0)::integer as lifetime,
           coalesce((select sum(amount) from public.ink_ledger l where l.member = p.id
                     and l.created_at >= date_trunc('week', now())), 0)::integer as week_ink
    from public.profiles p cross join me
    where exists (select 1 from public.consents c where c.member = p.id and c.kind = 'leaderboards' and c.granted)
      and (not p_local or p.city is not distinct from me.city)
      and not app.is_blocked(me.id, p.id)),
  ranked as (select *, rank() over (order by week_ink desc)::integer as r from members)
  select r, first_name, app.chapter_for(lifetime), week_ink, id = auth.uid()
  from ranked
  where r <= 20 or id = auth.uid()
  order by r, first_name
$$;

-- ---------------------------------------------------------------------------
-- Media: moderation status is set by the server on upload, never by the member.
-- ---------------------------------------------------------------------------
drop policy media_insert on public.media;
create policy media_insert on public.media for insert to authenticated with check (owner = auth.uid());

create or replace function app.media_moderation_on_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.moderation := case when app.econ('auto_approve_media') = 1 then 'approved' else 'pending' end;
  return new;
end $$;
create trigger media_moderation_on_insert before insert on public.media
  for each row execute function app.media_moderation_on_insert();

-- Staff (service role) approve or reject; members cannot call this.
create or replace function app.moderate_media(p_media uuid, p_decision text) returns void
language sql security definer set search_path = public as $$
  update public.media set moderation = p_decision where id = p_media and p_decision in ('approved','rejected')
$$;

revoke all on all functions in schema app from public;
grant execute on function app.is_blocked(uuid, uuid) to authenticated;
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated;
grant select on public.passes, public.assessments to authenticated;

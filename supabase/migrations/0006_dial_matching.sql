-- Dial 0006: the Dial is the only action. Dialling a person 1 to 100 replaces likes and passes.
-- Both dial each other at or above the threshold (70) = a match. Lower scores stay private.
-- The separate type-training deck is removed: your profile Dials teach your type instead.

insert into public.economy (key, value) values ('dial_match_threshold', 70) on conflict (key) do nothing;

create table public.profile_dials (
  member     uuid not null references public.profiles (id) on delete cascade,
  subject    uuid not null references public.profiles (id) on delete cascade,
  score      integer not null check (score between 1 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (member, subject),
  check (member <> subject)
);
alter table public.profile_dials enable row level security;
-- Members read back only the Dials they gave. Nobody can read a Dial given to them.
create policy profile_dials_read_own on public.profile_dials for select to authenticated using (member = auth.uid());
grant select on public.profile_dials to authenticated;

-- Dial someone. Returns the match id when this completes a mutual match, otherwise null.
create or replace function public.dial_profile(p_subject uuid, p_score integer, p_note text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'not_authenticated'; end if;
  if p_subject = me then raise exception 'cannot_dial_self'; end if;
  if p_score is null or p_score < 1 or p_score > 100 then raise exception 'score_out_of_range'; end if;
  if app.is_blocked(me, p_subject) then raise exception 'profile_not_available'; end if;
  insert into public.profile_dials (member, subject, score) values (me, p_subject, p_score)
  on conflict (member, subject) do update set score = excluded.score, updated_at = now();
  if p_score >= app.econ('dial_match_threshold') then
    -- an interested Dial is recorded as a like; like_profile completes the match if it is mutual
    return public.like_profile(p_subject, null, nullif(btrim(coalesce(p_note, '')), ''));
  end if;
  return null;
end $$;

create or replace function public.incoming_likes()
returns table (like_id uuid, from_id uuid, first_name text, age integer, media_id uuid, comment text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select l.id, p.id, p.first_name, extract(year from age(p.birth_date))::integer, l.media_id, l.comment, l.created_at
  from public.likes l join public.profiles p on p.id = l.from_user
  where l.to_user = auth.uid()
    and not exists (select 1 from public.likes back where back.from_user = auth.uid() and back.to_user = l.from_user)
    and not exists (select 1 from public.passes x where x.member = auth.uid() and x.passed = l.from_user)
    and not exists (select 1 from public.profile_dials pd where pd.member = auth.uid() and pd.subject = l.from_user)
    and not app.is_blocked(auth.uid(), l.from_user)
  order by l.created_at desc
$$;

drop function public.get_introductions(integer);
create or replace function public.get_introductions(p_limit integer default 12)
returns table (id uuid, first_name text, age integer, city text, occupation text, bio text,
               intentions text, interests text[], traits jsonb, distance_band text, shared_interests integer,
               hair_colour text, hair_length text, eye_colour text, build text, height_cm integer, fits_their_ideal numeric)
language sql stable security definer set search_path = public as $$
  with me as (select * from public.profiles where id = auth.uid())
  select p.id, p.first_name,
         extract(year from age(p.birth_date))::integer,
         p.city, p.occupation, p.bio, p.intentions, p.interests, p.traits,
         case when d.km is null then null when d.km < 2 then 'Under 2 km' when d.km < 5 then 'Under 5 km'
              when d.km < 15 then 'Under 15 km' else 'Within ' || (ceil(d.km / 10) * 10)::integer || ' km' end,
         (select count(*)::integer from unnest(p.interests) i where i = any (me.interests)),
         p.hair_colour, p.hair_length, p.eye_colour, p.build, p.height_cm,
         app.trait_fit(p.ideal_traits, me.traits)          -- how well I fit their ideal; their answers stay private
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
    and not exists (select 1 from public.profile_dials pd where pd.member = me.id and pd.subject = p.id)
    and not exists (select 1 from public.matches m where m.user_a = least(me.id, p.id) and m.user_b = greatest(me.id, p.id))
  order by (p.intentions is not distinct from me.intentions) desc,
           (select count(*) from unnest(p.interests) i where i = any (me.interests)) desc,
           p.created_at desc
  limit least(greatest(p_limit, 1), 25)
$$;

-- Your type, learned from the people you have dialled: average Dial per look attribute.
drop function public.my_learned_type();
create or replace function public.my_learned_type()
returns table (dimension text, value text, shown integer, liked integer, avg_score numeric)
language sql stable security definer set search_path = public as $$
  with s as (select d.score, d.score >= app.econ('dial_match_threshold') as liked,
                    p.hair_colour, p.hair_length, p.eye_colour, p.build
             from public.profile_dials d join public.profiles p on p.id = d.subject
             where d.member = auth.uid()),
  pairs as (
    select 'hair' d, hair_colour v, liked, score from s union all
    select 'length', hair_length, liked, score from s union all
    select 'eyes', eye_colour, liked, score from s union all
    select 'build', build, liked, score from s)
  select d, v, count(*)::integer, count(*) filter (where liked)::integer, round(avg(score), 1)
  from pairs where v is not null group by d, v order by d, v
$$;

-- The training deck is gone.
drop function public.calibration_deck(integer);
drop function public.record_calibration(uuid, integer);
drop table public.calibration_swipes;
delete from public.economy where key = 'calibration_max';

-- "Leave a note" replaces "like a photo with a comment" in the daily challenges.
create or replace function app.challenge_done(p_member uuid, p_code text) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare today timestamptz := date_trunc('day', now()); week timestamptz := date_trunc('week', now());
begin
  return case p_code
    when 'voice_note' then exists (select 1 from public.messages where sender = p_member and kind = 'voice' and created_at >= today)
    when 'ask_question' then exists (select 1 from public.messages where sender = p_member and is_question and created_at >= today)
    when 'specific_like' then exists (select 1 from public.likes where from_user = p_member
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

revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated;
revoke all on all functions in schema app from public;
grant execute on function app.is_blocked(uuid, uuid) to authenticated;

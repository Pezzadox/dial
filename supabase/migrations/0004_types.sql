-- Dial 0004: looks, the ideal partner, top three types and type training.
-- Looks are matched only on what members declare about themselves. No face analysis.

alter table public.profiles
  add column hair_colour text check (hair_colour in ('black','brunette','auburn','red','blonde','grey','other')),
  add column hair_length text check (hair_length in ('short','medium','long')),
  add column eye_colour  text check (eye_colour in ('brown','hazel','green','blue','grey')),
  add column build       text check (build in ('slim','athletic','average','curvy','plus')),
  add column height_cm   integer check (height_cm between 120 and 230),
  add column ideal_traits jsonb not null default '{}'::jsonb;   -- private: never returned to other members

-- A column-level grant keeps ideal_traits out of other members' reach even though profiles rows are readable.
revoke select on public.profiles from authenticated;
grant select (id, first_name, birth_date, gender, interested_in, city, occupation, bio, intentions, interests, traits,
              age_min, age_max, max_distance_km, onboarded, paused_until, created_at,
              hair_colour, hair_length, eye_colour, build, height_cm) on public.profiles to authenticated;

create or replace function public.my_ideal_traits() returns jsonb
language sql stable security definer set search_path = public as $$
  select ideal_traits from public.profiles where id = auth.uid()
$$;

-- How well a set of traits fits an ideal, 0..1, over the traits both mention. Null if nothing overlaps.
create or replace function app.trait_fit(p_ideal jsonb, p_traits jsonb) returns numeric
language sql immutable as $$
  select round(avg(1 - abs((i.value #>> '{}')::numeric - (p_traits ->> i.key)::numeric)), 3)
  from jsonb_each(coalesce(p_ideal, '{}'::jsonb)) i
  where p_traits ? i.key and jsonb_typeof(p_traits -> i.key) = 'number' and jsonb_typeof(i.value) = 'number'
$$;

alter table public.assessments drop constraint assessments_kind_check;
alter table public.assessments add constraint assessments_kind_check
  check (kind in ('personality','logic','creativity','humour','ideal_partner'));

insert into public.economy (key, value) values ('ink_ideal_partner', 50), ('calibration_max', 100)
on conflict (key) do nothing;

create or replace function public.submit_ideal_partner(p_traits jsonb) returns integer
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); k text; v jsonb;
  allowed text[] := array['humour','openness','talkative','planner','socialEnergy','activity','replyPace','curiosity','creativity'];
begin
  if me is null then raise exception 'not_authenticated'; end if;
  if jsonb_typeof(p_traits) <> 'object' then raise exception 'invalid_traits'; end if;
  for k, v in select * from jsonb_each(p_traits) loop
    if not (k = any (allowed)) or jsonb_typeof(v) <> 'number' or (v::text)::numeric < 0 or (v::text)::numeric > 1 then
      raise exception 'invalid_traits';
    end if;
  end loop;
  update public.profiles set ideal_traits = p_traits where id = me;
  insert into public.assessments (member, kind, traits) values (me, 'ideal_partner', p_traits)
  on conflict (member, kind) do update set traits = excluded.traits, completed_at = now();
  return app.award(me, app.econ('ink_ideal_partner'), 'assessment_ideal_partner', 'once');
end $$;

-- ---------------------------------------------------------------------------
-- Top three types: a look plus an optional vibe each. Private to the member.
-- ---------------------------------------------------------------------------
create table public.ideal_types (
  member       uuid not null references public.profiles (id) on delete cascade,
  rank         integer not null check (rank between 1 and 3),
  hair_colours text[] not null default '{}',
  hair_lengths text[] not null default '{}',
  eye_colours  text[] not null default '{}',
  builds       text[] not null default '{}',
  height_min   integer check (height_min between 120 and 230),
  height_max   integer check (height_max between 120 and 230),
  vibes        text[] not null default '{}' check (cardinality(vibes) <= 3),
  updated_at   timestamptz not null default now(),
  primary key (member, rank)
);
alter table public.ideal_types enable row level security;
create policy ideal_types_own on public.ideal_types for all to authenticated
  using (member = auth.uid()) with check (member = auth.uid());
grant select, insert, update, delete on public.ideal_types to authenticated;

-- ---------------------------------------------------------------------------
-- Train your type: up to 100 private yes/no answers. These are not likes:
-- nobody is told, and they never create a match.
-- ---------------------------------------------------------------------------
create table public.calibration_swipes (
  member     uuid not null references public.profiles (id) on delete cascade,
  subject    uuid not null references public.profiles (id) on delete cascade,
  liked      boolean not null,
  created_at timestamptz not null default now(),
  primary key (member, subject)
);
alter table public.calibration_swipes enable row level security;
create policy calibration_read_own on public.calibration_swipes for select to authenticated using (member = auth.uid());
grant select on public.calibration_swipes to authenticated;

create or replace function public.calibration_deck(p_limit integer default 20)
returns table (id uuid, first_name text, age integer, hair_colour text, hair_length text, eye_colour text, build text, height_cm integer)
language sql stable security definer set search_path = public as $$
  with me as (select * from public.profiles where id = auth.uid()),
  done as (select count(*) n from public.calibration_swipes where member = auth.uid())
  select p.id, p.first_name, extract(year from age(p.birth_date))::integer,
         p.hair_colour, p.hair_length, p.eye_colour, p.build, p.height_cm
  from public.profiles p cross join me cross join done
  where p.id <> me.id and p.onboarded
    and p.gender = any (me.interested_in) and me.gender = any (p.interested_in)
    and extract(year from age(p.birth_date)) between me.age_min and me.age_max
    and not app.is_blocked(me.id, p.id)
    and not exists (select 1 from public.calibration_swipes c where c.member = me.id and c.subject = p.id)
  order by random()
  limit greatest(0, least(p_limit, app.econ('calibration_max') - (select n from done)))
$$;

create or replace function public.record_calibration(p_subject uuid, p_liked boolean) returns integer
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); n integer;
begin
  if me is null then raise exception 'not_authenticated'; end if;
  if p_subject = me then raise exception 'cannot_rate_self'; end if;
  select count(*) into n from public.calibration_swipes where member = me;
  if n >= app.econ('calibration_max') then raise exception 'calibration_complete'; end if;
  insert into public.calibration_swipes (member, subject, liked) values (me, p_subject, p_liked)
  on conflict (member, subject) do update set liked = excluded.liked;
  return n + 1;
end $$;

-- For each look attribute value: how many you were shown and how many you said were your type.
create or replace function public.my_learned_type()
returns table (dimension text, value text, shown integer, liked integer)
language sql stable security definer set search_path = public as $$
  with s as (select c.liked, p.hair_colour, p.hair_length, p.eye_colour, p.build
             from public.calibration_swipes c join public.profiles p on p.id = c.subject
             where c.member = auth.uid()),
  pairs as (
    select 'hair' d, hair_colour v, liked from s union all
    select 'length', hair_length, liked from s union all
    select 'eyes', eye_colour, liked from s union all
    select 'build', build, liked from s)
  select d, v, count(*)::integer, count(*) filter (where liked)::integer
  from pairs where v is not null group by d, v order by d, v
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
    and not exists (select 1 from public.matches m where m.user_a = least(me.id, p.id) and m.user_b = greatest(me.id, p.id))
  order by (p.intentions is not distinct from me.intentions) desc,
           (select count(*) from unnest(p.interests) i where i = any (me.interests)) desc,
           p.created_at desc
  limit least(greatest(p_limit, 1), 25)
$$;

revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated;
revoke all on all functions in schema app from public;
grant execute on function app.is_blocked(uuid, uuid) to authenticated;

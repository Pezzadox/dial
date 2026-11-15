-- Dial 0005: type training uses the Dial (1 to 100) instead of a yes/no swipe.

alter table public.calibration_swipes add column score integer check (score between 1 and 100);
update public.calibration_swipes set score = case when liked then 80 else 20 end where score is null;
alter table public.calibration_swipes alter column score set not null;

drop function public.record_calibration(uuid, boolean);
create or replace function public.record_calibration(p_subject uuid, p_score integer) returns integer
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); n integer;
begin
  if me is null then raise exception 'not_authenticated'; end if;
  if p_subject = me then raise exception 'cannot_rate_self'; end if;
  if p_score is null or p_score < 1 or p_score > 100 then raise exception 'score_out_of_range'; end if;
  select count(*) into n from public.calibration_swipes where member = me and subject <> p_subject;
  if n >= app.econ('calibration_max') then raise exception 'calibration_complete'; end if;
  insert into public.calibration_swipes (member, subject, liked, score) values (me, p_subject, p_score >= 60, p_score)
  on conflict (member, subject) do update set score = excluded.score, liked = excluded.liked;
  return n + 1;
end $$;

-- For each look attribute value: how many you dialled and your average Dial for them.
drop function public.my_learned_type();
create or replace function public.my_learned_type()
returns table (dimension text, value text, shown integer, liked integer, avg_score numeric)
language sql stable security definer set search_path = public as $$
  with s as (select c.liked, c.score, p.hair_colour, p.hair_length, p.eye_colour, p.build
             from public.calibration_swipes c join public.profiles p on p.id = c.subject
             where c.member = auth.uid()),
  pairs as (
    select 'hair' d, hair_colour v, liked, score from s union all
    select 'length', hair_length, liked, score from s union all
    select 'eyes', eye_colour, liked, score from s union all
    select 'build', build, liked, score from s)
  select d, v, count(*)::integer, count(*) filter (where liked)::integer, round(avg(score), 1)
  from pairs where v is not null group by d, v order by d, v
$$;

revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated;

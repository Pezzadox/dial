-- Dial 0007: games for two inside a chat, and completing one counts towards Level 4.
-- Each round, both people pick privately; a round is revealed only once both have picked.

create table public.games (
  id         uuid primary key default gen_random_uuid(),
  match_id   uuid not null references public.matches (id) on delete cascade,
  kind       text not null check (kind in ('build_a_date', 'this_or_that')),
  rounds     jsonb not null,           -- [{ "prompt": "...", "options": ["...", ...] }, ...]
  started_by uuid not null references public.profiles (id) on delete cascade,
  status     text not null default 'active' check (status in ('active', 'complete', 'abandoned')),
  created_at timestamptz not null default now()
);
create unique index games_one_active_per_match on public.games (match_id) where status = 'active';

create table public.game_picks (
  game_id    uuid not null references public.games (id) on delete cascade,
  round      integer not null check (round >= 0),
  member     uuid not null references public.profiles (id) on delete cascade,
  option     integer not null check (option >= 0),
  created_at timestamptz not null default now(),
  primary key (game_id, round, member)
);
alter table public.games enable row level security;
alter table public.game_picks enable row level security;
-- No direct reads: games are read through my_games(), which hides the other person's
-- pick for any round you have not answered yet.

create or replace function app.match_member(p_match uuid, p_member uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.matches m where m.id = p_match and p_member in (m.user_a, m.user_b))
$$;

create or replace function public.start_game(p_match uuid, p_kind text, p_rounds jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); v_id uuid; r jsonb; o jsonb;
begin
  if me is null then raise exception 'not_authenticated'; end if;
  if not app.match_member(p_match, me) then raise exception 'match_not_found'; end if;
  if (select status from public.matches where id = p_match) <> 'open' then raise exception 'conversation_not_open'; end if;
  if jsonb_typeof(p_rounds) <> 'array' or jsonb_array_length(p_rounds) not between 1 and 8 then raise exception 'invalid_game'; end if;
  for r in select * from jsonb_array_elements(p_rounds) loop
    if jsonb_typeof(r -> 'options') <> 'array' or jsonb_array_length(r -> 'options') not between 2 and 6
       or char_length(coalesce(r ->> 'prompt', '')) not between 1 and 80 then raise exception 'invalid_game'; end if;
    for o in select * from jsonb_array_elements(r -> 'options') loop
      if jsonb_typeof(o) <> 'string' or char_length(o #>> '{}') not between 1 and 60 then raise exception 'invalid_game'; end if;
    end loop;
  end loop;
  update public.games set status = 'abandoned' where match_id = p_match and status = 'active';
  insert into public.games (match_id, kind, rounds, started_by) values (p_match, p_kind, p_rounds, me) returning id into v_id;
  return v_id;
end $$;

create or replace function public.play_game(p_game uuid, p_round integer, p_option integer) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); g public.games; n_rounds integer; n_opts integer; picked integer;
begin
  select * into g from public.games where id = p_game;
  if g.id is null or not app.match_member(g.match_id, me) then raise exception 'game_not_found'; end if;
  if g.status <> 'active' then raise exception 'game_over'; end if;
  n_rounds := jsonb_array_length(g.rounds);
  if p_round < 0 or p_round >= n_rounds then raise exception 'invalid_round'; end if;
  -- rounds are played in order
  if p_round > 0 and not exists (select 1 from public.game_picks where game_id = p_game and round = p_round - 1 and member = me) then
    raise exception 'invalid_round';
  end if;
  n_opts := jsonb_array_length(g.rounds -> p_round -> 'options');
  if p_option < 0 or p_option >= n_opts then raise exception 'invalid_option'; end if;
  insert into public.game_picks (game_id, round, member, option) values (p_game, p_round, me, p_option)
  on conflict (game_id, round, member) do nothing;          -- a pick cannot be changed once made
  select count(*) into picked from public.game_picks where game_id = p_game;
  if picked >= n_rounds * 2 then
    update public.games set status = 'complete' where id = p_game;
    perform app.recalc_level(g.match_id);
  end if;
end $$;

-- Games in a match, with picks. The other person's pick is shown only for rounds you have also picked.
create or replace function public.my_games(p_match uuid)
returns table (id uuid, kind text, rounds jsonb, status text, started_by_me boolean, my_picks jsonb, their_picks jsonb, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select g.id, g.kind, g.rounds, g.status, g.started_by = auth.uid(),
    coalesce((select jsonb_object_agg(p.round::text, p.option) from public.game_picks p where p.game_id = g.id and p.member = auth.uid()), '{}'::jsonb),
    coalesce((select jsonb_object_agg(p.round::text, p.option) from public.game_picks p
              where p.game_id = g.id and p.member <> auth.uid()
                and exists (select 1 from public.game_picks mine where mine.game_id = g.id and mine.round = p.round and mine.member = auth.uid())), '{}'::jsonb),
    g.created_at
  from public.games g
  where g.match_id = p_match and app.match_member(p_match, auth.uid()) and g.status <> 'abandoned'
  order by g.created_at desc
$$;

-- ---------------------------------------------------------------------------
-- (replaces 0001) Level 4 can also be reached by finishing a game together.
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
  -- Level 4: a real exchange beyond text. Voice notes both ways, or a game finished together.
  if new_level = 3 and ((v_a >= 1 and v_b >= 1)
       or exists (select 1 from public.games g where g.match_id = p_match and g.status = 'complete')) then new_level := 4; end if;
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

do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.games, public.game_picks;
  end if;
end $$;

revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated;
revoke all on all functions in schema app from public;
grant execute on function app.is_blocked(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- AI reply ideas: a simple daily allowance per member, counted by the edge function.
-- ---------------------------------------------------------------------------
insert into public.economy (key, value) values ('ai_suggestions_per_day', 40) on conflict (key) do nothing;
create table public.ai_requests (
  member     uuid not null references public.profiles (id) on delete cascade,
  match_id   uuid references public.matches (id) on delete set null,
  created_at timestamptz not null default now()
);
create index ai_requests_member_time on public.ai_requests (member, created_at);
alter table public.ai_requests enable row level security;   -- written and read only by the service role

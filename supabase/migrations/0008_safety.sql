-- Dial: report, block, suspend and the moderation console.
-- Members report or block from a chat or a profile. Blocking closes any conversation at once.
-- Staff (listed in public.staff) review reports and media from the moderation console.

-- ---------------------------------------------------------------------------
-- Staff and suspensions (neither is visible to members)
-- ---------------------------------------------------------------------------
create table public.staff (
  member     uuid primary key references public.profiles (id) on delete cascade,
  added_at   timestamptz not null default now()
);

create table public.suspensions (
  member     uuid primary key references public.profiles (id) on delete cascade,
  until      timestamptz not null,
  reason     text not null,
  by_staff   uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

alter table public.staff enable row level security;
alter table public.suspensions enable row level security;
-- No policies: members cannot read or write either table. Staff use the functions below.

create or replace function app.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.staff where member = auth.uid())
$$;

create or replace function app.is_suspended(m uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.suspensions where member = m and until > now())
$$;

-- A suspended member disappears for everyone, exactly like a block, so every
-- place that already respects blocks (introductions, likes, media, chats) respects suspensions too.
create or replace function app.is_blocked(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.blocks
                 where (blocker = a and blocked = b) or (blocker = b and blocked = a))
      or app.is_suspended(a) or app.is_suspended(b)
$$;

-- Blocking someone ends any conversation with them straight away.
create or replace function app.close_on_block() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.matches set status = 'closed', closed_by = new.blocker, close_note = null
  where user_a = least(new.blocker, new.blocked) and user_b = greatest(new.blocker, new.blocked)
    and status in ('open', 'queued');
  return new;
end $$;
create trigger close_on_block after insert on public.blocks
  for each row execute function app.close_on_block();

-- ---------------------------------------------------------------------------
-- Member actions
-- ---------------------------------------------------------------------------
create or replace function public.report_member(p_reported uuid, p_reason text, p_detail text default null, p_block boolean default true)
returns uuid language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); v_id uuid;
begin
  if me is null then raise exception 'not_signed_in'; end if;
  if p_reported = me then raise exception 'cannot_report_self'; end if;
  if p_reason not in ('fake_profile','inappropriate_photos','harassment','spam_or_scam','underage','felt_unsafe','other') then
    raise exception 'unknown_reason';
  end if;
  if not exists (select 1 from public.profiles where id = p_reported) then raise exception 'member_not_found'; end if;
  -- One open report per pair is enough; a repeat adds detail rather than noise.
  select id into v_id from public.reports
  where reporter = me and reported = p_reported and status in ('open', 'reviewing') limit 1;
  if v_id is null then
    insert into public.reports (reporter, reported, reason, detail)
    values (me, p_reported, p_reason, left(p_detail, 1000)) returning id into v_id;
  else
    update public.reports set detail = left(coalesce(detail || E'\n', '') || coalesce(p_detail, p_reason), 1000) where id = v_id;
  end if;
  if coalesce(p_block, true) then
    insert into public.blocks (blocker, blocked) values (me, p_reported) on conflict do nothing;
  end if;
  return v_id;
end $$;

create or replace function public.block_member(p_other uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  if p_other = auth.uid() then raise exception 'cannot_block_self'; end if;
  insert into public.blocks (blocker, blocked) values (auth.uid(), p_other) on conflict do nothing;
end $$;

-- Unblocking lets you see each other again. A closed conversation stays closed.
create or replace function public.unblock_member(p_other uuid) returns void
language sql security definer set search_path = public as $$
  delete from public.blocks where blocker = auth.uid() and blocked = p_other
$$;

create or replace function public.my_blocks()
returns table (member uuid, first_name text, blocked_at timestamptz)
language sql stable security definer set search_path = public as $$
  select b.blocked, p.first_name, b.created_at
  from public.blocks b join public.profiles p on p.id = b.blocked
  where b.blocker = auth.uid() order by b.created_at desc
$$;

-- "About you": the parts of a profile a member writes themselves.
create or replace function public.save_about(p_bio text, p_occupation text, p_city text, p_intentions text, p_interests text[])
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  if coalesce(array_length(p_interests, 1), 0) > 8 then raise exception 'too_many_interests'; end if;
  update public.profiles set
    bio = nullif(left(trim(p_bio), 500), ''),
    occupation = nullif(left(trim(p_occupation), 80), ''),
    city = nullif(left(trim(p_city), 60), ''),
    intentions = nullif(trim(p_intentions), ''),
    interests = coalesce((select array_agg(distinct left(trim(i), 30)) from unnest(p_interests) i where trim(i) <> ''), '{}')
  where id = auth.uid();
end $$;

-- ---------------------------------------------------------------------------
-- Moderation console (staff only)
-- ---------------------------------------------------------------------------
create or replace function app.require_staff() returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if not app.is_staff() then raise exception 'staff_only'; end if;
end $$;

create or replace function public.am_i_staff() returns boolean
language sql stable security definer set search_path = public as $$ select app.is_staff() $$;

-- Open reports, most serious first. Reporters stay anonymous to the reported member, always.
create or replace function public.mod_reports()
returns table (report_id uuid, reported uuid, reported_name text, reason text, detail text, status text,
               reports_against integer, reporters integer, suspended boolean, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  perform app.require_staff();
  return query
  select r.id, r.reported, p.first_name, r.reason, r.detail, r.status,
         (select count(*)::integer from public.reports x where x.reported = r.reported),
         (select count(distinct x.reporter)::integer from public.reports x where x.reported = r.reported),
         app.is_suspended(r.reported), r.created_at
  from public.reports r join public.profiles p on p.id = r.reported
  where r.status in ('open', 'reviewing')
  order by (r.reason in ('underage', 'felt_unsafe', 'harassment')) desc, r.created_at;
end $$;

create or replace function public.mod_media_queue()
returns table (media_id uuid, owner uuid, owner_name text, kind text, video_role text, storage_path text, caption text, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  perform app.require_staff();
  return query
  select m.id, m.owner, p.first_name, m.kind, m.video_role, m.storage_path, m.caption, m.created_at
  from public.media m join public.profiles p on p.id = m.owner
  where m.moderation = 'pending' order by m.created_at;
end $$;

create table public.mod_actions (
  id         uuid primary key default gen_random_uuid(),
  staff      uuid not null references public.profiles (id),
  action     text not null,
  target     uuid not null,
  note       text,
  created_at timestamptz not null default now()
);
alter table public.mod_actions enable row level security;

-- p_outcome: 'dismissed' or 'upheld'. When upheld, p_suspend_days > 0 suspends the member.
create or replace function public.mod_resolve_report(p_report uuid, p_outcome text, p_suspend_days integer default 0, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare r record;
begin
  perform app.require_staff();
  if p_outcome not in ('dismissed', 'upheld', 'reviewing') then raise exception 'unknown_outcome'; end if;
  select * into r from public.reports where id = p_report;
  if r.id is null then raise exception 'report_not_found'; end if;
  update public.reports set status = p_outcome where id = p_report;
  if p_outcome = 'upheld' and coalesce(p_suspend_days, 0) > 0 then
    insert into public.suspensions (member, until, reason, by_staff)
    values (r.reported, now() + make_interval(days => least(p_suspend_days, 3650)), r.reason, auth.uid())
    on conflict (member) do update set until = greatest(public.suspensions.until, excluded.until), reason = excluded.reason, by_staff = excluded.by_staff;
    -- Close every report against them that is still open: one decision covers them.
    update public.reports set status = 'upheld' where reported = r.reported and status in ('open', 'reviewing');
  end if;
  insert into public.mod_actions (staff, action, target, note)
  values (auth.uid(), 'report_' || p_outcome || case when p_suspend_days > 0 then '_suspend_' || p_suspend_days else '' end, p_report, p_note);
end $$;

create or replace function public.mod_review_media(p_media uuid, p_approve boolean, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform app.require_staff();
  update public.media set moderation = case when p_approve then 'approved' else 'rejected' end
  where id = p_media and moderation = 'pending';
  if not found then raise exception 'media_not_pending'; end if;
  insert into public.mod_actions (staff, action, target, note)
  values (auth.uid(), case when p_approve then 'media_approved' else 'media_rejected' end, p_media, p_note);
end $$;

create or replace function public.mod_lift_suspension(p_member uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform app.require_staff();
  delete from public.suspensions where member = p_member;
  insert into public.mod_actions (staff, action, target) values (auth.uid(), 'suspension_lifted', p_member);
end $$;

revoke all on function public.mod_reports(), public.mod_media_queue(), public.mod_resolve_report(uuid, text, integer, text),
  public.mod_review_media(uuid, boolean, text), public.mod_lift_suspension(uuid) from public, anon;
grant execute on function public.report_member(uuid, text, text, boolean), public.block_member(uuid), public.unblock_member(uuid),
  public.my_blocks(), public.save_about(text, text, text, text, text[]), public.am_i_staff(),
  public.mod_reports(), public.mod_media_queue(), public.mod_resolve_report(uuid, text, integer, text),
  public.mod_review_media(uuid, boolean, text), public.mod_lift_suspension(uuid) to authenticated;
grant execute on function app.is_blocked(uuid, uuid), app.is_suspended(uuid), app.is_staff() to authenticated;

-- Staff can open pending media to review it (Supabase only: needs the storage schema).
do $$
begin
  if not exists (select 1 from pg_namespace where nspname = 'storage') then return; end if;
  execute $p$create policy media_staff_read on storage.objects for select to authenticated
    using (bucket_id = 'media' and app.is_staff())$p$;
end $$;

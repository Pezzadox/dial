-- Dial 0010: deleting your account.
-- The app calls the delete-account edge function, which runs prepare_account_deletion() as the
-- member, removes their files from storage, then deletes the auth user. Everything that belongs
-- to the member goes with it (every table cascades from profiles).
--
-- One thing is kept, for safety: if other members reported this person, a staff-only record of
-- those reports survives for 12 months, so deleting an account is not a way to wipe a history
-- of harassment. It holds no photos, messages or profile details.

-- Staff can delete their accounts too, without breaking the moderation history.
alter table public.suspensions drop constraint if exists suspensions_by_staff_fkey;
alter table public.suspensions add constraint suspensions_by_staff_fkey
  foreign key (by_staff) references public.profiles (id) on delete set null;
alter table public.mod_actions alter column staff drop not null;
alter table public.mod_actions drop constraint if exists mod_actions_staff_fkey;
alter table public.mod_actions add constraint mod_actions_staff_fkey
  foreign key (staff) references public.profiles (id) on delete set null;

create table public.account_deletions (
  id          uuid primary key default gen_random_uuid(),
  member      uuid not null,            -- no foreign key: the member no longer exists
  deleted_at  timestamptz not null default now(),
  reports     jsonb not null default '[]',
  keep_until  timestamptz not null default now() + interval '12 months'
);
alter table public.account_deletions enable row level security;
create policy account_deletions_staff on public.account_deletions for select to authenticated using (app.is_staff());
grant select on public.account_deletions to authenticated;

create or replace function public.prepare_account_deletion() returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); v_reports jsonb;
begin
  if me is null then raise exception 'not_signed_in'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('reason', r.reason, 'detail', r.detail, 'status', r.status, 'at', r.created_at)
                            order by r.created_at), '[]')
    into v_reports from public.reports r where r.reported = me;
  if jsonb_array_length(v_reports) > 0 then
    insert into public.account_deletions (member, reports) values (me, v_reports);
  end if;
end $$;
revoke all on function public.prepare_account_deletion() from public, anon;
grant execute on function public.prepare_account_deletion() to authenticated;

-- Run daily (Supabase → Database → Cron, or pg_cron): forget safety records past their 12 months.
create or replace function app.forget_old_deletions() returns void
language sql security definer set search_path = public as $$
  delete from public.account_deletions where keep_until < now()
$$;

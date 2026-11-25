-- Dial: permissions for the server-side role, and nothing extra for the client roles.
--
-- New Supabase projects can be created with "Grant API access to new tables
-- automatically" switched off. These migrations already grant the client role
-- (authenticated) exactly what it needs, table by table. But in such a project
-- the service role, which the edge functions use, gets no table privileges at
-- all, so moderate-content, quick-push, verify-webhook and the rest would fail
-- with "permission denied". Grant it explicitly.
--
-- The same projects still hand anon and authenticated TRUNCATE, REFERENCES and
-- TRIGGER on every table. The app never needs them and TRUNCATE ignores
-- row-level security, so take them back.

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant usage on schema public, app to service_role;
    grant all on all tables in schema public to service_role;
    grant all on all sequences in schema public to service_role;
    grant execute on all functions in schema public to service_role;
    grant execute on all functions in schema app to service_role;
    alter default privileges in schema public grant all on tables to service_role;
    alter default privileges in schema public grant all on sequences to service_role;
    alter default privileges in schema public grant execute on functions to service_role;
  end if;
end $$;

revoke truncate, references, trigger on all tables in schema public from anon, authenticated;

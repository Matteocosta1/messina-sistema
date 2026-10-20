-- Solo per i test in locale: imita quello che Supabase ha già di suo
-- (ruoli, schema auth, auth.uid(), storage). Su Supabase NON va eseguito.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;

create schema if not exists auth;
create table if not exists auth.users (
  id uuid primary key,
  email text unique,
  raw_user_meta_data jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(coalesce(current_setting('request.jwt.claim.sub', true),
                         current_setting('request.jwt.claims', true)::jsonb ->> 'sub'), '')::uuid
$$;

create or replace function auth.role() returns text
language sql stable as $$
  select coalesce(current_setting('request.jwt.claim.role', true), current_user)
$$;

-- come Supabase: i dati del token. Nei test il livello parte da «aal2» (codice già dato);
-- 70_doppio_fattore.sql lo abbassa con request.jwt.claim.aal = 'aal1'.
create or replace function auth.jwt() returns jsonb
language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb,
                  jsonb_build_object('sub', current_setting('request.jwt.claim.sub', true),
                                     'aal', coalesce(nullif(current_setting('request.jwt.claim.aal', true), ''), 'aal2')))
$$;

grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid(), auth.jwt() to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to service_role;

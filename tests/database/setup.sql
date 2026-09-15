-- Local PostgreSQL test doubles for Supabase-managed schemas, not production migrations.
create schema auth;
create table auth.users(id uuid primary key);
create schema storage;
create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
do $$ begin
  if not exists(select from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists(select from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists(select from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;
-- Model projects that grant broad privileges to the server role by default.
alter default privileges in schema public grant all on tables to service_role;

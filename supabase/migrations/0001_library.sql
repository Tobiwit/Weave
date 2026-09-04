-- Weave library sync.
--
-- Run this once in the Supabase SQL editor (or via `supabase db push`).
--
-- Shape note: each table stores the record as jsonb with the few columns the
-- sync engine actually filters on lifted out. The app owns the schema of what
-- is inside `data`, so adding a field to a Song Profile never needs a
-- migration here. Row-level security is the only thing this file is strict
-- about: every row belongs to exactly one user and is readable by no one else.

create table if not exists public.playlists (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null,
  data jsonb not null,
  updated_at bigint not null,
  deleted_at bigint,
  primary key (user_id, id)
);

create table if not exists public.song_profiles (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null,
  data jsonb not null,
  updated_at bigint not null,
  deleted_at bigint,
  primary key (user_id, id)
);

create table if not exists public.songs (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null,
  data jsonb not null,
  updated_at bigint not null,
  deleted_at bigint,
  primary key (user_id, id)
);

create index if not exists playlists_updated_idx
  on public.playlists (user_id, updated_at);
create index if not exists song_profiles_updated_idx
  on public.song_profiles (user_id, updated_at);
create index if not exists songs_updated_idx
  on public.songs (user_id, updated_at);

alter table public.playlists enable row level security;
alter table public.song_profiles enable row level security;
alter table public.songs enable row level security;

-- One policy set per table. `with check` matters as much as `using`: without
-- it a signed-in user could write rows stamped with someone else's user_id.
do $$
declare
  t text;
begin
  foreach t in array array['playlists', 'song_profiles', 'songs'] loop
    execute format(
      'drop policy if exists "%1$s_select_own" on public.%1$I', t);
    execute format(
      'create policy "%1$s_select_own" on public.%1$I
         for select using (auth.uid() = user_id)', t);

    execute format(
      'drop policy if exists "%1$s_insert_own" on public.%1$I', t);
    execute format(
      'create policy "%1$s_insert_own" on public.%1$I
         for insert with check (auth.uid() = user_id)', t);

    execute format(
      'drop policy if exists "%1$s_update_own" on public.%1$I', t);
    execute format(
      'create policy "%1$s_update_own" on public.%1$I
         for update using (auth.uid() = user_id)
         with check (auth.uid() = user_id)', t);

    execute format(
      'drop policy if exists "%1$s_delete_own" on public.%1$I', t);
    execute format(
      'create policy "%1$s_delete_own" on public.%1$I
         for delete using (auth.uid() = user_id)', t);
  end loop;
end $$;

-- Real Me — initial schema
-- Tables: profiles, avatars, mls_connections, listings, videos
-- Every table has RLS enabled and owner-scoped policies keyed on auth.uid().

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type avatar_status as enum ('uploading', 'processing', 'ready', 'failed');
create type listing_source as enum ('manual', 'url', 'simplyrets', 'reso', 'mlsgrid');
create type listing_status as enum ('draft', 'active');
create type connection_provider as enum ('manual', 'url_scrape', 'simplyrets', 'reso', 'mlsgrid');
create type connection_status as enum ('disconnected', 'connected', 'error');
create type video_status as enum (
  'pending_script', 'script_ready', 'submitting', 'processing', 'completed', 'failed'
);

-- ---------------------------------------------------------------------------
-- updated_at helper
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- profiles (1:1 with auth.users)
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  full_name text,
  brokerage text,
  phone text,
  headshot_url text,
  mls_agent_id text,                 -- RESO ListAgentMlsId, for future aggregator filtering
  onboarding_completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- avatars
-- ---------------------------------------------------------------------------
create table public.avatars (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  name text,
  heygen_avatar_id text,
  heygen_asset_id text,
  voice_id text,
  source_path text,                  -- Storage path of the uploaded photo/video
  status avatar_status not null default 'uploading',
  is_active boolean not null default false,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index avatars_user_id_idx on public.avatars (user_id);

-- ---------------------------------------------------------------------------
-- mls_connections
-- ---------------------------------------------------------------------------
create table public.mls_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  provider connection_provider not null default 'manual',
  status connection_status not null default 'disconnected',
  credentials jsonb not null default '{}'::jsonb,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index mls_connections_user_id_idx on public.mls_connections (user_id);

-- ---------------------------------------------------------------------------
-- listings
-- ---------------------------------------------------------------------------
create table public.listings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  connection_id uuid references public.mls_connections (id) on delete set null,
  source listing_source not null default 'manual',
  external_id text,
  source_url text,
  address text not null,
  city text,
  state text,
  zip text,
  price numeric,
  beds integer,
  baths numeric,
  sqft integer,
  lot_size text,
  year_built integer,
  property_type text,
  description text,
  features text[] not null default '{}',
  photos jsonb not null default '[]'::jsonb,   -- [{ url, caption?, order }]
  status listing_status not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index listings_user_id_idx on public.listings (user_id);

-- ---------------------------------------------------------------------------
-- videos
-- ---------------------------------------------------------------------------
create table public.videos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  listing_id uuid not null references public.listings (id) on delete cascade,
  avatar_id uuid references public.avatars (id) on delete set null,
  title text,
  script text,
  script_segments jsonb not null default '[]'::jsonb,  -- [{ photoOrder, line }]
  heygen_video_id text,
  status video_status not null default 'pending_script',
  video_url text,
  cached_url text,
  thumbnail_url text,
  duration numeric,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index videos_user_id_idx on public.videos (user_id);
create index videos_listing_id_idx on public.videos (listing_id);
create index videos_heygen_video_id_idx on public.videos (heygen_video_id);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
create trigger profiles_set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger avatars_set_updated_at before update on public.avatars
  for each row execute function public.set_updated_at();
create trigger mls_connections_set_updated_at before update on public.mls_connections
  for each row execute function public.set_updated_at();
create trigger listings_set_updated_at before update on public.listings
  for each row execute function public.set_updated_at();
create trigger videos_set_updated_at before update on public.videos
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.avatars enable row level security;
alter table public.mls_connections enable row level security;
alter table public.listings enable row level security;
alter table public.videos enable row level security;

-- profiles (keyed on id). No INSERT policy: rows are created by the
-- handle_new_user trigger (SECURITY DEFINER) below.
create policy "profiles_select_own" on public.profiles
  for select to authenticated using ((select auth.uid()) = id);
create policy "profiles_update_own" on public.profiles
  for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- Owner-scoped CRUD for the remaining tables (keyed on user_id).
create policy "avatars_select_own" on public.avatars
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "avatars_insert_own" on public.avatars
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "avatars_update_own" on public.avatars
  for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "avatars_delete_own" on public.avatars
  for delete to authenticated using ((select auth.uid()) = user_id);

create policy "mls_connections_select_own" on public.mls_connections
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "mls_connections_insert_own" on public.mls_connections
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "mls_connections_update_own" on public.mls_connections
  for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "mls_connections_delete_own" on public.mls_connections
  for delete to authenticated using ((select auth.uid()) = user_id);

create policy "listings_select_own" on public.listings
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "listings_insert_own" on public.listings
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "listings_update_own" on public.listings
  for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "listings_delete_own" on public.listings
  for delete to authenticated using ((select auth.uid()) = user_id);

create policy "videos_select_own" on public.videos
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "videos_insert_own" on public.videos
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "videos_update_own" on public.videos
  for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "videos_delete_own" on public.videos
  for delete to authenticated using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- Auto-create a profile row when a new auth user signs up.
-- SECURITY DEFINER is required to insert into public.profiles from the auth
-- schema trigger; it is scoped to a single, safe INSERT.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', '')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Storage buckets (private) + policies
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values
  ('avatar-sources', 'avatar-sources', false),
  ('video-cache', 'video-cache', false),
  ('listing-photos', 'listing-photos', false)
on conflict (id) do nothing;

-- avatar-sources: owner-only, path prefixed by the user's id (e.g. "<uid>/photo.jpg").
-- Upsert needs INSERT + SELECT + UPDATE.
create policy "avatar_sources_select_own" on storage.objects
  for select to authenticated
  using (bucket_id = 'avatar-sources' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "avatar_sources_insert_own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatar-sources' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "avatar_sources_update_own" on storage.objects
  for update to authenticated
  using (bucket_id = 'avatar-sources' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'avatar-sources' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "avatar_sources_delete_own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatar-sources' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- listing-photos: same owner-prefixed model.
create policy "listing_photos_select_own" on storage.objects
  for select to authenticated
  using (bucket_id = 'listing-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "listing_photos_insert_own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'listing-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "listing_photos_update_own" on storage.objects
  for update to authenticated
  using (bucket_id = 'listing-photos' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'listing-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "listing_photos_delete_own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'listing-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- video-cache: read-only to owners (e.g. "<uid>/<videoId>.mp4"); writes happen
-- via the service-role client in the webhook/cron, which bypasses RLS.
create policy "video_cache_select_own" on storage.objects
  for select to authenticated
  using (bucket_id = 'video-cache' and (storage.foldername(name))[1] = (select auth.uid())::text);

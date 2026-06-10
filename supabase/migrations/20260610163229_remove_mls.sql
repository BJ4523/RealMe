-- Remove the deferred MLS integration. Drops the mls_connections table (and its
-- RLS policies / trigger / index via CASCADE), the listings.connection_id FK,
-- and profiles.mls_agent_id.
--
-- Enum values 'simplyrets'/'reso'/'mlsgrid' on connection_provider and
-- listing_source are intentionally NOT dropped: Postgres has no clean
-- ALTER TYPE ... DROP VALUE, and the unused values are harmless.

drop table if exists public.mls_connections cascade;

alter table public.listings drop column if exists connection_id;

alter table public.profiles drop column if exists mls_agent_id;

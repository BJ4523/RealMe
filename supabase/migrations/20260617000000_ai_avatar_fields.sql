-- Runway + ElevenLabs pipeline: the agent's likeness reference photo (Runway)
-- and the cloned ElevenLabs voice id, stored on the avatar. Additive + nullable
-- so the existing HeyGen path is untouched until we cut over.
alter table public.avatars
  add column if not exists agent_image_url text,
  add column if not exists el_voice_id text;

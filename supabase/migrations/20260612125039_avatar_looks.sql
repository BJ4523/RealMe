-- Trained photo-model looks per avatar (canonical outfit images that drive both
-- Seedance scenes and talking bookends). Shape:
-- { "model": "untrained"|"training"|"ready",
--   "items": { "<outfitId>": { "status": "generating"|"ready"|"failed",
--               "generationId"?: text, "lookId"?: text, "imageUrl"?: text, "error"?: text } } }
alter table public.avatars
  add column if not exists looks jsonb not null default '{}'::jsonb;

-- Listing photos are public marketing assets (they live on Zillow/MLS already).
-- Make the bucket public-read so an uploaded photo's URL works in a plain
-- <img src> AND can be fetched by HeyGen at generation time, exactly like a
-- scraped external URL — no signed-URL plumbing needed. Writes stay restricted
-- to the owner via the existing owner-prefixed RLS policies on storage.objects.

update storage.buckets set public = true where id = 'listing-photos';

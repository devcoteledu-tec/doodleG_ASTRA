-- Migration 024: Drop the duplicate `imageurl` column on customization_products
-- ---------------------------------------------------------------------------
-- Safe to re-run. `image_url` (snake_case, added in migration 023) is the
-- column the app actually reads — see GET /api/customization-products and
-- mapRowToProduct() in src/app/tailoring/TailoringPageClient.tsx. A second
-- column named `imageurl` (no underscore) was added directly in the
-- Supabase table editor and is never read by the app, so any image URL put
-- there silently does nothing. Dropping it here so there's only one place
-- to put an image and no ambiguity about which one "wins".
ALTER TABLE public.customization_products DROP COLUMN IF EXISTS imageurl;

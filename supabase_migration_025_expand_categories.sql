-- Migration 025: Expand customization_products categories
-- ---------------------------------------------------------------------------
-- Safe to re-run. Widens the category CHECK constraint to also allow
-- Chocolates, Watch, Chain, Frames, Spray, Nuts, and Boutique — on top of
-- the original five from migration 023 (Sweets, Drinks, Self-Care, Decor,
-- Stationery), which stay valid so existing rows are never invalidated.
--
-- The /tailoring page doesn't need a code change for this — its category
-- tabs are already derived at runtime from whatever categories are
-- actually present in the table (see TailoringPageClient.tsx), so a new
-- category just shows up as soon as a row using it exists.
ALTER TABLE public.customization_products
  DROP CONSTRAINT IF EXISTS customization_products_category_check;

ALTER TABLE public.customization_products
  ADD CONSTRAINT customization_products_category_check CHECK (
    category = ANY (ARRAY[
      'Sweets'::text, 'Drinks'::text, 'Self-Care'::text, 'Decor'::text, 'Stationery'::text,
      'Chocolates'::text, 'Watch'::text, 'Chain'::text, 'Frames'::text, 'Spray'::text, 'Nuts'::text, 'Boutique'::text
    ])
  );

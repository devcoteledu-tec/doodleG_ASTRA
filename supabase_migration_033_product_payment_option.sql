-- Migration 033: Per-product payment option (COD / Prepaid / Partial Advance)
-- ---------------------------------------------------------------------------
-- Safe to re-run. Lets a provider lock a specific product to Cash on
-- Delivery only, prepaid-only, or a partial advance (advance_percentage% paid
-- online at checkout, the rest collected as COD on delivery). Defaults to
-- 'both' so every existing row keeps behaving exactly as before (shopper's
-- own COD/online choice governs).
--
-- Written from the Provider Panel (doodleG_provider_panel) product form —
-- this repo only *reads* these columns (see src/lib/orderPricing.ts and
-- src/lib/paymentPlan.ts). If you already ran the equivalent migration from
-- the Provider Panel repo (migration_add_payment_terms.sql) against this
-- same database, this is a no-op — both are IF NOT EXISTS/idempotent and
-- define the columns identically.
--
-- IMPORTANT: /api/products and /api/products/[id] read from the
-- `active_products_box` VIEW, which is applied directly in Supabase and is
-- NOT in this repo (see supabase_migration_021_product_specifications.sql
-- for the same caveat). If that view lists columns explicitly (rather than
-- `SELECT *`), payment_option/advance_percentage won't be visible through it
-- until the view is updated too — check first, then update the view if
-- needed:
--   SELECT pg_get_viewdef('active_products_box'::regclass, true);

ALTER TABLE products_box
  ADD COLUMN IF NOT EXISTS payment_option TEXT DEFAULT 'both',
  ADD COLUMN IF NOT EXISTS advance_percentage NUMERIC;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'products_box_payment_option_check'
  ) THEN
    ALTER TABLE products_box
      ADD CONSTRAINT products_box_payment_option_check
      CHECK (payment_option IN ('cod', 'prepaid', 'both', 'advance'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'products_box_advance_percentage_check'
  ) THEN
    ALTER TABLE products_box
      ADD CONSTRAINT products_box_advance_percentage_check
      CHECK (advance_percentage IS NULL OR (advance_percentage > 0 AND advance_percentage < 100));
  END IF;
END $$;

UPDATE products_box
SET payment_option = 'both'
WHERE payment_option IS NULL;

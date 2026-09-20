-- Migration 022: Per-product shipping policy, return policy, warranty, product code
-- ---------------------------------------------------------------------------
-- Safe to re-run.
--
-- Context: shipping is fulfilled by each provider individually (see
-- src/lib/shipping.ts's per-provider distance-based cost), so shipping and
-- return terms are the PROVIDER's choice per product, not one fixed
-- site-wide policy. All four are nullable free text — a product with none
-- set falls back to neutral, honest copy on the product page (see
-- ProductDetailPageClient.tsx) rather than a fabricated specific promise.
ALTER TABLE products_box ADD COLUMN IF NOT EXISTS shipping_policy TEXT;
ALTER TABLE products_box ADD COLUMN IF NOT EXISTS return_policy TEXT;
ALTER TABLE products_box ADD COLUMN IF NOT EXISTS warranty TEXT;
ALTER TABLE products_box ADD COLUMN IF NOT EXISTS product_code TEXT;

-- Migration 020: Provider PIN code + resolved location on shipping
-- ---------------------------------------------------------------------------
-- Safe to re-run.
--
-- Context: distance-based shipping (src/lib/shipping.ts) needs each
-- provider's own pincode to compute their leg's distance from the buyer.
-- Nullable and NOT auto-backfilled — the user manages this data directly in
-- the providers table (no signup/admin flow adds it), so a provider with no
-- pincode yet just falls back to the flat shipping rate for their items
-- until one is set.
ALTER TABLE providers ADD COLUMN IF NOT EXISTS pincode TEXT;
ALTER TABLE providers DROP CONSTRAINT IF EXISTS providers_pincode_format;
ALTER TABLE providers ADD CONSTRAINT providers_pincode_format
    CHECK (pincode IS NULL OR pincode ~ '^[1-9][0-9]{5}$');

-- The buyer's shipping pincode is resolved server-side (via the offline
-- india-pincode dataset — see src/lib/geo.ts) at order time and stored
-- alongside the address, so a placed order keeps a record of what it was
-- resolved to even if the dataset or provider pincodes change later.
ALTER TABLE order_shipping ADD COLUMN IF NOT EXISTS gpo_name TEXT;
ALTER TABLE order_shipping ADD COLUMN IF NOT EXISTS district TEXT;
ALTER TABLE order_shipping ADD COLUMN IF NOT EXISTS state TEXT;

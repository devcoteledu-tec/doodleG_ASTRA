-- Migration 030: Provider payment mobile number (UPI ID)
-- ---------------------------------------------------------------------------
-- Fixes a real payment-routing bug: checkout previously sent every prepaid
-- (GPay/Paytm) payment to a single hardcoded UPI ID belonging to the
-- storefront operator, regardless of which provider (seller) actually
-- supplied the item(s) in the order. This column lets each provider record
-- their own UPI VPA so /api/checkout/payment-breakdown (see
-- src/lib/paymentBreakdown.ts) can route each provider's share of a cart to
-- the correct account.
--
-- Named `payment_mobile_number` because in practice most Indian UPI VPAs are
-- issued against a mobile number (e.g. "9876543210@okaxis"), but the column
-- also accepts handle-style VPAs (e.g. "shopname@okhdfcbank") — anything
-- valid to pass as the `pa=` parameter of a `upi://pay` intent. Nullable: a
-- provider with none set simply can't be paid via UPI yet — checkout blocks
-- prepaid options for their items and falls back to Cash on Delivery rather
-- than silently mis-routing funds.
--
-- Safe to re-run.
ALTER TABLE providers ADD COLUMN IF NOT EXISTS payment_mobile_number TEXT;

-- Loose sanity check, not a strict VPA validator: must look like
-- "handle@bank" (no spaces, exactly one '@'). Rejects obviously-wrong values
-- (phone numbers with no handle, empty strings) without being so strict it
-- blocks legitimate bank-specific handle formats.
-- NOTE: Postgres's regex engine caps repetition counts ({m,n}) at 255
-- (RE_DUP_MAX) — {2,256} throws "invalid repetition count(s)". Capped at
-- 64/64 here instead, comfortably above any real VPA's local-part length.
ALTER TABLE providers DROP CONSTRAINT IF EXISTS providers_payment_mobile_number_format;
ALTER TABLE providers ADD CONSTRAINT providers_payment_mobile_number_format
  CHECK (payment_mobile_number IS NULL OR payment_mobile_number ~ '^[a-zA-Z0-9.-]{2,64}@[a-zA-Z][a-zA-Z0-9]{1,64}$');

-- IMPORTANT: unlike products_box, `providers` is NOT read through the
-- `active_products_box` view, and payment_mobile_number is intentionally
-- never joined into that view or into the Product/providerName fields sent
-- to the browser — it's fetched server-side only, in
-- src/lib/paymentBreakdown.ts, right before a payment link is built. Do not
-- add it to any client-facing product/provider API response.

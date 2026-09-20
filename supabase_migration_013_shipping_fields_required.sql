-- Migration 013: Make every order_shipping field mandatory
-- ---------------------------------------------------------------------------
-- Run this against an existing database. Safe to re-run.
--
-- Context: order_shipping.phone and order_shipping.zip_code were previously
-- nullable — src/app/api/orders/route.ts's shippingSchema accepted an empty
-- string for both and inserted `null` when the shopper left them blank
-- (see src/app/cart/page.tsx's "Phone (optional)" field label). The cart
-- checkout UI now treats every shipping detail as required (name, email,
-- phone, address, city, zip), including for the UPI payment note built when
-- a shopper pays via GPay/Paytm, so the database should not allow an order
-- to be saved without them either.
--
-- Existing rows: any previously-placed order that has a NULL phone or
-- zip_code obviously can't have that data invented after the fact. Those
-- rows are backfilled with an explicit placeholder so the NOT NULL
-- constraint can be added without losing/blocking historical orders; new
-- orders will always have real values going forward since the API layer
-- now rejects blank phone/zip before the row is ever inserted.
UPDATE order_shipping SET phone    = 'NOT PROVIDED' WHERE phone    IS NULL OR btrim(phone)    = '';
UPDATE order_shipping SET zip_code = 'NOT PROVIDED' WHERE zip_code IS NULL OR btrim(zip_code) = '';

ALTER TABLE order_shipping ALTER COLUMN phone    SET NOT NULL;
ALTER TABLE order_shipping ALTER COLUMN zip_code SET NOT NULL;

-- country already has a DEFAULT of 'India' and the API always sends a value,
-- but make the guarantee explicit at the schema level too.
UPDATE order_shipping SET country = 'India' WHERE country IS NULL OR btrim(country) = '';
ALTER TABLE order_shipping ALTER COLUMN country SET NOT NULL;

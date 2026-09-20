-- Migration 028: Example offer tags
-- ---------------------------------------------------------------------------
-- Safe to re-run (each UPDATE is idempotent — same value every time).
-- Sets a real offer_tag on a handful of existing seeded products purely so
-- you can see the yellow offer badge render on /tailoring right after
-- running this, without having to populate it by hand first. Everything
-- else is untouched, and any product not listed here simply has no offer
-- (offer_tag stays NULL, badge doesn't show).
UPDATE customization_products SET offer_tag = '20% OFF' WHERE product_name = 'Artisan Chocolate Truffles';
UPDATE customization_products SET offer_tag = 'NEW'      WHERE product_name = 'Belgian Chocolate Box';
UPDATE customization_products SET offer_tag = 'BOGO'      WHERE product_name = 'French Macaron Box';
UPDATE customization_products SET offer_tag = 'LIMITED'   WHERE product_name = 'Reserve Red Wine';

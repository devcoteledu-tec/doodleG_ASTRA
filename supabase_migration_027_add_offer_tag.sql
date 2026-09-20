-- Migration 027: Offer tag for customization_products
-- ---------------------------------------------------------------------------
-- Safe to re-run. Adds a free-form promotional label shown on the tailoring
-- page's yellow "offer" badge (see TailoringPageClient.tsx). NULL/empty
-- means "no offer" — the badge simply doesn't render for that product,
-- rather than every item wearing a generic "OFFER" tag.
--
-- Free text (not a fixed enum) so it can hold anything short and punchy:
-- "20% OFF", "BOGO", "NEW", "LIMITED" — whatever the promotion actually is.
ALTER TABLE public.customization_products ADD COLUMN IF NOT EXISTS offer_tag TEXT;

-- Example: set an offer on a couple of products. Leave the column NULL on
-- anything that isn't currently on offer — the badge just won't show.
-- UPDATE customization_products SET offer_tag = '20% OFF' WHERE product_name = 'Artisan Chocolate Truffles';
-- UPDATE customization_products SET offer_tag = 'NEW'     WHERE product_name = 'Belgian Chocolate Box';

-- Migration 023: Customization products (Tailor Your Hamper catalog)
-- ---------------------------------------------------------------------------
-- Safe to re-run. Adds the catalog table that backs the /tailoring page
-- (src/app/tailoring/TailoringPageClient.tsx), fetched via
-- GET /api/customization-products (src/app/api/customization-products/route.ts).
--
-- This is a SEPARATE table from `products_box` (the main shop catalog) on
-- purpose: hamper items aren't independently sellable/stocked products —
-- they're small, unit-priced add-ins with a "slots" cost, no per-provider
-- shipping, no reviews, no stock count. Reusing products_box would mean
-- bolting a `slots` column onto rows that don't need it and filtering shop
-- listings to exclude hamper-only items everywhere. A dedicated table keeps
-- both catalogs simple and independently manageable.

CREATE TABLE IF NOT EXISTS customization_products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_name TEXT NOT NULL,
    -- Single hero image, shown on the drag-and-drop card. Nullable — the
    -- card falls back to `emoji` on a `gradient` background when unset,
    -- same fallback pattern as products_box (see ShopPageClient.tsx).
    image_url TEXT,
    -- Must stay in sync with the `Category` tabs on the tailoring page.
    -- Add a new category by updating this CHECK (drop + re-add the
    -- constraint) AND the CATEGORIES fallback in TailoringPageClient.tsx.
    category TEXT NOT NULL CHECK (category IN ('Sweets', 'Drinks', 'Self-Care', 'Decor', 'Stationery')),
    price_in_rupees NUMERIC NOT NULL CHECK (price_in_rupees >= 0),
    -- How many of the hamper's physical slots one unit of this item takes
    -- up (e.g. a bottle of wine = 2, a candle = 1). The hamper's own max
    -- capacity (currently 6) is a frontend constant, not enforced here.
    slots INTEGER NOT NULL DEFAULT 1 CHECK (slots >= 1),
    product_description TEXT,
    -- Fallback glyph shown when image_url is empty, and always used for the
    -- small slot-cell icons inside the hamper box itself.
    emoji TEXT DEFAULT '🎁',
    -- Fallback card background (Tailwind gradient classes) used behind the
    -- emoji when there's no image.
    gradient TEXT DEFAULT 'from-gray-500 to-gray-700',
    -- Lets an admin hide/discontinue an item without deleting its row
    -- (and without breaking historical orders that reference it).
    is_active BOOLEAN NOT NULL DEFAULT true,
    -- Manual sort position within a category; lower shows first.
    display_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_customization_products_category ON customization_products(category);
CREATE INDEX IF NOT EXISTS idx_customization_products_active ON customization_products(is_active);

-- Row-Level Security — same posture as products_box: public read (the
-- tailoring page is public), writes restricted to the service role. See
-- the "Row-Level Security" note in supabase_schema.sql for why RLS is
-- enabled even though every real read goes through the service-role API
-- route already.
ALTER TABLE customization_products ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  CREATE POLICY "customization_products_public_read" ON customization_products
      FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE POLICY "customization_products_service_role_write" ON customization_products
      FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- Seed data — the same starter catalog the tailoring page previously used
-- as local mock data, now moved into the database. Safe to re-run: only
-- inserts when the table is empty, so it won't duplicate rows or clobber
-- anything an admin has since edited.
-- ---------------------------------------------------------------------------
-- Demo seed data intentionally omitted from production migrations.

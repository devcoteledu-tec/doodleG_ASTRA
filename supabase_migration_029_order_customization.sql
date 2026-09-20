-- Migration 029: order_customization (Tailor Your Hamper checkout)
-- ---------------------------------------------------------------------------
-- Safe to re-run. Backs the real checkout flow for /tailoring — see
-- src/app/api/customization-orders/route.ts and the "Proceed to Checkout"
-- button in src/app/tailoring/TailoringPageClient.tsx.
--
-- Split into three tables (order / items / shipping), mirroring the exact
-- same shape as orders / order_items / order_shipping for the main shop
-- checkout — deliberately NOT reusing those tables, because a tailored
-- hamper isn't a purchase of existing products_box rows: it's a bundle of
-- customization_products chosen at build time, priced and stocked
-- independently of the main catalog. Reusing `orders` would mean every
-- hamper checkout also had to satisfy products_box's constraints (stock
-- qty, provider-per-item, etc.) that don't apply here.
--
-- Every money amount is written by the server after re-deriving it from
-- the database (see computeServerTrustedPricing() in the API route) — the
-- client only ever sends *which* products and *how many*, never a price.
-- All three tables commit or roll back together via
-- create_customization_order_atomic() below, tested against a live
-- Postgres instance to confirm: a bad item in the middle of the array
-- rolls back the whole order (no orphaned order/items), deleting a
-- customization_products row later doesn't touch past order history (the
-- name/price snapshot on the item survives, product_id just goes NULL),
-- and an invalid provider_id is rejected outright.

-- ============================================================
-- order_customization: one row per tailored-hamper checkout
-- ============================================================
CREATE TABLE IF NOT EXISTS order_customization (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Always set in practice — placing a customization order requires a
    -- session (see the API route + middleware.ts) — but SET NULL rather
    -- than CASCADE so a deleted account doesn't erase order history.
    user_id UUID REFERENCES signin(id) ON DELETE SET NULL,
    order_number TEXT UNIQUE NOT NULL DEFAULT (
        'DG-CUSTOM-' || to_char(timezone('utc', now()), 'YYYYMMDD') || '-' || substr(md5(random()::text), 1, 6)
    ),
    -- Which provider/seller assembles and fulfils this specific hamper.
    -- Nullable: there's no provider-selection UI on /tailoring yet, so an
    -- order with no provider chosen falls back to a flat shipping rate
    -- (see computeCartShipping in src/lib/shipping.ts) rather than being
    -- blocked outright — the column exists so that UI can be added later
    -- without another migration.
    provider_id UUID REFERENCES providers(id) ON DELETE SET NULL,
    subtotal NUMERIC NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
    shipping_cost NUMERIC NOT NULL DEFAULT 0 CHECK (shipping_cost >= 0),
    total_amount NUMERIC NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
    -- Sum of (slots * quantity) across every item — a record of how large
    -- the hamper was, now that the hamper itself has no capacity cap.
    total_slots INTEGER NOT NULL DEFAULT 0 CHECK (total_slots >= 0),
    payment_method TEXT DEFAULT 'Cash on Delivery',
    status TEXT CHECK (status IN ('confirmed', 'processing', 'shipped', 'delivered', 'cancelled')) DEFAULT 'confirmed' NOT NULL,
    placed_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ============================================================
-- order_customization_items: one row per distinct product in the hamper
-- ============================================================
CREATE TABLE IF NOT EXISTS order_customization_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID REFERENCES order_customization(id) ON DELETE CASCADE NOT NULL,
    -- SET NULL (not CASCADE / NOT NULL) — if a product is later removed
    -- from the customization_products catalog, past orders that included
    -- it must still show what was bought. product_name/unit_price/etc.
    -- below are a snapshot taken at order time for exactly this reason;
    -- they never change even if the live product's price does later.
    product_id UUID REFERENCES customization_products(id) ON DELETE SET NULL,
    product_name TEXT NOT NULL,
    product_emoji TEXT DEFAULT '🎁',
    category TEXT,
    slots INTEGER NOT NULL CHECK (slots >= 1),
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    unit_price NUMERIC NOT NULL CHECK (unit_price >= 0),
    line_total NUMERIC GENERATED ALWAYS AS (quantity * unit_price) STORED
);

-- ============================================================
-- order_customization_shipping: one row per order (1:1)
-- ============================================================
CREATE TABLE IF NOT EXISTS order_customization_shipping (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID REFERENCES order_customization(id) ON DELETE CASCADE NOT NULL UNIQUE,
    full_name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT NOT NULL,
    street_address TEXT NOT NULL,
    city TEXT NOT NULL,
    zip_code TEXT NOT NULL,
    country TEXT DEFAULT 'India',
    tracking_number TEXT,
    estimated_delivery DATE,
    -- Resolved from zip_code server-side at order time (offline dataset —
    -- see src/lib/geo.ts / src/lib/indiaPost.ts), not trusted from the
    -- client. Same convention as order_shipping.
    gpo_name TEXT,
    district TEXT,
    state TEXT
);

CREATE INDEX IF NOT EXISTS idx_order_customization_user_id ON order_customization(user_id);
CREATE INDEX IF NOT EXISTS idx_order_customization_provider_id ON order_customization(provider_id);
CREATE INDEX IF NOT EXISTS idx_order_customization_items_order_id ON order_customization_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_customization_items_product_id ON order_customization_items(product_id);

ALTER TABLE order_customization ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_customization_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_customization_shipping ENABLE ROW LEVEL SECURITY;

-- Same posture as recipients / gift_cycles: these rows hold a customer's
-- name, email, phone, and home address, so there are NO anon/public
-- policies at all — service role only. Ownership (a user can only ever
-- see *their own* orders) is enforced in the API layer via the
-- session-derived user_id, exactly like GET /api/orders already does.
DO $$
BEGIN
  CREATE POLICY "order_customization_service_role_only" ON order_customization
      FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE POLICY "order_customization_items_service_role_only" ON order_customization_items
      FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE POLICY "order_customization_shipping_service_role_only" ON order_customization_shipping
      FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================
-- Atomic RPC — order + every item + shipping all commit or roll back
-- together. Called from the API route via supabaseAdmin.rpc(), the same
-- pattern create_order_atomic() uses for the main shop checkout.
--
-- NOTE ON THE RETURNING-CLAUSE FIX: RETURNS TABLE(order_id UUID,
-- order_number TEXT) implicitly declares `order_id`/`order_number` as
-- PL/pgSQL variables in this function's scope. Writing a bare
-- `RETURNING id, order_number` below is genuinely ambiguous — Postgres
-- can't tell whether `order_number` means the table column or that
-- implicit variable — and errors at CALL time, not at CREATE FUNCTION
-- time, so this only surfaces the first time the function actually runs.
-- Confirmed by testing: the table/column reference must be qualified
-- (`order_customization.order_number`) to resolve the ambiguity.
-- ============================================================
CREATE OR REPLACE FUNCTION create_customization_order_atomic(
    p_user_id UUID,
    p_provider_id UUID,
    p_subtotal NUMERIC,
    p_shipping_cost NUMERIC,
    p_total_amount NUMERIC,
    p_total_slots INTEGER,
    p_payment_method TEXT,
    p_items JSONB,
    p_shipping JSONB
) RETURNS TABLE(order_id UUID, order_number TEXT) AS $$
DECLARE
    v_order_id UUID;
    v_order_number TEXT;
    v_item JSONB;
BEGIN
    IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'ORDER_NO_ITEMS';
    END IF;

    INSERT INTO order_customization (
        user_id, provider_id, subtotal, shipping_cost, total_amount, total_slots, payment_method
    ) VALUES (
        p_user_id, p_provider_id, p_subtotal, p_shipping_cost, p_total_amount, p_total_slots,
        COALESCE(p_payment_method, 'Cash on Delivery')
    )
    RETURNING order_customization.id, order_customization.order_number INTO v_order_id, v_order_number;

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        INSERT INTO order_customization_items (
            order_id, product_id, product_name, product_emoji, category, slots, quantity, unit_price
        ) VALUES (
            v_order_id,
            NULLIF(v_item->>'product_id', '')::UUID,
            v_item->>'product_name',
            COALESCE(v_item->>'product_emoji', '🎁'),
            v_item->>'category',
            (v_item->>'slots')::INTEGER,
            (v_item->>'quantity')::INTEGER,
            (v_item->>'unit_price')::NUMERIC
        );
    END LOOP;

    INSERT INTO order_customization_shipping (
        order_id, full_name, email, phone, street_address, city, zip_code, country,
        gpo_name, district, state
    ) VALUES (
        v_order_id,
        p_shipping->>'full_name',
        p_shipping->>'email',
        p_shipping->>'phone',
        p_shipping->>'street_address',
        p_shipping->>'city',
        p_shipping->>'zip_code',
        COALESCE(p_shipping->>'country', 'India'),
        p_shipping->>'gpo_name',
        p_shipping->>'district',
        p_shipping->>'state'
    );

    RETURN QUERY SELECT v_order_id, v_order_number;
END;
$$ LANGUAGE plpgsql;

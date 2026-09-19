-- 1. Signin Table (User Account)
CREATE TABLE IF NOT EXISTS signin (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_name TEXT NOT NULL,
    mobile_number TEXT,
    email TEXT UNIQUE NOT NULL,
    -- Added: bcrypt password hash. Was previously stored client-side/plaintext-adjacent (SHA-256).
    password_hash TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Migration for existing databases that already had a `signin` table without this column:
ALTER TABLE signin ADD COLUMN IF NOT EXISTS password_hash TEXT;

-- 2. Profile Table (User Profile)
CREATE TABLE IF NOT EXISTS profile (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID UNIQUE REFERENCES signin(id) ON DELETE CASCADE,
    subscription_type TEXT CHECK (subscription_type IN ('urgent', 'major', 'prime')) DEFAULT 'prime' NOT NULL,
    name TEXT NOT NULL,
    age INTEGER,
    date_of_birth DATE,
    topic_interested TEXT[] DEFAULT '{}'::TEXT[] NOT NULL,
    like_products_id UUID[] DEFAULT '{}'::UUID[] NOT NULL,
    avatar_url TEXT DEFAULT 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&q=80',
    -- 6-digit Indian PIN code, collected as a required field at signup.
    -- See supabase_migration_019_profile_pincode.sql.
    pincode TEXT NOT NULL CHECK (pincode ~ '^[1-9][0-9]{5}$'),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. Follows Table (Junction Table for Follow Logic)
CREATE TABLE IF NOT EXISTS follows (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    follower_id UUID REFERENCES profile(id) ON DELETE CASCADE,
    following_id UUID REFERENCES profile(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE (follower_id, following_id)
);

-- 3a. Providers Table (Gift Providers / Sellers — the vendors who actually
-- fulfil the gifts customers order, as distinct from `profile` which models
-- the *customer* who is signed in and buying). Shown on the public
-- /profiles ("Providers") directory page. See src/app/api/providers/route.ts
-- and src/app/profiles/page.tsx.
CREATE TABLE IF NOT EXISTS providers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    bio TEXT DEFAULT '',
    -- Long-form "About Me" copy for the individual profile page
    -- (src/app/profiles/[id]/page.tsx). `bio` stays as the short teaser
    -- shown on the /profiles directory cards.
    description TEXT DEFAULT '',
    avatar_url TEXT DEFAULT 'https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?auto=format&fit=crop&w=150&q=80',
    specialty TEXT[] DEFAULT '{}'::TEXT[] NOT NULL,
    -- Handle only (no leading @, no full URL) — e.g. "doodleg_gifts".
    -- The provider-card "Follow on Instagram" button builds the full
    -- https://instagram.com/<handle> link from this at render time.
    instagram_handle TEXT,
    -- Free-form links the provider wants surfaced on their profile page,
    -- e.g. [{"label":"Portfolio","url":"https://..."}]. Purely for display,
    -- so a small JSONB list rather than a join table.
    internal_links JSONB DEFAULT '[]'::jsonb NOT NULL,
    rating NUMERIC CHECK (rating >= 1 AND rating <= 5) DEFAULT 5.0,
    is_verified BOOLEAN DEFAULT false,
    -- 6-digit Indian PIN code for this provider's own location — used to
    -- compute distance-based shipping (src/lib/shipping.ts). Nullable: the
    -- user manages this data directly in the table; a provider with none
    -- set falls back to the flat shipping rate for their items.
    -- See supabase_migration_020_provider_pincode_shipping_geo.sql.
    pincode TEXT CHECK (pincode IS NULL OR pincode ~ '^[1-9][0-9]{5}$'),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3b. Customization Products Table (Tailor Your Hamper catalog).
-- Deliberately separate from products_box — see
-- supabase_migration_023_customization_products.sql for the full rationale.
-- Backs GET /api/customization-products, consumed by
-- src/app/tailoring/TailoringPageClient.tsx.
CREATE TABLE IF NOT EXISTS customization_products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_name TEXT NOT NULL,
    image_url TEXT,
    -- Must stay in sync with the `Category` tabs on the tailoring page.
    -- See supabase_migration_025_expand_categories.sql for how this list
    -- grew past the original five.
    category TEXT NOT NULL CHECK (category IN (
        'Sweets', 'Drinks', 'Self-Care', 'Decor', 'Stationery',
        'Chocolates', 'Watch', 'Chain', 'Frames', 'Spray', 'Nuts', 'Boutique'
    )),
    price_in_rupees NUMERIC NOT NULL CHECK (price_in_rupees >= 0),
    -- Physical slots one unit consumes in the hamper (e.g. wine = 2).
    slots INTEGER NOT NULL DEFAULT 1 CHECK (slots >= 1),
    product_description TEXT,
    emoji TEXT DEFAULT '🎁',
    gradient TEXT DEFAULT 'from-gray-500 to-gray-700',
    -- Free-form promotional label shown on the tailoring page's yellow
    -- offer badge (e.g. "20% OFF", "NEW"). NULL means no offer — the badge
    -- doesn't render. See supabase_migration_027_add_offer_tag.sql.
    offer_tag TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    display_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4. Products Box Table
CREATE TABLE IF NOT EXISTS products_box (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    star_count NUMERIC CHECK (star_count >= 1 AND star_count <= 5) DEFAULT 5.0,
    product_name TEXT NOT NULL,
    product_images TEXT[] NOT NULL CHECK (cardinality(product_images) BETWEEN 3 AND 5),
    price_in_rupees NUMERIC NOT NULL,
    product_description TEXT,
    likes INTEGER DEFAULT 0,
    shipping_and_products TEXT,
    saving_percentage NUMERIC DEFAULT 0,
    total_reviews INTEGER DEFAULT 0,
    category TEXT NOT NULL,
    status TEXT CHECK (status IN ('NEW', 'SALE', 'HOT', 'LIMITED')) DEFAULT 'NEW',
    available_qty INTEGER DEFAULT 0,
    total_likes INTEGER DEFAULT 0,
    date_of_listed TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    sales_count INTEGER DEFAULT 0,
    gradient TEXT DEFAULT 'from-gray-500 to-gray-700',
    emoji TEXT DEFAULT '🎁',
    -- Which provider/seller actually supplies this product. Nullable so
    -- existing catalog rows keep working until backfilled.
    provider_id UUID REFERENCES providers(id) ON DELETE SET NULL,
    -- Free-form key/value spec sheet (e.g. {"Material": "Stainless Steel"}),
    -- shown as a table on the product detail page. Empty object by default —
    -- admins fill this in per product; the specs section on the page just
    -- doesn't render when it's empty. See
    -- supabase_migration_021_product_specifications.sql.
    specifications JSONB NOT NULL DEFAULT '{}'::jsonb,
    -- Provider-set, per-product — shipping is fulfilled per-provider, so
    -- there is no single fixed shipping/return policy across the catalog.
    -- Nullable: falls back to neutral copy on the product page when unset.
    -- See supabase_migration_022_product_policies.sql.
    shipping_policy TEXT,
    return_policy TEXT,
    warranty TEXT,
    product_code TEXT,
    -- Per-product payment option set by the provider — 'both' (default)
    -- lets the shopper choose Cash on Delivery or online payment; 'cod'
    -- and 'prepaid' lock it to one or the other; 'advance' requires
    -- advance_percentage% paid online now with the rest collected as COD.
    -- See supabase_migration_033_product_payment_option.sql and
    -- src/lib/paymentPlan.ts, which is the only place that reads these.
    payment_option TEXT CHECK (payment_option IN ('cod', 'prepaid', 'both', 'advance')) DEFAULT 'both',
    -- Only meaningful when payment_option = 'advance'.
    advance_percentage NUMERIC CHECK (advance_percentage IS NULL OR (advance_percentage > 0 AND advance_percentage < 100))
);

-- 5. Reviews Table
CREATE TABLE IF NOT EXISTS reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_name TEXT NOT NULL,
    -- Who actually posted this review. Required for any *new* review so the
    -- API can enforce "one review per user per product" (see the unique
    -- index below); nullable only so legacy/anonymous rows aren't broken.
    user_id UUID REFERENCES signin(id) ON DELETE CASCADE,
    date_of_posted TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    description_of_product TEXT NOT NULL,
    rating INTEGER CHECK (rating >= 1 AND rating <= 5) NOT NULL,
    product_id UUID REFERENCES products_box(id) ON DELETE CASCADE NOT NULL
);

-- A signed-in user may only have ONE review per product. Submitting again
-- edits that same row instead of creating a duplicate (enforced here at the
-- DB level, not just in application code).
CREATE UNIQUE INDEX IF NOT EXISTS uq_reviews_product_user
    ON reviews(product_id, user_id)
    WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_reviews_user_id ON reviews(user_id);

-- 6. [DEPRECATED / LEGACY] Love Data Table (Loved Ones Occasions)
-- ---------------------------------------------------------------------------
-- This table is the old "gift concierge" persistence model: a single row per
-- recipient that stuffed the occasion, gift-cycle status, selected tier, AI
-- card message, and curated gift packages all into one JSON text column
-- (`unique_or_secret_preferences`). That made the data unqueryable and
-- unconstrained (status could silently become anything, or default to `{}`
-- on a JSON.parse failure).
--
-- It has been superseded by four normalized tables below: `recipients`,
-- `occasions`, `gift_cycles`, `gift_packages`. All application routes
-- (dashboard, db-onboard, cron, update-order-tier, update-card, whatsapp
-- webhook) now read/write those tables exclusively.
--
-- This table is kept ONLY until `scripts/migrate-love-data-to-normalized-schema.ts`
-- has been run against production and its output verified. Once verified,
-- drop it with `supabase_migration_002_cleanup_drop_love_data.sql`.
-- Do NOT write new features against this table.
CREATE TABLE IF NOT EXISTS love_data (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID REFERENCES profile(id) ON DELETE CASCADE NOT NULL,
    profile_name TEXT NOT NULL,
    relationship TEXT NOT NULL,
    hobbies_and_interest TEXT NOT NULL,
    unique_or_secret_preferences TEXT,
    trigger TEXT NOT NULL,
    date_autorenew_details TEXT,
    budget_tier TEXT CHECK (budget_tier IN ('100-500', '500-1000')) NOT NULL,
    collaboration_profile_id UUID REFERENCES profile(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- =====================================================================
-- Normalized "Gift Concierge" domain (replaces love_data JSON blob)
--
-- Lifecycle: recipient -> occasion -> gift_cycle -> gift_packages
-- See ARCHITECTURE.md for the full end-to-end flow diagram. This domain is
-- deliberately named and modeled separately from the `orders` /
-- `order_items` / `order_shipping` tables below, which are the *shop
-- checkout* domain (physical product purchases via /cart). "gift_cycles"
-- and "orders" both represent something a user completes, but they are not
-- the same concept — see ARCHITECTURE.md, Domains section, for why they're
-- kept apart.
-- =====================================================================

DO $$ BEGIN
    CREATE TYPE gift_cycle_status AS ENUM ('PENDING', 'CURATED', 'APPROVED', 'COMPLETED');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE gift_tier AS ENUM ('CLASSIC', 'GRAND', 'LUXURY');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- 6a. Recipients ("loved ones") — one row per person a user is tracking gifts for.
CREATE TABLE IF NOT EXISTS recipients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID REFERENCES profile(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    relationship TEXT NOT NULL,
    hobbies_and_interest TEXT NOT NULL DEFAULT '',
    quirks TEXT DEFAULT '',
    dynamic TEXT DEFAULT '',
    budget_tier TEXT CHECK (budget_tier IN ('100-500', '500-1000')) NOT NULL DEFAULT '100-500',
    -- Optional link to another profile collaborating on gifts for this recipient.
    collaboration_profile_id UUID REFERENCES profile(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 6b. Occasions — a recurring or one-off date to gift a recipient for
-- (birthday, anniversary, etc). A recipient may have more than one.
CREATE TABLE IF NOT EXISTS occasions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recipient_id UUID REFERENCES recipients(id) ON DELETE CASCADE NOT NULL,
    title TEXT NOT NULL,
    occasion_date DATE NOT NULL,
    is_recurring BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 6c. Gift cycles — the concierge lifecycle instance for one occurrence of an
-- occasion: AI curates packages, WhatsApp dispatches them, user approves one.
-- This is the row `orderId` refers to throughout the API (dashboard,
-- update-order-tier, update-card, the WhatsApp webhook, and cron).
CREATE TABLE IF NOT EXISTS gift_cycles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    occasion_id UUID REFERENCES occasions(id) ON DELETE CASCADE NOT NULL,
    status gift_cycle_status NOT NULL DEFAULT 'PENDING',
    selected_tier gift_tier,
    custom_card_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 6d. Gift packages — the (usually 3) AI-curated tiered options for a gift cycle.
CREATE TABLE IF NOT EXISTS gift_packages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    gift_cycle_id UUID REFERENCES gift_cycles(id) ON DELETE CASCADE NOT NULL,
    tier gift_tier NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    estimated_price NUMERIC NOT NULL DEFAULT 0,
    reason TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_recipients_profile_id ON recipients(profile_id);
CREATE INDEX IF NOT EXISTS idx_occasions_recipient_id ON occasions(recipient_id);
CREATE INDEX IF NOT EXISTS idx_gift_cycles_occasion_id ON gift_cycles(occasion_id);
CREATE INDEX IF NOT EXISTS idx_gift_packages_gift_cycle_id ON gift_packages(gift_cycle_id);

ALTER TABLE recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE occasions ENABLE ROW LEVEL SECURITY;
ALTER TABLE gift_cycles ENABLE ROW LEVEL SECURITY;
ALTER TABLE gift_packages ENABLE ROW LEVEL SECURITY;

-- Same posture as love_data: these contain gift/recipient secrets, so no
-- anon/public policies at all — service role only. Ownership is enforced in
-- the API layer via the session-derived profile_id / user_id chain.
CREATE POLICY "recipients_service_role_only" ON recipients
    FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
CREATE POLICY "occasions_service_role_only" ON occasions
    FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
CREATE POLICY "gift_cycles_service_role_only" ON gift_cycles
    FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
CREATE POLICY "gift_packages_service_role_only" ON gift_packages
    FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- 7. Orders Table (Shop Checkout — added: was missing from this schema file
--    even though src/app/api/orders/route.ts depends on it)
CREATE TABLE IF NOT EXISTS orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES signin(id) ON DELETE SET NULL, -- NULL = guest checkout
    order_number TEXT UNIQUE NOT NULL DEFAULT (
        'DG-' || to_char(timezone('utc', now()), 'YYYYMMDD') || '-' || substr(md5(random()::text), 1, 6)
    ),
    subtotal NUMERIC NOT NULL DEFAULT 0,
    discount_amount NUMERIC NOT NULL DEFAULT 0,
    coupon_code TEXT,
    coupon_pct NUMERIC NOT NULL DEFAULT 0,
    shipping_cost NUMERIC NOT NULL DEFAULT 0,
    gift_wrap_cost NUMERIC NOT NULL DEFAULT 0,
    total_amount NUMERIC NOT NULL DEFAULT 0,
    gift_wrap BOOLEAN NOT NULL DEFAULT false,
    payment_method TEXT DEFAULT 'Credit Card',
    status TEXT CHECK (status IN ('confirmed', 'processing', 'shipped', 'delivered', 'cancelled')) DEFAULT 'confirmed' NOT NULL,
    placed_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 8. Order Items Table
CREATE TABLE IF NOT EXISTS order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID REFERENCES orders(id) ON DELETE CASCADE NOT NULL,
    product_id TEXT NOT NULL,
    product_name TEXT NOT NULL,
    product_emoji TEXT DEFAULT '🎁',
    selected_color TEXT,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    unit_price NUMERIC NOT NULL CHECK (unit_price >= 0),
    line_total NUMERIC GENERATED ALWAYS AS (quantity * unit_price) STORED
);

-- 9. Order Shipping Table
CREATE TABLE IF NOT EXISTS order_shipping (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID REFERENCES orders(id) ON DELETE CASCADE NOT NULL UNIQUE,
    full_name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT,
    street_address TEXT NOT NULL,
    city TEXT NOT NULL,
    zip_code TEXT,
    country TEXT DEFAULT 'India',
    tracking_number TEXT,
    estimated_delivery DATE,
    -- Resolved from zip_code server-side at order time (offline dataset —
    -- see src/lib/geo.ts), not trusted from the client. Kept as a record of
    -- what the PIN resolved to at the time the order was placed.
    -- See supabase_migration_020_provider_pincode_shipping_geo.sql.
    gpo_name TEXT,
    district TEXT,
    state TEXT
);

-- 10. Order Customization Tables (Tailor Your Hamper checkout — see
-- supabase_migration_029_order_customization.sql for the full rationale,
-- the atomic RPC function that writes all three together, and the tests
-- run against them: rollback on a bad item, cascade delete, FK rejection,
-- and product-deletion survival).
CREATE TABLE IF NOT EXISTS order_customization (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES signin(id) ON DELETE SET NULL,
    order_number TEXT UNIQUE NOT NULL DEFAULT (
        'DG-CUSTOM-' || to_char(timezone('utc', now()), 'YYYYMMDD') || '-' || substr(md5(random()::text), 1, 6)
    ),
    provider_id UUID REFERENCES providers(id) ON DELETE SET NULL,
    subtotal NUMERIC NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
    shipping_cost NUMERIC NOT NULL DEFAULT 0 CHECK (shipping_cost >= 0),
    total_amount NUMERIC NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
    total_slots INTEGER NOT NULL DEFAULT 0 CHECK (total_slots >= 0),
    payment_method TEXT DEFAULT 'Cash on Delivery',
    status TEXT CHECK (status IN ('confirmed', 'processing', 'shipped', 'delivered', 'cancelled')) DEFAULT 'confirmed' NOT NULL,
    placed_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS order_customization_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID REFERENCES order_customization(id) ON DELETE CASCADE NOT NULL,
    product_id UUID REFERENCES customization_products(id) ON DELETE SET NULL,
    product_name TEXT NOT NULL,
    product_emoji TEXT DEFAULT '🎁',
    category TEXT,
    slots INTEGER NOT NULL CHECK (slots >= 1),
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    unit_price NUMERIC NOT NULL CHECK (unit_price >= 0),
    line_total NUMERIC GENERATED ALWAYS AS (quantity * unit_price) STORED
);

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
    gpo_name TEXT,
    district TEXT,
    state TEXT
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_providers_name ON providers(name);
CREATE INDEX IF NOT EXISTS idx_customization_products_category ON customization_products(category);
CREATE INDEX IF NOT EXISTS idx_customization_products_active ON customization_products(is_active);
CREATE INDEX IF NOT EXISTS idx_products_box_provider_id ON products_box(provider_id);
CREATE INDEX IF NOT EXISTS idx_profile_user_id ON profile(user_id);
CREATE INDEX IF NOT EXISTS idx_follows_follower ON follows(follower_id);
CREATE INDEX IF NOT EXISTS idx_follows_following ON follows(following_id);
CREATE INDEX IF NOT EXISTS idx_reviews_product_id ON reviews(product_id);
CREATE INDEX IF NOT EXISTS idx_love_data_profile_id ON love_data(profile_id);
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_shipping_order_id ON order_shipping(order_id);

-- =====================================================================
-- Row-Level Security
--
-- This app uses custom (non-Supabase-Auth) authentication: sessions are
-- signed JWTs issued by src/lib/session.ts, verified server-side in each
-- API route and in middleware.ts. Postgres RLS therefore has no
-- `auth.uid()` to key off of. The concrete, safe pattern here is:
--
--   1. ALL application reads/writes go through Next.js API routes using
--      the Supabase SERVICE ROLE client (src/lib/supabaseAdmin.ts), which
--      bypasses RLS *after* the API route has already verified the caller's
--      session and confirmed the row belongs to them.
--   2. RLS is still enabled on every table as defense-in-depth: if the
--      anon/public key were ever used directly (misconfiguration, a bug,
--      a future client-side query), it is blocked by default rather than
--      silently exposed.
--   3. `signin` (password hashes) is locked down completely — not even
--      public-read — since it's the most sensitive table in the app.
-- =====================================================================

ALTER TABLE signin ENABLE ROW LEVEL SECURITY;
ALTER TABLE profile ENABLE ROW LEVEL SECURITY;
ALTER TABLE follows ENABLE ROW LEVEL SECURITY;
ALTER TABLE providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE customization_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE products_box ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE love_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_shipping ENABLE ROW LEVEL SECURITY;

-- signin: service-role only. No anon/authenticated policies at all —
-- with RLS enabled and zero permissive policies, every non-service-role
-- request is denied by default. Password hashes are never selectable
-- via the anon key under any circumstances.

-- profile: readable by anyone with the anon key (profile browsing feature
-- in src/app/api/profiles/route.ts needs this), but only the service role
-- may write. The API layer is what restricts writes to "your own row".
CREATE POLICY "profile_public_read" ON profile
    FOR SELECT USING (true);
CREATE POLICY "profile_service_role_write" ON profile
    FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- follows: public read (needed to compute "isFollowing" / follower counts);
-- writes only via service role (src/app/api/profiles/follow/route.ts).
CREATE POLICY "follows_public_read" ON follows
    FOR SELECT USING (true);
CREATE POLICY "follows_service_role_write" ON follows
    FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- providers: public read (the /profiles "Providers" directory is a public
-- page, same posture as products_box), writes restricted to service role.
CREATE POLICY "providers_public_read" ON providers
    FOR SELECT USING (true);
CREATE POLICY "providers_service_role_write" ON providers
    FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- products_box: public read (shop catalog), writes restricted to service role.
CREATE POLICY "products_box_public_read" ON products_box
    FOR SELECT USING (true);
CREATE POLICY "products_box_service_role_write" ON products_box
    FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- customization_products: public read (the /tailoring hamper builder is a
-- public page), writes restricted to service role.
CREATE POLICY "customization_products_public_read" ON customization_products
    FOR SELECT USING (true);
CREATE POLICY "customization_products_service_role_write" ON customization_products
    FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- reviews: public read, writes restricted to service role.
CREATE POLICY "reviews_public_read" ON reviews
    FOR SELECT USING (true);
CREATE POLICY "reviews_service_role_write" ON reviews
    FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- love_data: contains gift/recipient secrets — service role only, no public
-- read at all. Ownership (which profile a row belongs to) is enforced in
-- the API layer (update-order-tier, update-card, whatsapp webhook).
CREATE POLICY "love_data_service_role_only" ON love_data
    FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- orders / order_items / order_shipping: contain PII (shipping address,
-- email, phone) and order history — service role only. Ownership (a user
-- can only see their own orders) is enforced in src/app/api/orders/route.ts
-- via the session-derived user id.
CREATE POLICY "orders_service_role_only" ON orders
    FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
CREATE POLICY "order_items_service_role_only" ON order_items
    FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
CREATE POLICY "order_shipping_service_role_only" ON order_shipping
    FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- =====================================================================
-- Sample providers (safe to delete/edit) so the /profiles directory has
-- something to show on a fresh install. Only inserted if the table is
-- empty, so re-running this file is a no-op here.
-- =====================================================================
-- Demo seed data intentionally omitted from production migrations.

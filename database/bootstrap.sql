-- NEW EMPTY SUPABASE PROJECT ONLY. No demo seed data.
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

-- FILE: supabase_migration_003_add_providers.sql
-- Migration 003: Add `providers` (gift providers / sellers)
-- ---------------------------------------------------------------------------
-- Run this against an existing database that was created before the
-- `providers` table existed in supabase_schema.sql. It is safe to re-run.
--
-- Context: the public /profiles page used to list *customer* profiles
-- (people who signed in). It has been repurposed to list the providers /
-- sellers who actually supply the gifts customers order, each with an
-- "Follow on Instagram" link. See src/app/profiles/page.tsx and
-- src/app/api/providers/route.ts.

CREATE TABLE IF NOT EXISTS providers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    bio TEXT DEFAULT '',
    avatar_url TEXT DEFAULT 'https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?auto=format&fit=crop&w=150&q=80',
    specialty TEXT[] DEFAULT '{}'::TEXT[] NOT NULL,
    instagram_handle TEXT,
    rating NUMERIC CHECK (rating >= 1 AND rating <= 5) DEFAULT 5.0,
    is_verified BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE products_box ADD COLUMN IF NOT EXISTS provider_id UUID REFERENCES providers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_providers_name ON providers(name);
CREATE INDEX IF NOT EXISTS idx_products_box_provider_id ON products_box(provider_id);

ALTER TABLE providers ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    CREATE POLICY "providers_public_read" ON providers
        FOR SELECT USING (true);
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE POLICY "providers_service_role_write" ON providers
        FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- Optional: a few sample providers so the /profiles page isn't empty right
-- after migrating. Safe to delete/edit afterwards — remove this block if
-- you'd rather add real providers yourself via Supabase.
-- Demo seed data intentionally omitted from production migrations.

-- FILE: supabase_migration_004_reviews_user_id.sql
-- Migration 004: One review per signed-in user per product
-- ---------------------------------------------------------------------------
-- Problem being fixed: `reviews` had no link to the `signin` (auth) table at
-- all — a review only stored a free-text `user_name`. That meant:
--   1. There was nothing stopping the same signed-in user from submitting an
--      unlimited number of reviews for the same product.
--   2. The server had no reliable way to know "does this user already have
--      a review here?", so it could never turn a second submission into an
--      edit of the first one.
--
-- This migration adds `user_id`, backfills it as best-effort for any
-- pre-existing rows, and then adds a UNIQUE constraint on
-- (product_id, user_id) so the database itself enforces "one review per
-- user per product" — the API can no longer get this wrong even by
-- accident.
--
-- Safe to re-run.

ALTER TABLE reviews ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES signin(id) ON DELETE CASCADE;

-- Legacy rows created before this migration have no user_id. They're kept
-- (so historical reviews aren't deleted) but excluded from the uniqueness
-- guarantee below, since NULL is never considered equal to NULL in a
-- standard UNIQUE constraint — i.e. any number of legacy/anonymous rows can
-- coexist, but once a row has a real user_id, that (product_id, user_id)
-- pair can only exist once.
CREATE UNIQUE INDEX IF NOT EXISTS uq_reviews_product_user
    ON reviews(product_id, user_id)
    WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_reviews_user_id ON reviews(user_id);

-- FILE: supabase_migration_005_provider_profile_details.sql
-- Migration 005: Provider profile page — description + internal links
-- ---------------------------------------------------------------------------
-- Run this against an existing database that was created before these
-- columns existed on `providers`. Safe to re-run.
--
-- Context: the public provider directory (/profiles) only ever showed the
-- short `bio` teaser. The new individual profile page
-- (src/app/profiles/[id]/page.tsx) needs two more things per provider:
--
--   1. `description`   — a longer, "About Me" style write-up (bio stays as
--                         the short card teaser, description is the full
--                         story shown on the profile page).
--   2. `internal_links` — a small JSONB list of links the provider wants to
--                         surface on their own profile page (portfolio site,
--                         price list, booking page, etc). Shape:
--                           [{ "label": "Portfolio", "url": "https://..." }]
--                         Kept as JSONB (not a join table) since these are
--                         purely display links, not relational data.

ALTER TABLE providers ADD COLUMN IF NOT EXISTS description TEXT DEFAULT '';
ALTER TABLE providers ADD COLUMN IF NOT EXISTS internal_links JSONB DEFAULT '[]'::jsonb NOT NULL;

COMMENT ON COLUMN providers.description IS 'Long-form "About Me" copy for the provider profile page (src/app/profiles/[id]/page.tsx). Distinct from the short `bio` teaser shown on provider cards.';
COMMENT ON COLUMN providers.internal_links IS 'JSONB array of {label, url} link objects the provider wants shown on their profile page, e.g. portfolio site, price list, booking page.';

-- Backfill a couple of the sample providers from migration 003 so the new
-- profile page isn't empty right after migrating. Safe to delete/edit.
UPDATE providers SET
  description = 'We hand-tie every bouquet to order in small batches, sourcing seasonal stems from local growers wherever we can. What started as a kitchen-table hobby has grown into a studio that now ships preserved flower boxes across the country — but every order still gets the same close attention as our very first one.',
  internal_links = '[{"label":"Portfolio","url":"https://instagram.com/thepetalworkshop"},{"label":"Price List","url":"https://instagram.com/thepetalworkshop"}]'::jsonb
WHERE name = 'The Petal Workshop' AND (description IS NULL OR description = '');

UPDATE providers SET
  description = 'Grainwood Craft Co. is a two-person woodshop specialising in engraved keepsakes — cutting boards, jewellery boxes, and home decor pieces that are built to be handed down. Every piece is sanded, finished, and packed by hand before it ships.',
  internal_links = '[{"label":"Portfolio","url":"https://instagram.com/grainwoodcraftco"}]'::jsonb
WHERE name = 'Grainwood Craft Co.' AND (description IS NULL OR description = '');

-- FILE: supabase_migration_006_follows_providers.sql
-- Migration 006: Reuse `follows` for user → provider follows
-- ---------------------------------------------------------------------------
-- Run this against an existing database. Safe to re-run.
--
-- Context: the /profiles directory page (src/app/profiles/page.tsx) gets a
-- "Follow" button so a signed-in user can follow a gift *provider* (not
-- another customer, which is what `follows.following_id -> profile(id)`
-- originally modelled and what the app no longer does). Rather than add a
-- brand-new table, `follows` is extended with a `provider_id` column so it
-- can express either kind of edge:
--   - following_id set, provider_id NULL  -> legacy user-follows-user (unused)
--   - provider_id set, following_id NULL  -> user-follows-provider (new)
--
-- See src/app/api/providers/follow/route.ts for the read/write API.

ALTER TABLE follows ADD COLUMN IF NOT EXISTS provider_id UUID REFERENCES providers(id) ON DELETE CASCADE;

-- Exactly one target per row.
ALTER TABLE follows DROP CONSTRAINT IF EXISTS follows_target_check;
ALTER TABLE follows ADD CONSTRAINT follows_target_check CHECK (
  (following_id IS NOT NULL AND provider_id IS NULL) OR
  (following_id IS NULL AND provider_id IS NOT NULL)
);

-- The original UNIQUE (follower_id, following_id) doesn't stop duplicate
-- provider-follows, since Postgres treats every NULL following_id as
-- distinct. A partial unique index covers the provider case instead.
CREATE UNIQUE INDEX IF NOT EXISTS idx_follows_follower_provider_unique
  ON follows(follower_id, provider_id)
  WHERE provider_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_follows_provider ON follows(provider_id);

COMMENT ON COLUMN follows.provider_id IS 'Set when this row is a user following a gift provider (src/app/profiles/page.tsx "Follow" button). Mutually exclusive with following_id — see follows_target_check.';

-- FILE: supabase_migration_007_unique_username.sql
-- Migration 007: Enforce username uniqueness at the DB level
-- ---------------------------------------------------------------------------
-- Run this against an existing database. Safe to re-run.
--
-- Context: src/app/api/auth/signup/route.ts's pre-insert check
-- (`.ilike('user_name', userName).maybeSingle()`) is a bare TOCTOU race
-- without a backing unique index — two concurrent signups for the same
-- username can both pass the check and both INSERT successfully. Once that
-- happens, src/app/api/auth/signin/route.ts's own
-- `.ilike('user_name', userName).maybeSingle()` throws (PGRST116, "multiple
-- (or no) rows returned") for *both* accounts, which the route currently
-- treats identically to a bad password — permanently locking out both users
-- with no recovery path short of a manual DB fix.
--
-- This index is what the 23505-handling branch in signup/route.ts has always
-- assumed exists (see that file's comment referencing "migration 007") —
-- this file is what actually creates it.

-- ── Before running the CREATE UNIQUE INDEX below ──
-- CREATE UNIQUE INDEX will fail outright if any duplicate (case-insensitive)
-- usernames already exist. Run this query first to find them:
--
--   SELECT LOWER(user_name) AS lower_user_name, array_agg(id ORDER BY created_at) AS ids, count(*)
--   FROM signin
--   GROUP BY LOWER(user_name)
--   HAVING count(*) > 1;
--
-- For each duplicate group, decide which row is the "real" account (e.g. the
-- oldest, or whichever still receives login attempts) and rename or remove
-- the others before proceeding, e.g.:
--
--   UPDATE signin SET user_name = user_name || '-dup-' || substr(id::text, 1, 8)
--   WHERE id = '<the row(s) you are NOT keeping>';

CREATE UNIQUE INDEX IF NOT EXISTS uq_signin_user_name_lower
  ON signin (LOWER(user_name));

-- FILE: supabase_migration_008_decrement_stock_rpc.sql
-- Migration 008: Atomic stock decrement for products_box
-- ---------------------------------------------------------------------------
-- Run this against an existing database. Safe to re-run.
--
-- Context: src/app/api/orders/route.ts's computeServerTrustedPricing() reads
-- available_qty and checks `quantity <= available_qty`, but nothing ever
-- decremented available_qty after the order was placed, and the check itself
-- was a check-then-insert race (two concurrent orders for the last unit could
-- both pass).
--
-- This function performs the decrement (and the "is there enough stock"
-- check) as a single atomic UPDATE ... WHERE ... RETURNING, so concurrent
-- callers serialize on the row instead of racing each other. It returns one
-- row per call when the decrement succeeded, and zero rows when there wasn't
-- enough stock left (available_qty < p_quantity) — the caller
-- (src/app/api/orders/route.ts) treats an empty result as "ran out of
-- stock between the price check and checkout" and rolls the order back.
--
-- Calling this with a *negative* p_quantity restocks instead of decrementing
-- (available_qty - (-n) = available_qty + n), which is how the order route
-- rolls back any items it already decremented earlier in the same request
-- when a later item in the same order turns out to be out of stock. The
-- `available_qty >= p_quantity` guard is trivially true for a restock since
-- p_quantity is negative there.
CREATE OR REPLACE FUNCTION decrement_product_stock(p_product_id UUID, p_quantity INTEGER)
RETURNS TABLE(id UUID, available_qty INTEGER)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  UPDATE products_box
  SET available_qty = products_box.available_qty - p_quantity
  WHERE products_box.id = p_product_id
    AND products_box.available_qty >= p_quantity
  RETURNING products_box.id, products_box.available_qty;
END;
$$;

-- service-role only, same posture as the rest of this domain's writes.
REVOKE ALL ON FUNCTION decrement_product_stock(UUID, INTEGER) FROM PUBLIC;

-- FILE: supabase_migration_009_recipient_budget_tier_enum.sql
-- Migration 009: Store the gift tier directly in recipients.budget_tier
-- ---------------------------------------------------------------------------
-- Run this against an existing database. Safe to re-run.
--
-- Context: recipients.budget_tier previously stored a *price range* string
-- ('100-500' | '500-1000') rather than the GiftTier itself. That scheme could
-- only round-trip two of the three tiers:
--   - src/app/api/db-onboard/route.ts wrote
--       selectedTier === 'CLASSIC' ? '100-500' : '500-1000'
--     which mapped BOTH 'GRAND' and 'LUXURY' onto '500-1000'.
--   - src/lib/giftDomain.ts's mapRecipientToDashboardShape then read
--       budget_tier === '100-500' ? 'CLASSIC' : 'GRAND'
--     so a LUXURY recipient displayed as GRAND everywhere the dashboard shows
--     the recipient-level budget tier badge.
-- Meanwhile src/app/api/cron/route.ts was already reading recipient.budget_tier
-- as if it held a GiftTier value directly
-- (`giftCycle.selected_tier || recipient.budget_tier || 'GRAND'`), which only
-- ever worked by coincidence for CLASSIC/GRAND. Storing the GiftTier value
-- directly makes every read site agree, and actually distinguishes LUXURY.

-- Best-effort conversion of existing rows under the old range scheme. The old
-- scheme could never distinguish a LUXURY selection from GRAND (both stored
-- '500-1000'), so any existing '500-1000' row is conservatively mapped to
-- GRAND — there's no way to recover which of these were originally LUXURY
-- from this column alone.
ALTER TABLE recipients DROP CONSTRAINT IF EXISTS recipients_budget_tier_check;
UPDATE recipients SET budget_tier = 'CLASSIC' WHERE budget_tier = '100-500';
UPDATE recipients SET budget_tier = 'GRAND' WHERE budget_tier = '500-1000';


ALTER TABLE recipients ADD CONSTRAINT recipients_budget_tier_check
  CHECK (budget_tier IN ('CLASSIC', 'GRAND', 'LUXURY'));
ALTER TABLE recipients ALTER COLUMN budget_tier SET DEFAULT 'CLASSIC';

-- FILE: supabase_migration_010_gift_packages_product_link.sql
-- Migration 010: Ground gift_packages in the real product catalog
-- ---------------------------------------------------------------------------
-- Run this against an existing database. Safe to re-run.
--
-- Context: /api/curate previously asked Gemini to invent a gift package from
-- plain text with no connection to anything actually sellable in
-- products_box. The curation "title/description/price" were fiction — there
-- was no way to fulfil the order from real inventory, and no reliable link
-- between a gift_packages row and a products_box row.
--
-- src/services/ai.ts now grounds curation in real products_box rows (see
-- AIService.curateGiftsFromCatalog) and returns the matched product's id.
-- This column persists that link so a gift_packages row can be resolved back
-- to its real product (price, images, stock, provider) at read time.

ALTER TABLE public.gift_packages
  ADD COLUMN IF NOT EXISTS product_id uuid REFERENCES public.products_box(id);

CREATE INDEX IF NOT EXISTS idx_gift_packages_product_id ON public.gift_packages(product_id);

COMMENT ON COLUMN public.gift_packages.product_id IS
  'Real products_box row this curated package resolves to, when the AI curation engine matched one from the live catalog. Nullable: older rows and pure-experience packages (no matching physical product) leave this null.';

-- FILE: supabase_migration_011_provider_profile_overview_fields.sql
-- Migration 011: Provider profile "overview" template fields
-- ---------------------------------------------------------------------------
-- Run this against an existing database. Safe to re-run.
--
-- Context: the individual provider profile page
-- (src/app/profiles/[id]/page.tsx) was redesigned to match a social-style
-- profile template (banner photo, handle, title/role line, location,
-- primary website link, founded date, joined date, followers/products
-- counts). Most of that already exists on `providers` (name, bio,
-- description, avatar_url, specialty, is_verified, created_at, and the
-- follower count is computed at query time from `follows`) — this
-- migration adds the handful of columns that don't have anywhere to live
-- yet.

-- 1. Handle shown as "@username" under the display name.
ALTER TABLE providers ADD COLUMN IF NOT EXISTS username TEXT;
COMMENT ON COLUMN providers.username IS 'Handle shown as "@username" on the profile page (src/app/profiles/[id]/page.tsx), e.g. "petalworkshop". No leading @.';

-- Case-insensitive uniqueness, same pattern as migration 007's
-- uq_signin_user_name_lower. Partial index (WHERE username IS NOT NULL) so
-- existing providers without a handle yet don't block each other.
CREATE UNIQUE INDEX IF NOT EXISTS uq_providers_username_lower
  ON providers (LOWER(username))
  WHERE username IS NOT NULL;

-- 2. Banner / cover photo shown behind the avatar at the top of the profile.
ALTER TABLE providers ADD COLUMN IF NOT EXISTS cover_url TEXT;
COMMENT ON COLUMN providers.cover_url IS 'Banner image shown behind the avatar on the profile page. Falls back to a neutral gradient in the UI when null.';

-- 3. Short role/title line shown next to a briefcase icon (e.g.
--    "Florist & Studio Owner"), distinct from the `specialty` tag list.
ALTER TABLE providers ADD COLUMN IF NOT EXISTS title TEXT;
COMMENT ON COLUMN providers.title IS 'Short role/tagline shown next to the briefcase icon on the profile page, e.g. "Florist & Studio Owner".';

-- 4. Free-text location shown next to a pin icon.
ALTER TABLE providers ADD COLUMN IF NOT EXISTS location TEXT;
COMMENT ON COLUMN providers.location IS 'Free-text location shown next to the pin icon on the profile page, e.g. "Kochi, Kerala".';

-- 5. Primary website, shown as its own clickable line (distinct from the
--    `internal_links` JSONB list, which stays for the secondary
--    portfolio/price-list/booking links further down the page).
ALTER TABLE providers ADD COLUMN IF NOT EXISTS website_url TEXT;
COMMENT ON COLUMN providers.website_url IS 'Primary website shown next to the link icon on the profile page. Secondary links (portfolio, price list, etc.) stay in internal_links.';

-- 6. Founded date, shown next to a gift icon (business equivalent of the
--    template's personal "Born" field).
ALTER TABLE providers ADD COLUMN IF NOT EXISTS founded_date DATE;
COMMENT ON COLUMN providers.founded_date IS 'Date the business/studio was founded, shown next to the gift icon on the profile page (business equivalent of a personal "born on" field).';

-- `providers.created_at` already exists and is reused as-is for the
-- "Joined <month year>" line — no new column needed for that one.

-- ── Optional backfill for the two sample providers seeded in earlier
--    migrations, so the new profile page isn't empty right after migrating.
--    Safe to delete/edit.
UPDATE providers SET
  username = 'petalworkshop',
  title = 'Florist & Studio Owner',
  location = 'Kochi, Kerala',
  website_url = 'https://instagram.com/thepetalworkshop',
  founded_date = '2019-03-01',
  cover_url = 'https://images.unsplash.com/photo-1490750967868-88aa4486c946?auto=format&fit=crop&w=1200&q=80'
WHERE name = 'The Petal Workshop' AND username IS NULL;

UPDATE providers SET
  username = 'grainwoodcraftco',
  title = 'Woodworker & Founder',
  location = 'Bengaluru, Karnataka',
  website_url = 'https://instagram.com/grainwoodcraftco',
  founded_date = '2020-08-15',
  cover_url = 'https://images.unsplash.com/photo-1601058268499-e52658b8bb88?auto=format&fit=crop&w=1200&q=80'
WHERE name = 'Grainwood Craft Co.' AND username IS NULL;

-- FILE: supabase_migration_012_email_verification_google_auth.sql
-- Migration 012: Email verification (OTP) + Google OAuth support
--
-- Adds everything the redesigned /auth page needs:
--   - email_verified          : gate on /api/auth/signin until the address is confirmed
--   - otp_code_hash / otp_expires_at / otp_purpose : short-lived signup verification code
--   - auth_provider           : 'password' | 'google'
--   - google_sub              : Google's stable per-account subject id (unique)
--
-- Safe to run multiple times (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS throughout).

ALTER TABLE signin ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE signin ADD COLUMN IF NOT EXISTS otp_code_hash TEXT;
ALTER TABLE signin ADD COLUMN IF NOT EXISTS otp_expires_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE signin ADD COLUMN IF NOT EXISTS otp_purpose TEXT;
ALTER TABLE signin ADD COLUMN IF NOT EXISTS auth_provider TEXT NOT NULL DEFAULT 'password';
ALTER TABLE signin ADD COLUMN IF NOT EXISTS google_sub TEXT;

-- password_hash is now nullable in practice (Google-only accounts have none) —
-- make that explicit for anyone reading the schema.
ALTER TABLE signin ALTER COLUMN password_hash DROP NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS signin_google_sub_unique_idx
  ON signin (google_sub)
  WHERE google_sub IS NOT NULL;

-- Existing rows created before this migration are grandfathered in as verified
-- so current users aren't suddenly locked out of sign-in.
UPDATE signin SET email_verified = TRUE WHERE email_verified IS NOT TRUE;

-- FILE: supabase_migration_013_shipping_fields_required.sql
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

-- FILE: supabase_migration_014_rate_limit_store.sql
-- ── Durable, shared rate-limit store ──
-- Replaces the in-memory Map in src/lib/rateLimit.ts, which was per-instance
-- and reset on every cold start / redeploy — on Vercel that meant the real
-- effective limit was (configured limit × running instance count), not the
-- configured limit, making brute-force protection on auth routes and the
-- billing guard on the unauthenticated AI routes (/api/curate,
-- /api/card-writer) both effectively bypassable.
--
-- This table + function make the fixed-window counter global (one row per
-- key, shared by every serverless instance) and atomic (no separate
-- SELECT-then-UPDATE, so concurrent requests for the same key can't race
-- past the limit).

create table if not exists rate_limit_windows (
  key text primary key,
  count integer not null default 0,
  reset_at timestamptz not null
);

-- Supports a future scheduled cleanup job (`delete from rate_limit_windows
-- where reset_at < now() - <grace period>`) so the table doesn't grow
-- unbounded. Not built in this migration — expired rows are harmless (they
-- just get overwritten/reset on next use of that key) so cleanup is a
-- follow-up, not a blocker for closing the race condition itself.
create index if not exists rate_limit_windows_reset_at_idx on rate_limit_windows (reset_at);

-- Atomically checks whether `p_key` is within `p_limit` requests per
-- `p_window_ms`, incrementing its counter if so.
--
-- Race-safety: this locks the row for `p_key` with `SELECT ... FOR UPDATE`
-- before deciding anything, so two concurrent calls for the same key
-- serialize on that row instead of both reading a stale count and both
-- incrementing past the limit (the exact bug this migration exists to
-- fix). The whole function body runs as part of the single statement the
-- Supabase client issues to call it, so the lock, the read, and the
-- eventual update all happen inside one atomic unit of work.
--
-- For a brand-new key, the initial row doesn't exist yet to lock, so a
-- `INSERT ... ON CONFLICT (key) DO NOTHING` is used first to create it (or
-- silently no-op if a concurrent call just created it), then the loop goes
-- back around to lock whichever row now exists.
create or replace function check_and_increment_rate_limit(
  p_key text,
  p_limit integer,
  p_window_ms bigint
)
returns table (allowed boolean, retry_after_seconds integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_new_reset_at timestamptz := v_now + (p_window_ms::text || ' milliseconds')::interval;
  v_count integer;
  v_reset_at timestamptz;
  v_allowed boolean;
  v_retry_after integer;
begin
  loop
    select w.count, w.reset_at
      into v_count, v_reset_at
      from rate_limit_windows w
     where w.key = p_key
       for update;

    exit when found;

    insert into rate_limit_windows (key, count, reset_at)
    values (p_key, 0, v_now)
    on conflict (key) do nothing;
    -- Loop back around: either our insert landed and the next iteration
    -- locks it, or a concurrent call's insert won and we lock that one.
  end loop;

  if v_reset_at <= v_now then
    -- No row, or the previous window has expired: start a fresh one.
    v_count := 1;
    v_reset_at := v_new_reset_at;
    v_allowed := true;
    v_retry_after := 0;
  elsif v_count < p_limit then
    v_count := v_count + 1;
    v_allowed := true;
    v_retry_after := 0;
  else
    -- At/over the limit: reject WITHOUT incrementing, and report how long
    -- until the current window resets.
    v_allowed := false;
    v_retry_after := greatest(0, ceil(extract(epoch from (v_reset_at - v_now)))::integer);
  end if;

  update rate_limit_windows
     set count = v_count,
         reset_at = v_reset_at
   where key = p_key;

  return query select v_allowed, v_retry_after;
end;
$$;

-- FILE: supabase_migration_017_toggle_wishlist_product.sql
-- Migration 017: the missing toggle_wishlist_product() function
-- =============================================================================
-- src/app/api/my-profile/like/route.ts already calls
-- supabaseAdmin.rpc('toggle_wishlist_product', ...) and profile.like_products_id
-- (a UUID[] column) already exists — the like/unlike feature was fully built
-- on the application side, but this Postgres function itself was never
-- actually created. Every call to it has been failing with a
-- "function does not exist" error. This migration creates it.
--
-- Behavior:
--   - Atomic toggle: if the product is already in like_products_id, it's
--     removed (un-like); otherwise it's added (like). No read-modify-write
--     race between concurrent requests from the same user.
--   - Verifies the profile exists for this user (raises
--     WISHLIST_PROFILE_NOT_FOUND if not — the route already maps this to a
--     404).
--   - Verifies the product actually exists in products_box before allowing
--     it to be liked (raises WISHLIST_PRODUCT_NOT_FOUND — also mapped to a
--     404 by the route already). Un-liking a product that no longer exists
--     is still allowed, so a discontinued product doesn't get stuck
--     permanently un-removable from someone's list.
--   - Returns the resulting like_products_id array.

CREATE OR REPLACE FUNCTION toggle_wishlist_product(
    p_user_id UUID,
    p_product_id UUID
)
RETURNS UUID[] AS $$
DECLARE
    v_profile_id UUID;
    v_current UUID[];
    v_already_liked BOOLEAN;
    v_product_exists BOOLEAN;
    v_updated UUID[];
BEGIN
    SELECT id, like_products_id INTO v_profile_id, v_current
    FROM profile
    WHERE user_id = p_user_id
    FOR UPDATE;

    IF v_profile_id IS NULL THEN
        RAISE EXCEPTION 'WISHLIST_PROFILE_NOT_FOUND';
    END IF;

    v_already_liked := p_product_id = ANY(v_current);

    IF NOT v_already_liked THEN
        SELECT EXISTS(SELECT 1 FROM products_box WHERE id = p_product_id) INTO v_product_exists;
        IF NOT v_product_exists THEN
            RAISE EXCEPTION 'WISHLIST_PRODUCT_NOT_FOUND';
        END IF;
    END IF;

    IF v_already_liked THEN
        v_updated := array_remove(v_current, p_product_id);
    ELSE
        v_updated := array_append(v_current, p_product_id);
    END IF;

    UPDATE profile SET like_products_id = v_updated WHERE id = v_profile_id;

    RETURN v_updated;
END;
$$ LANGUAGE plpgsql;

-- FILE: supabase_migration_018_drop_duplicate_toggle_wishlist.sql
-- Migration 018: remove the duplicate toggle_wishlist_product overload
-- =============================================================================
-- Error seen in production (PGRST203):
--   Could not choose the best candidate function between:
--     public.toggle_wishlist_product(p_user_id => uuid, p_product_id => text),
--     public.toggle_wishlist_product(p_user_id => uuid, p_product_id => uuid)
--
-- Two versions of this function exist: an older one (parameter typed as
-- `text`) from an earlier, separate attempt at this feature that was never
-- cleaned up, and the one created in migration 017 (parameter typed as
-- `uuid`, matching profile.like_products_id's actual UUID[] column type).
-- PostgREST refuses to guess between overloads, so every call has been
-- failing since 017 ran, rather than one of the two versions just quietly
-- winning.
--
-- This drops the stale `text`-parameter version. The `uuid`-parameter
-- version from migration 017 is left untouched and becomes the only
-- candidate, so the existing RPC call from
-- src/app/api/my-profile/like/route.ts resolves unambiguously.

DROP FUNCTION IF EXISTS public.toggle_wishlist_product(p_user_id UUID, p_product_id TEXT);

-- FILE: supabase_migration_020_provider_pincode_shipping_geo.sql
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

-- FILE: supabase_migration_021_product_specifications.sql
-- Migration 021: Product specifications
-- ---------------------------------------------------------------------------
-- Safe to re-run. Adds a free-form key/value spec sheet per product (e.g.
-- {"Material": "Stainless Steel", "Dimensions": "13x23 inch"}), rendered as
-- a table on the product detail page. NOT NULL with a constant default —
-- Postgres 11+ backfills this as a metadata-only operation, no table rewrite.
--
-- IMPORTANT: /api/products and /api/products/[id] read from the
-- `active_products_box` VIEW, which is applied directly in Supabase and is
-- NOT in this repo. If that view lists columns explicitly (rather than
-- `SELECT *`), this new column won't be visible through it until the view
-- is updated too — run this first to check, then update the view if needed:
--   SELECT pg_get_viewdef('active_products_box'::regclass, true);
ALTER TABLE products_box ADD COLUMN IF NOT EXISTS specifications JSONB NOT NULL DEFAULT '{}'::jsonb;

-- FILE: supabase_migration_022_product_policies.sql
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

-- FILE: supabase_migration_023_customization_products.sql
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

-- FILE: supabase_migration_024_drop_duplicate_imageurl.sql
-- Migration 024: Drop the duplicate `imageurl` column on customization_products
-- ---------------------------------------------------------------------------
-- Safe to re-run. `image_url` (snake_case, added in migration 023) is the
-- column the app actually reads — see GET /api/customization-products and
-- mapRowToProduct() in src/app/tailoring/TailoringPageClient.tsx. A second
-- column named `imageurl` (no underscore) was added directly in the
-- Supabase table editor and is never read by the app, so any image URL put
-- there silently does nothing. Dropping it here so there's only one place
-- to put an image and no ambiguity about which one "wins".
ALTER TABLE public.customization_products DROP COLUMN IF EXISTS imageurl;

-- FILE: supabase_migration_025_expand_categories.sql
-- Migration 025: Expand customization_products categories
-- ---------------------------------------------------------------------------
-- Safe to re-run. Widens the category CHECK constraint to also allow
-- Chocolates, Watch, Chain, Frames, Spray, Nuts, and Boutique — on top of
-- the original five from migration 023 (Sweets, Drinks, Self-Care, Decor,
-- Stationery), which stay valid so existing rows are never invalidated.
--
-- The /tailoring page doesn't need a code change for this — its category
-- tabs are already derived at runtime from whatever categories are
-- actually present in the table (see TailoringPageClient.tsx), so a new
-- category just shows up as soon as a row using it exists.
ALTER TABLE public.customization_products
  DROP CONSTRAINT IF EXISTS customization_products_category_check;

ALTER TABLE public.customization_products
  ADD CONSTRAINT customization_products_category_check CHECK (
    category = ANY (ARRAY[
      'Sweets'::text, 'Drinks'::text, 'Self-Care'::text, 'Decor'::text, 'Stationery'::text,
      'Chocolates'::text, 'Watch'::text, 'Chain'::text, 'Frames'::text, 'Spray'::text, 'Nuts'::text, 'Boutique'::text
    ])
  );

-- FILE: supabase_migration_027_add_offer_tag.sql
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

-- FILE: supabase_migration_029_order_customization.sql
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

-- FILE: supabase_migration_030_provider_payment_mobile_number (1).sql
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

-- FILE: supabase_migration_031_order_items_selected_size.sql
-- Migration 031: Size selection actually reaches the order
-- ---------------------------------------------------------------------------
-- Run this against your existing database. Safe to re-run.
--
-- Context: order_items.selected_color has existed and worked end-to-end
-- since day one, but the equivalent for size was never built — the product
-- page had a `selectedSize` state variable and even a CartItem.selectedSize
-- TS field, but the Select Size buttons had no onClick, addItem() never
-- passed selectedSize, and no column existed here to store it even if it
-- had. This adds the missing column so a size chosen on the product page
-- can actually flow through checkout to the provider. Nullable — most
-- products (anything without a `sizes` list) never set it.
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS selected_size TEXT;

-- FILE: supabase_migration_032_order_atomic_selected_size.sql
-- Migration 032: create_order_atomic — persist selected_size on order_items
-- ---------------------------------------------------------------------------
-- Run this against your existing database. Safe to re-run (CREATE OR REPLACE).
--
-- Context: migration 031 added order_items.selected_size, and the API layer
-- (src/lib/orderPricing.ts, src/app/api/orders/route.ts) now sends it in
-- p_items as `selected_size` — but this function's INSERT INTO order_items
-- never listed that column, so it was being silently dropped even after
-- migration 031 and the app-code changes landed. This is a one-line
-- addition to the existing function; every other line is unchanged from the
-- live definition (confirmed via pg_get_functiondef before writing this).
CREATE OR REPLACE FUNCTION public.create_order_atomic(p_user_id uuid, p_subtotal numeric, p_discount_amount numeric, p_coupon_code text, p_coupon_pct numeric, p_shipping_cost numeric, p_gift_wrap_cost numeric, p_total_amount numeric, p_gift_wrap boolean, p_payment_method text, p_items jsonb, p_shipping jsonb)
 RETURNS TABLE(order_id uuid, order_number text)
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_order_id UUID;
    v_order_number TEXT;
    v_item JSONB;
    v_product_id TEXT;
    v_quantity INTEGER;
    v_product_name TEXT;
    v_rows_affected INTEGER;
    -- Per-order aggregate of quantities per product, so an order that lists
    -- the same product twice (different colors) decrements stock once with
    -- the summed quantity — matching what the old JS code did.
    v_agg_quantities JSONB := '{}'::jsonb;
    v_key TEXT;
    v_value NUMERIC;
BEGIN
    -- ── 1. Create the order row ──
    INSERT INTO orders (
        user_id, subtotal, discount_amount, coupon_code, coupon_pct,
        shipping_cost, gift_wrap_cost, total_amount, gift_wrap,
        payment_method, status
    )
    VALUES (
        p_user_id, p_subtotal, p_discount_amount, p_coupon_code, p_coupon_pct,
        p_shipping_cost, p_gift_wrap_cost, p_total_amount, p_gift_wrap,
        COALESCE(p_payment_method, 'Cash on Delivery'), 'confirmed'
    )
    RETURNING id, orders.order_number INTO v_order_id, v_order_number;

    -- ── 2. Insert each item, and aggregate quantities per product for step 3 ──
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
        INSERT INTO order_items (
            order_id, product_id, product_name, product_emoji,
            selected_color, selected_size, quantity, unit_price
        )
        VALUES (
            v_order_id,
            v_item->>'product_id',
            v_item->>'product_name',
            v_item->>'product_emoji',
            v_item->>'selected_color',
            v_item->>'selected_size',
            (v_item->>'quantity')::INTEGER,
            (v_item->>'unit_price')::NUMERIC
        );

        v_product_id := v_item->>'product_id';
        v_quantity := (v_item->>'quantity')::INTEGER;
        v_agg_quantities := jsonb_set(
            v_agg_quantities,
            ARRAY[v_product_id],
            to_jsonb(COALESCE((v_agg_quantities->>v_product_id)::INTEGER, 0) + v_quantity)
        );
    END LOOP;

    -- ── 3. Decrement stock atomically per aggregated product ──
    -- The WHERE available_qty >= p_quantity clause is the check-and-swap
    -- guard; concurrent callers serialize on the row via Postgres's row
    -- lock. Any product without enough stock aborts the whole function,
    -- rolling back the order and all items via transaction rollback.
    FOR v_key IN SELECT jsonb_object_keys(v_agg_quantities) LOOP
        v_value := (v_agg_quantities->>v_key)::NUMERIC;

        UPDATE products_box
        SET available_qty = products_box.available_qty - v_value
        WHERE products_box.id = v_key::UUID
          AND products_box.available_qty >= v_value;

        GET DIAGNOSTICS v_rows_affected = ROW_COUNT;
        IF v_rows_affected = 0 THEN
            -- Look up the product name for a useful error message.
            SELECT product_name INTO v_product_name
            FROM products_box
            WHERE id = v_key::UUID;

            RAISE EXCEPTION 'ORDER_STOCK_UNAVAILABLE:%',
                COALESCE(v_product_name, 'an item in your cart');
        END IF;
    END LOOP;

    -- ── 4. Insert shipping ──
    -- CHANGED: now also stores gpo_name/district/state, resolved
    -- server-side from the PIN in src/app/api/orders/route.ts and passed
    -- through inside p_shipping (see supabase_migration_020).
    INSERT INTO order_shipping (
        order_id, full_name, email, phone, street_address, city, zip_code, country,
        gpo_name, district, state
    )
    VALUES (
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

    -- Success — return the two ids the client needs.
    RETURN QUERY SELECT v_order_id, v_order_number;
END;
$function$

-- FILE: supabase_migration_033_product_payment_option.sql
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

-- FILE: supabase_migration_034_integrity_and_privacy.sql
-- Apply after existing schema/migrations. Additive repair: no customer data is deleted.
BEGIN;
ALTER TABLE profile ALTER COLUMN pincode DROP NOT NULL;
ALTER TABLE profile ADD COLUMN IF NOT EXISTS gift_personalization_opt_in boolean NOT NULL DEFAULT false;
ALTER TABLE recipients ADD COLUMN IF NOT EXISTS recipient_profile_id uuid REFERENCES profile(id) ON DELETE SET NULL;
ALTER TABLE products_box ADD COLUMN IF NOT EXISTS slug text;
ALTER TABLE products_box ADD COLUMN IF NOT EXISTS sizes text[];
ALTER TABLE products_box ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
CREATE UNIQUE INDEX IF NOT EXISTS products_slug_unique ON products_box(slug) WHERE slug IS NOT NULL;
ALTER TABLE recipients DROP CONSTRAINT IF EXISTS recipients_budget_tier_check;
ALTER TABLE recipients ALTER COLUMN budget_tier DROP DEFAULT;
ALTER TABLE recipients ALTER COLUMN budget_tier TYPE text USING budget_tier::text;
UPDATE recipients SET budget_tier = CASE budget_tier WHEN '100-500' THEN 'CLASSIC' WHEN '500-1000' THEN 'GRAND' ELSE budget_tier END;
ALTER TABLE recipients ADD CONSTRAINT recipients_budget_tier_check CHECK (budget_tier IN ('CLASSIC','GRAND','LUXURY'));
ALTER TABLE recipients ALTER COLUMN budget_tier SET DEFAULT 'CLASSIC';
-- All app access already passes through session-scoped server routes.
REVOKE ALL ON profile, follows, providers FROM anon, authenticated;
DROP POLICY IF EXISTS profile_public_read ON profile;
DROP POLICY IF EXISTS follows_public_read ON follows;
DROP POLICY IF EXISTS providers_public_read ON providers;
GRANT ALL ON profile, follows, providers TO service_role;

-- A safe, independent view avoids changing an unknown production view definition.
DO $$ BEGIN
 IF to_regclass('public.active_products_box') IS NOT NULL THEN
  EXECUTE 'CREATE OR REPLACE VIEW catalog_products WITH (security_invoker = true) AS SELECT p.* FROM products_box p WHERE p.is_active AND EXISTS(SELECT 1 FROM active_products_box a WHERE a.id=p.id)';
 ELSE
  EXECUTE 'CREATE OR REPLACE VIEW catalog_products WITH (security_invoker = true) AS SELECT * FROM products_box WHERE is_active';
 END IF;
END $$;
GRANT SELECT ON catalog_products TO service_role;

-- Profiles may be incomplete until checkout, but must always exist.
CREATE OR REPLACE FUNCTION ensure_account_profile() RETURNS trigger LANGUAGE plpgsql
SET search_path = public AS $$
BEGIN
 INSERT INTO profile(user_id, name) VALUES (NEW.id, NEW.user_name) ON CONFLICT(user_id) DO NOTHING;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS account_profile_created ON signin;
CREATE TRIGGER account_profile_created AFTER INSERT ON signin FOR EACH ROW EXECUTE FUNCTION ensure_account_profile();
INSERT INTO profile(user_id,name) SELECT id,user_name FROM signin ON CONFLICT(user_id) DO NOTHING;

CREATE TABLE IF NOT EXISTS planned_occasions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES signin(id) ON DELETE CASCADE,
 planned_date date NOT NULL, planned_time time,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(user_id, planned_date)
);
ALTER TABLE planned_occasions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON planned_occasions FROM anon, authenticated;
GRANT ALL ON planned_occasions TO service_role;

-- Recreate the formerly missing onboarding transaction. Catalog prices are re-read here.
CREATE OR REPLACE FUNCTION create_onboarding_bundle_v2(
 p_user_id uuid,p_recipient_name text,p_relationship text,p_hobbies_and_interest text,
 p_quirks text,p_dynamic text,p_budget_tier text,p_recipient_profile_id uuid,
 p_occasion_title text,p_occasion_date date,p_is_recurring boolean,p_selected_tier text,
 p_custom_card_message text,p_packages jsonb
) RETURNS TABLE(profile_id uuid,recipient_id uuid,occasion_id uuid,gift_cycle_id uuid)
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_profile uuid; v_recipient uuid; v_occasion uuid; v_cycle uuid; v_pkg jsonb; v_product products_box%ROWTYPE;
BEGIN
 IF jsonb_array_length(p_packages) NOT BETWEEN 1 AND 3 THEN RAISE EXCEPTION 'INVALID_PACKAGES'; END IF;
 SELECT p.id INTO STRICT v_profile FROM profile p WHERE p.user_id=p_user_id;
 INSERT INTO recipients(profile_id,name,relationship,hobbies_and_interest,quirks,dynamic,budget_tier,recipient_profile_id)
 VALUES(v_profile,p_recipient_name,p_relationship,p_hobbies_and_interest,p_quirks,p_dynamic,p_budget_tier,p_recipient_profile_id) RETURNING id INTO v_recipient;
 INSERT INTO occasions(recipient_id,title,occasion_date,is_recurring) VALUES(v_recipient,p_occasion_title,p_occasion_date,p_is_recurring) RETURNING id INTO v_occasion;
 INSERT INTO gift_cycles(occasion_id,status,selected_tier,custom_card_message)
 VALUES(v_occasion,'CURATED',p_selected_tier::gift_tier,p_custom_card_message) RETURNING id INTO v_cycle;
 FOR v_pkg IN SELECT * FROM jsonb_array_elements(p_packages) LOOP
  SELECT * INTO STRICT v_product FROM products_box WHERE id=(v_pkg->>'product_id')::uuid AND is_active AND available_qty>0;
  INSERT INTO gift_packages(gift_cycle_id,tier,title,description,estimated_price,reason,product_id)
  VALUES(v_cycle,(v_pkg->>'tier')::gift_tier,v_product.product_name,coalesce(v_product.product_description,''),v_product.price_in_rupees,coalesce(v_pkg->>'reason',''),v_product.id);
 END LOOP;
 IF NOT EXISTS(SELECT 1 FROM gift_packages WHERE gift_packages.gift_cycle_id=v_cycle AND tier=p_selected_tier::gift_tier) THEN RAISE EXCEPTION 'SELECTED_TIER_UNAVAILABLE'; END IF;
 DELETE FROM planned_occasions WHERE user_id=p_user_id AND planned_date=p_occasion_date;
 RETURN QUERY SELECT v_profile,v_recipient,v_occasion,v_cycle;
END $$;

-- Rating updates serialize per product so concurrent reviews cannot overwrite each other.
CREATE OR REPLACE FUNCTION recalculate_product_rating(p_product_id uuid) RETURNS void LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
 PERFORM id FROM products_box WHERE id=p_product_id FOR UPDATE;
 UPDATE products_box SET star_count=coalesce((SELECT avg(rating) FROM reviews WHERE product_id=p_product_id),5),
 total_reviews=(SELECT count(*) FROM reviews WHERE product_id=p_product_id) WHERE id=p_product_id;
END $$;
REVOKE ALL ON FUNCTION create_onboarding_bundle_v2(uuid,text,text,text,text,text,text,uuid,text,date,boolean,text,text,jsonb), recalculate_product_rating(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION create_onboarding_bundle_v2(uuid,text,text,text,text,text,text,uuid,text,date,boolean,text,text,jsonb), recalculate_product_rating(uuid) TO service_role;
COMMIT;

-- FILE: supabase_migration_035_checkout_recovery.sql
BEGIN;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_reference text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS idempotency_key uuid;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS checkout_request_hash text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS online_amount numeric NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cod_amount numeric NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX IF NOT EXISTS orders_payment_unique ON orders(payment_reference) WHERE payment_reference IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS orders_request_unique ON orders(user_id,idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE TABLE IF NOT EXISTS checkout_attempts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES signin(id),
 idempotency_key uuid NOT NULL, request_hash text NOT NULL,
 razorpay_order_id text UNIQUE, payment_id text UNIQUE,
 expected_paise bigint NOT NULL CHECK(expected_paise>0), payload jsonb NOT NULL,
 state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','completed','needs_review','refunded')),
 order_id uuid REFERENCES orders(id), last_error text,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(user_id,idempotency_key)
);
ALTER TABLE checkout_attempts DROP CONSTRAINT IF EXISTS checkout_attempts_state_check;
ALTER TABLE checkout_attempts ADD CONSTRAINT checkout_attempts_state_check CHECK(state IN ('pending','completed','needs_review','refunded'));
CREATE INDEX IF NOT EXISTS checkout_pending ON checkout_attempts(created_at) WHERE state='pending';
ALTER TABLE checkout_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON checkout_attempts FROM anon,authenticated;
GRANT ALL ON checkout_attempts TO service_role;

CREATE OR REPLACE FUNCTION create_order_safe(p_user_id uuid,p_key uuid,p_hash text,p_payload jsonb,p_payment_id text DEFAULT NULL)
RETURNS TABLE(order_id uuid,order_number text) LANGUAGE plpgsql SET search_path=public AS $$
DECLARE v_existing orders%ROWTYPE; v_order record; v_label text;
BEGIN
 -- A transaction-scoped lock closes the check/insert race for retries.
 PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text||p_key::text,0));
 SELECT * INTO v_existing FROM orders WHERE user_id=p_user_id AND idempotency_key=p_key;
 IF FOUND THEN
  IF v_existing.checkout_request_hash IS DISTINCT FROM p_hash THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT'; END IF;
  RETURN QUERY SELECT v_existing.id,v_existing.order_number; RETURN;
 END IF;
 IF coalesce((p_payload->>'online_amount')::numeric,0)>0 AND p_payment_id IS NULL THEN RAISE EXCEPTION 'PAYMENT_REQUIRED'; END IF;
 IF p_payment_id IS NOT NULL THEN
  -- Also prevents legacy payments embedded in text from being reused after this upgrade.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_payment_id,1));
  IF EXISTS(SELECT 1 FROM orders WHERE payment_reference=p_payment_id OR position(p_payment_id in coalesce(payment_method,''))>0) THEN RAISE EXCEPTION 'PAYMENT_ALREADY_USED'; END IF;
 END IF;
 v_label:=CASE WHEN p_payment_id IS NULL THEN 'Cash on Delivery' ELSE 'Razorpay (Online) · '||p_payment_id END;
 SELECT * INTO v_order FROM create_order_atomic(p_user_id,(p_payload->>'subtotal')::numeric,(p_payload->>'discount_amount')::numeric,
 p_payload->>'coupon_code',(p_payload->>'coupon_pct')::numeric,(p_payload->>'shipping_cost')::numeric,
 (p_payload->>'gift_wrap_cost')::numeric,(p_payload->>'total_amount')::numeric,(p_payload->>'gift_wrap')::boolean,
 v_label,p_payload->'items',p_payload->'shipping');
 UPDATE orders SET payment_reference=p_payment_id,idempotency_key=p_key,checkout_request_hash=p_hash,
 online_amount=(p_payload->>'online_amount')::numeric,cod_amount=(p_payload->>'cod_amount')::numeric WHERE id=v_order.order_id;
 RETURN QUERY SELECT v_order.order_id::uuid,v_order.order_number::text;
END $$;

CREATE OR REPLACE FUNCTION finalize_checkout(p_attempt_id uuid,p_payment_id text,p_amount_paise bigint)
RETURNS TABLE(order_id uuid,order_number text,state text) LANGUAGE plpgsql SET search_path=public AS $$
DECLARE v_attempt checkout_attempts%ROWTYPE; v_order record;
BEGIN
 SELECT * INTO STRICT v_attempt FROM checkout_attempts WHERE id=p_attempt_id FOR UPDATE;
 IF v_attempt.expected_paise<>p_amount_paise THEN RAISE EXCEPTION 'PAYMENT_AMOUNT_MISMATCH'; END IF;
 IF v_attempt.payment_id IS NOT NULL AND v_attempt.payment_id<>p_payment_id THEN RAISE EXCEPTION 'PAYMENT_CONFLICT'; END IF;
 IF v_attempt.state='completed' THEN
  RETURN QUERY SELECT o.id,o.order_number,'completed'::text FROM orders o WHERE o.id=v_attempt.order_id; RETURN;
 END IF;
 IF v_attempt.state IN ('needs_review','refunded') THEN
  RETURN QUERY SELECT NULL::uuid,NULL::text,v_attempt.state; RETURN;
 END IF;
 UPDATE checkout_attempts SET payment_id=p_payment_id,updated_at=now() WHERE id=p_attempt_id;
 BEGIN
  SELECT * INTO v_order FROM create_order_safe(v_attempt.user_id,v_attempt.idempotency_key,v_attempt.request_hash,v_attempt.payload,p_payment_id);
  UPDATE checkout_attempts SET order_id=v_order.order_id,state='completed',last_error=NULL,updated_at=now() WHERE id=p_attempt_id;
  RETURN QUERY SELECT v_order.order_id::uuid,v_order.order_number::text,'completed'::text;
 EXCEPTION WHEN OTHERS THEN
  -- Keep the captured payment durable even if stock/order creation fails.
  -- Operators must resolve or refund needs_review records; never silently discard them.
  UPDATE checkout_attempts SET state='needs_review',last_error=SQLERRM,updated_at=now() WHERE id=p_attempt_id;
  RETURN QUERY SELECT NULL::uuid,NULL::text,'needs_review'::text;
 END;
END $$;
REVOKE ALL ON FUNCTION create_order_safe(uuid,uuid,text,jsonb,text),finalize_checkout(uuid,text,bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION create_order_safe(uuid,uuid,text,jsonb,text),finalize_checkout(uuid,text,bigint) TO service_role;
COMMIT;

-- FILE: supabase_migration_036_gift_dispatch.sql
BEGIN;
ALTER TABLE gift_cycles ADD COLUMN IF NOT EXISTS occurrence_date date;
ALTER TABLE gift_cycles ADD COLUMN IF NOT EXISTS dispatch_state text NOT NULL DEFAULT 'pending';
ALTER TABLE gift_cycles ADD COLUMN IF NOT EXISTS dispatch_claimed_at timestamptz;
ALTER TABLE gift_cycles ADD COLUMN IF NOT EXISTS notification_sent_at timestamptz;
ALTER TABLE gift_cycles ADD COLUMN IF NOT EXISTS notification_message_id text;
ALTER TABLE gift_cycles ADD COLUMN IF NOT EXISTS dispatch_error text;
ALTER TABLE gift_cycles ADD COLUMN IF NOT EXISTS dispatch_next_attempt_at timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS gift_occurrence_unique ON gift_cycles(occasion_id,occurrence_date) WHERE occurrence_date IS NOT NULL;
CREATE OR REPLACE FUNCTION next_gift_date(p_date date,p_recurring boolean,p_today date) RETURNS date LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE v_date date; v_year int:=extract(year FROM p_today)::int;
BEGIN
 IF NOT p_recurring THEN RETURN p_date; END IF;
 -- Feb 29 is deliberately observed on March 1 in non-leap years.
 v_date:=make_date(v_year,extract(month FROM p_date)::int,1)+(extract(day FROM p_date)::int-1);
 IF v_date<p_today THEN v_date:=make_date(v_year+1,extract(month FROM p_date)::int,1)+(extract(day FROM p_date)::int-1); END IF;
 RETURN v_date;
END $$;
-- Assign only the most recent legacy cycle to its upcoming occurrence; preserve history.
WITH latest AS (SELECT DISTINCT ON (occasion_id) id,occasion_id FROM gift_cycles WHERE occurrence_date IS NULL ORDER BY occasion_id,created_at DESC)
UPDATE gift_cycles g SET occurrence_date=next_gift_date(o.occasion_date,o.is_recurring,(now() AT TIME ZONE 'Asia/Kolkata')::date)
FROM latest l JOIN occasions o ON o.id=l.occasion_id WHERE g.id=l.id
AND NOT EXISTS(SELECT 1 FROM gift_cycles x WHERE x.occasion_id=o.id AND x.occurrence_date=next_gift_date(o.occasion_date,o.is_recurring,(now() AT TIME ZONE 'Asia/Kolkata')::date));

CREATE OR REPLACE FUNCTION claim_due_gifts(p_limit int DEFAULT 4,p_today date DEFAULT (now() AT TIME ZONE 'Asia/Kolkata')::date)
RETURNS SETOF jsonb LANGUAGE plpgsql SET search_path=public AS $$
DECLARE v record; v_cycle gift_cycles%ROWTYPE; v_date date;
BEGIN
 FOR v IN SELECT o.*,r.name,r.relationship,r.hobbies_and_interest,r.quirks,r.dynamic,s.mobile_number
 FROM occasions o JOIN recipients r ON r.id=o.recipient_id JOIN profile p ON p.id=r.profile_id JOIN signin s ON s.id=p.user_id
 WHERE next_gift_date(o.occasion_date,o.is_recurring,p_today) BETWEEN p_today AND p_today+14
 AND s.mobile_number IS NOT NULL ORDER BY next_gift_date(o.occasion_date,o.is_recurring,p_today),o.id
 FOR UPDATE OF o SKIP LOCKED LOOP
  v_date:=next_gift_date(v.occasion_date,v.is_recurring,p_today);
  -- Adopt a newly onboarded legacy cycle before making another cycle.
  UPDATE gift_cycles SET occurrence_date=v_date WHERE id=(SELECT id FROM gift_cycles WHERE occasion_id=v.id AND occurrence_date IS NULL ORDER BY created_at DESC LIMIT 1)
  AND NOT EXISTS(SELECT 1 FROM gift_cycles WHERE occasion_id=v.id AND occurrence_date=v_date);
  INSERT INTO gift_cycles(occasion_id,occurrence_date) VALUES(v.id,v_date) ON CONFLICT(occasion_id,occurrence_date) WHERE occurrence_date IS NOT NULL DO NOTHING;
  SELECT * INTO v_cycle FROM gift_cycles WHERE occasion_id=v.id AND occurrence_date=v_date FOR UPDATE;
  IF v_cycle.dispatch_next_attempt_at > now() THEN CONTINUE; END IF;
  IF v_cycle.status IN ('APPROVED','COMPLETED') OR v_cycle.dispatch_state IN ('sent','sending','needs_review') THEN CONTINUE; END IF;
  IF v_cycle.dispatch_state='generating' AND v_cycle.dispatch_claimed_at>now()-interval '10 minutes' THEN CONTINUE; END IF;
  UPDATE gift_cycles SET dispatch_state='generating',dispatch_claimed_at=now(),dispatch_error=NULL WHERE id=v_cycle.id;
  RETURN NEXT jsonb_build_object('cycleId',v_cycle.id,'recipientName',v.name,'relationship',v.relationship,'interests',v.hobbies_and_interest,'quirks',v.quirks,'dynamic',v.dynamic,'occasionTitle',v.title,'phone',v.mobile_number);
  p_limit:=p_limit-1; IF p_limit<=0 THEN EXIT; END IF;
 END LOOP;
END $$;
CREATE OR REPLACE FUNCTION save_gift_packages(p_cycle_id uuid,p_packages jsonb) RETURNS void LANGUAGE plpgsql SET search_path=public AS $$
DECLARE p jsonb;
BEGIN
 PERFORM id FROM gift_cycles WHERE id=p_cycle_id AND status IN ('PENDING','CURATED') FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'CYCLE_NOT_EDITABLE'; END IF;
 IF jsonb_array_length(p_packages) NOT BETWEEN 1 AND 3 THEN RAISE EXCEPTION 'INVALID_PACKAGES'; END IF;
 DELETE FROM gift_packages WHERE gift_cycle_id=p_cycle_id;
 FOR p IN SELECT * FROM jsonb_array_elements(p_packages) LOOP
  INSERT INTO gift_packages(gift_cycle_id,tier,title,description,estimated_price,reason,product_id)
  SELECT p_cycle_id,(p->>'tier')::gift_tier,product_name,coalesce(product_description,''),price_in_rupees,p->>'reason',id
  FROM products_box WHERE id=(p->>'productId')::uuid AND is_active AND available_qty>0;
  IF NOT FOUND THEN RAISE EXCEPTION 'PRODUCT_UNAVAILABLE'; END IF;
 END LOOP;
 UPDATE gift_cycles SET status='CURATED',updated_at=now() WHERE id=p_cycle_id;
END $$;
REVOKE ALL ON FUNCTION claim_due_gifts(int,date),save_gift_packages(uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION claim_due_gifts(int,date),save_gift_packages(uuid,jsonb) TO service_role;
COMMIT;

-- FILE: supabase_migration_037_custom_order_retries.sql
BEGIN;
ALTER TABLE order_customization ADD COLUMN IF NOT EXISTS idempotency_key uuid;
ALTER TABLE order_customization ADD COLUMN IF NOT EXISTS checkout_request_hash text;
CREATE UNIQUE INDEX IF NOT EXISTS custom_order_request_unique ON order_customization(user_id,idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE OR REPLACE FUNCTION create_customization_order_safe(
 p_user_id uuid,p_idempotency_key uuid,p_request_hash text,p_provider_id uuid,
 p_subtotal numeric,p_shipping_cost numeric,p_total_amount numeric,p_total_slots int,
 p_items jsonb,p_shipping jsonb
) RETURNS TABLE(order_id uuid,order_number text) LANGUAGE plpgsql SET search_path=public AS $$
DECLARE existing order_customization%ROWTYPE; created record;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text||p_idempotency_key::text,0));
 SELECT * INTO existing FROM order_customization o WHERE o.user_id=p_user_id AND o.idempotency_key=p_idempotency_key;
 IF FOUND THEN
  IF existing.checkout_request_hash IS DISTINCT FROM p_request_hash THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT'; END IF;
  RETURN QUERY SELECT existing.id,existing.order_number; RETURN;
 END IF;
 SELECT * INTO created FROM create_customization_order_atomic(p_user_id,p_provider_id,p_subtotal,p_shipping_cost,p_total_amount,p_total_slots,'Cash on Delivery',p_items,p_shipping);
 UPDATE order_customization SET idempotency_key=p_idempotency_key,checkout_request_hash=p_request_hash WHERE id=created.order_id;
 RETURN QUERY SELECT created.order_id::uuid,created.order_number::text;
END $$;
REVOKE ALL ON FUNCTION create_customization_order_safe(uuid,uuid,text,uuid,numeric,numeric,numeric,int,jsonb,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION create_customization_order_safe(uuid,uuid,text,uuid,numeric,numeric,numeric,int,jsonb,jsonb) TO service_role;
-- All account/order writes use server-only credentials and app sessions.
GRANT ALL ON signin,profile,recipients,occasions,gift_cycles,gift_packages,products_box,
 reviews,orders,order_items,order_shipping,order_customization,order_customization_items,
 order_customization_shipping,checkout_attempts,planned_occasions,rate_limit_windows TO service_role;
GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;
-- Keep legacy trusted-price functions inaccessible to public API clients.
REVOKE EXECUTE ON FUNCTION create_order_atomic(uuid,numeric,numeric,text,numeric,numeric,numeric,numeric,boolean,text,jsonb,jsonb),
 create_customization_order_atomic(uuid,uuid,numeric,numeric,numeric,int,text,jsonb,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION create_order_atomic(uuid,numeric,numeric,text,numeric,numeric,numeric,numeric,boolean,text,jsonb,jsonb),
 create_customization_order_atomic(uuid,uuid,numeric,numeric,numeric,int,text,jsonb,jsonb) TO service_role;
COMMIT;


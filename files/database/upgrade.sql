-- Doodle G: reviewed local migration bundle. Take a backup and test in staging first.
-- Existing installation: base schema and migrations through 030 must already exist.
DO $$ BEGIN
 IF to_regclass('public.order_customization') IS NULL OR to_regclass('public.rate_limit_windows') IS NULL THEN
  RAISE EXCEPTION 'Prerequisite schema missing. Apply the existing migrations through 030 in staging first.';
 END IF;
END $$;

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


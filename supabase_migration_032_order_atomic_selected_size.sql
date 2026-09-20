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

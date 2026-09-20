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

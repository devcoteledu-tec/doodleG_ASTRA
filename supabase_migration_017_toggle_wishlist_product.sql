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

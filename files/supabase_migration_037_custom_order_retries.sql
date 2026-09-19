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

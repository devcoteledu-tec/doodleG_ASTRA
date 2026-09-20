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

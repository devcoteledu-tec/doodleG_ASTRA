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

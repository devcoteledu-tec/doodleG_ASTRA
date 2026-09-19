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

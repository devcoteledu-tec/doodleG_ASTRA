import { PGlite } from '@electric-sql/pglite';
import { readFile, readdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
const db = new PGlite();
await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS; CREATE SCHEMA auth; CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$ SELECT current_user::text $$;`);
const base=await readFile('supabase_schema.sql','utf8');
await db.exec(base);
const excluded=['002','026','028'];
for(const file of (await readdir('.')).filter(f=>/^supabase_migration_\d+.*\.sql$/.test(f)).sort()) {
 const num=file.match(/_(\d+)/)[1]; if(excluded.includes(num))continue;
 try { await db.exec(await readFile(file,'utf8')); console.log('Applied',file); }
 catch(e) { console.error('Migration failed:',file,e.message);process.exitCode=1; await db.close(); process.exit(1); }
}
// Reapply the new repair migrations to check safe reruns.
for (const f of (await readdir('.')).filter(f=>/^supabase_migration_03[4-7]_.*\.sql$/.test(f)).sort()) await db.exec(await readFile(f,'utf8'));
await db.exec('SET ROLE service_role');
const u='11111111-1111-4111-8111-111111111111', product='22222222-2222-4222-8222-222222222222';
await db.query(`INSERT INTO signin(id,user_name,email,email_verified) VALUES ($1,'audit','audit@example.test',true)`,[u]);
assert.equal((await db.query('SELECT count(*)::int AS n FROM profile WHERE user_id=$1',[u])).rows[0].n,1,'profile trigger');
await db.query(`INSERT INTO products_box(id,product_name,product_images,price_in_rupees,category,available_qty) VALUES ($1,'Test gift',ARRAY['a','b','c'],100,'Gifts',5)`,[product]);
const payload={subtotal:100,discount_amount:0,coupon_code:null,coupon_pct:0,shipping_cost:40,gift_wrap_cost:0,total_amount:140,gift_wrap:false,online_amount:140,cod_amount:0,items:[{product_id:product,product_name:'Test gift',product_emoji:'gift',quantity:1,unit_price:100,selected_size:'M'}],shipping:{full_name:'Test buyer',email:'buyer@example.test',phone:'9876543210',street_address:'Test road',city:'Test city',zip_code:'678632',country:'India'}};
const a=(await db.query(`INSERT INTO checkout_attempts(user_id,idempotency_key,request_hash,payload,expected_paise,razorpay_order_id) VALUES ($1,gen_random_uuid(),'hash',$2,14000,'order_test') RETURNING id`,[u,JSON.stringify(payload)])).rows[0].id;
const first=(await db.query(`SELECT * FROM finalize_checkout($1,'pay_test',14000)`,[a])).rows[0];
assert.equal(first.state,'completed');
const retry=(await db.query(`SELECT * FROM finalize_checkout($1,'pay_test',14000)`,[a])).rows[0];
assert.equal(first.order_id,retry.order_id,'payment retry returns original order');
assert.equal((await db.query('SELECT available_qty FROM products_box WHERE id=$1',[product])).rows[0].available_qty,4,'stock decremented once');
const second=(await db.query(`INSERT INTO checkout_attempts(user_id,idempotency_key,request_hash,payload,expected_paise) VALUES ($1,gen_random_uuid(),'hash2',$2,14000) RETURNING id`,[u,JSON.stringify(payload)])).rows[0].id;
await assert.rejects(db.query(`SELECT * FROM finalize_checkout($1,'pay_test',14000)`,[second]), /unique|duplicate/);
await assert.rejects(db.query(`SELECT * FROM finalize_checkout($1,'pay_wrong',1)`,[second]),/PAYMENT_AMOUNT_MISMATCH/);
await db.query('UPDATE products_box SET available_qty=0 WHERE id=$1',[product]);
assert.equal((await db.query(`SELECT * FROM finalize_checkout($1,'pay_outofstock',14000)`,[second])).rows[0].state,'needs_review');
assert.equal((await db.query('SELECT payment_id FROM checkout_attempts WHERE id=$1',[second])).rows[0].payment_id,'pay_outofstock','captured money remains recorded');
await db.query('UPDATE products_box SET available_qty=5 WHERE id=$1',[product]);
assert.equal((await db.query(`SELECT * FROM finalize_checkout($1,'pay_outofstock',14000)`,[second])).rows[0].state,'needs_review','review is not automatically re-finalized after restock');
await db.query("UPDATE checkout_attempts SET state='refunded' WHERE id=$1",[second]);
assert.equal((await db.query(`SELECT * FROM finalize_checkout($1,'pay_outofstock',14000)`,[second])).rows[0].state,'refunded','refunded attempt is terminal');
// Onboarding and dispatch exercise the real SQL, including transaction rollback.
await db.query('UPDATE products_box SET available_qty=5 WHERE id=$1',[product]);
await db.query("UPDATE signin SET mobile_number='9876543210' WHERE id=$1",[u]);
const onboardingSql = `SELECT * FROM create_onboarding_bundle_v2($1,'Jamie','Friend','Books','','','CLASSIC',NULL,'Birthday','2030-01-10',true,'CLASSIC','Hello',$2)`;
const packages=JSON.stringify([{tier:'CLASSIC',product_id:product,estimated_price:1,title:'Forged title'}]);
const bundle=(await db.query(onboardingSql,[u,packages])).rows[0];
assert.equal((await db.query('SELECT estimated_price::float8 AS price FROM gift_packages WHERE gift_cycle_id=$1',[bundle.gift_cycle_id])).rows[0].price,100,'onboarding uses catalog price');
const recipientCount=(await db.query('SELECT count(*)::int AS n FROM recipients')).rows[0].n;
await assert.rejects(db.query(onboardingSql,[u,JSON.stringify([{tier:'GRAND',product_id:product}])]),/SELECTED_TIER_UNAVAILABLE/);
assert.equal((await db.query('SELECT count(*)::int AS n FROM recipients')).rows[0].n,recipientCount,'failed onboarding rolls back');
assert.equal((await db.query("SELECT * FROM claim_due_gifts(4,'2030-01-01')")).rows.length,1,'upcoming cycle claimed');
assert.equal((await db.query("SELECT * FROM claim_due_gifts(4,'2030-01-01')")).rows.length,0,'claim prevents duplicate dispatch');
await db.query("UPDATE gift_cycles SET dispatch_state='sent' WHERE id=$1",[bundle.gift_cycle_id]);
assert.equal((await db.query("SELECT * FROM claim_due_gifts(4,'2030-01-01')")).rows.length,0,'sent cycle not resent');
assert.equal((await db.query("SELECT * FROM claim_due_gifts(4,'2031-01-01')")).rows.length,1,'recurring event gets next annual cycle');
await db.query('UPDATE occasions SET is_recurring=false WHERE id=$1',[bundle.occasion_id]);
assert.equal((await db.query("SELECT * FROM claim_due_gifts(4,'2032-01-01')")).rows.length,0,'one-time event does not recur');
assert.equal((await db.query("SELECT next_gift_date('2024-02-29',true,'2025-01-01')::text AS d")).rows[0].d,'2025-03-01');
// Custom hamper retries must return the same order, with conflicts rejected.
const customSql=`SELECT * FROM create_customization_order_safe($1,$2,$3,NULL,100,40,140,1,$4,$5)`;
const customKey='33333333-3333-4333-8333-333333333333';
const customItems=JSON.stringify([{product_id:null,product_name:'Custom gift',product_emoji:'gift',category:'Sweets',slots:1,quantity:1,unit_price:100}]);
const customArgs=[u,customKey,'customhash',customItems,JSON.stringify(payload.shipping)];
const custom=(await db.query(customSql,customArgs)).rows[0];
assert.equal((await db.query(customSql,customArgs)).rows[0].order_id,custom.order_id);
await assert.rejects(db.query(customSql,[u,customKey,'different',customItems,JSON.stringify(payload.shipping)]),/IDEMPOTENCY_CONFLICT/);
await db.exec('RESET ROLE; SET ROLE anon');
await assert.rejects(db.query('SELECT * FROM profile'),/permission denied/);
await assert.rejects(db.query('SELECT * FROM checkout_attempts'),/permission denied/);
await assert.rejects(db.query(`SELECT * FROM finalize_checkout($1,'forged',14000)`,[a]),/permission denied/);
await db.exec('RESET ROLE');
console.log('PASS: fresh setup and migration reruns; service-role privileges; profile creation; payment/custom-order idempotency; replay, amount and stock safeguards; private data access; onboarding rollback; recurring and one-time dispatch claims.');
await db.close();

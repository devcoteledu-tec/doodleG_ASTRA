import {describe,it,expect,vi,beforeEach} from 'vitest';
import {createSupabaseAdminMock} from './helpers/supabaseMock';
let db:ReturnType<typeof createSupabaseAdminMock>;vi.mock('@/lib/supabaseAdmin',()=>({get supabaseAdmin(){return db;}}));
import {computeServerTrustedPricing} from '@/lib/orderPricing';
import {computePaymentPlan} from '@/lib/paymentPlan';
const product={id:'p1',product_name:'Real item',price_in_rupees:100,available_qty:2,provider_id:null,payment_option:'both',is_active:true};
beforeEach(()=>{db=createSupabaseAdminMock({catalog_products:[{data:[product],error:null}]});});
describe('trusted pricing',()=>{
 it('prices from inventory and explicitly configured shipping',async()=>{const p=await computeServerTrustedPricing([{productId:'p1',quantity:1}],null,false,'682001');expect(p.total).toBe(140);});
 it('checks aggregate stock across variants before payment',async()=>{await expect(computeServerTrustedPricing([{productId:'p1',quantity:2,selectedColor:'red'},{productId:'p1',quantity:1,selectedColor:'blue'}],null,false,'682001')).rejects.toThrow(/left in stock/);});
 it.each([{is_active:false},{price_in_rupees:-1},{price_in_rupees:'bad'},{sizes:['M'],is_active:true}])('rejects unavailable or invalid inventory %#',async change=>{db=createSupabaseAdminMock({catalog_products:[{data:[{...product,...change}],error:null}]});await expect(computeServerTrustedPricing([{productId:'p1',quantity:1}],null,false,'682001')).rejects.toThrow();});
 it('keeps online and COD paise exact for fractional amounts',async()=>{db=createSupabaseAdminMock({catalog_products:[{data:[{...product,price_in_rupees:100.55,payment_option:'advance',advance_percentage:36}],error:null}]});const pricing=await computeServerTrustedPricing([{productId:'p1',quantity:1}],null,false,'682001');const plan=computePaymentPlan(pricing,'cod');expect(Math.round((plan.onlineAmount+plan.codAmount)*100)).toBe(Math.round(pricing.total*100));});
});

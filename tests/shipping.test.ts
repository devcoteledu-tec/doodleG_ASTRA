import {describe,it,expect,vi,beforeEach,afterEach} from 'vitest';
import {createSupabaseAdminMock} from './helpers/supabaseMock';
let db:ReturnType<typeof createSupabaseAdminMock>;vi.mock('@/lib/supabaseAdmin',()=>({get supabaseAdmin(){return db;}}));
import {computeCartShipping,SHIPPING_FALLBACK_COST,SHIPPING_MAX_COST} from '@/lib/shipping';
beforeEach(()=>{db=createSupabaseAdminMock({});});afterEach(()=>vi.unstubAllEnvs());
describe('explicit merchant shipping tariff',()=>{
 it('charges zero for an empty cart',async()=>expect((await computeCartShipping('682001',[])).totalShipping).toBe(0));
 it.each(['682001','100001','999999'])('does not treat PIN %s as geographic distance',async pin=>{db=createSupabaseAdminMock({providers:[{data:[{id:'provider',name:'Maker',pincode:pin}],error:null}]});expect((await computeCartShipping('682001',['provider'])).totalShipping).toBe(SHIPPING_FALLBACK_COST);});
 it('groups multiple products from one provider into one parcel',async()=>{const result=await computeCartShipping('682001',['a','a','b']);expect(result.legs).toHaveLength(2);expect(result.totalShipping).toBe(80);});
 it('groups unassigned products into one parcel',async()=>expect((await computeCartShipping('682001',[null,null])).totalShipping).toBe(40));
 it('uses the configured merchant tariff',async()=>{vi.stubEnv('SHIPPING_FLAT_RATE_RUPEES','65.50');expect((await computeCartShipping('682001',[null])).totalShipping).toBe(65.5);});
 it('rejects invalid tariff configuration',async()=>{vi.stubEnv('SHIPPING_FLAT_RATE_RUPEES','-5');await expect(computeCartShipping('682001',[null])).rejects.toThrow();});
 it('keeps per-provider allocations equal to the capped total',async()=>{const result=await computeCartShipping('682001',Array.from({length:30},(_,i)=>String(i)));expect(result.totalShipping).toBe(SHIPPING_MAX_COST);expect(result.legs.reduce((n,l)=>n+l.cost,0)).toBe(SHIPPING_MAX_COST);});
 it('retains a predictable tariff when provider metadata is unavailable',async()=>{db=createSupabaseAdminMock({providers:[{data:null,error:{message:'offline'}}]});const result=await computeCartShipping('682001',['a','b']);expect(result.totalShipping).toBe(80);expect(result.anyUnresolved).toBe(true);});
});

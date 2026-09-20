import { describe,it,expect,vi,beforeEach } from 'vitest';
import { createSupabaseAdminMock } from './helpers/supabaseMock';
const session=vi.hoisted(()=>({getSessionFromRequest:vi.fn()}));
vi.mock('@/lib/session',()=>session);
const checkout=vi.hoisted(()=>({priceCheckout:vi.fn(),finalizePayment:vi.fn()}));vi.mock('@/lib/checkout',()=>checkout);
let db:ReturnType<typeof createSupabaseAdminMock>;
vi.mock('@/lib/supabaseAdmin',()=>({get supabaseAdmin(){return db;}}));
const {POST,GET}=await import('@/app/api/orders/route');
const input={idempotencyKey:'11111111-1111-4111-8111-111111111111',items:[{productId:'22222222-2222-4222-8222-222222222222',quantity:1}],shipping:{name:'Buyer',email:'buyer@example.test',phone:'9876543210',address:'Test street',city:'Kochi',zip:'682001'}};
function req(body:unknown){return new Request('http://localhost/api/orders',{method:'POST',body:JSON.stringify(body)}) as import('next/server').NextRequest;}
beforeEach(()=>{session.getSessionFromRequest.mockResolvedValue({userId:'user-a'});checkout.priceCheckout.mockReset().mockResolvedValue({plan:{onlineAmount:0},payload:{total_amount:140}});db=createSupabaseAdminMock({'rpc:create_order_safe':[{data:[{order_id:'order-a',order_number:'DG-A'}],error:null}]});});
describe('cash on delivery checkout',()=>{
 it('requires sign in',async()=>{session.getSessionFromRequest.mockResolvedValue(null);expect((await POST(req(input))).status).toBe(401);});
 it('validates identity, address and quantity',async()=>{expect((await POST(req({...input,items:[]}))).status).toBe(400);expect(checkout.priceCheckout).not.toHaveBeenCalled();});
 it('requires a stable idempotency key',async()=>expect((await POST(req({...input,idempotencyKey:undefined}))).status).toBe(400));
 it('uses server-priced payload, never client price/payment labels',async()=>{const r=await POST(req({...input,total:1,paymentMethod:'PAID'}));expect(r.status).toBe(200);expect(db.rpcCalls.find(c=>c.fn==='create_order_safe')?.params).toMatchObject({p_user_id:'user-a',p_payload:{total_amount:140},p_payment_id:null});});
 it('does not allow COD to bypass a required online charge',async()=>{checkout.priceCheckout.mockResolvedValue({plan:{onlineAmount:100},payload:{}});expect((await POST(req(input))).status).toBe(400);expect(db.rpcCalls.some(c=>c.fn==='create_order_safe')).toBe(false);});
 it('does not expose database errors',async()=>{db=createSupabaseAdminMock({orders:[{data:null,error:{message:'secret internals'}}]});const r=await POST(req(input));expect(r.status).toBe(503);expect(await r.text()).not.toContain('secret internals');});
 it('scopes order history to signed in users',async()=>{db=createSupabaseAdminMock({orders:[{data:[],error:null}]});expect((await GET(req(null))).status).toBe(200);session.getSessionFromRequest.mockResolvedValue(null);expect((await GET(req(null))).status).toBe(401);});
});

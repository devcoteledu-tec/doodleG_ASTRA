import { describe,it,expect,vi,beforeEach } from 'vitest';
import { createSupabaseAdminMock } from './helpers/supabaseMock';
const session=vi.hoisted(()=>({getSessionFromRequest:vi.fn()}));vi.mock('@/lib/session',()=>session);
const checkout=vi.hoisted(()=>({priceCheckout:vi.fn()}));vi.mock('@/lib/checkout',()=>checkout);
const create=vi.hoisted(()=>vi.fn());vi.mock('@/lib/razorpay',()=>({getRazorpayClient:()=>({orders:{create}})}));
let db:ReturnType<typeof createSupabaseAdminMock>;vi.mock('@/lib/supabaseAdmin',()=>({get supabaseAdmin(){return db;}}));
const {POST}=await import('@/app/api/checkout/razorpay-order/route');
const input={idempotencyKey:'11111111-1111-4111-8111-111111111111',items:[{productId:'22222222-2222-4222-8222-222222222222',quantity:1}],shipping:{name:'Buyer',email:'buyer@example.test',phone:'9876543210',address:'Test street',city:'Kochi',zip:'682001'}};
function req(body:unknown=input){return new Request('http://localhost/api/checkout/razorpay-order',{method:'POST',body:JSON.stringify(body)}) as import('next/server').NextRequest;}
beforeEach(()=>{vi.clearAllMocks();session.getSessionFromRequest.mockResolvedValue({userId:'user-a'});checkout.priceCheckout.mockResolvedValue({payload:{total_amount:140},plan:{onlineAmount:140,codAmount:0}});create.mockResolvedValue({id:'order_processor',amount:14000,currency:'INR'});db=createSupabaseAdminMock({checkout_attempts:[{data:null,error:null},{data:{id:'attempt-a'},error:null},{data:null,error:null}]});});
describe('durable payment initialization',()=>{
 it('requires authentication',async()=>{session.getSessionFromRequest.mockResolvedValue(null);expect((await POST(req())).status).toBe(401);});
 it('rejects missing shipping before starting payment',async()=>expect((await POST(req({...input,shipping:undefined}))).status).toBe(400));
 it('persists a trusted checkout before returning the processor order',async()=>{const r=await POST(req());expect(r.status).toBe(200);expect((await r.json()).attemptId).toBe('attempt-a');expect(db.insertedRows.checkout_attempts[0]).toMatchObject({user_id:'user-a',expected_paise:14000,payload:{total_amount:140}});expect(create).toHaveBeenCalledWith(expect.objectContaining({amount:14000,currency:'INR',receipt:'dg_attempt-a'}));});
 it('does not charge if checkout persistence fails',async()=>{db=createSupabaseAdminMock({checkout_attempts:[{data:null,error:null},{data:null,error:{message:'db down'}}]});expect((await POST(req())).status).toBe(503);expect(create).not.toHaveBeenCalled();});
 it('rejects reusing an intent for a different cart',async()=>{db=createSupabaseAdminMock({checkout_attempts:[{data:{request_hash:'different'},error:null}]});expect((await POST(req())).status).toBe(409);expect(create).not.toHaveBeenCalled();});
 it('does not create an online charge for an all-COD cart',async()=>{checkout.priceCheckout.mockResolvedValue({payload:{},plan:{onlineAmount:0}});expect((await POST(req())).status).toBe(400);expect(create).not.toHaveBeenCalled();});
});

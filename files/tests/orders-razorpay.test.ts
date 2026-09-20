import { describe,it,expect,vi,beforeEach } from 'vitest';
import { createSupabaseAdminMock } from './helpers/supabaseMock';
const session=vi.hoisted(()=>({getSessionFromRequest:vi.fn()}));vi.mock('@/lib/session',()=>session);
const checkout=vi.hoisted(()=>({priceCheckout:vi.fn(),finalizePayment:vi.fn()}));vi.mock('@/lib/checkout',()=>checkout);
const razorpay=vi.hoisted(()=>({verifyPaymentSignature:vi.fn()}));vi.mock('@/lib/razorpay',()=>razorpay);
let db:ReturnType<typeof createSupabaseAdminMock>;vi.mock('@/lib/supabaseAdmin',()=>({get supabaseAdmin(){return db;}}));
const {POST}=await import('@/app/api/orders/route');
function req(){return new Request('http://localhost/api/orders',{method:'POST',body:JSON.stringify({razorpay:{orderId:'order_processor',paymentId:'pay_processor',signature:'a'.repeat(64)}})}) as import('next/server').NextRequest;}
beforeEach(()=>{vi.clearAllMocks();session.getSessionFromRequest.mockResolvedValue({userId:'user-a'});razorpay.verifyPaymentSignature.mockReturnValue(true);checkout.finalizePayment.mockResolvedValue({state:'completed',order_id:'order-a',order_number:'DG-A'});db=createSupabaseAdminMock({});});
describe('paid checkout callback',()=>{
 it('rejects invalid signatures before finalization',async()=>{razorpay.verifyPaymentSignature.mockReturnValue(false);expect((await POST(req())).status).toBe(400);expect(checkout.finalizePayment).not.toHaveBeenCalled();});
 it('binds finalization to the session owner and processor order',async()=>{const r=await POST(req());expect(r.status).toBe(200);expect(checkout.finalizePayment).toHaveBeenCalledWith('pay_processor','order_processor','user-a');expect(checkout.priceCheckout).not.toHaveBeenCalled();});
 it('returns the same order on a retry',async()=>{expect(await (await POST(req())).json()).toEqual(await (await POST(req())).json());});
 it('does not claim success when money needs operational review',async()=>{checkout.finalizePayment.mockResolvedValue({state:'needs_review'});const r=await POST(req());expect(r.status).toBe(202);expect((await r.json()).paymentReceived).toBe(true);});
 it('leaves retryable errors visible',async()=>{checkout.finalizePayment.mockRejectedValue(new Error('processor offline'));expect((await POST(req())).status).toBe(503);});
});

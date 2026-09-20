// Database lifecycle/claim/idempotency tests run against PostgreSQL WASM with npm run test:database.
// This file verifies the trusted webhook boundary; it does not claim a live end-to-end integration.
import {describe,it,expect,vi,beforeEach} from 'vitest';
import {createHmac} from 'crypto';
const finalize=vi.hoisted(()=>vi.fn());vi.mock('@/lib/checkout',()=>({finalizePayment:finalize}));
const {POST}=await import('@/app/api/razorpay/webhook/route');
function req(raw:string,signature?:string){return new Request('http://localhost/api/razorpay/webhook',{method:'POST',body:raw,headers:{'x-razorpay-signature':signature||''}}) as import('next/server').NextRequest;}
const raw=JSON.stringify({event:'payment.captured',payload:{payment:{entity:{id:'pay_verified'}}}});
const sign=(body:string)=>createHmac('sha256','webhook-secret-for-test').update(body).digest('hex');
beforeEach(()=>{process.env.RAZORPAY_WEBHOOK_SECRET='webhook-secret-for-test';finalize.mockReset().mockResolvedValue({state:'completed'});});
describe('payment recovery webhook boundary',()=>{
 it('rejects unsigned events',async()=>{expect((await POST(req(raw))).status).toBe(403);expect(finalize).not.toHaveBeenCalled();});
 it('rejects a body changed after signing',async()=>expect((await POST(req(raw+' ',sign(raw)))).status).toBe(403));
 it('verifies raw bytes and delegates processor re-fetch',async()=>{expect((await POST(req(raw,sign(raw)))).status).toBe(200);expect(finalize).toHaveBeenCalledWith('pay_verified');});
 it('returns retryable failure for processor/database outages',async()=>{finalize.mockRejectedValue(new Error('offline'));expect((await POST(req(raw,sign(raw)))).status).toBe(503);});
 it('acknowledges irrelevant signed events without creating orders',async()=>{const body=JSON.stringify({event:'payment.failed'});expect((await POST(req(body,sign(body)))).status).toBe(200);expect(finalize).not.toHaveBeenCalled();});
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const rate = vi.hoisted(() => ({ checkRateLimit: vi.fn(), getClientIp: () => 'test' }));
vi.mock('@/lib/rateLimit', () => rate);
import { POST } from '@/app/api/support/route';
const request = (body = {name:'Buyer',email:'buyer@example.test',subject:'Order question',message:'Please check my order.'}) => new NextRequest('http://localhost/api/support',{method:'POST',body:JSON.stringify(body)});
describe('support delivery',()=>{
 afterEach(()=>vi.unstubAllGlobals());
 beforeEach(()=>{rate.checkRateLimit.mockResolvedValue({allowed:true});vi.stubEnv('RESEND_API_KEY','test');vi.stubEnv('RESEND_FROM_EMAIL','sender@example.test');vi.stubEnv('SUPPORT_EMAIL','support@example.test');});
 it('validates before sending',async()=>{expect((await POST(request({name:'',email:'bad',subject:'',message:''}))).status).toBe(400);});
 it('limits email abuse',async()=>{rate.checkRateLimit.mockResolvedValue({allowed:false});expect((await POST(request())).status).toBe(429);});
 it('does not simulate success without configuration',async()=>{vi.stubEnv('SUPPORT_EMAIL','');expect((await POST(request())).status).toBe(503);});
 it('only confirms a provider receipt',async()=>{const send=vi.fn().mockResolvedValue(Response.json({id:'email_123'}));vi.stubGlobal('fetch',send);const response=await POST(request());expect(response.status).toBe(200);expect((await response.json()).reference).toBe('email_123');const payload=JSON.parse(send.mock.calls[0][1].body);expect(payload.to).toEqual(['support@example.test']);expect(payload.reply_to).toBe('buyer@example.test');});
 it('reports provider failure',async()=>{vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('',{status:500})));expect((await POST(request())).status).toBe(503);});
});

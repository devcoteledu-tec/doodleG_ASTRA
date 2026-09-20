import { describe,it,expect } from 'vitest';
import { SignJWT } from 'jose';
import { issueAuthFlowToken } from '@/lib/authTokens';
import { verifySessionJwt } from '@/lib/sessionToken';
import { getSessionFromRequest } from '@/lib/session';
import { NextRequest } from 'next/server';
import { middleware } from '../middleware';
const secret=()=>new TextEncoder().encode(process.env.SESSION_SECRET);
async function session(extra: Record<string,unknown>={}){return new SignJWT({userId:'user-a',purpose:'session',...extra}).setProtectedHeader({alg:'HS256'}).setIssuer('doodleg').setAudience('doodleg-session').setIssuedAt().setExpirationTime('1h').sign(secret());}
describe('session token boundaries',()=>{
 it.each(['signup-verify','google-complete'] as const)('rejects %s flow tokens in routes and middleware',async purpose=>{
  const token=await issueAuthFlowToken('pending-user',purpose);
  const req=new NextRequest('http://localhost/api/orders',{headers:{cookie:`doodleg_session=${token}`}});
  expect(await getSessionFromRequest(req)).toBeNull();
  expect((await middleware(req)).status).toBe(401);
 });
 it('accepts explicitly scoped sessions',async()=>expect((await verifySessionJwt(await session()))?.userId).toBe('user-a'));
 it('rejects legacy tokens without session audience/purpose',async()=>{const token=await new SignJWT({userId:'user-a'}).setProtectedHeader({alg:'HS256'}).setExpirationTime('1h').sign(secret());expect(await verifySessionJwt(token)).toBeNull();});
 it('rejects missing user identities',async()=>expect(await verifySessionJwt(await session({userId:''}))).toBeNull());
 it('rejects altered signatures',async()=>expect(await verifySessionJwt((await session())+'tamper')).toBeNull());
});

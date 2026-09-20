import { jwtVerify, type JWTPayload } from 'jose';
export const SESSION_ISSUER = 'doodleg';
export const SESSION_AUDIENCE = 'doodleg-session';
/** Shared by route handlers and middleware: flow tokens are never sessions. */
export async function verifySessionJwt(token: string): Promise<(JWTPayload & { userId: string }) | null> {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) return null;
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret), {
      algorithms: ['HS256'], issuer: SESSION_ISSUER, audience: SESSION_AUDIENCE,
      requiredClaims: ['exp', 'iat', 'userId', 'purpose'],
    });
    if (payload.purpose !== 'session' || typeof payload.userId !== 'string' || !payload.userId) return null;
    return payload as JWTPayload & { userId: string };
  } catch { return null; }
}

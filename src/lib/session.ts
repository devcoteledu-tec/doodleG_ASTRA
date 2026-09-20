import { SignJWT, type JWTPayload } from 'jose';
import { verifySessionJwt, SESSION_ISSUER, SESSION_AUDIENCE } from './sessionToken';
import { cookies } from 'next/headers';
import type { NextRequest } from 'next/server';

export const SESSION_COOKIE_NAME = 'doodleg_session';
const MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 days

function getSecretKey(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      'SESSION_SECRET is missing or shorter than 32 characters. Set a long, ' +
        'random value (e.g. `openssl rand -base64 48`) in your server environment.'
    );
  }
  return new TextEncoder().encode(secret);
}

export interface SessionPayload extends JWTPayload {
  userId: string;
}

async function signSessionToken(userId: string): Promise<string> {
  return new SignJWT({ userId, purpose: 'session' })
    .setIssuer(SESSION_ISSUER)
    .setAudience(SESSION_AUDIENCE)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_SECONDS}s`)
    .sign(getSecretKey());
}

async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    return await verifySessionJwt(token) as SessionPayload | null;
  } catch {
    return null;
  }
}

/**
 * Issue a session for `userId` and set it as a signed, httpOnly, Secure,
 * SameSite=Lax cookie. Only callable from Route Handlers / Server Actions
 * (anywhere `next/headers` cookies() is writable).
 */
export async function createSession(userId: string): Promise<void> {
  const token = await signSessionToken(userId);
  const store = await cookies();
  store.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: MAX_AGE_SECONDS,
  });
}

/** Clear the session cookie (sign out). */
export async function destroySession(): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE_NAME, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
}

/** Read + verify the session cookie from an incoming request (Route Handlers or Middleware). */
export async function getSessionFromRequest(req: NextRequest): Promise<SessionPayload | null> {
  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

export class UnauthorizedError extends Error {
  constructor(message = 'Unauthorized') {
    super(message);
    this.name = 'UnauthorizedError';
  }
}

/**
 * Use at the top of any protected API route:
 *   const { userId } = await requireUser(req);
 * Throws UnauthorizedError (catch it and return a 401) if there's no valid session.
 */
export async function requireUser(req: NextRequest): Promise<{ userId: string }> {
  const session = await getSessionFromRequest(req);
  if (!session) throw new UnauthorizedError();
  return { userId: session.userId };
}

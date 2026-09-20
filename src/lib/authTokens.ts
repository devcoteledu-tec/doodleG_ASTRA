import { SignJWT, jwtVerify, type JWTPayload } from 'jose';

/**
 * Signed, short-lived, purpose-bound tokens for post-signup / post-Google
 * flows.
 *
 * Motivation: `POST /api/auth/complete-profile`, `verify-email`, and
 * `resend-code` used to accept a bare `userId` from the request body and,
 * on success, issue a session cookie (or send an email) for that user.
 * Anyone who knew (or could guess/enumerate) a signin.id UUID could hand
 * this endpoint any other user's id and be logged in as them. See the
 * audit note in the git history for the full attack path via review
 * responses leaking user_id.
 *
 * These tokens fix that by making the "which user is in the middle of
 * signup/completion" claim into a signed assertion that only the server
 * itself can mint. The token is issued the moment /signup or /google
 * establishes the pending user, sent back to the browser exactly once,
 * and required on every follow-up step of that flow. A client that
 * doesn't already possess a valid token cannot impersonate a different
 * userId simply by putting a UUID in the request body.
 *
 * Tokens are:
 *  - HS256-signed with SESSION_SECRET (same secret as the main session
 *    cookie — one secret to rotate, one place it lives)
 *  - Purpose-bound: a "signup-verify" token cannot be used at
 *    /complete-profile, and vice versa. Enforced by the `purpose` claim.
 *  - Short-lived: 30 minutes. Long enough for a distracted user to finish
 *    OTP entry / mobile entry, short enough that a leaked token expires
 *    before it becomes broadly useful.
 *  - Not stored server-side. JWTs are stateless; single-use behavior
 *    comes from the underlying state (OTP row cleared after verify,
 *    mobile row filled after complete-profile) rather than a per-token
 *    denylist. That is enough here because both terminal actions leave
 *    the account in a state the replayed token can no longer act on.
 */

export type AuthTokenPurpose = 'signup-verify' | 'google-complete';

interface AuthTokenPayload extends JWTPayload {
  userId: string;
  purpose: AuthTokenPurpose;
}

/**
 * 30 minutes. A user finishing OTP entry or supplying a mobile number
 * takes seconds; the wide window is there for the "opened email 20
 * minutes later" case, not for token reuse.
 */
const TOKEN_TTL_SECONDS = 30 * 60;

function getSecretKey(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      'SESSION_SECRET is missing or shorter than 32 characters. Auth flow ' +
        'tokens cannot be issued or verified without it.'
    );
  }
  return new TextEncoder().encode(secret);
}

/**
 * Issue a token binding `userId` to a specific `purpose`. Return this to
 * the browser exactly once (in the JSON response body — never in a
 * cookie); every subsequent step of the flow must re-present it.
 */
export async function issueAuthFlowToken(
  userId: string,
  purpose: AuthTokenPurpose
): Promise<string> {
  return new SignJWT({ userId, purpose })
    .setIssuer('doodleg')
    .setAudience('doodleg-auth-flow')
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${TOKEN_TTL_SECONDS}s`)
    .sign(getSecretKey());
}

/**
 * Verify a token AND that it was issued for the expected purpose. Returns
 * the enclosed userId on success, or `null` for any failure (signature
 * invalid, expired, wrong purpose, malformed). Callers translate `null`
 * into a generic 401 — never leak *which* check failed to the client.
 */
export async function verifyAuthFlowToken(
  token: string,
  expectedPurpose: AuthTokenPurpose
): Promise<{ userId: string } | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey(), { algorithms: ['HS256'], issuer: 'doodleg', audience: 'doodleg-auth-flow', requiredClaims: ['exp', 'iat', 'purpose', 'userId'] });
    const claims = payload as AuthTokenPayload;
    if (claims.purpose !== expectedPurpose) return null;
    if (typeof claims.userId !== 'string' || !claims.userId) return null;
    return { userId: claims.userId };
  } catch {
    return null;
  }
}

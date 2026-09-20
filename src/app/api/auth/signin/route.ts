import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { hashPassword, verifyPassword, isBcryptHash, legacySha256 } from '@/lib/password';
import { createSession } from '@/lib/session';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';
import { issueAuthFlowToken } from '@/lib/authTokens';
import { escapeLikePattern } from '@/lib/likeEscape';
import { captureServerEvent } from '@/lib/posthogServer';

const signinSchema = z.object({
  userName: z.string().trim().min(1, 'Username and password are required.').max(40),
  password: z.string().min(1, 'Username and password are required.').max(200),
});

// ── Brute-force / credential-stuffing protection ──
// Two independent limits, both must pass:
//  - Per-IP: stops a single attacker from hammering many usernames.
//  - Per-username (case-insensitive): stops distributed/rotating-IP attacks
//    from grinding through passwords for one specific account.
// Backed by a shared Supabase table (see src/lib/rateLimit.ts), so both
// limits are enforced globally across every serverless instance.
const IP_LIMIT = 20;
const IP_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const USERNAME_LIMIT = 8;
const USERNAME_WINDOW_MS = 10 * 60 * 1000; // 10 minutes

// LIKE-metacharacter escaping — see src/lib/likeEscape.ts for the rationale.
// Both signin and signup route through the same helper so the two lookups
// can never drift apart again.

export async function POST(req: NextRequest) {
  try {
    const json = await req.json().catch(() => null);
    const parsed = signinSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Username and password are required.' }, { status: 400 });
    }
    const { userName, password } = parsed.data;

    const ip = getClientIp(req.headers);
    const [ipCheck, userCheck] = await Promise.all([
      checkRateLimit(`signin:ip:${ip}`, IP_LIMIT, IP_WINDOW_MS),
      checkRateLimit(`signin:user:${userName.toLowerCase()}`, USERNAME_LIMIT, USERNAME_WINDOW_MS),
    ]);

    if (!ipCheck.allowed || !userCheck.allowed) {
      const retryAfterSeconds = Math.max(ipCheck.retryAfterSeconds, userCheck.retryAfterSeconds);
      return NextResponse.json(
        { error: 'Too many sign-in attempts. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(retryAfterSeconds) } }
      );
    }

    // Same generic response whether the username doesn't exist or the
    // password is wrong, so this endpoint can't be used to enumerate usernames.
    const invalidCredentials = () =>
      NextResponse.json({ error: 'Invalid username or password.' }, { status: 401 });

    const { data: signinRow, error } = await supabaseAdmin
      .from('signin')
      .select('id, user_name, email, mobile_number, password_hash, email_verified')
      .ilike('user_name', escapeLikePattern(userName))
      .maybeSingle();

    if (error) {
      // Surface this instead of silently treating it as "wrong password" —
      // e.g. PGRST116 (multiple rows) would otherwise look identical to a
      // bad password to the user, which is exactly what made this bug hard
      // to spot last time.
      console.error('Signin lookup error:', error);
      return invalidCredentials();
    }

    if (!signinRow || !signinRow.password_hash) {
      return invalidCredentials();
    }

    let valid = false;

    if (isBcryptHash(signinRow.password_hash)) {
      valid = await verifyPassword(password, signinRow.password_hash);
    } else {
      // ── Legacy SHA-256 row: verify once against the old scheme, then
      //    transparently upgrade to bcrypt so it's never checked this way again. ──
      valid = legacySha256(password) === signinRow.password_hash;
      if (valid) {
        const upgradedHash = await hashPassword(password);
        await supabaseAdmin
          .from('signin')
          .update({ password_hash: upgradedHash })
          .eq('id', signinRow.id);
      }
    }

    if (!valid) {
      return invalidCredentials();
    }

    if (!signinRow.email_verified) {
      // Correct password, but the address was never confirmed — no session
      // yet. Front-end routes this straight to the OTP step instead of
      // showing a generic error.
      //
      // We hand back a signed verificationToken instead of the bare userId
      // so that the follow-up /verify-email and /resend-code calls can be
      // proven to have originated from this signin (see
      // src/lib/authTokens.ts).
      const verificationToken = await issueAuthFlowToken(signinRow.id, 'signup-verify');
      return NextResponse.json(
        {
          error: 'Please verify your email to continue.',
          needsVerification: true,
          verificationToken,
          email: signinRow.email,
        },
        { status: 403 }
      );
    }

    await createSession(signinRow.id);
    captureServerEvent(signinRow.id, 'sign_in', { method: 'password' });

    return NextResponse.json({
      user: {
        id: signinRow.id,
        user_name: signinRow.user_name,
        email: signinRow.email,
        mobile_number: signinRow.mobile_number,
        email_verified: true,
      },
    });
  } catch (err) {
    console.error('Signin route error:', err);
    return NextResponse.json({ error: 'An unexpected error occurred.' }, { status: 500 });
  }
}

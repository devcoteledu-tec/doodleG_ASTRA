import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { createSession } from '@/lib/session';
import { captureServerEvent } from '@/lib/posthogServer';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';
import { verifyOtp, isOtpExpired } from '@/lib/otp';
import { verifyAuthFlowToken } from '@/lib/authTokens';

// The client no longer sends a raw userId. It sends the
// `verificationToken` that /signup or /signin (needsVerification branch)
// handed it, and the 6-digit OTP the user typed in from their email. The
// token is the only way to reference which account is being verified —
// see src/lib/authTokens.ts for why this replaces the previous
// userId-in-body scheme.
const verifySchema = z.object({
  verificationToken: z.string().min(1, 'Missing verification token.'),
  code: z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code.'),
});

// Brute-force protection: a 6-digit code only has 1e6 possibilities, so this
// must be tightly throttled per account (and per IP, so one attacker can't
// spin up many accounts to spread guesses around the IP limit).
const USER_LIMIT = 8;
const USER_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const IP_LIMIT = 20;
const IP_WINDOW_MS = 15 * 60 * 1000;

export async function POST(req: NextRequest) {
  try {
    const json = await req.json().catch(() => null);
    const parsed = verifySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || 'Invalid input.' },
        { status: 400 }
      );
    }
    const { verificationToken, code } = parsed.data;

    // Recover the userId from the signed token. A wrong purpose, expired
    // token, or missing/invalid signature all collapse to a generic 401 —
    // the client never sees *which* check failed.
    const claim = await verifyAuthFlowToken(verificationToken, 'signup-verify');
    if (!claim) {
      return NextResponse.json({ error: 'This verification session has expired. Please sign in again.' }, { status: 401 });
    }
    const userId = claim.userId;

    const ip = getClientIp(req.headers);
    const [ipCheck, userCheck] = await Promise.all([
      checkRateLimit(`verify-email:ip:${ip}`, IP_LIMIT, IP_WINDOW_MS),
      checkRateLimit(`verify-email:user:${userId}`, USER_LIMIT, USER_WINDOW_MS),
    ]);
    if (!ipCheck.allowed || !userCheck.allowed) {
      const retryAfterSeconds = Math.max(ipCheck.retryAfterSeconds, userCheck.retryAfterSeconds);
      return NextResponse.json(
        { error: 'Too many attempts. Please request a new code and try again later.' },
        { status: 429, headers: { 'Retry-After': String(retryAfterSeconds) } }
      );
    }

    const { data: row, error } = await supabaseAdmin
      .from('signin')
      .select('id, user_name, email, mobile_number, email_verified, otp_code_hash, otp_expires_at')
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      console.error('verify-email lookup error:', error);
      return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
    }
    if (!row) {
      return NextResponse.json({ error: 'Account not found.' }, { status: 404 });
    }
    if (row.email_verified) {
      return NextResponse.json({ error: 'Email already verified. Please sign in.' }, { status: 409 });
    }
    if (!row.otp_code_hash || isOtpExpired(row.otp_expires_at)) {
      return NextResponse.json(
        { error: 'This code has expired. Please request a new one.' },
        { status: 410 }
      );
    }
    if (!verifyOtp(code, row.otp_code_hash)) {
      return NextResponse.json({ error: 'Incorrect code. Please try again.' }, { status: 400 });
    }

    const { data: verified, error: updateError } = await supabaseAdmin
      .from('signin')
      .update({ email_verified: true, otp_code_hash: null, otp_expires_at: null, otp_purpose: null })
      .eq('id', row.id)
      .eq('email_verified', false)
      .eq('otp_code_hash', row.otp_code_hash)
      .select('id')
      .maybeSingle();
    if (updateError || !verified) {
      return NextResponse.json({ error: 'Verification could not be completed. Please sign in again.' }, { status: 409 });
    }

    await createSession(row.id);
    captureServerEvent(row.id, 'sign_up', { method: 'password' });

    return NextResponse.json({
      user: { id: row.id, user_name: row.user_name, email: row.email, mobile_number: row.mobile_number, email_verified: true },
    });
  } catch (err) {
    console.error('verify-email route error:', err);
    return NextResponse.json({ error: 'An unexpected error occurred.' }, { status: 500 });
  }
}

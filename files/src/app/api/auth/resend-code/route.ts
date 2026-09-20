import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';
import { generateOtp, hashOtp, otpExpiryTimestamp } from '@/lib/otp';
import { EmailService } from '@/services/email';
import { verifyAuthFlowToken } from '@/lib/authTokens';

// Same token requirement as /verify-email — the caller must present the
// verificationToken issued by /signup or /signin's needsVerification
// branch. Previously this endpoint accepted a raw userId in the body,
// which let anyone trigger repeated OTP emails to any account they knew
// (or guessed) the id of.
const resendSchema = z.object({
  verificationToken: z.string().min(1, 'Missing verification token.'),
});

// A fresh code can be requested at most a few times per window — this is
// unauthenticated (the person isn't signed in yet) so it must be throttled
// like any other endpoint that triggers a real email send.
const USER_LIMIT = 4;
const USER_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const IP_LIMIT = 10;
const IP_WINDOW_MS = 15 * 60 * 1000;

export async function POST(req: NextRequest) {
  try {
    const json = await req.json().catch(() => null);
    const parsed = resendSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
    }
    const { verificationToken } = parsed.data;

    const claim = await verifyAuthFlowToken(verificationToken, 'signup-verify');
    if (!claim) {
      return NextResponse.json({ error: 'This verification session has expired. Please sign in again.' }, { status: 401 });
    }
    const userId = claim.userId;

    const ip = getClientIp(req.headers);
    const [ipCheck, userCheck] = await Promise.all([
      checkRateLimit(`resend-code:ip:${ip}`, IP_LIMIT, IP_WINDOW_MS),
      checkRateLimit(`resend-code:user:${userId}`, USER_LIMIT, USER_WINDOW_MS),
    ]);
    if (!ipCheck.allowed || !userCheck.allowed) {
      const retryAfterSeconds = Math.max(ipCheck.retryAfterSeconds, userCheck.retryAfterSeconds);
      return NextResponse.json(
        { error: 'Please wait a bit before requesting another code.' },
        { status: 429, headers: { 'Retry-After': String(retryAfterSeconds) } }
      );
    }

    const { data: row, error } = await supabaseAdmin
      .from('signin')
      .select('id, user_name, email, email_verified')
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      console.error('resend-code lookup error:', error);
      return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
    }
    if (!row) {
      return NextResponse.json({ error: 'Account not found.' }, { status: 404 });
    }
    if (row.email_verified) {
      return NextResponse.json({ error: 'This email is already verified. Please sign in.' }, { status: 409 });
    }

    const code = generateOtp();
    const otpCodeHash = hashOtp(code);
    const otpExpiresAt = otpExpiryTimestamp();

    const { error: saveError } = await supabaseAdmin
      .from('signin')
      .update({ otp_code_hash: otpCodeHash, otp_expires_at: otpExpiresAt, otp_purpose: 'signup' })
      .eq('id', row.id);

    if (saveError) throw saveError;

    const sendResult = await EmailService.sendVerificationCode({ to: row.email, code, name: row.user_name });
    if (!sendResult.success) {
      return NextResponse.json({ error: "We couldn't send the email. Please try again shortly." }, { status: 502 });
    }

    return NextResponse.json({ sent: true });
  } catch (err) {
    console.error('resend-code route error:', err);
    return NextResponse.json({ error: 'An unexpected error occurred.' }, { status: 500 });
  }
}

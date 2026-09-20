import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { hashPassword } from '@/lib/password';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';
import { generateOtp, hashOtp, otpExpiryTimestamp } from '@/lib/otp';
import { EmailService } from '@/services/email';
import { issueAuthFlowToken } from '@/lib/authTokens';
import { escapeLikePattern } from '@/lib/likeEscape';

const signupSchema = z.object({
  userName: z.string().trim().min(3, 'Username must be at least 3 characters.').max(40),
  email: z.string().trim().toLowerCase().email('A valid email is required.').max(255),
  mobileNumber: z.string().trim().regex(/^\d{10}$/, 'Enter a valid 10-digit mobile number.'),
  pincode: z.string().trim().regex(/^[1-9][0-9]{5}$/, 'Enter a valid 6-digit PIN code.'),
  password: z.string().min(8, 'Password must be at least 8 characters.').max(200),
});

// ── Abuse protection ──
// Unauthenticated endpoint that creates real DB rows (signin + profile) —
// throttle per-IP so it can't be scripted into mass account creation /
// username-squatting / signup spam. Backed by a shared Supabase table (see
// src/lib/rateLimit.ts), so the limit is enforced globally.
const IP_LIMIT = 10;
const IP_WINDOW_MS = 10 * 60 * 1000; // 10 minutes

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req.headers);
    const { allowed, retryAfterSeconds } = await checkRateLimit(`signup:ip:${ip}`, IP_LIMIT, IP_WINDOW_MS);
    if (!allowed) {
      return NextResponse.json(
        { error: 'Too many sign-up attempts. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(retryAfterSeconds) } }
      );
    }

    const json = await req.json().catch(() => null);
    const parsed = signupSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || 'Invalid input.' },
        { status: 400 }
      );
    }
    const { userName, email, mobileNumber, pincode, password } = parsed.data;

    // ── Check username uniqueness (case-insensitive, matches the DB's
    //    unique index on LOWER(user_name)) ──
    // LIKE-metachar escape is mandatory here: without it a signup with a
    // userName containing '%' or '_' would silently match unrelated
    // existing rows and reject the signup with "username already taken",
    // and it would also let a caller probe existing usernames by trying
    // wildcards. See src/lib/likeEscape.ts.
    const { data: existingUser } = await supabaseAdmin
      .from('signin')
      .select('id')
      .ilike('user_name', escapeLikePattern(userName))
      .maybeSingle();

    if (existingUser) {
      return NextResponse.json({ error: 'Username is already taken. Please choose another.' }, { status: 409 });
    }

    // ── Check email uniqueness ──
    const { data: existingEmail } = await supabaseAdmin
      .from('signin')
      .select('id')
      .eq('email', email)
      .maybeSingle();

    if (existingEmail) {
      return NextResponse.json({ error: 'An account with this email already exists.' }, { status: 409 });
    }

    // ── Hash password with bcrypt (cost factor 12) ──
    const passwordHash = await hashPassword(password);

    // ── Generate a 6-digit email verification code. Only its hash is
    //    stored (see src/lib/otp.ts + supabase_migration_012). The account
    //    is created unverified; sign-in is blocked until it's confirmed. ──
    const code = generateOtp();
    const otpCodeHash = hashOtp(code);
    const otpExpiresAt = otpExpiryTimestamp();

    // ── Insert into signin table ──
    const { data: newSignin, error: signinError } = await supabaseAdmin
      .from('signin')
      .insert({
        user_name: userName,
        email,
        mobile_number: mobileNumber,
        password_hash: passwordHash,
        email_verified: false,
        auth_provider: 'password',
        otp_code_hash: otpCodeHash,
        otp_expires_at: otpExpiresAt,
        otp_purpose: 'signup',
      })
      .select()
      .single();

    if (signinError || !newSignin) {
      // 23505 = Postgres unique_violation. Two concurrent signups can both
      // pass the pre-check above and race to INSERT; the DB's unique index
      // on LOWER(user_name) (see migration 007) is what actually prevents
      // duplicate rows, and this is where that race gets caught cleanly.
      if (signinError?.code === '23505') {
        return NextResponse.json(
          { error: 'Username is already taken. Please choose another.' },
          { status: 409 }
        );
      }
      console.error('Signup error:', signinError);
      return NextResponse.json({ error: 'Failed to create account. Please try again.' }, { status: 500 });
    }

    // ── Auto-create profile row ──
    const { error: profileError } = await supabaseAdmin.from('profile').upsert({
      user_id: newSignin.id,
      name: userName,
      subscription_type: 'prime',
      topic_interested: [],
      like_products_id: [],
      pincode,
    }, { onConflict: 'user_id' });
    if (profileError) throw profileError;

    // ── Send the verification code. No session is issued yet — the
    //    account only becomes usable once /api/auth/verify-email confirms
    //    the code. If the email fails to send, the account still exists so
    //    the person can retry via /api/auth/resend-code.
    //
    //    We hand the client a signed `verificationToken` (short-lived,
    //    purpose-bound — see src/lib/authTokens.ts) rather than the bare
    //    userId. Every follow-up step (verify-email, resend-code)
    //    requires this token, so a caller can never target another user's
    //    row by putting a UUID in the request body. ──
    const verificationToken = await issueAuthFlowToken(newSignin.id, 'signup-verify');

    const sendResult = await EmailService.sendVerificationCode({ to: email, code, name: userName });
    if (!sendResult.success) {
      return NextResponse.json(
        {
          error: "We couldn't send your verification email. Please try resending the code.",
          needsVerification: true,
          verificationToken,
          email,
        },
        { status: 202 }
      );
    }

    return NextResponse.json({
      needsVerification: true,
      verificationToken,
      email,
    });
  } catch (err) {
    console.error('Signup route error:', err);
    return NextResponse.json({ error: 'An unexpected error occurred.' }, { status: 500 });
  }
}

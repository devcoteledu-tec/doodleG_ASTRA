import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { createSession } from '@/lib/session';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';
import { verifyAuthFlowToken } from '@/lib/authTokens';
import { captureServerEvent } from '@/lib/posthogServer';

// Google only ever gives us email + name — never a phone number — so a
// brand-new (or first-time-linking) Google account lands here to supply
// one before it gets a session. See src/app/api/auth/google/route.ts,
// which returns `completionToken` instead of a session whenever this is
// missing.
//
// SECURITY: this endpoint previously accepted a bare `userId` from the
// request body and issued a session cookie for whichever id was
// supplied. Anyone who knew (or could guess/enumerate) a signin.id UUID
// could be logged in as that user with no other authentication. The
// endpoint now requires the signed `completionToken` that /google
// returned to the browser; a caller cannot target a different account
// simply by editing the request body.
const bodySchema = z.object({
  completionToken: z.string().min(1, 'Missing completion token.'),
  mobileNumber: z.string().trim().regex(/^\d{10}$/, 'Enter a valid 10-digit mobile number.'),
});

const IP_LIMIT = 15;
const IP_WINDOW_MS = 15 * 60 * 1000;

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req.headers);
    const { allowed, retryAfterSeconds } = await checkRateLimit(`complete-profile:ip:${ip}`, IP_LIMIT, IP_WINDOW_MS);
    if (!allowed) {
      return NextResponse.json(
        { error: 'Too many attempts. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(retryAfterSeconds) } }
      );
    }

    const json = await req.json().catch(() => null);
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || 'Invalid input.' },
        { status: 400 }
      );
    }
    const { completionToken, mobileNumber } = parsed.data;

    // Recover the userId from the signed token. Any failure — bad
    // signature, expired, wrong purpose — collapses to a generic 401.
    const claim = await verifyAuthFlowToken(completionToken, 'google-complete');
    if (!claim) {
      return NextResponse.json(
        { error: 'This sign-in session has expired. Please sign in with Google again.' },
        { status: 401 }
      );
    }
    const userId = claim.userId;

    const { data: row, error } = await supabaseAdmin
      .from('signin')
      .select('id, user_name, email, mobile_number, email_verified')
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      console.error('complete-profile lookup error:', error);
      return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
    }
    if (!row) {
      return NextResponse.json({ error: 'Account not found.' }, { status: 404 });
    }
    if (!row.email_verified) {
      return NextResponse.json({ error: 'Please verify your email first.' }, { status: 403 });
    }

    // SECURITY: refuse to overwrite an existing mobile number. The
    // legitimate flow only reaches this endpoint when the account has no
    // mobile on file (see /api/auth/google). Silently overwriting one
    // would let a stolen completion token replace the WhatsApp number
    // that /api/whatsapp/webhook uses to identify the account owner. If
    // an existing user genuinely needs to change their number, that
    // belongs on the signed-in /api/my-profile endpoint, not here.
    if (row.mobile_number) {
      return NextResponse.json({ error: 'This account already has a mobile number on file.' }, { status: 409 });
    }

    const { data: updated, error: updateError } = await supabaseAdmin
      .from('signin')
      .update({ mobile_number: mobileNumber })
      .eq('id', row.id)
      .is('mobile_number', null)
      .select('id, user_name, email, mobile_number')
      .single();

    if (updateError || !updated) {
      console.error('complete-profile update error:', updateError);
      return NextResponse.json({ error: 'Failed to save your mobile number. Please try again.' }, { status: 500 });
    }

    await createSession(updated.id);
    captureServerEvent(updated.id, 'sign_up', { method: 'google' });

    return NextResponse.json({
      user: { ...updated, email_verified: true },
    });
  } catch (err) {
    console.error('complete-profile route error:', err);
    return NextResponse.json({ error: 'An unexpected error occurred.' }, { status: 500 });
  }
}

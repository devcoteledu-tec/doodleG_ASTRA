import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { createSession } from '@/lib/session';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';
import { issueAuthFlowToken } from '@/lib/authTokens';
import { escapeLikePattern } from '@/lib/likeEscape';
import { captureServerEvent } from '@/lib/posthogServer';

const bodySchema = z.object({
  credential: z.string().min(20, 'Invalid Google credential.'),
});

// Google's own tokeninfo endpoint validates the JWT signature/expiry for us
// server-side — no extra dependency (google-auth-library) needed for a
// single-purpose "verify this ID token" check, same "plain fetch to a REST
// API" convention used in src/services/whatsapp.ts and src/services/email.ts.
interface GoogleTokenInfo {
  aud: string;
  sub: string;
  email: string;
  email_verified: string; // Google returns this as the *string* "true"/"false"
  name?: string;
  picture?: string;
}

const IP_LIMIT = 20;
const IP_WINDOW_MS = 10 * 60 * 1000;

async function generateUniqueUsername(base: string): Promise<string> {
  const cleaned = base.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 24) || 'gifter';
  for (let attempt = 0; attempt < 6; attempt++) {
    const candidate = attempt === 0 ? cleaned : `${cleaned}${Math.floor(1000 + Math.random() * 9000)}`;
    // escapeLikePattern is defensive here: `cleaned` already strips
    // non-[a-z0-9_] characters, so `%` can't leak through today. If the
    // allowlist above ever loosens, this call is what stops the lookup
    // from silently turning into a wildcard match.
    const { data } = await supabaseAdmin.from('signin').select('id').ilike('user_name', escapeLikePattern(candidate)).maybeSingle();
    if (!data) return candidate;
  }
  return `${cleaned}${Date.now().toString().slice(-6)}`;
}

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req.headers);
    const { allowed, retryAfterSeconds } = await checkRateLimit(`google-auth:ip:${ip}`, IP_LIMIT, IP_WINDOW_MS);
    if (!allowed) {
      return NextResponse.json(
        { error: 'Too many attempts. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(retryAfterSeconds) } }
      );
    }

    const json = await req.json().catch(() => null);
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid Google sign-in request.' }, { status: 400 });
    }

    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    if (!clientId) {
      return NextResponse.json({ error: 'Google sign-in is not configured.' }, { status: 501 });
    }

    const infoRes = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(parsed.data.credential)}`,
      { signal: AbortSignal.timeout(8000) }
    );
    if (!infoRes.ok) {
      return NextResponse.json({ error: 'Your Google sign-in could not be verified. Please try again.' }, { status: 401 });
    }
    const info = (await infoRes.json()) as GoogleTokenInfo;

    // The audience MUST match our own client id, or this token could have
    // been issued for a completely different app.
    if (info.aud !== clientId) {
      return NextResponse.json({ error: 'Google sign-in could not be verified.' }, { status: 401 });
    }
    if (info.email_verified !== 'true' || !info.email || !info.sub) {
      return NextResponse.json({ error: 'Your Google account email is not verified.' }, { status: 401 });
    }

    info.email = info.email.trim().toLowerCase();

    // ── Look up an existing account by Google subject id first ──
    const { data: byGoogleSub } = await supabaseAdmin
      .from('signin')
      .select('id, user_name, email, mobile_number')
      .eq('google_sub', info.sub)
      .maybeSingle();

    if (byGoogleSub) {
      if (!byGoogleSub.mobile_number) {
        // Signed token instead of a raw userId — /complete-profile only
        // trusts a token bound to the 'google-complete' purpose, so a
        // caller cannot target another user by editing the request body.
        const completionToken = await issueAuthFlowToken(byGoogleSub.id, 'google-complete');
        return NextResponse.json({
          needsMobileNumber: true,
          completionToken,
          email: byGoogleSub.email,
          name: byGoogleSub.user_name,
        });
      }
      await createSession(byGoogleSub.id);
      captureServerEvent(byGoogleSub.id, 'sign_in', { method: 'google' });
      return NextResponse.json({
        user: { ...byGoogleSub, email_verified: true },
      });
    }

    // ── Otherwise, link by matching email (a password account signing in
    //    with Google for the first time) ──
    const { data: byEmail } = await supabaseAdmin
      .from('signin')
      .select('id, user_name, email, mobile_number, email_verified, password_hash')
      .eq('email', info.email)
      .maybeSingle();

    if (byEmail) {
      // SECURITY: if the existing row was never OTP-verified but has a
      // password set, an attacker may have squatted this email — signed
      // up with `victim@example.com`, chosen their own password, and
      // waited. The OTP went to the real victim's inbox and was never
      // used. If we simply flip email_verified=true here (which we must,
      // since Google just proved ownership of the email), the squatter's
      // password becomes usable.
      //
      // Wipe the password and demote the row to a Google-only account.
      // The real user (whose Google account we just verified) can still
      // sign in via Google unchanged. Any squatter loses the account.
      const isSquatterRisk = !byEmail.email_verified && byEmail.password_hash != null;

      const updatePayload: Record<string, unknown> = {
        google_sub: info.sub,
        email_verified: true,
      };
      if (isSquatterRisk) {
        updatePayload.password_hash = null;
        updatePayload.auth_provider = 'google';
        updatePayload.mobile_number = null;
        updatePayload.otp_code_hash = null;
        updatePayload.otp_expires_at = null;
        console.warn(
          `Google linking on unverified account ${byEmail.id}: password wiped as potential email-squatter mitigation.`
        );
      }

      const { error: linkError } = await supabaseAdmin.from('signin').update(updatePayload).eq('id', byEmail.id);
      if (linkError) throw linkError;

      if (isSquatterRisk || !byEmail.mobile_number) {
        const completionToken = await issueAuthFlowToken(byEmail.id, 'google-complete');
        return NextResponse.json({
          needsMobileNumber: true,
          completionToken,
          email: byEmail.email,
          name: byEmail.user_name,
        });
      }
      await createSession(byEmail.id);
      captureServerEvent(byEmail.id, 'sign_in', { method: 'google' });
      // Never surface `password_hash` in the response — the select above
      // included it only so we could detect the squatter case.
      return NextResponse.json({
        user: {
          id: byEmail.id,
          user_name: byEmail.user_name,
          email: byEmail.email,
          mobile_number: byEmail.mobile_number,
          email_verified: true,
        },
      });
    }

    // ── Brand new account ──
    const userName = await generateUniqueUsername(info.name || info.email.split('@')[0]);
    const { data: newSignin, error: insertError } = await supabaseAdmin
      .from('signin')
      .insert({
        user_name: userName,
        email: info.email,
        password_hash: null,
        email_verified: true,
        auth_provider: 'google',
        google_sub: info.sub,
      })
      .select()
      .single();

    if (insertError || !newSignin) {
      console.error('Google signup error:', insertError);
      return NextResponse.json({ error: 'Failed to create account. Please try again.' }, { status: 500 });
    }

    const { error: profileError } = await supabaseAdmin.from('profile').upsert({
      user_id: newSignin.id,
      name: info.name || userName,
      subscription_type: 'prime',
      topic_interested: [],
      like_products_id: [],
      ...(info.picture ? { avatar_url: info.picture } : {}),
    }, { onConflict: 'user_id' });
    if (profileError) throw profileError;

    const completionToken = await issueAuthFlowToken(newSignin.id, 'google-complete');
    return NextResponse.json({
      needsMobileNumber: true,
      completionToken,
      email: newSignin.email,
      name: newSignin.user_name,
    });
  } catch (err) {
    console.error('Google auth route error:', err);
    return NextResponse.json({ error: 'An unexpected error occurred.' }, { status: 500 });
  }
}

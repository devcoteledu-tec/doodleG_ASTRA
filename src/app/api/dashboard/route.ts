import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getSessionFromRequest } from '@/lib/session';
import { fetchRecipientsForProfile, mapRecipientToDashboardShape } from '@/lib/giftDomain';
import { getErrorMessage } from '@/lib/errors';

/**
 * Returns the signed-in user's own Relationship Hub data: their profile plus
 * every recipient/occasion/gift-cycle they've created.
 *
 * Previously this route hardcoded a single `DEFAULT_EMAIL`, auto-created a
 * fake "Alex Mercer" account if it didn't exist, and auto-seeded two demo
 * recipients whenever the list was empty — every visitor saw (or silently
 * recreated) the same account, and it was impossible to show per-user data.
 * It now derives the user strictly from the session cookie and returns a
 * genuinely empty list — with no side effects — when the user has no
 * recipients yet. To seed demo data for local development, run
 * `npm run seed:demo` (see scripts/seed-demo-data.ts) instead.
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: userSign, error: userErr } = await supabaseAdmin
      .from('signin')
      .select('id, user_name, email, mobile_number')
      .eq('id', session.userId)
      .maybeSingle();

    if (userErr || !userSign) {
      return NextResponse.json({ error: 'Account not found.' }, { status: 404 });
    }

    // Every signed-in user has exactly one profile row (created at signup).
    // If one is somehow missing, treat it as an empty hub rather than erroring.
    const { data: profile, error: profileErr } = await supabaseAdmin
      .from('profile')
      .select('id')
      .eq('user_id', userSign.id)
      .maybeSingle();

    if (profileErr) throw profileErr;

    const recipients = profile ? await fetchRecipientsForProfile(profile.id) : [];

    return NextResponse.json({
      user: {
        email: userSign.email,
        name: userSign.user_name,
        whatsappPhone: userSign.mobile_number,
      },
      recipients: recipients.map(mapRecipientToDashboardShape),
    });
  } catch (error: unknown) {
    console.error('Error fetching dashboard details:', error);
    return NextResponse.json({ error: getErrorMessage(error, 'Failed to retrieve hub data.') }, { status: 500 });
  }
}

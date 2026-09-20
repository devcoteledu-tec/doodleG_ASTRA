import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';
import { resolvePincodeLocation } from '@/lib/indiaPost';

// Looks up a 6-digit Indian PIN code against India Post's official,
// free/public API (via src/lib/indiaPost.ts) and returns the post
// office(s) it resolves to, so the signup form / cart PIN box can show
// the user "Thiruvananthapuram, Kerala" while they type instead of
// accepting any 6 digits blindly.
//
// Kept server-side (rather than called directly from the browser) so:
//   - it goes through our own rate limiter, consistent with every other
//     unauthenticated endpoint in this app;
//   - the upstream host/shape can change without a client redeploy.
const PINCODE_REGEX = /^[1-9][0-9]{5}$/;

const IP_LIMIT = 30;
const IP_WINDOW_MS = 10 * 60 * 1000; // 10 minutes

export async function GET(req: NextRequest) {
  try {
    const ip = getClientIp(req.headers);
    const { allowed, retryAfterSeconds } = await checkRateLimit(`verify-pincode:ip:${ip}`, IP_LIMIT, IP_WINDOW_MS);
    if (!allowed) {
      return NextResponse.json(
        { error: 'Too many lookups. Please slow down and try again.' },
        { status: 429, headers: { 'Retry-After': String(retryAfterSeconds) } }
      );
    }

    const pincode = req.nextUrl.searchParams.get('pincode')?.trim() || '';
    if (!PINCODE_REGEX.test(pincode)) {
      return NextResponse.json({ error: 'Enter a valid 6-digit PIN code.' }, { status: 400 });
    }

    const result = await resolvePincodeLocation(pincode);
    if (!result) {
      return NextResponse.json(
        { error: "Couldn't verify that PIN code right now. You can still continue." },
        { status: 502 }
      );
    }

    return NextResponse.json(result);
  } catch (err) {
    console.error('verify-pincode route error:', err);
    return NextResponse.json({ error: 'An unexpected error occurred.' }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';
import { computeCartShipping } from '@/lib/shipping';

// Powers the live "Shipping" line in the cart's Order Summary as the
// shopper types their pincode — the same computeCartShipping() the order
// route uses for the actual charge, so what's shown here always matches
// what gets charged at checkout (barring provider pincode changes in
// between). No auth required: this only reads provider pincodes (not
// sensitive) and a pincode the shopper just typed, matching /api/verify-pincode.
const bodySchema = z.object({
  pincode: z.string().trim().regex(/^[1-9][0-9]{5}$/, 'Enter a valid 6-digit PIN code.'),
  // One entry per cart item — null for items with no provider_id at all.
  // Not deduped by the caller; computeCartShipping handles grouping.
  providerIds: z.array(z.string().min(1).nullable()).min(1).max(100),
});

const IP_LIMIT = 60;
const IP_WINDOW_MS = 10 * 60 * 1000;

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req.headers);
    const { allowed, retryAfterSeconds } = await checkRateLimit(`cart-shipping-estimate:ip:${ip}`, IP_LIMIT, IP_WINDOW_MS);
    if (!allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please slow down and try again.' },
        { status: 429, headers: { 'Retry-After': String(retryAfterSeconds) } }
      );
    }

    const json = await req.json().catch(() => null);
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Invalid input.' }, { status: 400 });
    }

    const result = await computeCartShipping(parsed.data.pincode, parsed.data.providerIds);
    return NextResponse.json(result);
  } catch (err) {
    console.error('cart shipping-estimate route error:', err);
    return NextResponse.json({ error: 'An unexpected error occurred.' }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSessionFromRequest } from '@/lib/session';
import { computeServerTrustedPricing } from '@/lib/orderPricing';
import { computePaymentBreakdown } from '@/lib/paymentBreakdown';

// Tells the cart UI exactly who to pay, how much, and via which UPI ID —
// computed fresh from the database every time, never from client-cached
// cart/product data. This is what replaced the old single hardcoded UPI_ID
// in src/app/cart/CartPageClient.tsx: that constant sent every prepaid
// order to the storefront's own account regardless of which provider
// actually supplied the item(s), which is both wrong (providers never got
// paid for their own sales) and a real correctness bug, not just a UX one.
//
// Reuses computeServerTrustedPricing — the exact same function /api/orders
// uses to price what actually gets charged — so the amount a shopper is
// asked to pay a given provider can never drift from what the order itself
// records.
const itemSchema = z.object({
  productId: z.union([z.string(), z.number()]),
  selectedColor: z.string().nullable().optional(),
  selectedSize: z.string().nullable().optional(),
  quantity: z.coerce.number().int().positive().max(50, 'Quantity per item is limited to 50.'),
});

const bodySchema = z.object({
  items: z.array(itemSchema).min(1, 'Cart is empty.'),
  couponCode: z.string().trim().max(40).nullable().optional(),
  giftWrap: z.boolean().optional(),
  zip: z.string({ required_error: 'A shipping PIN code is required to check payment details.' })
    .trim()
    .regex(/^[1-9][0-9]{5}$/, 'Enter a valid 6-digit PIN code.'),
});

export async function POST(req: NextRequest) {
  try {
    // Same auth gate as /api/orders — this endpoint reveals nothing more
    // sensitive than an order preview would, but keeping it signed-in-only
    // matches the rest of the checkout flow (cart page is already gated).
    const session = await getSessionFromRequest(req);
    if (!session) {
      return NextResponse.json({ error: 'Sign in to check out.' }, { status: 401 });
    }

    const json = await req.json().catch(() => null);
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || 'Invalid request.' },
        { status: 400 }
      );
    }
    const body = parsed.data;

    let pricing;
    try {
      pricing = await computeServerTrustedPricing(body.items, body.couponCode, Boolean(body.giftWrap), body.zip);
    } catch (pricingErr) {
      const message = pricingErr instanceof Error ? pricingErr.message : 'Unable to price this order.';
      return NextResponse.json({ error: message }, { status: 400 });
    }

    const breakdown = await computePaymentBreakdown(pricing);

    return NextResponse.json({
      legs: breakdown.legs,
      total: breakdown.total,
      hasUnattributedItems: breakdown.hasUnattributedItems,
      payableViaUpi: breakdown.payableViaUpi,
      // Echoed back so the cart UI can show the exact same numbers it's
      // about to charge, instead of relying only on its own client-side
      // estimate for the payment step.
      pricing: {
        subtotal: pricing.subtotal,
        discountAmount: pricing.discountAmount,
        shippingCost: pricing.shippingCost,
        giftWrapCost: pricing.giftWrapCost,
        total: pricing.total,
      },
    });
  } catch (err) {
    console.error('[checkout/payment-breakdown] Unexpected error:', err);
    return NextResponse.json({ error: 'Unexpected error.' }, { status: 500 });
  }
}

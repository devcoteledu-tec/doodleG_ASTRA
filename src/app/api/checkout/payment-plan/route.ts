import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSessionFromRequest } from '@/lib/session';
import { computeServerTrustedPricing } from '@/lib/orderPricing';
import { computePaymentPlan } from '@/lib/paymentPlan';

// Read-only preview of how much of the cart must be paid online now vs
// collected as Cash on Delivery — lets the cart page show this *before* the
// shopper commits to a payment method or opens Razorpay Checkout. Charges
// nothing and creates nothing; /api/checkout/razorpay-order and /api/orders
// each independently recompute the same plan when money actually moves.
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
  zip: z.string({ required_error: 'A shipping PIN code is required to preview payment details.' })
    .trim()
    .regex(/^[1-9][0-9]{5}$/, 'Enter a valid 6-digit PIN code.'),
  flexibleChoice: z.enum(['online', 'cod']).optional(),
});

export async function POST(req: NextRequest) {
  try {
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

    const plan = computePaymentPlan(pricing, body.flexibleChoice ?? 'cod');

    return NextResponse.json({
      total: pricing.total,
      onlineAmount: plan.onlineAmount,
      codAmount: plan.codAmount,
      requiresSplit: plan.requiresSplit,
      hasFixedOnlineItems: plan.hasFixedOnlineItems,
      hasFixedCodItems: plan.hasFixedCodItems,
      hasFlexibleItems: plan.hasFlexibleItems,
      items: plan.items,
    });
  } catch (err) {
    console.error('[checkout/payment-plan] Unexpected error:', err);
    return NextResponse.json({ error: 'Unexpected error.' }, { status: 500 });
  }
}

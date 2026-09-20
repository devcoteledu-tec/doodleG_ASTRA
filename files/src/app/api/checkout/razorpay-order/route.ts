import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { getSessionFromRequest } from '@/lib/session';
import { checkoutSchema } from '@/lib/checkoutSchema';
import { priceCheckout } from '@/lib/checkout';
import { getRazorpayClient } from '@/lib/razorpay';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { checkRateLimit } from '@/lib/rateLimit';
export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: 'Sign in to check out.' }, { status: 401 });
  const limit = await checkRateLimit(`checkout:${session.userId}`, 20, 600_000);
  if (!limit.allowed) return NextResponse.json({ error: 'Please wait before trying again.' }, { status: 429 });
  const parsed = checkoutSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Check your address and cart details.' }, { status: 400 });
  try {
    const input = parsed.data;
    const requestHash = createHash('sha256').update(JSON.stringify(input)).digest('hex');
    const { data: prior, error: lookupError } = await supabaseAdmin.from('checkout_attempts')
      .select('id, razorpay_order_id, expected_paise, payload, request_hash, state')
      .eq('user_id', session.userId).eq('idempotency_key', input.idempotencyKey).maybeSingle();
    if (lookupError) throw lookupError;
    if (prior) {
      if (prior.request_hash !== requestHash) return NextResponse.json({ error: 'Cart changed. Start a new checkout.' }, { status: 409 });
      if (!prior.razorpay_order_id || prior.state !== 'pending') return NextResponse.json({ error: 'This checkout is processing or already paid. Check its status before paying again.', attemptId: prior.id }, { status: 409 });
      return NextResponse.json({ attemptId: prior.id, orderId: prior.razorpay_order_id, amount: prior.expected_paise, currency: 'INR', keyId: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID, total: prior.payload.total_amount, onlineAmount: prior.payload.online_amount, codAmount: prior.payload.cod_amount });
    }
    const { payload, plan } = await priceCheckout(input);
    const amount = Math.round(plan.onlineAmount * 100);
    if (amount <= 0) return NextResponse.json({ error: 'This order can be placed with Cash on Delivery.' }, { status: 400 });
    const { data: attempt, error: insertError } = await supabaseAdmin.from('checkout_attempts').insert({
      user_id: session.userId, idempotency_key: input.idempotencyKey, request_hash: requestHash,
      payload, expected_paise: amount,
    }).select('id').single();
    if (insertError) {
      if (insertError.code === '23505') return NextResponse.json({ error: 'Checkout is already starting. Please retry shortly.' }, { status: 409 });
      throw insertError;
    }
    const order = await getRazorpayClient().orders.create({ amount, currency: 'INR', receipt: `dg_${attempt.id}`,
      notes: { userId: session.userId, attemptId: attempt.id } });
    const { error: saveError } = await supabaseAdmin.from('checkout_attempts').update({ razorpay_order_id: order.id }).eq('id', attempt.id);
    if (saveError) throw saveError;
    return NextResponse.json({ attemptId: attempt.id, orderId: order.id, amount: order.amount, currency: order.currency,
      keyId: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID, total: payload.total_amount, onlineAmount: plan.onlineAmount, codAmount: plan.codAmount });
  } catch (error) {
    console.error('[checkout/start]', error);
    return NextResponse.json({ error: 'Could not start checkout. Please retry or contact support.' }, { status: 503 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createHash } from 'crypto';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getSessionFromRequest } from '@/lib/session';
import { checkoutSchema } from '@/lib/checkoutSchema';
import { finalizePayment, priceCheckout } from '@/lib/checkout';
import { verifyPaymentSignature } from '@/lib/razorpay';
import { checkRateLimit } from '@/lib/rateLimit';
const paymentSchema = z.object({ orderId: z.string().min(1).max(100), paymentId: z.string().min(1).max(100), signature: z.string().regex(/^[a-f0-9]{64}$/i) });
export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: 'Sign in to place an order.' }, { status: 401 });
  const limit = await checkRateLimit(`orders:${session.userId}`, 30, 600_000);
  if (!limit.allowed) return NextResponse.json({ error: 'Please wait before trying again.' }, { status: 429 });
  const body = await req.json().catch(() => null);
  try {
    if (body?.razorpay) {
      const payment = paymentSchema.safeParse(body.razorpay);
      if (!payment.success || !verifyPaymentSignature(payment.data)) return NextResponse.json({ error: 'Payment verification failed.' }, { status: 400 });
      const result = await finalizePayment(payment.data.paymentId, payment.data.orderId, session.userId);
      if (result.state !== 'completed') return NextResponse.json({ error: 'Payment received. Your order needs support review; do not pay again.', paymentReceived: true }, { status: 202 });
      return NextResponse.json({ success: true, orderId: result.order_id, orderNumber: result.order_number });
    }
    const parsed = checkoutSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'Check your address and cart details.' }, { status: 400 });
    const requestHash = createHash('sha256').update(JSON.stringify(parsed.data)).digest('hex');
    // Resolve retries before repricing: stock may already have been consumed by this order.
    const { data: existing, error: lookupError } = await supabaseAdmin.from('orders').select('id, order_number, checkout_request_hash')
      .eq('user_id', session.userId).eq('idempotency_key', parsed.data.idempotencyKey).maybeSingle();
    if (lookupError) throw lookupError;
    if (existing) {
      if (existing.checkout_request_hash !== requestHash) return NextResponse.json({ error: 'Checkout changed. Please start again.' }, { status: 409 });
      return NextResponse.json({ success: true, orderId: existing.id, orderNumber: existing.order_number });
    }
    const { payload, plan } = await priceCheckout(parsed.data);
    if (plan.onlineAmount > 0) return NextResponse.json({ error: 'This cart requires online payment.' }, { status: 400 });
    const { data, error } = await supabaseAdmin.rpc('create_order_safe', {
      p_user_id: session.userId, p_key: parsed.data.idempotencyKey, p_hash: requestHash, p_payload: payload, p_payment_id: null,
    });
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    if (!row?.order_id) throw new Error('MISSING_ORDER');
    return NextResponse.json({ success: true, orderId: row.order_id, orderNumber: row.order_number });
  } catch (error) {
    console.error('[orders/create]', error);
    return NextResponse.json({ error: 'Could not complete this order. If you paid, check order status or contact support before paying again.' }, { status: 503 });
  }
}

// ── GET: fetch orders for the signed-in caller only ──
export async function GET(req: NextRequest) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: orders, error } = await supabaseAdmin
      .from('orders')
      .select(`
        id, order_number, status, total_amount, placed_at, gift_wrap, payment_method, online_amount, cod_amount,
        order_items ( product_id, product_name, product_emoji, quantity, unit_price, line_total, selected_color, selected_size ),
        order_shipping ( full_name, email, phone, street_address, city, zip_code, country, tracking_number, estimated_delivery )
      `)
      .eq('user_id', session.userId)
      .order('placed_at', { ascending: false });

    if (error) {
      console.error('[orders] GET failed:', error);
      return NextResponse.json({ error: 'Failed to fetch orders.' }, { status: 500 });
    }

    return NextResponse.json({ orders });
  } catch (err) {
    console.error('[orders] GET unexpected error:', err);
    return NextResponse.json({ error: 'An unexpected error occurred.' }, { status: 500 });
  }
}

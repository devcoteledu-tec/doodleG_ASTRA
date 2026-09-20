import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/session';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getRazorpayClient } from '@/lib/razorpay';
import { finalizePayment } from '@/lib/checkout';
import { checkRateLimit } from '@/lib/rateLimit';
export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(await checkRateLimit(`checkout-status:${session.userId}`, 60, 600_000)).allowed) return NextResponse.json({ error: 'Please wait.' }, { status: 429 });
  const id = req.nextUrl.searchParams.get('attemptId');
  if (!id || !/^[a-f0-9-]{36}$/i.test(id)) return NextResponse.json({ error: 'Invalid checkout.' }, { status: 400 });
  try {
    const { data, error } = await supabaseAdmin.from('checkout_attempts').select('id, state, order_id, razorpay_order_id, expected_paise, payload').eq('id', id).eq('user_id', session.userId).maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: 'Checkout not found.' }, { status: 404 });
    if (data.state === 'pending' && data.razorpay_order_id) {
      const payments = await getRazorpayClient().orders.fetchPayments(data.razorpay_order_id);
      const captured = payments.items.find(p => p.status === 'captured');
      if (captured) {
        const result = await finalizePayment(captured.id, data.razorpay_order_id, session.userId);
        return NextResponse.json({ state: result.state, orderId: result.order_id, orderNumber: result.order_number }, { headers: { 'Cache-Control': 'no-store' } });
      }
    }
    return NextResponse.json({ state: data.state, orderId: data.order_id, paymentOrderId: data.razorpay_order_id, amount: data.expected_paise, keyId: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID, currency: 'INR', total: data.payload.total_amount, codAmount: data.payload.cod_amount, items: data.payload.items.map((i: { product_name: string; quantity: number }) => ({ name: i.product_name, quantity: i.quantity })) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('[checkout/status]', error);
    return NextResponse.json({ error: 'Status is temporarily unavailable. Do not pay again until your payment is confirmed.' }, { status: 503 });
  }
}

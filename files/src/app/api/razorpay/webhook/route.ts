import { NextRequest, NextResponse } from 'next/server';
import { createHmac, timingSafeEqual } from 'crypto';
import { finalizePayment } from '@/lib/checkout';
export async function POST(req: NextRequest) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: 'Webhook not configured.' }, { status: 503 });
  if (Number(req.headers.get('content-length') || 0) > 100_000) return new NextResponse(null, { status: 413 });
  const raw = await req.text();
  if (Buffer.byteLength(raw) > 100_000) return new NextResponse(null, { status: 413 });
  const signature = req.headers.get('x-razorpay-signature') || '';
  const expected = createHmac('sha256', secret).update(raw).digest('hex');
  if (!/^[a-f0-9]{64}$/i.test(signature) || !timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(signature, 'hex'))) return new NextResponse(null, { status: 403 });
  let event;
  try { event = JSON.parse(raw); } catch { return new NextResponse(null, { status: 400 }); }
  if (!['payment.captured', 'order.paid'].includes(event.event)) return NextResponse.json({ received: true });
  const paymentId = event.payload?.payment?.entity?.id;
  if (typeof paymentId !== 'string') return new NextResponse(null, { status: 400 });
  try {
    await finalizePayment(paymentId);
    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('[payment/webhook]', error);
    // Non-2xx lets Razorpay retry transient failures. The SQL transaction deduplicates delivery.
    return NextResponse.json({ error: 'Payment processing will be retried.' }, { status: 503 });
  }
}

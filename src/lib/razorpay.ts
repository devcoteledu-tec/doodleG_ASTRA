import Razorpay from 'razorpay';
import crypto from 'crypto';

// ── Single shared Razorpay client ──
// Both /api/checkout/razorpay-order (creates the order) and /api/orders
// (verifies the payment before recording the order) call this instead of
// each constructing their own client — one place to change credentials,
// one place that throws a clear error if they're missing.
//
// Deliberately lazy (not instantiated at module load): env.ts already
// warns loudly at boot if these are missing (see src/lib/env.ts).
// Throwing here too would just duplicate that message with a less useful
// stack trace the first time a route imports this file.
let cachedClient: Razorpay | null = null;

export function getRazorpayClient(): Razorpay {
  if (cachedClient) return cachedClient;
  const key_id = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;
  const key_secret = process.env.RAZORPAY_KEY_SECRET;
  if (!key_id || !key_secret) {
    throw new Error('Razorpay is not configured — set NEXT_PUBLIC_RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET (see .env.example).');
  }
  cachedClient = new Razorpay({ key_id, key_secret });
  return cachedClient;
}

/**
 * Verifies that a checkout success callback actually came from Razorpay and
 * wasn't forged by the browser. Razorpay signs `${order_id}|${payment_id}`
 * with HMAC-SHA256 using the account's key secret; recomputing that here
 * and comparing (in constant time) is the standard, documented way to trust
 * a client-reported "payment succeeded" event server-side.
 *
 * This is necessary but NOT sufficient on its own for money-amount
 * integrity — see verifyPaymentAmount below, which additionally confirms
 * the captured amount matches what the server actually priced the order at.
 */
export function verifyPaymentSignature(params: {
  orderId: string;
  paymentId: string;
  signature: string;
}): boolean {
  const key_secret = process.env.RAZORPAY_KEY_SECRET;
  if (!key_secret) return false;

  const expected = crypto
    .createHmac('sha256', key_secret)
    .update(`${params.orderId}|${params.paymentId}`)
    .digest('hex');

  const expectedBuf = Buffer.from(expected, 'hex');
  const actualBuf = Buffer.from(params.signature, 'hex');
  if (expectedBuf.length !== actualBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, actualBuf);
}

/**
 * Fetches the payment from Razorpay's API and confirms:
 *   1. it was actually captured (not just "authorized" or failed), and
 *   2. the captured amount matches the server-computed total (in paise),
 *      not merely whatever amount the client claims to have paid.
 *
 * Signature verification alone proves "Razorpay issued this callback for
 * this order_id/payment_id pair" — it does NOT independently confirm the
 * amount, since a valid signature is still valid even if paired with a
 * mismatched or manipulated request body. This closes that gap: the order
 * only gets created if the amount Razorpay actually captured equals what
 * computeServerTrustedPricing() (src/lib/orderPricing.ts) says the cart
 * costs, for the exact same reason /api/orders never trusts a client-sent
 * price.
 */
/**
 * Fetches the payment from Razorpay's API and confirms:
 *   1. it was actually captured (not just "authorized" or failed), and
 *   2. the captured amount matches the server-computed total (in paise),
 *      not merely whatever amount the client claims to have paid.
 *
 * Signature verification alone proves "Razorpay issued this callback for
 * this order_id/payment_id pair" — it does NOT independently confirm the
 * amount, since a valid signature is still valid even if paired with a
 * mismatched or manipulated request body. This closes that gap: the order
 * only gets created if the amount Razorpay actually captured equals what
 * computeServerTrustedPricing() (src/lib/orderPricing.ts) says the cart
 * costs, for the exact same reason /api/orders never trusts a client-sent
 * price.
 *
 * Returns a discriminated result rather than a bare boolean: "captured but
 * wrong amount" and "not captured at all" are different problems with
 * different fixes, and collapsing them into one false made the resulting
 * /api/orders error message ("amount doesn't match") actively misleading
 * for the not-captured case — see the 'not_captured' branch below, which
 * is what happens for EVERY real payment if Dashboard → Account & Settings
 * → Payment Capture isn't set to auto-capture (Razorpay's Orders API has no
 * per-order capture flag any more — see the go-live checklist notes).
 */
export type PaymentAmountCheck =
  | { ok: true }
  | { ok: false; reason: 'not_captured'; status: string }
  | { ok: false; reason: 'amount_mismatch'; capturedPaise: number; expectedPaise: number };

export async function verifyPaymentAmount(paymentId: string, expectedAmountPaise: number): Promise<PaymentAmountCheck> {
  const payment = await getRazorpayClient().payments.fetch(paymentId);
  if (payment.status !== 'captured') {
    return { ok: false, reason: 'not_captured', status: String(payment.status) };
  }
  if (Number(payment.amount) !== expectedAmountPaise) {
    return { ok: false, reason: 'amount_mismatch', capturedPaise: Number(payment.amount), expectedPaise: expectedAmountPaise };
  }
  return { ok: true };
}

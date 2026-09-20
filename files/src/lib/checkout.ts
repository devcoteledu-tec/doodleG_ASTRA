import { supabaseAdmin } from './supabaseAdmin';
import { getRazorpayClient } from './razorpay';
import { computeServerTrustedPricing } from './orderPricing';
import { computePaymentPlan } from './paymentPlan';
import type { CheckoutInput } from './checkoutSchema';
export async function priceCheckout(input: CheckoutInput) {
  const pricing = await computeServerTrustedPricing(input.items, input.couponCode, Boolean(input.giftWrap), input.shipping.zip);
  const plan = computePaymentPlan(pricing, input.flexibleChoice);
  return { pricing, plan, payload: {
    subtotal: pricing.subtotal, discount_amount: pricing.discountAmount, coupon_code: pricing.couponCode,
    coupon_pct: pricing.couponPct, shipping_cost: pricing.shippingCost, gift_wrap_cost: pricing.giftWrapCost,
    total_amount: pricing.total, gift_wrap: Boolean(input.giftWrap), online_amount: plan.onlineAmount, cod_amount: plan.codAmount,
    items: pricing.items.map(i => ({ product_id: i.productId, product_name: i.productName, product_emoji: i.productEmoji,
      selected_color: i.selectedColor, selected_size: i.selectedSize, quantity: i.quantity, unit_price: i.unitPrice })),
    shipping: { full_name: input.shipping.name, email: input.shipping.email, phone: input.shipping.phone,
      street_address: input.shipping.address, city: input.shipping.city, zip_code: input.shipping.zip, country: 'India' },
  }};
}
export interface CheckoutResult { order_id: string | null; order_number: string | null; state: string }
/** Payment is re-fetched from the processor; webhook/browser amounts are never trusted. */
export async function finalizePayment(paymentId: string, expectedOrderId?: string, userId?: string): Promise<CheckoutResult> {
  const payment = await getRazorpayClient().payments.fetch(paymentId);
  if (payment.status !== 'captured' || payment.currency !== 'INR' || !payment.order_id) throw new Error('PAYMENT_NOT_CAPTURED');
  if (expectedOrderId && expectedOrderId !== payment.order_id) throw new Error('PAYMENT_ORDER_MISMATCH');
  const { data: attempt, error } = await supabaseAdmin.from('checkout_attempts')
    .select('id, user_id, expected_paise').eq('razorpay_order_id', payment.order_id).maybeSingle();
  if (error) throw error;
  if (!attempt || (userId && attempt.user_id !== userId)) throw new Error('CHECKOUT_NOT_FOUND');
  if (Number(payment.amount) !== Number(attempt.expected_paise)) throw new Error('PAYMENT_AMOUNT_MISMATCH');
  const { data, error: finalizeError } = await supabaseAdmin.rpc('finalize_checkout', {
    p_attempt_id: attempt.id, p_payment_id: payment.id, p_amount_paise: Number(payment.amount),
  });
  if (finalizeError) throw finalizeError;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error('CHECKOUT_RESULT_MISSING');
  return row as CheckoutResult;
}

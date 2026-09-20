import { ServerPricing } from '@/lib/orderPricing';

/**
 * Whichever way the shopper chose to pay for items whose provider allows
 * *either* Cash on Delivery or online payment (payment_option = 'both').
 * Items whose provider has locked in 'cod', 'prepaid', or 'advance' ignore
 * this choice entirely — their split is fixed regardless of what the
 * shopper picks for the rest of the cart.
 */
export type FlexiblePaymentChoice = 'online' | 'cod';

export interface PaymentPlanItem {
  productId: string;
  productName: string;
  paymentOption: 'cod' | 'prepaid' | 'both' | 'advance';
  advancePercentage: number | null;
  lineTotal: number;
  /** Rupees of this item's line total that must be paid online now. */
  onlineShare: number;
  /** Rupees of this item's line total collected as Cash on Delivery. */
  codShare: number;
}

export interface PaymentPlan {
  items: PaymentPlanItem[];
  /** Total to be charged online right now (via Razorpay), across the whole cart. */
  onlineAmount: number;
  /** Total to be collected as Cash on Delivery when the order arrives. */
  codAmount: number;
  /** True when the cart needs BOTH an online charge now AND a COD collection later. */
  requiresSplit: boolean;
  /** True if any item's provider requires prepaid-in-full or a partial advance. */
  hasFixedOnlineItems: boolean;
  /** True if any item's provider only accepts Cash on Delivery. */
  hasFixedCodItems: boolean;
  /** True if any item lets the shopper choose COD or online (payment_option = 'both'). */
  hasFlexibleItems: boolean;
}

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

/**
 * Splits a priced cart's total into "pay online now" vs "collect as COD"
 * amounts, based on each item's provider-set payment_option:
 *   - 'cod'     → this item's whole share is COD, no matter what the shopper picks.
 *   - 'prepaid' → this item's whole share must be paid online now.
 *   - 'advance' → advancePercentage% of this item's share is paid online now,
 *                 the rest is COD.
 *   - 'both'    → follows flexibleChoice (the shopper's own toggle).
 *
 * Shipping, discount, and gift-wrap aren't tied to any one item, so they're
 * allocated proportionally to the cart's overall online/COD split — the same
 * proportional-allocation approach src/lib/paymentBreakdown.ts uses for
 * splitting those amounts across providers. Rounding remainder is absorbed
 * into the COD amount so the online charge (what Razorpay actually captures)
 * is always the smaller, exactly-computed figure.
 */
export function computePaymentPlan(pricing: ServerPricing, flexibleChoice: FlexiblePaymentChoice): PaymentPlan {
  const items: PaymentPlanItem[] = pricing.items.map((item) => {
    let onlineFraction: number;
    switch (item.paymentOption) {
      case 'cod':
        onlineFraction = 0;
        break;
      case 'prepaid':
        onlineFraction = 1;
        break;
      case 'advance':
        onlineFraction = clamp01((item.advancePercentage ?? 36) / 100);
        break;
      case 'both':
      default:
        onlineFraction = flexibleChoice === 'online' ? 1 : 0;
        break;
    }
    const onlineShare = Math.round(item.lineTotal * 100 * onlineFraction) / 100;
    const codShare = Math.round((item.lineTotal - onlineShare) * 100) / 100;
    return {
      productId: item.productId,
      productName: item.productName,
      paymentOption: item.paymentOption,
      advancePercentage: item.advancePercentage,
      lineTotal: item.lineTotal,
      onlineShare,
      codShare,
    };
  });

  const lineItemsTotal = items.reduce((sum, i) => sum + i.lineTotal, 0);
  const lineItemsOnline = items.reduce((sum, i) => sum + i.onlineShare, 0);
  const onlineFractionOfCart = lineItemsTotal > 0 ? lineItemsOnline / lineItemsTotal : 0;

  // Everything in pricing.total that isn't a line item — shipping + gift wrap
  // minus discount — allocated in the same proportion as the line items.
  const nonItemTotal = pricing.total - lineItemsTotal;
  const onlineAmount = Math.max(0, Math.round((lineItemsOnline + nonItemTotal * onlineFractionOfCart) * 100) / 100);
  const codAmount = Math.max(0, Math.round((pricing.total - onlineAmount) * 100) / 100);

  return {
    items,
    onlineAmount,
    codAmount,
    requiresSplit: onlineAmount > 0 && codAmount > 0,
    hasFixedOnlineItems: items.some((i) => i.paymentOption === 'prepaid' || i.paymentOption === 'advance'),
    hasFixedCodItems: items.some((i) => i.paymentOption === 'cod'),
    hasFlexibleItems: items.some((i) => i.paymentOption === 'both'),
  };
}

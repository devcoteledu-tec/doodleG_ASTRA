import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { ServerPricing } from '@/lib/orderPricing';

/** Synthetic id for items with no provider_id at all — mirrors src/lib/shipping.ts's UNATTRIBUTED_LEG_ID. */
const UNATTRIBUTED_ID = '__unattributed__';

export interface ProviderPaymentLeg {
  providerId: string;
  providerName: string;
  /** The provider's own UPI VPA (providers.payment_mobile_number). Null means this
   *  provider hasn't set one up yet — UPI payment can't be routed for their items. */
  upiId: string | null;
  /** Rupees this specific provider should receive for their share of the cart. */
  amount: number;
}

export interface PaymentBreakdown {
  legs: ProviderPaymentLeg[];
  total: number;
  /** True if any cart item has no provider_id at all — there's nowhere valid to route that money via UPI. */
  hasUnattributedItems: boolean;
  /** True only when every leg (including no unattributed items) has a real upiId — i.e. UPI checkout can proceed. */
  payableViaUpi: boolean;
}

/**
 * Splits a priced cart across the providers who actually supply each item, and
 * resolves each provider's own UPI ID fresh from the database — never from
 * client-cached product data, which can be stale or tampered with.
 *
 * Discount and gift-wrap (amounts that aren't tied to any one provider) are
 * apportioned across providers in proportion to their share of the cart
 * subtotal; shipping uses the exact per-provider legs already computed by
 * computeCartShipping. Rounding remainders are absorbed by the last leg so
 * the legs always sum to exactly `pricing.total` — never more, never less.
 */
export async function computePaymentBreakdown(pricing: ServerPricing): Promise<PaymentBreakdown> {
  const hasUnattributedItems = pricing.items.some((i) => i.providerId === null);

  // Group line totals by provider (unattributed items pool under a synthetic id).
  const subtotalByProvider = new Map<string, number>();
  for (const item of pricing.items) {
    const key = item.providerId ?? UNATTRIBUTED_ID;
    subtotalByProvider.set(key, (subtotalByProvider.get(key) ?? 0) + item.lineTotal);
  }

  const shippingByProvider = new Map<string, number>();
  for (const leg of pricing.shippingLegs) {
    shippingByProvider.set(leg.providerId, leg.cost);
  }

  const providerIds = Array.from(subtotalByProvider.keys()).filter((id) => id !== UNATTRIBUTED_ID);
  const { data: providers, error } = providerIds.length > 0
    ? await supabaseAdmin.from('providers').select('id, name, payment_mobile_number').in('id', providerIds)
    : { data: [], error: null };

  if (error) throw error;

  const providerMap = new Map((providers || []).map((p) => [String(p.id), p]));

  const keys = Array.from(subtotalByProvider.keys());
  const legs: ProviderPaymentLeg[] = [];
  let allocatedDiscount = 0;
  let allocatedGiftWrap = 0;
  let allocatedTotal = 0;

  keys.forEach((key, idx) => {
    const isLast = idx === keys.length - 1;
    const providerSubtotal = subtotalByProvider.get(key) ?? 0;
    const share = pricing.subtotal > 0 ? providerSubtotal / pricing.subtotal : 0;

    const discountShare = isLast ? pricing.discountAmount - allocatedDiscount : Math.round(pricing.discountAmount * share);
    const giftWrapShare = isLast ? pricing.giftWrapCost - allocatedGiftWrap : Math.round(pricing.giftWrapCost * share);
    allocatedDiscount += discountShare;
    allocatedGiftWrap += giftWrapShare;

    const shippingShare = shippingByProvider.get(key) ?? 0;

    const rawAmount = providerSubtotal - discountShare + shippingShare + giftWrapShare;
    const amount = isLast ? pricing.total - allocatedTotal : rawAmount;
    allocatedTotal += amount;

    if (key === UNATTRIBUTED_ID) {
      legs.push({ providerId: UNATTRIBUTED_ID, providerName: 'Other items', upiId: null, amount });
    } else {
      const provider = providerMap.get(key);
      legs.push({
        providerId: key,
        providerName: provider?.name || 'Provider',
        upiId: (provider?.payment_mobile_number as string | null) || null,
        amount,
      });
    }
  });

  const payableViaUpi = !hasUnattributedItems && legs.length > 0 && legs.every((l) => Boolean(l.upiId));

  return { legs, total: pricing.total, hasUnattributedItems, payableViaUpi };
}

import { supabaseAdmin } from '@/lib/supabaseAdmin';


// Merchant-configured flat rate per provider parcel; this is not a carrier quote.
export const SHIPPING_FALLBACK_COST = 40;
export const SHIPPING_MAX_COST = 800;
function configuredRate(): number {
  const value = Number(process.env.SHIPPING_FLAT_RATE_RUPEES ?? SHIPPING_FALLBACK_COST);
  if (!Number.isFinite(value) || value < 0 || value > SHIPPING_MAX_COST) throw new Error('Invalid shipping rate configuration.');
  return Math.round(value * 100) / 100;
}

export interface ProviderShippingLeg {
  providerId: string;
  providerName: string;
  /** null only when the provider has no pincode on file (fallback rate used instead) */
  delta: number | null;
  cost: number;
  resolved: boolean;
}

export interface CartShippingResult {
  totalShipping: number;
  legs: ProviderShippingLeg[];
  /** true if any leg fell back to the flat rate — caller should surface this to the shopper */
  anyUnresolved: boolean;
}

/** Synthetic id for the combined leg covering items with no provider_id at all (legacy/un-attributed catalog rows). */
const UNATTRIBUTED_LEG_ID = '__unattributed__';

/**
 * Computes shipping for a cart given the buyer's pincode and the provider
 * id of every item in the cart (one entry per cart item is fine, including
 * duplicates — grouped internally). Pass `null` for any item that has no
 * provider_id at all; those are grouped into a single flat-rate leg rather
 * than each silently costing ₹0 or each getting their own fallback charge.
 */
export async function computeCartShipping(_buyerPincode: string, itemProviderIds: (string | null)[]): Promise<CartShippingResult> {
  const flatRate = configuredRate();
  const uniqueProviderIds = Array.from(new Set(itemProviderIds.filter((id): id is string => Boolean(id))));
  const hasUnattributed = itemProviderIds.some(id => !id);

  if (uniqueProviderIds.length === 0 && !hasUnattributed) {
    return { totalShipping: 0, legs: [], anyUnresolved: false };
  }

  const { data: providers, error } = uniqueProviderIds.length > 0
    ? await supabaseAdmin.from('providers').select('id, name, pincode').in('id', uniqueProviderIds)
    : { data: [], error: null };

  const legs: ProviderShippingLeg[] = [];
  let anyUnresolved = false;

  if (error) {
    // Can't look up providers at all — fall back to the flat rate per
    // provider rather than failing the whole cart/order.
    anyUnresolved = true;
    for (const id of uniqueProviderIds) {
      legs.push({ providerId: id, providerName: 'Provider', delta: null, cost: flatRate, resolved: false });
    }
  } else {
    const providerMap = new Map((providers || []).map(p => [String(p.id), p]));
    for (const id of uniqueProviderIds) {
      const provider = providerMap.get(id);
      const providerName = provider?.name || 'Provider';
      const providerPincode = provider?.pincode as string | null | undefined;

      if (!providerPincode) {
        anyUnresolved = true;
        legs.push({ providerId: id, providerName, delta: null, cost: flatRate, resolved: false });
      } else {
        const delta = null;
        legs.push({ providerId: id, providerName, delta, cost: flatRate, resolved: true });
      }
    }
  }

  if (hasUnattributed) {
    anyUnresolved = true;
    legs.push({ providerId: UNATTRIBUTED_LEG_ID, providerName: 'Other items', delta: null, cost: flatRate, resolved: false });
  }

  const rawTotal = legs.reduce((sum, leg) => sum + leg.cost, 0);

  // If the raw total exceeds the cap, scale every leg down proportionally
  // (rather than just capping the total number) so the per-provider
  // breakdown shown to the shopper still sums to what's actually charged —
  // capping only the total while leaving legs at their pre-cap amounts
  // would make the displayed breakdown add up to more than the total.
  let totalShipping = rawTotal;
  if (rawTotal > SHIPPING_MAX_COST && rawTotal > 0) {
    const scale = SHIPPING_MAX_COST / rawTotal;
    let allocated = 0;
    legs.forEach((leg, idx) => {
      if (idx === legs.length - 1) {
        // Last leg absorbs the rounding remainder so the sum is exact.
        leg.cost = SHIPPING_MAX_COST - allocated;
      } else {
        leg.cost = Math.round(leg.cost * scale);
        allocated += leg.cost;
      }
    });
    totalShipping = SHIPPING_MAX_COST;
  }

  return { totalShipping, legs, anyUnresolved };
}

import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { resolveCouponPct } from '@/lib/coupons';
import { computeCartShipping, ProviderShippingLeg } from '@/lib/shipping';

// ── Server-side pricing constants ──
// Mirrors src/app/cart/CartPageClient.tsx's display logic exactly, but this
// copy is what actually gets charged. Shipping itself is no longer a flat
// number — see computeCartShipping in src/lib/shipping.ts — but the
// fallback rate it uses when a provider's distance can't be resolved is the
// same constant (SHIPPING_FALLBACK_COST) imported from there, so there's
// still only one place that number lives.
export const GIFT_WRAP_COST = 400;

export interface PricedItem {
  productId: string;
  productName: string;
  productEmoji: string;
  selectedColor: string | null;
  selectedSize: string | null;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  providerId: string | null;
  /** Provider-set payment option for this product — governs how much of this
   *  item's line total must be paid online vs collected as COD. See
   *  src/lib/paymentPlan.ts, which is the only place that reads these. */
  paymentOption: 'cod' | 'prepaid' | 'both' | 'advance';
  advancePercentage: number | null;
}

export interface ServerPricing {
  items: PricedItem[];
  subtotal: number;
  couponCode: string | null;
  couponPct: number;
  discountAmount: number;
  shippingCost: number;
  shippingLegs: ProviderShippingLeg[];
  shippingUnresolved: boolean;
  giftWrapCost: number;
  total: number;
}

/**
 * Re-derives every money amount for the order from the database and a
 * validated coupon table — never from the request body. Throws a plain
 * Error with a user-facing message if a product can't be found or doesn't
 * have enough stock; callers should catch and turn that into a 400.
 *
 * This is the single source of truth for order pricing — used by both
 * POST /api/orders (to price what actually gets charged) and
 * POST /api/checkout/payment-breakdown (to work out which provider gets
 * paid what, and via which UPI ID, before the shopper pays). Keeping this
 * in one place means the two can never drift apart — the amount a
 * provider is asked to be paid is always exactly their share of the same
 * numbers the order gets created with.
 */
export async function computeServerTrustedPricing(
  rawItems: { productId: string | number; selectedColor?: string | null; selectedSize?: string | null; quantity: number }[],
  couponCodeInput: string | null | undefined,
  giftWrap: boolean,
  buyerPincode: string
): Promise<ServerPricing> {
  const productIds = Array.from(new Set(rawItems.map((i) => String(i.productId))));

  const { data: products, error: productsErr } = await supabaseAdmin
    .from('catalog_products')
    .select('id, product_name, emoji, price_in_rupees, available_qty, provider_id, payment_option, advance_percentage, is_active, sizes')
    .in('id', productIds);

  if (productsErr) throw productsErr;

  const productMap = new Map((products || []).map((p) => [String(p.id), p]));

  const quantities = new Map<string, number>();
  for (const i of rawItems) quantities.set(String(i.productId), (quantities.get(String(i.productId)) || 0) + i.quantity);

  const items: PricedItem[] = rawItems.map((raw) => {
    const product = productMap.get(String(raw.productId));
    if (!product || product.is_active === false) {
      throw new Error(`One of the items in your cart is no longer available.`);
    }
    if (typeof product.available_qty === 'number' && (quantities.get(String(raw.productId)) || 0) > product.available_qty) {
      throw new Error(`Only ${product.available_qty} of "${product.product_name}" left in stock.`);
    }

    const unitPrice = Number(product.price_in_rupees);
    if (!Number.isFinite(unitPrice) || unitPrice <= 0) throw new Error('This product is not available for checkout.');
    if (product.sizes?.length && !product.sizes.includes(raw.selectedSize)) throw new Error('Please choose an available size.');
    const paymentOption = (product.payment_option as PricedItem['paymentOption']) || 'both';
    return {
      productId: String(raw.productId),
      productName: product.product_name,
      productEmoji: product.emoji || '🎁',
      selectedColor: raw.selectedColor ?? null,
      selectedSize: raw.selectedSize ?? null,
      quantity: raw.quantity,
      unitPrice,
      lineTotal: unitPrice * raw.quantity,
      providerId: product.provider_id ? String(product.provider_id) : null,
      paymentOption,
      advancePercentage: paymentOption === 'advance' ? (Number(product.advance_percentage) || 36) : null,
    };
  });

  const subtotal = items.reduce((sum, i) => sum + i.lineTotal, 0);

  const { code: couponCode, pct: couponPct } = resolveCouponPct(couponCodeInput);
  const discountAmount = couponPct > 0 ? Math.round((subtotal * couponPct) / 100) : 0;

  // ── Distance-based shipping, per provider, summed ──
  // Items with no provider_id (legacy/un-attributed catalog rows) are
  // grouped into one flat-rate leg by computeCartShipping rather than
  // silently shipping free.
  const { totalShipping, legs, anyUnresolved } = await computeCartShipping(buyerPincode, items.map((i) => i.providerId));
  const shippingCost = totalShipping;

  const giftWrapCost = giftWrap ? GIFT_WRAP_COST : 0;

  const total = subtotal - discountAmount + shippingCost + giftWrapCost;

  return {
    items,
    subtotal,
    couponCode,
    couponPct,
    discountAmount,
    shippingCost,
    shippingLegs: legs,
    shippingUnresolved: anyUnresolved,
    giftWrapCost,
    total,
  };
}

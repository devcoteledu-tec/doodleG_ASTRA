/**
 * Single source of truth for coupon codes and their discount percentage.
 *
 * IMPORTANT: this must be imported by both the cart UI (for displaying the
 * applied discount) AND /api/orders (for recomputing the discount
 * server-side). Previously this list lived only in src/app/cart/page.tsx,
 * which meant the server trusted whatever discount percentage the client
 * sent — see the price-integrity fix in src/app/api/orders/route.ts.
 */
export const COUPON_CODES: Record<string, number> = {
  KRISHNADEV: 2,
  GIFT10: 1,
  DOODLEG20: 3,
};

/** Looks up a coupon code (case-insensitive) and returns its discount percentage, or 0 if invalid/absent. */
export function resolveCouponPct(code: string | null | undefined): { code: string | null; pct: number } {
  if (!code) return { code: null, pct: 0 };
  const normalized = code.trim().toUpperCase();
  const pct = COUPON_CODES[normalized];
  return pct ? { code: normalized, pct } : { code: null, pct: 0 };
}

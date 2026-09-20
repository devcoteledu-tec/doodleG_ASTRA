export interface Product {
  id: string;
  /** Human-readable URL slug (e.g. "rose-chocolate-gift-box"). Falls back to `id` when absent. */
  slug?: string;
  name: string;
  price: number;
  originalPrice?: number;
  rating: number;
  reviews: number;
  category: string;
  subcategory: string;
  badge?: 'NEW' | 'SALE' | 'HOT' | 'LIMITED';
  discount?: number;
  colors: string[];
  sizes?: string[];
  description: string;
  details: string[];
  emoji: string;          // used as placeholder art
  gradient: string;       // card gradient
  images?: string[];
  /** Which provider/seller supplies this product — needed for per-provider distance-based shipping (src/lib/shipping.ts). */
  providerId?: string;
  /** Free-form key/value spec sheet, shown as a table on the product detail page. Only populated there. */
  specifications?: Record<string, string>;
  /** Provider-set per-product policy text — shipping is fulfilled per-provider, so there's no single fixed policy. */
  shippingPolicy?: string;
  returnPolicy?: string;
  warranty?: string;
  productCode?: string;
  providerName?: string;
  /** Per-product payment option set by the provider (defaults to 'both' when unset). */
  paymentOption?: 'cod' | 'prepaid' | 'both' | 'advance';
  /** Only meaningful when paymentOption === 'advance' — % of price paid online at checkout, rest COD. */
  advancePercentage?: number;
}

// ─── No more hardcoded PRODUCTS array ───────────────────────────────
// All product data now comes from Supabase via SSR (fetchProductsServer)
// or client-side fetch (/api/products). The old static PRODUCTS[] with
// fake items (Stargazing Dome Weekend, Celestial Constellation Kit, etc.)
// has been removed because:
//  1. Google indexes them as real products — buyers search, land, can't buy → bounce.
//  2. Fake review counts (212, 341) in JSON-LD structured data → Google penalty risk.
//  3. Hardcoded category counts didn't match the real Supabase catalog.

// ─── Dynamic category builder ───────────────────────────────────────
// Instead of a static CATEGORIES array with hardcoded counts, derive
// categories from the live product list. Icons default to 🎁 unless
// a mapping is provided below.
const CATEGORY_ICONS: Record<string, string> = {
  Cakes: '🎂',
  'Gift Kits': '🎁',
  Photography: '📷',
  Culinary: '🍽️',
  Literature: '📚',
  Wellness: '🌿',
  Music: '🎷',
  Experiences: '🌌',
  Jewelry: '💍',
  Handmade: '🧶',
  Organic: '🌱',
  'Home Decor': '🏠',
  Food: '🍱',
};

export interface CategoryEntry {
  label: string;
  value: string;
  icon: string;
  count: number;
}

/**
 * Build categories dynamically from whatever products exist in Supabase.
 * Replaces the old hardcoded CATEGORIES export.
 */
export function buildCategories(products: Product[]): CategoryEntry[] {
  const catMap = new Map<string, number>();
  for (const p of products) {
    catMap.set(p.category, (catMap.get(p.category) ?? 0) + 1);
  }
  const cats: CategoryEntry[] = [
    { label: 'All', value: 'all', icon: '✨', count: products.length },
  ];
  for (const [cat, count] of catMap) {
    cats.push({
      label: cat,
      value: cat,
      icon: CATEGORY_ICONS[cat] || '🎁',
      count,
    });
  }
  return cats;
}

// Legacy named export so existing `import { CATEGORIES }` doesn't break
// at compile time. Returns an empty "All" entry — callers should prefer
// buildCategories(productsList) instead.
export const CATEGORIES: CategoryEntry[] = [
  { label: 'All', value: 'all', icon: '✨', count: 0 },
];

// Flash deals, new arrivals, best sellers — all derived from live data.
// These empty arrays keep imports valid; real data comes from useMemo
// inside each page component.
export const FLASH_DEALS: Product[] = [];
export const NEW_ARRIVALS: Product[] = [];
export const BEST_SELLERS: Product[] = [];

export function renderStars(rating: number): string[] {
  return Array.from({ length: 5 }, (_, i) => {
    if (rating >= i + 1) return 'full';
    if (rating >= i + 0.5) return 'half';
    return 'empty';
  });
}

/**
 * Raw shape of a row from Supabase's `products_box` table, as returned by
 * `/api/products` and `/api/products/[id]`.
 */
export interface ProductBoxRow {
  id: string;
  slug?: string | null;
  product_name: string;
  price_in_rupees: number | string;
  saving_percentage?: number | string | null;
  star_count?: number | string | null;
  total_reviews?: number | string | null;
  category: string;
  status?: Product['badge'] | null;
  product_description?: string | null;
  emoji?: string | null;
  gradient?: string | null;
  product_images?: string[] | null;
  provider_id?: string | null;
  specifications?: Record<string, string> | null;
  shipping_policy?: string | null;
  return_policy?: string | null;
  warranty?: string | null;
  product_code?: string | null;
  provider_name?: string | null;
  payment_option?: 'cod' | 'prepaid' | 'both' | 'advance' | null;
  advance_percentage?: number | string | null;
}

/** Map one raw `products_box` row into the frontend `Product` shape. */
export function mapProductBoxRow(p: ProductBoxRow): Product {
  const savingPct = Number(p.saving_percentage) || 0;
  const price = Number(p.price_in_rupees);

  return {
    id: p.id,
    slug: p.slug ?? undefined,
    name: p.product_name,
    price,
    originalPrice: savingPct > 0 ? Math.round(price / (1 - savingPct / 100)) : undefined,
    rating: Number(p.star_count) || 0,
    reviews: Number(p.total_reviews) || 0,
    category: p.category,
    subcategory: 'Premium Gift',
    badge: p.status ?? undefined,
    discount: savingPct > 0 ? savingPct : undefined,
    colors: ['#0a0a0a', '#6b7280', '#e85d4a'],
    description: p.product_description || '',
    details: [],
    emoji: p.emoji || '🎁',
    gradient: p.gradient || 'from-gray-700 to-black',
    images: p.product_images || undefined,
    providerId: p.provider_id ?? undefined,
    specifications: p.specifications && Object.keys(p.specifications).length > 0 ? p.specifications : undefined,
    shippingPolicy: p.shipping_policy ?? undefined,
    returnPolicy: p.return_policy ?? undefined,
    warranty: p.warranty ?? undefined,
    productCode: p.product_code ?? undefined,
    providerName: p.provider_name ?? undefined,
    paymentOption: p.payment_option ?? 'both',
    advancePercentage: p.payment_option === 'advance' ? (Number(p.advance_percentage) || 36) : undefined,
  };
}

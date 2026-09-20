/**
 * Server-side product fetching for SSR/SSG pages.
 *
 * Both the homepage (page.tsx) and shop page (shop/page.tsx) need product
 * data in the initial HTML so search engines can see the catalog. Before
 * this module, products were fetched client-side via useEffect →
 * fetch('/api/products'), which meant Googlebot saw "Loading products..."
 * and zero product content — the single biggest reason the site had zero
 * indexed pages.
 *
 * This module runs the same Supabase query the API route does, but at
 * request/build time on the server, and returns Product[] ready for the
 * client component to hydrate from.
 */

import { supabaseAdmin } from '@/lib/supabaseAdmin';
import type { Product } from '@/lib/products';

interface ProductRow {
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
  shipping_and_products?: string | null;
  available_qty?: number | string | null;
  total_likes?: number | string | null;
  emoji?: string | null;
  gradient?: string | null;
  product_images?: string[] | null;
}

function mapRow(p: ProductRow): Product {
  return {
    id: p.id,
    slug: p.slug ?? undefined,
    name: p.product_name,
    price: Number(p.price_in_rupees),
    originalPrice:
      Number(p.saving_percentage) > 0
        ? Math.round(Number(p.price_in_rupees) / (1 - Number(p.saving_percentage) / 100))
        : undefined,
    rating: Number(p.star_count),
    reviews: Number(p.total_reviews),
    category: p.category,
    subcategory: 'Premium Gift',
    badge: p.status ?? undefined,
    discount: Number(p.saving_percentage) > 0 ? Number(p.saving_percentage) : undefined,
    colors: ['#0a0a0a', '#6b7280', '#e85d4a'],
    description: p.product_description || '',
    details: [
      p.shipping_and_products || 'Free express delivery',
      'Min 3 high-res photos included',
      `${p.available_qty} items left in stock`,
      `Total Likes: ${p.total_likes}`,
    ],
    emoji: p.emoji || '🎁',
    gradient: p.gradient || 'from-gray-700 to-black',
    images: p.product_images ?? undefined,
  };
}

/**
 * Fetch all active products from Supabase, server-side.
 * Returns an empty array on error so the page still renders.
 */
export async function fetchProductsServer(): Promise<Product[]> {
  try {
    const { data: products, error } = await supabaseAdmin
      .from('catalog_products')
      .select('*')
      .order('date_of_listed', { ascending: false });

    if (error) throw error;
    if (!products || products.length === 0) return [];

    return (products as ProductRow[]).map(mapRow);
  } catch (err) {
    console.error('fetchProductsServer: failed to load products', err);
    return [];
  }
}

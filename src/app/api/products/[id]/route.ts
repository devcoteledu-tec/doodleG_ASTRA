import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabaseAdmin';
import { getErrorMessage } from '@/lib/errors';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';

// Public detail page. Same throttle rationale as /api/products — a real
// visitor loads a product page a handful of times per session, so 120
// per 5 min per IP is well above any legitimate use and knocks down
// scraper-shaped traffic.
const IP_LIMIT = 120;
const IP_WINDOW_MS = 5 * 60 * 1000;

// Helper to check if a string is a valid UUID
function isUUID(str: string) {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
}

type ProductRow = Record<string, unknown> & { id: string };

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ip = getClientIp(req.headers);
    const { allowed, retryAfterSeconds } = await checkRateLimit(`product-detail:ip:${ip}`, IP_LIMIT, IP_WINDOW_MS);
    if (!allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again shortly.' },
        { status: 429, headers: { 'Retry-After': String(retryAfterSeconds) } }
      );
    }

    const { id } = await params;
    let product: ProductRow | null = null;

    if (isUUID(id)) {
      const { data, error } = await supabase
        .from('catalog_products')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (error) throw error;
      product = data as ProductRow | null;
    } else {
      // Slug lookup: covers the legacy p1/p2/p3 URLs (which were
      // backfilled in migration 017) AND any custom slug set on newer
      // products by the trigger. Uses the unique index on
      // products_box(slug) — one indexed hit instead of the previous
      // "SELECT * FROM products_box ORDER BY date_of_listed" that scanned
      // the entire catalog on every request and shifted whenever a row
      // was inserted or deleted.
      const { data, error } = await supabase
        .from('catalog_products')
        .select('*')
        .eq('slug', id)
        .maybeSingle();

      if (error) throw error;
      product = data as ProductRow | null;
    }

    if (!product) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }

    // Fetch reviews for this product.
    // SECURITY: never expose reviews.user_id publicly — that value is the
    // signin.id of the reviewer (i.e. their internal account identifier).
    // Leaking it turned the /shop/[id] page into a directory of live user
    // IDs and became the seed list for the pre-fix complete-profile
    // account-takeover chain. The column list here is deliberately
    // explicit — never fall back to `select('*')`.
    const { data: reviews, error: reviewsErr } = await supabase
      .from('reviews')
      .select('id, user_name, rating, description_of_product, date_of_posted')
      .eq('product_id', product.id)
      .order('date_of_posted', { ascending: false });

    if (reviewsErr) throw reviewsErr;

    return NextResponse.json({
      product,
      reviews: reviews || [],
    });
  } catch (error: unknown) {
    console.error('Error fetching product details:', error);
    return NextResponse.json({ error: getErrorMessage(error, 'Failed to fetch product details') }, { status: 500 });
  }
}

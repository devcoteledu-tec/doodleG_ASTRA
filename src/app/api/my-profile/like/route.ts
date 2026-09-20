import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getSessionFromRequest } from '@/lib/session';

// productId is expected to be a UUID (products_box.id). If a legacy
// p1/p2/p3-style slug ever reaches this endpoint it's rejected — the
// caller should have resolved the slug to a UUID first (see the slug
// lookup in /api/products/[id]).
const likeSchema = z.object({
  productId: z.string().uuid('productId must be a product UUID.'),
});

export async function POST(req: NextRequest) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const json = await req.json().catch(() => null);
    const parsed = likeSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Invalid input.' }, { status: 400 });
    }
    const { productId } = parsed.data;

    // Atomic toggle in Postgres — see toggle_wishlist_product in
    // supabase_migration_016. Concurrent likes on the same product from
    // the same user can no longer lose each other's write (the previous
    // read-modify-write in JS could), and the DB verifies the productId
    // actually references a real product so callers can't stuff arbitrary
    // strings into their like_products_id array.
    const { data, error } = await supabaseAdmin.rpc('toggle_wishlist_product', {
      p_user_id: session.userId,
      p_product_id: productId,
    });

    if (error) {
      const message = String(error.message || '');
      if (message.includes('WISHLIST_PROFILE_NOT_FOUND')) {
        return NextResponse.json({ error: 'Profile not found.' }, { status: 404 });
      }
      if (message.includes('WISHLIST_PRODUCT_NOT_FOUND')) {
        return NextResponse.json({ error: 'That product no longer exists.' }, { status: 404 });
      }
      console.error('Wishlist toggle error:', error);
      return NextResponse.json({ error: 'Failed to update liked products.' }, { status: 500 });
    }

    // toggle_wishlist_product RETURNS TEXT[] — surfaced as an array.
    const wishlist = Array.isArray(data) ? data : [];
    return NextResponse.json({ wishlist });
  } catch (err) {
    console.error('Like toggle route error:', err);
    return NextResponse.json({ error: 'An unexpected error occurred.' }, { status: 500 });
  }
}

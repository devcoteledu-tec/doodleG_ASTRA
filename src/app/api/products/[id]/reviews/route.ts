import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin as supabase } from '@/lib/supabaseAdmin';
import { getSessionFromRequest } from '@/lib/session';
import { getErrorMessage } from '@/lib/errors';

function isUUID(str: string) {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
}

const reviewSchema = z.object({
  rating: z.coerce.number().int().min(1).max(5),
  descriptionOfProduct: z.string().trim().min(1).max(2000),
});

/**
 * Recompute `star_count` (average of every rating on the product) and
 * `total_reviews` (count of reviews) directly from the `reviews` table
 * and persist both onto `products_box`.
 *
 * Delegates to the recalculate_product_rating Postgres function (see
 * supabase_migration_016), which does the aggregation and the UPDATE
 * inside a single SQL statement — no JS round-trip that reads every
 * review row into memory, and no lost-update race between concurrent
 * writers (the previous JS version was O(n) per write and could clobber
 * a sibling review's contribution).
 */
async function recalculateProductRating(productId: string) {
  const { error } = await supabase.rpc('recalculate_product_rating', {
    p_product_id: productId,
  });
  if (error) throw error;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    // 1. A review must be attributable to a real signed-in account. The
    //    client can no longer supply its own `userName` — that was the root
    //    of the ambiguity that let the same person submit unlimited
    //    unlinked reviews. The display name is now always resolved
    //    server-side, from the caller's own session.
    const session = await getSessionFromRequest(req);
    if (!session) {
      return NextResponse.json(
        { error: 'You must be signed in to write a review.' },
        { status: 401 }
      );
    }

    const { id } = await params;
    const json = await req.json().catch(() => null);
    const parsed = reviewSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || 'Missing required review fields.' },
        { status: 400 }
      );
    }
    const { rating, descriptionOfProduct } = parsed.data;

    // 2. Resolve product UUID (also accepts legacy p1/p2/p3-style slugs
    //    via the indexed slug column — see supabase_migration_017).
    let productUuid = '';
    if (isUUID(id)) {
      productUuid = id;
    } else {
      const { data: bySlug } = await supabase
        .from('products_box')
        .select('id')
        .eq('slug', id)
        .maybeSingle();
      if (bySlug) {
        productUuid = bySlug.id;
      }
    }

    if (!productUuid) {
      return NextResponse.json({ error: 'Product not found.' }, { status: 404 });
    }

    // 3. Look up the caller's own account name — never trust a client-sent
    //    display name for what gets attached to the review.
    const { data: account, error: accountErr } = await supabase
      .from('signin')
      .select('user_name')
      .eq('id', session.userId)
      .single();

    if (accountErr || !account) {
      return NextResponse.json({ error: 'Account not found.' }, { status: 404 });
    }

    // 4. One review per user per product: check for an existing review by
    //    this exact (user, product) pair first. If one exists, this
    //    submission EDITS it in place instead of inserting a duplicate row.
    //    This is the application-level guarantee; the unique index on
    //    reviews(product_id, user_id) is the database-level backstop in
    //    case two requests race.
    const { data: existingReview, error: existingErr } = await supabase
      .from('reviews')
      .select('id')
      .eq('product_id', productUuid)
      .eq('user_id', session.userId)
      .maybeSingle();

    if (existingErr) throw existingErr;

    let savedReview;
    let wasUpdate = false;

    if (existingReview) {
      wasUpdate = true;
      const { data, error: updateErr } = await supabase
        .from('reviews')
        .update({
          rating,
          description_of_product: descriptionOfProduct,
          user_name: account.user_name,
        })
        .eq('id', existingReview.id)
        .select()
        .single();

      if (updateErr) throw updateErr;
      savedReview = data;
    } else {
      const { data, error: insertErr } = await supabase
        .from('reviews')
        .insert({
          user_name: account.user_name,
          user_id: session.userId,
          rating,
          description_of_product: descriptionOfProduct,
          product_id: productUuid,
        })
        .select()
        .single();

      // A unique-constraint violation here means a second request for the
      // same (product, user) slipped in between our check above and this
      // insert. Treat that as "already reviewed" rather than a 500.
      if (insertErr) {
        if (insertErr.code === '23505') {
          return NextResponse.json(
            { error: 'You have already reviewed this product.' },
            { status: 409 }
          );
        }
        throw insertErr;
      }
      savedReview = data;
    }

    // 5. Always recompute the product's star count from the full set of
    //    reviews after the write, so it's an exact average — never an
    //    approximation nudged by a single new/edited rating.
    await recalculateProductRating(productUuid);

    return NextResponse.json({ success: true, review: savedReview, updated: wasUpdate });
  } catch (error: unknown) {
    console.error('Error posting product review:', error);
    return NextResponse.json({ error: getErrorMessage(error, 'Failed to submit review.') }, { status: 500 });
  }
}

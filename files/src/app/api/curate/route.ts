import { z } from 'zod';
import { NextRequest, NextResponse } from 'next/server';
import { AIService } from '@/services/ai';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getSessionFromRequest } from '@/lib/session';
import { rankCandidatesByTier, type MatchableProduct, type RecipientProfileInput } from '@/lib/giftMatching';
import type { ProductBoxRow } from '@/lib/products';

// This route calls the billed Gemini API on every request, so it needs its
// own throttle rather than relying on some layer above it (see
// src/lib/rateLimit.ts for the shared, Supabase-backed implementation).
// It also now requires a session (see PROTECTED_API_PREFIXES in
// middleware.ts): once taggedProfileId was added, this route reads another
// real member's liked-products list, which is exactly the kind of personal
// data that shouldn't be reachable by an anonymous caller.
const RATE_LIMIT = 10;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000; // 10 minutes

function toMatchableProduct(row: ProductBoxRow & { available_qty?: number | null }): MatchableProduct {
  return {
    id: row.id,
    name: row.product_name,
    category: row.category,
    description: row.product_description || '',
    price: Number(row.price_in_rupees) || 0,
    rating: Number(row.star_count) || 0,
    totalReviews: Number(row.total_reviews) || 0,
    availableQty: row.available_qty ?? 1, // unknown stock is assumed sellable rather than excluded
    emoji: row.emoji || '🎁',
    image: row.product_images?.[0],
  };
}

/**
 * When the onboarding user has tagged the recipient as an existing doodle_G
 * member, pull that member's own real signal (liked-product categories +
 * their stated interests) to ground curation in what they've actually
 * chosen to like, rather than only the sender's guess. Returns null if the
 * id doesn't resolve to a real profile — the caller must not trust a
 * client-supplied id without this check.
 */
async function fetchTaggedMemberSignal(
  profileId: string
): Promise<RecipientProfileInput['taggedMember'] & { likedProductIds: string[] }> {
  const { data: profile, error } = await supabaseAdmin
    .from('profile')
    .select('like_products_id, topic_interested')
    .eq('id', profileId)
    .eq('gift_personalization_opt_in', true)
    .maybeSingle();

  if (error || !profile) {
    throw new Error('Tagged profile not found.');
  }

  const likedProductIds: string[] = profile.like_products_id || [];
  let likedCategories: string[] = [];

  if (likedProductIds.length > 0) {
    const { data: likedProducts } = await supabaseAdmin
      .from('products_box')
      .select('category')
      .in('id', likedProductIds);
    likedCategories = Array.from(new Set((likedProducts || []).map((p) => p.category).filter(Boolean)));
  }

  const statedInterests: string[] = profile.topic_interested || [];
  if (likedCategories.length === 0 && statedInterests.length === 0) {
    // Not an error — a real member who simply hasn't liked anything or
    // filled in interests yet has no first-party signal to give. But this
    // is exactly the situation that produces "generic-looking" picks
    // downstream, so it needs to be visible in logs rather than silently
    // indistinguishable from a Gemini failure.
    console.warn(
      `Tagged profile ${profileId} has no liked products and no stated interests on file — ` +
        'curation for this recipient will rely entirely on the sender-supplied interests text.'
    );
  }

  return {
    likedCategories,
    likedProductIds,
    statedInterests,
  };
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const ip = getClientIp(req.headers);
    const { allowed, retryAfterSeconds } = await checkRateLimit(`curate:${ip}`, RATE_LIMIT, RATE_LIMIT_WINDOW_MS);
    if (!allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(retryAfterSeconds) } }
      );
    }

    const parsed = z.object({
      recipientName: z.string().trim().min(1).max(100), relationship: z.string().trim().min(1).max(100),
      interests: z.string().trim().max(1500), quirks: z.string().max(1000).optional(), dynamic: z.string().max(1000).optional(),
      occasionTitle: z.string().trim().min(1).max(150), taggedProfileId: z.string().uuid().optional(),
    }).safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Check the recipient details.' }, { status: 400 });
    const { recipientName, relationship, interests, quirks, dynamic, occasionTitle, taggedProfileId } = parsed.data;

    let taggedMember: RecipientProfileInput['taggedMember'] | undefined;
    if (taggedProfileId) {
      try {
        taggedMember = await fetchTaggedMemberSignal(taggedProfileId);
      } catch (err) {
        // A bad/stale tagged id shouldn't fail the whole curation request —
        // just fall back to sender-supplied data only, same posture as the
        // catalog-fetch failure below.
        console.error('Failed to load tagged profile signal, continuing without it:', err);
      }
    }

    const recipientProfile: RecipientProfileInput = { interests, quirks, dynamic, occasionTitle, taggedMember };

    // Ground the curation in whatever is actually sellable right now. If this
    // fetch fails for any reason, fall through to the legacy free-text
    // curation path below rather than 500ing the whole request — a slightly
    // less-grounded suggestion beats no suggestion at all.
    let candidatesByTier = null as ReturnType<typeof rankCandidatesByTier> | null;
    try {
      const { data: products, error } = await supabaseAdmin
        .from('catalog_products')
        .select('id, product_name, category, product_description, price_in_rupees, star_count, total_reviews, available_qty, emoji, product_images');

      if (error) throw error;

      const matchable = (products || []).map(toMatchableProduct);
      candidatesByTier = rankCandidatesByTier(matchable, recipientProfile);
    } catch (catalogError) {
      console.error('Error fetching products_box for AI curation, falling back to free-text curation:', catalogError);
    }

    const hasCandidates =
      candidatesByTier && Object.values(candidatesByTier).some((tierCandidates) => tierCandidates.length > 0);

    if (!hasCandidates) return NextResponse.json({ error: 'No suitable in-stock gifts are available right now. Please try again later.' }, { status: 503 });

    const curation = await AIService.curateGiftsFromCatalog(
      { ...recipientProfile, recipientName, relationship }, candidatesByTier!
    );

    return NextResponse.json(curation);
  } catch (error) {
    console.error('Error in /api/curate API route:', error);
    return NextResponse.json(
      { error: 'Failed to generate gift packages. Please try again.' },
      { status: 500 }
    );
  }
}

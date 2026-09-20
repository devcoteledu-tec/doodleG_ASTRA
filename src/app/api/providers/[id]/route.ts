import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getErrorMessage } from '@/lib/errors';

// Single provider "profile page" endpoint — returns the provider record
// (including the `description` / `internal_links` columns from migration
// 005) plus every product they supply (products_box.provider_id), so the
// profile page (src/app/profiles/[id]/page.tsx) can render the "What I Do"
// boxes and, when one is clicked, filter straight to that provider's
// matching products without a second round trip.
//
// The [id] route segment is really "identifier" — it accepts either the
// provider's raw UUID (old share links, internal callers) or their
// `username` handle (new pretty share links, e.g. /profiles/chemparathi),
// so existing shared links never break. UUIDs are matched exactly by id;
// anything else is matched case-insensitively against `username` (backed
// by the partial unique index from migration 011).
//
// NOTE: follow/unfollow for a provider is handled separately by
// /api/providers/follow (see that route) — this endpoint only ever reads
// provider + product data and must not be repurposed for follow status,
// since src/app/profiles/[id]/page.tsx depends on the exact
// { provider, products } shape below.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: identifier } = await params;
    const isUuid = UUID_RE.test(identifier);

    // Explicit column list — never select('*'). `providers` now holds
    // payment_mobile_number (each provider's own UPI ID, migration 030),
    // which must never reach this public, unauthenticated profile endpoint.
    const providerQuery = supabaseAdmin
      .from('providers')
      .select('id, name, bio, description, avatar_url, specialty, instagram_handle, internal_links, rating, is_verified, pincode, created_at, username, cover_url, title, location, website_url, founded_date, instagram_reels, reels');
    const { data: provider, error } = isUuid
      ? await providerQuery.eq('id', identifier).single()
      : await providerQuery.ilike('username', identifier).single();

    if (error || !provider) {
      return NextResponse.json({ error: 'Provider not found' }, { status: 404 });
    }

    const id = provider.id;

    const { data: products, error: productsErr } = await supabaseAdmin
      .from('catalog_products')
      .select('*')
      .eq('provider_id', id)
      .order('date_of_listed', { ascending: false });

    if (productsErr) throw productsErr;

    // Follower count — real number pulled from `follows`, same source as
    // the /profiles directory list (src/app/api/providers/route.ts), so the
    // profile page's "Followers" stat isn't a placeholder.
    const { count: followersCount, error: followersErr } = await supabaseAdmin
      .from('follows')
      .select('id', { count: 'exact', head: true })
      .eq('provider_id', id);
    if (followersErr) throw followersErr;

    return NextResponse.json({
      provider: { ...provider, followers_count: followersCount ?? 0 },
      products: products ?? [],
    });
  } catch (error: unknown) {
    console.error('Error fetching provider profile:', error);
    return NextResponse.json({ error: getErrorMessage(error, 'Failed to fetch provider profile') }, { status: 500 });
  }
}

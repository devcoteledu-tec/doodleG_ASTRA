import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

// Public directory of gift providers / sellers — the vendors who actually
// supply the products customers order (see products_box.provider_id).
// Unlike the old /api/profiles route this does NOT require a signed-in
// session: anyone browsing the shop should be able to see who makes the
// gifts. Signed-in-only actions (following a provider) live in the
// separate /api/providers/follow route so this listing stays public.

// PostgREST's `.or()` filter is a comma-separated list of
// `column.operator.value` triples. `q` gets interpolated straight into that
// string below, so `,`, `(`, and `)` in a caller-supplied query would let
// them terminate/append filter clauses of their own (e.g. `q=x,id.neq.`
// broadens the match beyond what this endpoint intends). Stripping those
// characters — the ones with syntactic meaning in the filter grammar —
// keeps `q` a plain search term no matter what's typed into it.
function sanitizeFilterValue(raw: string): string {
  return raw.replace(/[,()]/g, '').slice(0, 100);
}

export async function GET(req: NextRequest) {
  try {
    const rawQuery = req.nextUrl.searchParams.get('q') || '';
    const query = sanitizeFilterValue(rawQuery);

    // Explicit column list — never select('*') here. `providers` now holds
    // payment_mobile_number (each provider's own UPI ID, added in migration
    // 030), which must never reach this public, unauthenticated directory.
    let providersQuery = supabaseAdmin
      .from('providers')
      .select('id, name, bio, description, avatar_url, specialty, instagram_handle, internal_links, rating, is_verified, pincode, created_at')
      .order('is_verified', { ascending: false })
      .order('rating', { ascending: false });

    if (query) {
      providersQuery = providersQuery.or(`name.ilike.%${query}%,specialty.cs.{${query}}`);
    }

    const { data: providers, error } = await providersQuery;
    if (error) throw error;

    // Card stats (follower count + listing count) are real numbers, not
    // placeholders — pulled from `follows` (provider_id) and `products_box`
    // (provider_id) with one grouped count query each rather than N+1
    // per-provider lookups.
    const providerIds = (providers ?? []).map(p => p.id);
    let followerCounts = new Map<string, number>();
    let listingCounts = new Map<string, number>();

    if (providerIds.length > 0) {
      const [{ data: followRows }, { data: productRows }] = await Promise.all([
        supabaseAdmin.from('follows').select('provider_id').in('provider_id', providerIds),
        supabaseAdmin.from('catalog_products').select('provider_id').in('provider_id', providerIds),
      ]);

      followerCounts = (followRows ?? []).reduce((acc, row) => {
        const id = row.provider_id as string;
        acc.set(id, (acc.get(id) ?? 0) + 1);
        return acc;
      }, new Map<string, number>());

      listingCounts = (productRows ?? []).reduce((acc, row) => {
        const id = row.provider_id as string;
        acc.set(id, (acc.get(id) ?? 0) + 1);
        return acc;
      }, new Map<string, number>());
    }

    const withStats = (providers ?? []).map(p => ({
      ...p,
      followers_count: followerCounts.get(p.id) ?? 0,
      listings_count: listingCounts.get(p.id) ?? 0,
    }));

    return NextResponse.json({ providers: withStats });
  } catch (error) {
    console.error('Error fetching providers:', error);
    return NextResponse.json({ error: 'Failed to fetch providers' }, { status: 500 });
  }
}

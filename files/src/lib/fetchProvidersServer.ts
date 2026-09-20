/**
 * Server-side provider fetching for SSR/ISR on the /profiles page.
 *
 * Same problem as products: ProvidersPageClient fetches via useEffect →
 * fetch('/api/providers'), so Googlebot sees an empty page and classifies
 * it as a Soft 404. This module runs the same Supabase query server-side
 * so provider cards are in the initial HTML.
 */

import { supabaseAdmin } from '@/lib/supabaseAdmin';

interface ProviderLink {
  label: string;
  url: string;
}

export interface ServerProvider {
  id: string;
  username?: string | null;
  name: string;
  bio?: string;
  description?: string;
  internal_links?: ProviderLink[];
  avatar_url?: string;
  specialty: string[];
  instagram_handle?: string | null;
  rating?: number;
  is_verified?: boolean;
  followers_count?: number;
  listings_count?: number;
}

export async function fetchProvidersServer(): Promise<ServerProvider[]> {
  try {
    const { data: providers, error } = await supabaseAdmin
      .from('providers')
      .select(
        'id, name, bio, description, avatar_url, specialty, instagram_handle, internal_links, rating, is_verified, pincode, created_at'
      )
      .order('is_verified', { ascending: false })
      .order('rating', { ascending: false });

    if (error) throw error;
    if (!providers || providers.length === 0) return [];

    const providerIds = providers.map((p) => p.id);

    const [{ data: followRows }, { data: productRows }] = await Promise.all([
      supabaseAdmin.from('follows').select('provider_id').in('provider_id', providerIds),
      supabaseAdmin
        .from('catalog_products')
        .select('provider_id')
        .in('provider_id', providerIds),
    ]);

    const followerCounts = (followRows ?? []).reduce((acc, row) => {
      const id = row.provider_id as string;
      acc.set(id, (acc.get(id) ?? 0) + 1);
      return acc;
    }, new Map<string, number>());

    const listingCounts = (productRows ?? []).reduce((acc, row) => {
      const id = row.provider_id as string;
      acc.set(id, (acc.get(id) ?? 0) + 1);
      return acc;
    }, new Map<string, number>());

    return providers.map((p) => ({
      id: p.id,
      name: p.name,
      bio: p.bio ?? undefined,
      description: p.description ?? undefined,
      internal_links: p.internal_links ?? undefined,
      avatar_url: p.avatar_url ?? undefined,
      specialty: p.specialty ?? [],
      instagram_handle: p.instagram_handle ?? undefined,
      rating: p.rating ?? undefined,
      is_verified: p.is_verified ?? undefined,
      followers_count: followerCounts.get(p.id) ?? 0,
      listings_count: listingCounts.get(p.id) ?? 0,
    }));
  } catch (err) {
    console.error('fetchProvidersServer: failed to load providers', err);
    return [];
  }
}

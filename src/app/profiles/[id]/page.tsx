import type { Metadata } from 'next';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { SITE_NAME, absoluteUrl, truncateForMeta, providerProfileSlug } from '@/lib/seo';
import JsonLd from '@/components/JsonLd';
import ProviderProfilePageClient from './ProviderProfilePageClient';

type ProviderRow = {
  id: string;
  name: string;
  username: string | null;
  bio: string | null;
  description: string | null;
  avatar_url: string | null;
  cover_url: string | null;
  specialty: string[] | null;
  title: string | null;
  location: string | null;
  website_url: string | null;
  is_verified: boolean | null;
  rating: number | null;
};

// The route segment accepts either the provider's raw UUID (old share
// links) or their `username` handle (new pretty share links, e.g.
// /profiles/chemparathi) — see src/app/api/providers/[id]/route.ts for the
// matching lookup used by the client-rendered page.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function fetchProviderForMetadata(identifier: string): Promise<ProviderRow | null> {
  try {
    // Explicit column list matching ProviderRow — never select('*'). This is
    // used to build public <meta> tags, so payment_mobile_number (each
    // provider's UPI ID, migration 030) must never be selected here.
    const query = supabaseAdmin
      .from('providers')
      .select('id, name, username, bio, description, avatar_url, cover_url, specialty, title, location, website_url, is_verified, rating');
    const { data } = UUID_RE.test(identifier)
      ? await query.eq('id', identifier).single()
      : await query.ilike('username', identifier).single();
    return (data as ProviderRow) ?? null;
  } catch (error) {
    console.error('generateMetadata(profiles/[id]): failed to load provider', error);
    return null;
  }
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const provider = await fetchProviderForMetadata(id);

  if (!provider) {
    return {
      title: 'Provider Not Found',
      description: 'This provider profile is no longer available. Browse the full doodle_G directory of home makers and artisans.',
      robots: { index: false, follow: true },
    };
  }

  // Deliberately names "home maker" / "artisan" explicitly in both the
  // title and description — that's both an accurate description of who
  // these providers are and the exact phrase a shopper (or an LLM
  // answering "where can I buy gifts from home makers") would search for.
  const roleLine = provider.title || (provider.specialty?.length ? provider.specialty.join(', ') : 'Home Maker & Gift Provider');
  const title = `${provider.name} — ${roleLine}`;
  const description = truncateForMeta(
    provider.description ||
      provider.bio ||
      `${provider.name} is an independent home maker and gift provider on doodle_G${provider.location ? `, based in ${provider.location}` : ''}, specialising in ${provider.specialty?.join(', ') || 'handmade gifts'}.`
  );
  const image = provider.cover_url || provider.avatar_url || undefined;
  // Prefer the human-readable username as the canonical URL (matches the
  // product slug pattern in src/app/sitemap.ts) — same page either way,
  // but the pretty URL is what should appear in search results and shares.
  const canonical = `/profiles/${providerProfileSlug(provider)}`;

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      type: 'profile',
      url: canonical,
      title,
      description,
      images: image ? [{ url: image, alt: provider.name }] : undefined,
    },
    twitter: {
      card: image ? 'summary_large_image' : 'summary',
      title,
      description,
      images: image ? [image] : undefined,
    },
  };
}

export default async function ProviderProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const provider = await fetchProviderForMetadata(id);

  // LocalBusiness JSON-LD (rather than plain Person) — these are home-based
  // gift businesses, not individuals, and LocalBusiness lets us attach a
  // location, rating, and parent-brand relationship, which is the richer,
  // more accurate schema for "independent home maker running a small gift
  // business" and what an AI assistant asked "who makes doodle_G's gifts"
  // should be able to cite directly.
  const providerJsonLd = provider
    ? {
        '@context': 'https://schema.org',
        '@type': 'LocalBusiness',
        name: provider.name,
        description: provider.description || provider.bio || undefined,
        image: provider.cover_url || provider.avatar_url || undefined,
        url: absoluteUrl(`/profiles/${providerProfileSlug(provider)}`),
        address: provider.location ? { '@type': 'PostalAddress', addressLocality: provider.location } : undefined,
        sameAs: provider.website_url ? [provider.website_url] : undefined,
        knowsAbout: provider.specialty || undefined,
        ...(provider.rating
          ? {
              aggregateRating: {
                '@type': 'AggregateRating',
                ratingValue: provider.rating,
                bestRating: 5,
                worstRating: 1,
              },
            }
          : {}),
        parentOrganization: { '@type': 'Organization', name: SITE_NAME },
      }
    : null;

  return (
    <>
      {providerJsonLd && <JsonLd data={providerJsonLd} />}
      <ProviderProfilePageClient params={params} />
    </>
  );
}

import type { MetadataRoute } from 'next';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { SITE_URL, providerProfileSlug } from '@/lib/seo';

// Next.js generates /sitemap.xml from this file automatically at build
// time (and re-runs it on ISR revalidation in production, per the
// `revalidate` export below). Static marketing routes are listed
// explicitly; every live product and provider is pulled straight from
// Supabase so new listings show up in the sitemap without a code change or
// redeploy — the whole point of a sitemap is to help crawlers discover
// pages they wouldn't otherwise find via internal links quickly, and
// product/provider pages are exactly the "discovered late" case.
export const revalidate = 3600; // re-generate at most once an hour

const STATIC_ROUTES: Array<{ path: string; changeFrequency: MetadataRoute.Sitemap[number]['changeFrequency']; priority: number }> = [
  { path: '/', changeFrequency: 'daily', priority: 1 },
  { path: '/shop', changeFrequency: 'daily', priority: 0.9 },
  { path: '/shop/collection', changeFrequency: 'daily', priority: 0.7 },
  { path: '/tailoring', changeFrequency: 'weekly', priority: 0.7 },
  { path: '/profiles', changeFrequency: 'daily', priority: 0.8 },
  { path: '/support', changeFrequency: 'monthly', priority: 0.5 },
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries: MetadataRoute.Sitemap = STATIC_ROUTES.map((route) => ({
    url: `${SITE_URL}${route.path}`,
    lastModified: new Date(),
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));

  try {
    const [{ data: products }, { data: providers }] = await Promise.all([
      supabaseAdmin
        .from('catalog_products')
        // Only sellable, in-stock products should be advertised for
        // indexing. Out-of-stock rows would send crawlers to a "sold
        // out" state and burn crawl budget on pages users can't act on;
        // when they re-stock they'll re-enter the sitemap on the next
        // ISR revalidation.
        .select('id, slug, date_of_listed')
        .gt('available_qty', 0)
        .order('date_of_listed', { ascending: false })
        .limit(5000),
      supabaseAdmin
        .from('providers')
        .select('id, username, created_at')
        .limit(5000),
    ]);

    for (const product of products ?? []) {
      // Prefer the human-readable slug (see supabase_migration_017) —
      // same page either way, but the slug is the canonical URL that
      // appears in search results.
      const path = product.slug ? `/shop/${product.slug}` : `/shop/${product.id}`;
      entries.push({
        url: `${SITE_URL}${path}`,
        lastModified: product.date_of_listed ? new Date(product.date_of_listed) : new Date(),
        changeFrequency: 'weekly',
        priority: 0.8,
      });
    }

    for (const provider of providers ?? []) {
      // Prefer the human-readable username (see supabase_migration_011) —
      // same page either way, but the pretty handle is the canonical URL
      // that should appear in search results, mirroring the product-slug
      // pattern above. providerProfileSlug falls back to the id whenever
      // the stored username isn't a safe single-segment slug (e.g.
      // contains a "/" or space), so a bad DB value can't sitemap a 404.
      entries.push({
        url: `${SITE_URL}/profiles/${providerProfileSlug(provider)}`,
        lastModified: provider.created_at ? new Date(provider.created_at) : new Date(),
        changeFrequency: 'weekly',
        priority: 0.7,
      });
    }
  } catch (error) {
    // Never let a Supabase hiccup take the whole sitemap (and therefore
    // crawling of the static routes above) down with it — log and fall
    // back to the static entries only.
    console.error('sitemap: failed to load products/providers from Supabase', error);
  }

  return entries;
}

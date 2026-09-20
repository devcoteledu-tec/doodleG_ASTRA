import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/seo';

// Next.js generates /robots.txt from this file automatically at build
// time. Public, crawlable pages (home, shop, product pages, provider
// profiles, support) are left open; anything behind auth or purely
// transactional (cart, wishlist, checkout-adjacent account pages, and the
// API routes themselves) is disallowed so crawl budget isn't wasted on
// pages that either require a login or are identical thin content for
// every visitor. This must stay in sync with the per-page `robots: { index:
// false }` metadata set on those same routes (see cart/wishlist/my-profile/
// onboarding/auth page.tsx wrappers) — disallowing here stops crawling,
// the meta tag stops indexing of anything that slips through anyway.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/api/', '/cart', '/wishlist', '/my-profile', '/onboarding', '/auth'],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}

/**
 * Central SEO constants.
 *
 * Every file that needs the site's canonical URL, name, or default
 * marketing copy (layout.tsx, robots.ts, sitemap.ts, and every page's
 * `generateMetadata`) imports from here instead of hardcoding its own copy
 * of the domain or tagline. Keeping it in one place means a rebrand or
 * domain change is a one-file edit instead of a grep-and-replace across the
 * app.
 *
 * SITE_URL falls back to a placeholder domain when NEXT_PUBLIC_SITE_URL
 * isn't set (see .env.example) so `next build` never fails without it —
 * but every canonical/Open Graph URL and the sitemap will be wrong until a
 * real production domain is configured.
 */

export const SITE_NAME = 'doodle_G';

export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.doodleg.in').replace(/\/+$/, '');

export const SITE_TAGLINE = 'AI Surprise Gift Concierge';

/**
 * Default meta description, used on the homepage and as a fallback for any
 * page that doesn't set its own. Written to answer, in one sentence, what
 * the site is and who it's for: an AI-curated gifting service on WhatsApp,
 * fulfilled by independent home-based makers and small studios (florists,
 * bakers, woodworkers, candle-makers, etc.) rather than a faceless
 * warehouse — that distinction is a deliberate keyword target, since it's
 * both true and how people search ("handmade gifts from home makers near
 * me", "support small home-based gift businesses").
 */
export const SITE_DESCRIPTION =
  'doodle_G is an AI gift concierge that curates and delivers personalised, handmade gifts for girlfriend, boyfriend, husband, wife, mom, dad, and friends — birthdays, anniversaries, Valentine\u2019s, Raksha Bandhan and every occasion. Homemade gifts, artisan gift boxes and surprise hampers from independent home makers and small studios across India, coordinated end-to-end over WhatsApp.';

// Keyword list feeds `<meta name="keywords">`. Modern Google largely ignores
// the keywords meta itself, but this same array is (a) reused as the site-wide
// bag-of-terms for the Organization/OnlineStore JSON-LD `keywords` property
// (which answer engines and product-grid crawlers do read), and (b) a
// checklist for the copywriting on individual pages — every phrase here should
// appear naturally somewhere on the site. It's ordered roughly by search
// volume / intent strength, high-intent buyer queries first, brand/category
// terms after.
export const SITE_KEYWORDS = [
  // High-intent recipient queries — these are the exact strings people type
  'gift for girlfriend',
  'gift for boyfriend',
  'gift for wife',
  'gift for husband',
  'gift for mom',
  'gift for dad',
  'gift for sister',
  'gift for brother',
  'gift for best friend',
  'gift for him',
  'gift for her',
  // Occasion queries
  'birthday gift ideas',
  'anniversary gift ideas',
  'valentine\u2019s day gifts',
  'raksha bandhan gifts',
  'rakhi gifts online',
  'wedding gifts',
  'housewarming gifts',
  'farewell gifts',
  'graduation gifts',
  'baby shower gifts',
  'mother\u2019s day gifts',
  'father\u2019s day gifts',
  'friendship day gifts',
  'diwali gifts',
  'christmas gifts',
  // Product-type queries
  'personalised gifts online',
  'personalized gifts india',
  'customised gifts',
  'homemade gifts',
  'handmade gifts',
  'handmade gifts india',
  'artisan gifts',
  'curated gift boxes',
  'gift hampers online',
  'surprise gift box',
  'gift baskets india',
  'chocolate gift box',
  'flower and gift delivery',
  'romantic gifts',
  'cute gifts for couples',
  'unique gift ideas',
  'thoughtful gift ideas',
  'small business gifts',
  // Brand / service positioning
  'AI gift concierge',
  'AI gift recommender',
  'WhatsApp gifting service',
  'surprise gift delivery india',
  'send gifts online india',
  'gifts under 500',
  'gifts under 1000',
  'gifts under 2000',
  'last minute gifts',
  'same day gift delivery',
  // Supply-side / discovery
  'home makers gift shop',
  'home-based gift sellers',
  'support small home businesses',
  'independent artisan providers',
  'buy directly from artisans',
  'doodle_G',
  'doodleg',
];

/**
 * Google Search Console site-verification token for www.doodleg.in.
 *
 * Checked in deliberately rather than left env-only: this value is public by
 * design (it ships in the HTML `<meta>` tag on every page), and keeping it in
 * source means the property stays verified even if the Vercel env var is
 * missing on a preview/redeploy — an unset env var silently drops the tag,
 * which un-verifies the property and kills Search Console data.
 * GOOGLE_SITE_VERIFICATION in the environment still overrides it if the
 * property is ever re-issued a new token.
 */
export const GOOGLE_SITE_VERIFICATION =
  process.env.GOOGLE_SITE_VERIFICATION || 'FnaxFP1ObeUzENbarUXHkMzGzsRdw3wN11KAn2A4LUc';

/** Bing Webmaster Tools token — env-only; no property registered yet. */
export const BING_SITE_VERIFICATION = process.env.BING_SITE_VERIFICATION;

/** Absolute URL helper — joins a site-relative path onto SITE_URL. */
export function absoluteUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  return `${SITE_URL}${path.startsWith('/') ? path : `/${path}`}`;
}

/** Truncate arbitrary copy (bios, product descriptions) to a safe meta-description length. */
export function truncateForMeta(text: string, maxLength = 155): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= maxLength) return clean;
  return `${clean.slice(0, maxLength - 1).trimEnd()}…`;
}

/**
 * Is this a safe single-segment URL slug for /profiles/[id]?
 *
 * `providers.username` (migration 011) is free-text set directly in the DB
 * — nothing enforces it's actually a URL-shaped handle. A value like
 * "product/services" or "Home & Gifts" produces a share link such as
 * /profiles/product/services, which is TWO path segments; Next's
 * `/profiles/[id]` route only ever matches one, so that link 404s.
 *
 * Every place that builds a profile share link must run the provider's
 * username through this check first and fall back to provider.id when it
 * fails, so a bad value in the DB degrades to "still works" instead of
 * "404". Letters, numbers, hyphens and underscores only — no slashes,
 * spaces, or other characters that carry meaning in a URL path.
 */
export function isValidProfileSlug(slug: string | null | undefined): slug is string {
  return !!slug && /^[a-zA-Z0-9_-]+$/.test(slug);
}

/** Given a provider's id/username, pick the safe slug for its /profiles/ URL. */
export function providerProfileSlug(provider: { id: string; username?: string | null }): string {
  return isValidProfileSlug(provider.username) ? provider.username : provider.id;
}

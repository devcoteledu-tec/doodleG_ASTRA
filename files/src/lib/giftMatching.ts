import type { GiftTier } from '@/lib/giftDomain';

/**
 * Grounds gift curation in the real `products_box` catalog instead of letting
 * the AI invent a product that doesn't exist and can never be fulfilled.
 *
 * Flow: score every in-stock product against the recipient's onboarding
 * answers (interests, quirks, dynamic, relationship, occasion), bucket the
 * top candidates into the three price tiers, and hand only those *real*
 * candidates to the AI so it can only ever pick and copy-write something
 * that is actually sellable. See src/services/ai.ts (curateGiftsFromCatalog)
 * for how these candidates are turned into the final selection.
 */

export const TIER_PRICE_BANDS: Record<GiftTier, { min: number; max: number }> = {
  CLASSIC: { min: 0, max: 500 },
  GRAND: { min: 500, max: 2500 },
  LUXURY: { min: 2500, max: Infinity },
};

/** Minimal shape of a `products_box` row needed for matching + display. */
export interface MatchableProduct {
  id: string;
  name: string;
  category: string;
  description: string;
  price: number;
  rating: number;
  totalReviews: number;
  availableQty: number;
  emoji: string;
  image?: string;
}

export interface ScoredProduct extends MatchableProduct {
  score: number;
}

const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'that', 'this', 'from', 'their', 'they', 'them',
  'her', 'his', 'she', 'him', 'a', 'an', 'of', 'to', 'in', 'on', 'is', 'are',
  'i', 'we', 'you', 'my', 'our', 'very', 'really', 'just', 'like', 'likes',
  'loves', 'love', 'enjoy', 'enjoys', 'always', 'often', 'sometimes', 'also',
]);

/**
 * A gift-shop catalog will never carry a literal product for every stated
 * interest (no fitness tracker on a site that sells food hampers), so a
 * plain keyword match against "fitness" or "technology" finds nothing and
 * relevance silently collapses to zero — at which point scoring falls back
 * to pure popularity, which is what made every recipient with an
 * unmatched interest see the exact same top-rated items regardless of who
 * they were. This maps common interest words to the *adjacent, giftable*
 * qualities a thoughtful human curator would reach for instead — someone
 * into fitness is plausibly into wellness/energy/active living even if
 * "fitness" itself isn't a category; someone into tech likely appreciates
 * "smart"/practical/innovative framing even from a non-electronic gift.
 * This only ever adds candidate keywords to match against — it never
 * removes the original interest text from consideration, and it's a plain
 * object specifically so it's easy to extend as the real category mix
 * becomes clearer over time.
 */
const THEME_SYNONYMS: Record<string, string[]> = {
  fitness: ['wellness', 'health', 'active', 'energy', 'vitality'],
  gym: ['wellness', 'health', 'active', 'energy'],
  sports: ['active', 'energy', 'outdoor'],
  technology: ['smart', 'innovative', 'modern', 'gadget', 'practical'],
  tech: ['smart', 'innovative', 'modern', 'gadget', 'practical'],
  gadgets: ['smart', 'innovative', 'practical'],
  reading: ['literature', 'book', 'story'],
  books: ['literature', 'story'],
  cooking: ['culinary', 'food', 'gourmet', 'recipe'],
  baking: ['culinary', 'cakes', 'gourmet'],
  music: ['music', 'sound', 'melody'],
  travel: ['experience', 'adventure', 'journey'],
  photography: ['photography', 'memory', 'capture'],
  art: ['handmade', 'craft', 'artisan', 'creative'],
  fashion: ['style', 'elegant', 'premium'],
  gardening: ['nature', 'wellness', 'organic'],
  coffee: ['gourmet', 'culinary'],
  tea: ['gourmet', 'wellness', 'culinary'],
  spa: ['wellness', 'relax', 'self-care'],
  relaxation: ['wellness', 'relax', 'self-care', 'calm'],
};

/** Lowercase, strip punctuation, split into de-duplicated meaningful words. */
function extractKeywords(...texts: (string | null | undefined)[]): string[] {
  const words = texts
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map((w) => w.trim())
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));

  const expanded = new Set(words);
  for (const w of words) {
    for (const synonym of THEME_SYNONYMS[w] || []) {
      expanded.add(synonym);
    }
  }
  return Array.from(expanded);
}

export interface RecipientProfileInput {
  interests?: string | null;
  quirks?: string | null;
  dynamic?: string | null;
  relationship?: string | null;
  occasionTitle?: string | null;
  /**
   * Signals pulled from an EXISTING doodle_G member's own profile when the
   * onboarding user has tagged the recipient as that member (see
   * recipients.recipient_profile_id + /api/profile-lookup). This is
   * real, first-party data about what the recipient actually likes —
   * stronger signal than the sender's guess in `interests`/`quirks` above,
   * so it gets its own, more heavily-weighted scoring path rather than
   * being folded into the free-text keyword extraction.
   */
  taggedMember?: {
    /** Categories of products already in this member's `profile.like_products_id` list. */
    likedCategories?: string[];
    /** The exact product ids they've already liked — excluded from candidates, not recommended again. */
    likedProductIds?: string[];
    /** `profile.topic_interested` — their own stated interests, distinct from the sender's free-text guess. */
    statedInterests?: string[];
  };
}

/**
 * Whether any interest/quirk/dynamic/occasion keyword (after synonym
 * expansion) or liked-category actually appears in this product's own
 * text — i.e. whether this is a genuine content match rather than a pure
 * popularity pick with nothing real behind it. Exported so the copy layer
 * (src/services/ai.ts) can write honestly different framing for each case
 * instead of using identical "matched to their love for X" language
 * regardless of whether anything actually matched.
 */
export function hasGenuineMatch(product: MatchableProduct, profile: RecipientProfileInput): boolean {
  const keywords = extractKeywords(
    profile.interests,
    profile.quirks,
    profile.dynamic,
    profile.occasionTitle,
    ...(profile.taggedMember?.statedInterests || [])
  );
  const haystack = `${product.name} ${product.category} ${product.description}`.toLowerCase();
  const keywordHit = keywords.some((kw) => kw && haystack.includes(kw));

  const likedCategories = profile.taggedMember?.likedCategories || [];
  const categoryHit = likedCategories.some((c) => c.toLowerCase() === product.category.toLowerCase());

  return keywordHit || categoryHit;
}

/**
 * Scores a single product against the recipient's profile. Higher is a
 * better match. Keyword relevance dominates; rating/popularity only break
 * ties between similarly-relevant products so the recommendation stays
 * personalized rather than defaulting to "just the best-seller".
 */
export function scoreProduct(product: MatchableProduct, profile: RecipientProfileInput): number {
  const keywords = extractKeywords(
    profile.interests,
    profile.quirks,
    profile.dynamic,
    profile.occasionTitle,
    ...(profile.taggedMember?.statedInterests || [])
  );
  const haystack = `${product.name} ${product.category} ${product.description}`.toLowerCase();

  let relevance = 0;
  for (const kw of keywords) {
    if (!kw) continue;
    if (haystack.includes(kw)) {
      // Exact word-boundary hits count more than a loose substring match.
      const wholeWordHit = new RegExp(`\\b${kw}\\b`).test(haystack);
      relevance += wholeWordHit ? 3 : 1;
    }
  }

  // Category match against the first stated interest is a strong signal
  // (e.g. interests="hiking, jazz" and category="Music").
  const firstInterest = (profile.interests || '').split(',')[0]?.trim().toLowerCase();
  if (firstInterest && product.category.toLowerCase().includes(firstInterest)) {
    relevance += 4;
  }

  // Tagged member's own liked-products category history is real observed
  // behavior (they actually chose to like something in this category),
  // which is a stronger signal than a sender's guessed interest text — so
  // it's weighted above the keyword-match bonus above, not folded into it.
  const likedCategories = profile.taggedMember?.likedCategories || [];
  if (likedCategories.some((c) => c.toLowerCase() === product.category.toLowerCase())) {
    relevance += 6;
  }

  // Popularity: star rating dominates, review COUNT is capped low so a
  // product with 500 mediocre reviews can't outrank one with 20 excellent
  // ones — "high reviews and higher rating" means both, not just volume.
  const popularity = Math.min(product.rating, 5) * 1.2 + Math.min(product.totalReviews, 100) / 100;
  // available_qty defaults to 0 in the schema and many sellers never touch
  // it, so 0 is ambiguous ("known out of stock" vs "just never set") rather
  // than a reliable signal — a small nudge for tracked stock, no penalty
  // for untracked/zero, so real matches don't vanish over unmanaged data.
  const inStockBoost = product.availableQty > 0 ? 1 : 0;

  return relevance * 5 + popularity + inStockBoost;
}

/**
 * Ranks every candidate product and buckets the top matches per price tier.
 * Returns up to `perTier` candidates for each of CLASSIC/GRAND/LUXURY, sorted
 * best-match-first, so callers always have a grounded, real fallback even if
 * the AI step is skipped or fails.
 */
export function rankCandidatesByTier(
  products: MatchableProduct[],
  profile: RecipientProfileInput,
  perTier = 5
): Record<GiftTier, ScoredProduct[]> {
  const alreadyLiked = new Set(profile.taggedMember?.likedProductIds || []);
  // Don't recommend something the tagged member has already told us they
  // like (their like_products_id list) — that's a signal for what STYLE to
  // match, not a shortlist to re-suggest verbatim.
  const eligible = products.filter(p => p.availableQty > 0 && p.price > 0 && !alreadyLiked.has(p.id));
  const scored: ScoredProduct[] = eligible.map((p) => ({ ...p, score: scoreProduct(p, profile) }));

  const buckets: Record<GiftTier, ScoredProduct[]> = { CLASSIC: [], GRAND: [], LUXURY: [] };

  (Object.keys(TIER_PRICE_BANDS) as GiftTier[]).forEach((tier) => {
    const { min, max } = TIER_PRICE_BANDS[tier];
    buckets[tier] = scored
      .filter((p) => p.price >= min && p.price < max)
      .sort((a, b) => b.score - a.score)
      .slice(0, perTier);
  });

  return buckets;
}

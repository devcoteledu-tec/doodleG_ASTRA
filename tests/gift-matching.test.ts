import { describe, it, expect, beforeEach, vi } from 'vitest';
import { rankCandidatesByTier, scoreProduct, type MatchableProduct } from '@/lib/giftMatching';

const catalog: MatchableProduct[] = [
  { id: 'prod-tea', name: 'Luxury Matcha Ceremony Set', category: 'Culinary', description: 'Ceremonial-grade matcha and bamboo whisk for tea lovers.', price: 1200, rating: 4.9, totalReviews: 341, availableQty: 20, emoji: '🍵' },
  { id: 'prod-jazz', name: 'Midnight Jazz Vinyl Set', category: 'Music', description: 'Hand-curated jazz vinyl pressings for music collectors.', price: 2200, rating: 4.8, totalReviews: 43, availableQty: 5, emoji: '🎷' },
  { id: 'prod-hike', name: 'Trailblazer Hiking Kit', category: 'Outdoors', description: 'A compact hiking kit with trail snacks and a reusable flask.', price: 450, rating: 4.5, totalReviews: 90, availableQty: 15, emoji: '🥾' },
  { id: 'prod-dome', name: 'Stargazing Dome Weekend', category: 'Experiences', description: 'A private stargazing dome retreat for two.', price: 7800, rating: 5.0, totalReviews: 19, availableQty: 3, emoji: '🔭' },
  { id: 'prod-noqty', name: 'Untracked Stock Candle', category: 'Wellness', description: 'A hand-poured soy candle, hiking themed scent.', price: 300, rating: 4.2, totalReviews: 12, availableQty: 0, emoji: '🕯️' },
];

describe('scoreProduct', () => {
  it('ranks a category/keyword match above an unrelated product', () => {
    const profile = { interests: 'hiking, jazz records', occasionTitle: 'Anniversary' };
    const jazzScore = scoreProduct(catalog[1], profile);
    const teaScore = scoreProduct(catalog[0], profile);
    expect(jazzScore).toBeGreaterThan(teaScore);
  });

  it('does not zero out products with untracked (0) available_qty', () => {
    const profile = { interests: 'hiking' };
    const untracked = scoreProduct(catalog[4], profile); // hiking-themed candle, qty 0
    const unrelatedButStocked = scoreProduct(catalog[3], profile); // dome, no hiking keywords, qty 3
    expect(untracked).toBeGreaterThan(unrelatedButStocked);
  });
});

describe('rankCandidatesByTier', () => {
  it('buckets candidates into the correct CLASSIC/GRAND/LUXURY price bands', () => {
    const buckets = rankCandidatesByTier(catalog, { interests: 'hiking, jazz, tea' }, 5);
    expect(buckets.CLASSIC.every((p) => p.price < 500)).toBe(true);
    expect(buckets.GRAND.every((p) => p.price >= 500 && p.price < 2500)).toBe(true);
    expect(buckets.LUXURY.every((p) => p.price >= 2500)).toBe(true);

    expect(buckets.CLASSIC.map((p) => p.id)).toContain('prod-hike');
    expect(buckets.GRAND.map((p) => p.id)).toContain('prod-tea');
    expect(buckets.LUXURY.map((p) => p.id)).toContain('prod-dome');
  });

  it('sorts each tier best-match-first', () => {
    const buckets = rankCandidatesByTier(catalog, { interests: 'jazz records, vinyl' }, 5);
    expect(buckets.GRAND[0].id).toBe('prod-jazz');
  });
});

describe('AIService.curateGiftsFromCatalog (grounded in real products)', () => {
  beforeEach(() => {
    vi.stubEnv('GEMINI_API_KEY', '');
    vi.stubEnv('NODE_ENV', 'test');
  });

  async function importFreshAIService() {
    vi.resetModules();
    const mod = await import('@/services/ai');
    return mod.AIService;
  }

  it('only ever returns productIds that were in the given candidate lists', async () => {
    const AIService = await importFreshAIService();
    const buckets = rankCandidatesByTier(catalog, { interests: 'hiking, jazz, tea' }, 5);

    const result = await AIService.curateGiftsFromCatalog(
      { recipientName: 'Sam', relationship: 'Friend', interests: 'hiking, jazz, tea' },
      buckets
    );

    const allCandidateIds = new Set(Object.values(buckets).flat().map((p) => p.id));
    for (const pkg of result.giftPackages) {
      expect(pkg.productId).toBeDefined();
      expect(allCandidateIds.has(pkg.productId!)).toBe(true);
      // estimatedPrice must be the product's real price, never invented
      const matched = Object.values(buckets).flat().find((p) => p.id === pkg.productId);
      expect(pkg.estimatedPrice).toBe(matched!.price);
    }
  });

  it('omits a tier entirely when there are no in-stock/priced candidates for it', async () => {
    const AIService = await importFreshAIService();
    const buckets = rankCandidatesByTier(
      [catalog[2]], // only a CLASSIC-tier product
      { interests: 'hiking' },
      5
    );

    const result = await AIService.curateGiftsFromCatalog(
      { recipientName: 'Sam', relationship: 'Friend', interests: 'hiking' },
      buckets
    );

    expect(result.giftPackages).toHaveLength(1);
    expect(result.giftPackages[0].tier).toBe('CLASSIC');
  });
});

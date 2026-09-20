import { describe, it, expect, beforeEach, vi } from 'vitest';

// AIService reads GEMINI_API_KEY once at module load time (`const apiKey =
// process.env.GEMINI_API_KEY`), so each test that needs a different env
// state must reset the module registry and re-import fresh.
async function importFreshAIService() {
  vi.resetModules();
  const mod = await import('@/services/ai');
  return mod.AIService;
}

describe('AIService.curateGifts (mock fallback)', () => {
  beforeEach(() => {
    vi.stubEnv('GEMINI_API_KEY', '');
    vi.stubEnv('NODE_ENV', 'test');
  });

  it('returns a well-formed CurationResult with exactly 3 tiers when GEMINI_API_KEY is unset', async () => {
    const AIService = await importFreshAIService();

    const result = await AIService.curateGifts({
      recipientName: 'Jamie',
      relationship: 'Partner',
      interests: 'hiking, jazz records',
      quirks: 'always cold',
      dynamic: 'playful',
      occasionTitle: 'Anniversary',
    });

    expect(result.giftPackages).toHaveLength(3);
    const tiers = result.giftPackages.map((p) => p.tier).sort();
    expect(tiers).toEqual(['CLASSIC', 'GRAND', 'LUXURY']);

    for (const pkg of result.giftPackages) {
      expect(typeof pkg.title).toBe('string');
      expect(pkg.title.length).toBeGreaterThan(0);
      expect(typeof pkg.description).toBe('string');
      expect(pkg.description.length).toBeGreaterThan(0);
      expect(typeof pkg.estimatedPrice).toBe('number');
      expect(pkg.estimatedPrice).toBeGreaterThan(0);
      expect(typeof pkg.reason).toBe('string');
      expect(pkg.reason.length).toBeGreaterThan(0);
    }
  });

  it('is independent of network calls — no fetch/genAI call is made when the key is unset', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const AIService = await importFreshAIService();

    await AIService.curateGifts({
      recipientName: 'Sam',
      relationship: 'Friend',
      interests: 'coffee, books',
      occasionTitle: 'Birthday',
    });

    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('personalizes the mock output using the given interests and recipient name', async () => {
    const AIService = await importFreshAIService();

    const result = await AIService.curateGifts({
      recipientName: 'Priya',
      relationship: 'Sister',
      interests: 'pottery, gardening',
      occasionTitle: 'Birthday',
    });

    const classic = result.giftPackages.find((p) => p.tier === 'CLASSIC')!;
    expect(classic.title).toMatch(/pottery/i);
  });

  it('throws in production rather than silently serving mock curations', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const AIService = await importFreshAIService();

    await expect(
      AIService.curateGifts({
        recipientName: 'Jamie',
        relationship: 'Partner',
        interests: 'hiking',
        occasionTitle: 'Anniversary',
      })
    ).rejects.toThrow(/GEMINI_API_KEY/);
  });
});

describe('AIService.generateCardMessage (mock fallback)', () => {
  beforeEach(() => {
    vi.stubEnv('GEMINI_API_KEY', '');
    vi.stubEnv('NODE_ENV', 'test');
  });

  it('returns a non-empty cardMessage for each supported tone', async () => {
    const AIService = await importFreshAIService();

    for (const tone of ['sentimental', 'witty', 'inside-jokes'] as const) {
      const result = await AIService.generateCardMessage({
        senderName: 'Alex',
        recipientName: 'Jamie',
        relationship: 'Partner',
        occasionTitle: 'Anniversary',
        tone,
      });
      expect(typeof result.cardMessage).toBe('string');
      expect(result.cardMessage.length).toBeGreaterThan(0);
      expect(result.cardMessage).toContain('Jamie');
    }
  });
});

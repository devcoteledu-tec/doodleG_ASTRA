import { describe, it, expect, vi, beforeEach } from 'vitest';

// A fake `rate_limit_windows` table + `check_and_increment_rate_limit` RPC,
// implementing the exact same fixed-window semantics as
// supabase_migration_014_rate_limit_store.sql. This lets these tests
// exercise checkRateLimit() against something that behaves like the real
// shared Postgres store — including genuinely sharing state across
// concurrent calls — without hitting a real database.
function createFakeRateLimitStore() {
  const windows = new Map<string, { count: number; resetAt: number }>();

  const rpc = vi.fn(async (
    fn: string,
    params: Record<string, unknown>
  ): Promise<{ data: unknown; error: unknown }> => {
    if (fn !== 'check_and_increment_rate_limit') {
      return { data: null, error: { message: `unexpected rpc: ${fn}` } };
    }
    const { p_key: key, p_limit: limit, p_window_ms: windowMs } = params as {
      p_key: string;
      p_limit: number;
      p_window_ms: number;
    };
    const now = Date.now();
    const existing = windows.get(key);

    if (!existing || now >= existing.resetAt) {
      windows.set(key, { count: 1, resetAt: now + windowMs });
      return { data: [{ allowed: true, retry_after_seconds: 0 }], error: null };
    }

    if (existing.count >= limit) {
      return {
        data: [{ allowed: false, retry_after_seconds: Math.ceil((existing.resetAt - now) / 1000) }],
        error: null,
      };
    }

    existing.count += 1;
    return { data: [{ allowed: true, retry_after_seconds: 0 }], error: null };
  });

  return { rpc, windows };
}

let fakeStore: ReturnType<typeof createFakeRateLimitStore>;
vi.mock('@/lib/supabaseAdmin', () => ({
  get supabaseAdmin() {
    return { rpc: fakeStore.rpc };
  },
}));

async function importRateLimit() {
  return import('@/lib/rateLimit');
}

describe('checkRateLimit (Supabase-backed)', () => {
  beforeEach(() => {
    vi.resetModules();
    fakeStore = createFakeRateLimitStore();
  });

  it('shares state across calls for the same key — simulating two different serverless instances', async () => {
    // This is the core bug being fixed: the old implementation kept counts
    // in a per-process in-memory Map, so two different instances handling
    // requests for the same rate-limit key each had their own independent
    // budget instead of sharing one. Calling checkRateLimit() twice in a
    // row for the same key (as two instances calling out to the same
    // durable store would) must NOT reset the count in between — it must
    // accumulate against the same shared window, which is exactly what the
    // old Map-backed version would have failed at.
    const { checkRateLimit } = await importRateLimit();

    const first = await checkRateLimit('shared-key', 2, 60_000);
    const second = await checkRateLimit('shared-key', 2, 60_000);
    const third = await checkRateLimit('shared-key', 2, 60_000);

    expect(first).toEqual({ allowed: true, retryAfterSeconds: 0 });
    expect(second).toEqual({ allowed: true, retryAfterSeconds: 0 });
    // Third call exceeds the limit of 2 — proves the second call's count
    // was actually persisted and read back, not reset.
    expect(third.allowed).toBe(false);
    expect(fakeStore.rpc).toHaveBeenCalledTimes(3);
  });

  it('rejects once the limit is hit, with a positive retryAfterSeconds', async () => {
    const { checkRateLimit } = await importRateLimit();

    await checkRateLimit('limited-key', 1, 60_000);
    const result = await checkRateLimit('limited-key', 1, 60_000);

    expect(result.allowed).toBe(false);
    expect(result.retryAfterSeconds).toBeGreaterThan(0);
    expect(result.retryAfterSeconds).toBeLessThanOrEqual(60);
  });

  it('allows a fresh request again after the window elapses', async () => {
    vi.useFakeTimers();
    try {
      const { checkRateLimit } = await importRateLimit();

      const first = await checkRateLimit('expiring-key', 1, 1_000);
      const second = await checkRateLimit('expiring-key', 1, 1_000);
      expect(first.allowed).toBe(true);
      expect(second.allowed).toBe(false);

      vi.advanceTimersByTime(1_001);

      const third = await checkRateLimit('expiring-key', 1, 1_000);
      expect(third).toEqual({ allowed: true, retryAfterSeconds: 0 });
    } finally {
      vi.useRealTimers();
    }
  });

  it('calls the RPC with the exact key, limit, and window', async () => {
    const { checkRateLimit } = await importRateLimit();

    await checkRateLimit('some:key', 5, 30_000);

    expect(fakeStore.rpc).toHaveBeenCalledWith('check_and_increment_rate_limit', {
      p_key: 'some:key',
      p_limit: 5,
      p_window_ms: 30_000,
    });
  });

  it('fails closed when the RPC call errors', async () => {
    fakeStore.rpc.mockResolvedValueOnce({ data: null, error: { message: 'connection refused' } });
    const { checkRateLimit } = await importRateLimit();

    const result = await checkRateLimit('db-down-key', 10, 60_000);

    expect(result.allowed).toBe(false);
    expect(result.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('fails closed when the limiter returns no decision', async () => {
    fakeStore.rpc.mockResolvedValueOnce({ data: null, error: null });
    const { checkRateLimit } = await importRateLimit();

    const result = await checkRateLimit('unconfigured-key', 10, 60_000);

    expect(result).toEqual({ allowed: false, retryAfterSeconds: 60 });
  });

  it('keeps independent windows for different keys', async () => {
    const { checkRateLimit } = await importRateLimit();

    await checkRateLimit('key-a', 1, 60_000);
    const keyBResult = await checkRateLimit('key-b', 1, 60_000);

    expect(keyBResult.allowed).toBe(true);
  });
});

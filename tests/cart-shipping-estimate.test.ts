import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createSupabaseAdminMock } from './helpers/supabaseMock';
import { SHIPPING_FALLBACK_COST } from '@/lib/shipping';

const rateLimitMock = vi.hoisted(() => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, retryAfterSeconds: 0 }),
  getClientIp: vi.fn().mockReturnValue('127.0.0.1'),
}));
vi.mock('@/lib/rateLimit', () => rateLimitMock);

let supabaseMock: ReturnType<typeof createSupabaseAdminMock>;
vi.mock('@/lib/supabaseAdmin', () => ({
  get supabaseAdmin() {
    return supabaseMock;
  },
}));

async function importRoute() {
  const mod = await import('@/app/api/cart/shipping-estimate/route');
  return mod.POST;
}

function makeRequest(body: unknown) {
  return new Request('http://localhost/api/cart/shipping-estimate', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  }) as unknown as import('next/server').NextRequest;
}

describe('POST /api/cart/shipping-estimate', () => {
  beforeEach(() => {
    rateLimitMock.checkRateLimit.mockClear();
    rateLimitMock.checkRateLimit.mockResolvedValue({ allowed: true, retryAfterSeconds: 0 });
    supabaseMock = createSupabaseAdminMock({});
  });

  it('rejects an invalid pincode format', async () => {
    const POST = await importRoute();
    const res = await POST(makeRequest({ pincode: '12345', providerIds: ['prov-1'] }));
    expect(res.status).toBe(400);
  });

  it('rejects an empty providerIds array', async () => {
    const POST = await importRoute();
    const res = await POST(makeRequest({ pincode: '695001', providerIds: [] }));
    expect(res.status).toBe(400);
  });

  it('is rate limited per IP', async () => {
    rateLimitMock.checkRateLimit.mockResolvedValue({ allowed: false, retryAfterSeconds: 42 });
    const POST = await importRoute();
    const res = await POST(makeRequest({ pincode: '695001', providerIds: ['prov-1'] }));
    expect(res.status).toBe(429);
  });

  it('returns the same breakdown shape computeCartShipping produces', async () => {
    supabaseMock = createSupabaseAdminMock({
      providers: [{ data: [{ id: 'prov-1', name: 'Kochi Crafts', pincode: '695005' }], error: null }],
    });
    const POST = await importRoute();
    const res = await POST(makeRequest({ pincode: '695001', providerIds: ['prov-1'] }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.totalShipping).toBe(SHIPPING_FALLBACK_COST);
    expect(json.legs).toHaveLength(1);
    expect(json.legs[0].resolved).toBe(true);
    expect(json.anyUnresolved).toBe(false);
  });

  it('accepts null entries for items with no provider_id', async () => {
    const POST = await importRoute();
    const res = await POST(makeRequest({ pincode: '695001', providerIds: [null] }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.totalShipping).toBe(SHIPPING_FALLBACK_COST);
    expect(json.anyUnresolved).toBe(true);
  });
});

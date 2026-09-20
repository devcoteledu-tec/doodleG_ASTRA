import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { createSupabaseAdminMock } from './helpers/supabaseMock';

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

vi.mock('@/lib/indiaPost', () => ({
  resolvePincodeLocation: vi.fn(async (pincode: string) =>
    pincode === '695001' ? { valid: true, district: 'Thiruvananthapuram', state: 'Kerala' } : { valid: false }
  ),
}));

import { SHIPPING_FALLBACK_COST } from '@/lib/shipping';

async function importRoute() {
  const mod = await import('@/app/api/products/[id]/delivery-check/route');
  return mod.GET;
}

function makeRequest(pincode: string) {
  return new NextRequest(`http://localhost/api/products/prod-1/delivery-check?pincode=${pincode}`);
}

describe('GET /api/products/[id]/delivery-check', () => {
  beforeEach(() => {
    rateLimitMock.checkRateLimit.mockClear();
    rateLimitMock.checkRateLimit.mockResolvedValue({ allowed: true, retryAfterSeconds: 0 });
  });

  it('rejects an invalid pincode format', async () => {
    supabaseMock = createSupabaseAdminMock({});
    const GET = await importRoute();
    const res = await GET(makeRequest('12345'), { params: Promise.resolve({ id: 'prod-1' }) });
    expect(res.status).toBe(400);
  });

  it('returns 404 when the product does not exist', async () => {
    supabaseMock = createSupabaseAdminMock({ catalog_products: [{ data: null, error: null }] });
    const GET = await importRoute();
    const res = await GET(makeRequest('695001'), { params: Promise.resolve({ id: 'prod-1' }) });
    expect(res.status).toBe(404);
  });

  it('returns real district/state and the exact shipping.ts-computed estimate for a resolvable provider', async () => {
    supabaseMock = createSupabaseAdminMock({
      catalog_products: [{ data: { id: 'prod-1', provider_id: 'prov-1' }, error: null }],
      providers: [{ data: [{ id: 'prov-1', name: 'Kochi Crafts', pincode: '695005' }], error: null }],
    });
    const GET = await importRoute();
    const res = await GET(makeRequest('695001'), { params: Promise.resolve({ id: 'prod-1' }) });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.valid).toBe(true);
    expect(json.district).toBe('Thiruvananthapuram');
    expect(json.state).toBe('Kerala');
    expect(json.estimatedShipping).toBe(SHIPPING_FALLBACK_COST); // matches src/lib/shipping.ts exactly
    expect(json.resolved).toBe(true);
  });

  it('falls back to the flat rate and marks unresolved when the product has no provider', async () => {
    supabaseMock = createSupabaseAdminMock({
      catalog_products: [{ data: { id: 'prod-1', provider_id: null }, error: null }],
    });
    const GET = await importRoute();
    const res = await GET(makeRequest('695001'), { params: Promise.resolve({ id: 'prod-1' }) });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.estimatedShipping).toBe(SHIPPING_FALLBACK_COST); // SHIPPING_FALLBACK_COST
    expect(json.resolved).toBe(false);
  });

  it('resolves a real UUID id via the id column (not just slugs)', async () => {
    supabaseMock = createSupabaseAdminMock({
      catalog_products: [{ data: { id: 'c3333333-3333-3333-3333-333333333304', provider_id: 'prov-1' }, error: null }],
      providers: [{ data: [{ id: 'prov-1', name: 'Kochi Crafts', pincode: '695005' }], error: null }],
    });
    const GET = await importRoute();
    const res = await GET(
      new NextRequest('http://localhost/api/products/c3333333-3333-3333-3333-333333333304/delivery-check?pincode=695001'),
      { params: Promise.resolve({ id: 'c3333333-3333-3333-3333-333333333304' }) }
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.estimatedShipping).toBe(SHIPPING_FALLBACK_COST);
  });

  it('is rate limited per IP', async () => {
    rateLimitMock.checkRateLimit.mockResolvedValue({ allowed: false, retryAfterSeconds: 30 });
    supabaseMock = createSupabaseAdminMock({});
    const GET = await importRoute();
    const res = await GET(makeRequest('695001'), { params: Promise.resolve({ id: 'prod-1' }) });
    expect(res.status).toBe(429);
  });
});

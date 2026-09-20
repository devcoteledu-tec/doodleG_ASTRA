import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createSupabaseAdminMock } from './helpers/supabaseMock';

const sessionMock = vi.hoisted(() => ({
  getSessionFromRequest: vi.fn().mockResolvedValue(null),
}));
vi.mock('@/lib/session', () => sessionMock);

let supabaseMock: ReturnType<typeof createSupabaseAdminMock>;
vi.mock('@/lib/supabaseAdmin', () => ({
  get supabaseAdmin() {
    return supabaseMock;
  },
}));

async function importRoute() {
  const mod = await import('@/app/api/checkout/payment-breakdown/route');
  return mod.POST;
}

function makeRequest(body: unknown) {
  return new Request('http://localhost/api/checkout/payment-breakdown', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  }) as unknown as import('next/server').NextRequest;
}

const baseBody = { items: [{ productId: 'p1', quantity: 1 }], couponCode: null, giftWrap: false, zip: '682001' };

describe('POST /api/checkout/payment-breakdown', () => {
  beforeEach(() => {
    sessionMock.getSessionFromRequest.mockClear();
    sessionMock.getSessionFromRequest.mockResolvedValue({ userId: 'user-1' });
  });

  it('rejects an unauthenticated request', async () => {
    sessionMock.getSessionFromRequest.mockResolvedValue(null);
    supabaseMock = createSupabaseAdminMock({});
    const POST = await importRoute();

    const res = await POST(makeRequest(baseBody));
    expect(res.status).toBe(401);
  });

  it('routes a single-provider cart to that provider\'s own UPI ID — not a hardcoded storefront one', async () => {
    supabaseMock = createSupabaseAdminMock({
      catalog_products: [{
        data: [{ id: 'p1', product_name: 'Curated Gift Box', emoji: '🎁', price_in_rupees: 1999, available_qty: 10, provider_id: 'prov-a' }],
        error: null,
      }],
      // First `.from('providers')` call is computeCartShipping's (inside
      // computeServerTrustedPricing); second is computePaymentBreakdown's
      // own lookup for payment_mobile_number. Both hit the same table, so
      // both responses are queued here, FIFO.
      providers: [
        { data: [{ id: 'prov-a', name: 'Petal Workshop', pincode: null }], error: null },
        { data: [{ id: 'prov-a', name: 'Petal Workshop', payment_mobile_number: 'petalworkshop@okaxis' }], error: null },
      ],
    });
    const POST = await importRoute();

    const res = await POST(makeRequest(baseBody));
    expect(res.status).toBe(200);
    const json = await res.json();

    expect(json.legs).toHaveLength(1);
    expect(json.legs[0].providerId).toBe('prov-a');
    expect(json.legs[0].upiId).toBe('petalworkshop@okaxis');
    expect(json.legs[0].amount).toBe(json.total);
    expect(json.payableViaUpi).toBe(true);
    expect(json.hasUnattributedItems).toBe(false);
  });

  it('splits a multi-provider cart so each provider is paid their own share via their own UPI ID, summing exactly to the total', async () => {
    supabaseMock = createSupabaseAdminMock({
      catalog_products: [{
        data: [
          { id: 'p1', product_name: 'Gift Box A', emoji: '🎁', price_in_rupees: 1000, available_qty: 10, provider_id: 'prov-a' },
          { id: 'p2', product_name: 'Gift Box B', emoji: '🎁', price_in_rupees: 2000, available_qty: 10, provider_id: 'prov-b' },
        ],
        error: null,
      }],
      providers: [
        { data: [
          { id: 'prov-a', name: 'Petal Workshop', pincode: null },
          { id: 'prov-b', name: 'Grainwood Craft Co.', pincode: null },
        ], error: null },
        { data: [
          { id: 'prov-a', name: 'Petal Workshop', payment_mobile_number: 'petalworkshop@okaxis' },
          { id: 'prov-b', name: 'Grainwood Craft Co.', payment_mobile_number: 'grainwood@okhdfcbank' },
        ], error: null },
      ],
    });
    const POST = await importRoute();

    const res = await POST(makeRequest({
      ...baseBody,
      items: [{ productId: 'p1', quantity: 1 }, { productId: 'p2', quantity: 1 }],
    }));
    expect(res.status).toBe(200);
    const json = await res.json();

    expect(json.legs).toHaveLength(2);
    const legA = json.legs.find((l: { providerId: string }) => l.providerId === 'prov-a');
    const legB = json.legs.find((l: { providerId: string }) => l.providerId === 'prov-b');
    expect(legA.upiId).toBe('petalworkshop@okaxis');
    expect(legB.upiId).toBe('grainwood@okhdfcbank');
    // Every rupee charged is accounted for across the two providers —
    // nothing goes to a third, uninvolved account.
    const sumOfLegs = json.legs.reduce((sum: number, l: { amount: number }) => sum + l.amount, 0);
    expect(sumOfLegs).toBe(json.total);
    expect(json.payableViaUpi).toBe(true);
  });

  it('blocks UPI checkout (forces COD) when a provider in the cart has not set up a UPI ID yet', async () => {
    supabaseMock = createSupabaseAdminMock({
      catalog_products: [{
        data: [{ id: 'p1', product_name: 'Curated Gift Box', emoji: '🎁', price_in_rupees: 1999, available_qty: 10, provider_id: 'prov-a' }],
        error: null,
      }],
      providers: [
        { data: [{ id: 'prov-a', name: 'Petal Workshop', pincode: null }], error: null },
        // payment_mobile_number is unset — this provider hasn't configured UPI yet.
        { data: [{ id: 'prov-a', name: 'Petal Workshop', payment_mobile_number: null }], error: null },
      ],
    });
    const POST = await importRoute();

    const res = await POST(makeRequest(baseBody));
    expect(res.status).toBe(200);
    const json = await res.json();

    expect(json.legs[0].upiId).toBeNull();
    expect(json.payableViaUpi).toBe(false);
  });

  it('blocks UPI checkout when a cart item has no provider at all (nowhere valid to route the money)', async () => {
    supabaseMock = createSupabaseAdminMock({
      catalog_products: [{
        data: [{ id: 'p1', product_name: 'Legacy Item', emoji: '🎁', price_in_rupees: 999, available_qty: 10, provider_id: null }],
        error: null,
      }],
      providers: [
        { data: [], error: null }, // no providers to look up shipping for
      ],
    });
    const POST = await importRoute();

    const res = await POST(makeRequest(baseBody));
    expect(res.status).toBe(200);
    const json = await res.json();

    expect(json.hasUnattributedItems).toBe(true);
    expect(json.payableViaUpi).toBe(false);
  });
});

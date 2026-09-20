import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createSupabaseAdminMock } from './helpers/supabaseMock';

const sessionMock = vi.hoisted(() => ({
  getSessionFromRequest: vi.fn(),
}));
vi.mock('@/lib/session', () => sessionMock);

let supabaseMock: ReturnType<typeof createSupabaseAdminMock>;
vi.mock('@/lib/supabaseAdmin', () => ({
  get supabaseAdmin() {
    return supabaseMock;
  },
}));

const giftDomainMock = vi.hoisted(() => ({
  fetchGiftCycleWithOwner: vi.fn(),
}));
vi.mock('@/lib/giftDomain', () => giftDomainMock);

async function importRoute() {
  const mod = await import('@/app/api/update-order-tier/route');
  return mod.POST;
}

function makeRequest(body: unknown) {
  return new Request('http://localhost/api/update-order-tier', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  }) as unknown as import('next/server').NextRequest;
}

const baseGiftCycle = {
  id: 'cycle-1',
  status: 'CURATED',
  selected_tier: null,
  custom_card_message: 'Happy birthday, Jamie! — a message written before this tier update.',
  gift_packages: [{ tier: 'LUXURY', title: 'Luxury gift' }],
  occasion: {
    id: 'occasion-1',
    title: 'Birthday',
    occasion_date: '2026-08-01',
    recipient: {
      id: 'recipient-1',
      name: 'Jamie',
      profile: { id: 'profile-1', user_id: 'user-1' },
    },
  },
};

describe('POST /api/update-order-tier', () => {
  beforeEach(() => {
    sessionMock.getSessionFromRequest.mockReset();
    giftDomainMock.fetchGiftCycleWithOwner.mockReset();
  });

  it('returns 401 when there is no session', async () => {
    sessionMock.getSessionFromRequest.mockResolvedValue(null);
    supabaseMock = createSupabaseAdminMock({});
    const POST = await importRoute();

    const res = await POST(makeRequest({ orderId: 'cycle-1', selectedTier: 'GRAND' }));
    expect(res.status).toBe(401);
  });

  it('rejects missing params with 400', async () => {
    sessionMock.getSessionFromRequest.mockResolvedValue({ userId: 'user-1' });
    supabaseMock = createSupabaseAdminMock({});
    const POST = await importRoute();

    const res = await POST(makeRequest({ orderId: '' }));
    expect(res.status).toBe(400);
  });

  it('rejects an unrecognized selectedTier value with 400', async () => {
    sessionMock.getSessionFromRequest.mockResolvedValue({ userId: 'user-1' });
    supabaseMock = createSupabaseAdminMock({});
    const POST = await importRoute();

    const res = await POST(makeRequest({ orderId: 'cycle-1', selectedTier: 'ULTRA' }));
    expect(res.status).toBe(400);
  });

  it('404s when the gift cycle does not exist', async () => {
    sessionMock.getSessionFromRequest.mockResolvedValue({ userId: 'user-1' });
    giftDomainMock.fetchGiftCycleWithOwner.mockResolvedValue(null);
    supabaseMock = createSupabaseAdminMock({});
    const POST = await importRoute();

    const res = await POST(makeRequest({ orderId: 'unknown-cycle', selectedTier: 'GRAND' }));
    expect(res.status).toBe(404);
  });

  it('404s when the gift cycle belongs to a different user', async () => {
    sessionMock.getSessionFromRequest.mockResolvedValue({ userId: 'someone-else' });
    giftDomainMock.fetchGiftCycleWithOwner.mockResolvedValue(baseGiftCycle);
    supabaseMock = createSupabaseAdminMock({});
    const POST = await importRoute();

    const res = await POST(makeRequest({ orderId: 'cycle-1', selectedTier: 'GRAND' }));
    expect(res.status).toBe(404);
  });

  it('merges the new tier without clobbering the existing custom card message', async () => {
    sessionMock.getSessionFromRequest.mockResolvedValue({ userId: 'user-1' });
    giftDomainMock.fetchGiftCycleWithOwner.mockResolvedValue(baseGiftCycle);
    supabaseMock = createSupabaseAdminMock({
      gift_cycles: [{ data: { id: 'cycle-1' }, error: null }], // update
    });
    const POST = await importRoute();

    const res = await POST(makeRequest({ orderId: 'cycle-1', selectedTier: 'LUXURY' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.order.selectedTier).toBe('LUXURY');
    expect(json.order.status).toBe('APPROVED');
    // The pre-existing customCardMessage field must survive the tier update
    // untouched — this route only ever writes selected_tier/status/updated_at,
    // so custom_card_message is never part of the write payload.
    expect(json.order.customCardMessage).toBe(baseGiftCycle.custom_card_message);
  });
});

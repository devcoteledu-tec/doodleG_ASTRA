import { describe, it, expect, vi, beforeEach } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { createSupabaseAdminMock } from './helpers/supabaseMock';

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
  const mod = await import('@/app/api/whatsapp/webhook/route');
  return mod.POST;
}

const AUTH_TOKEN = 'test-twilio-auth-token';
const WEBHOOK_URL = 'https://localhost/api/whatsapp/webhook';

function signTwilioParams(url: string, params: Record<string, string>, authToken: string): string {
  let data = url;
  for (const key of Object.keys(params).sort()) {
    data += key + params[key];
  }
  return crypto.createHmac('sha1', authToken).update(Buffer.from(data, 'utf-8')).digest('base64');
}

function makeTwilioFormRequest(params: Record<string, string>) {
  const signature = signTwilioParams(WEBHOOK_URL, params, AUTH_TOKEN);
  const body = new URLSearchParams(params).toString();
  return new NextRequest(WEBHOOK_URL, {
    method: 'POST',
    body,
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'x-twilio-signature': signature,
      host: 'localhost',
    },
  });
}

function makeJsonSimulatorRequest(payload: Record<string, string>) {
  return new NextRequest(WEBHOOK_URL, {
    method: 'POST',
    body: JSON.stringify(payload),
    headers: { 'Content-Type': 'application/json' },
  });
}

const giftCycleFixture = {
  id: 'cycle-with-dashes_and_underscores-123',
  status: 'CURATED',
  selected_tier: null,
  custom_card_message: null,
  gift_packages: [
    { id: 'pkg-1', gift_cycle_id: 'cycle-with-dashes_and_underscores-123', tier: 'GRAND', title: 'Book Bundle', description: 'Curated reads', estimated_price: 5000, reason: 'Loves books' },
  ],
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

describe('POST /api/whatsapp/webhook — Twilio form-encoded path', () => {
  beforeEach(() => {
    vi.stubEnv('TWILIO_AUTH_TOKEN', AUTH_TOKEN);
    giftDomainMock.fetchGiftCycleWithOwner.mockReset();
    supabaseMock = createSupabaseAdminMock({
      signin: [{ data: { mobile_number: '+919876543210' }, error: null }],
      gift_cycles: [{ data: { id: giftCycleFixture.id }, error: null }],
    });
  });

  it('rejects a request with an invalid Twilio signature', async () => {
    const params = { Body: 'hello', From: 'whatsapp:+919876543210' };
    const badRequest = new NextRequest(WEBHOOK_URL, {
      method: 'POST',
      body: new URLSearchParams(params).toString(),
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'x-twilio-signature': 'not-a-real-signature',
        host: 'localhost',
      },
    });

    const POST = await importRoute();
    const res = await POST(badRequest);
    expect(res.status).toBe(403);
  });

  it('parses an APPROVE_GIFT_{orderId}_{tier} payload whose orderId itself contains dashes and underscores', async () => {
    giftDomainMock.fetchGiftCycleWithOwner.mockResolvedValue(giftCycleFixture);

    const params = {
      Body: `APPROVE_GIFT_${giftCycleFixture.id}_GRAND`,
      From: 'whatsapp:+919876543210',
    };
    const req = makeTwilioFormRequest(params);

    const POST = await importRoute();
    const res = await POST(req);

    expect(res.status).toBe(200);
    // The parsed giftCycleId must be reconstructed *exactly*, including its
    // embedded underscores/dashes, not truncated at the first underscore.
    expect(giftDomainMock.fetchGiftCycleWithOwner).toHaveBeenCalledWith(giftCycleFixture.id);

    // Response is Twilio-flavored TwiML XML.
    const xml = await res.text();
    expect(res.headers.get('content-type')).toContain('application/xml');
    expect(xml).toContain('<Response>');
    expect(xml).toContain('Book Bundle');

    // Order status flips to APPROVED with the chosen tier.
    const updateCallIndex = supabaseMock.fromCalls.indexOf('gift_cycles');
    expect(updateCallIndex).toBeGreaterThanOrEqual(0);
  });

  it('rejects approval from a phone number that does not own the gift cycle', async () => {
    giftDomainMock.fetchGiftCycleWithOwner.mockResolvedValue(giftCycleFixture);
    supabaseMock = createSupabaseAdminMock({
      signin: [{ data: { mobile_number: '+919999999999' }, error: null }], // different owner number
    });

    const params = {
      Body: `APPROVE_GIFT_${giftCycleFixture.id}_GRAND`,
      From: 'whatsapp:+919876543210',
    };
    const req = makeTwilioFormRequest(params);

    const POST = await importRoute();
    const res = await POST(req);
    expect(res.status).toBe(200);
    const xml = await res.text();
    expect(xml).toContain('not authorized');
  });

  it('rejects approval when the account has no mobile_number on file, instead of bypassing the check', async () => {
    giftDomainMock.fetchGiftCycleWithOwner.mockResolvedValue(giftCycleFixture);
    supabaseMock = createSupabaseAdminMock({
      signin: [{ data: { mobile_number: null }, error: null }], // no phone on file for this account
    });

    const params = {
      Body: `APPROVE_GIFT_${giftCycleFixture.id}_GRAND`,
      From: 'whatsapp:+919876543210',
    };
    const req = makeTwilioFormRequest(params);

    const POST = await importRoute();
    const res = await POST(req);
    expect(res.status).toBe(200);
    const xml = await res.text();
    // A missing owner phone number must be treated as "not authorized", not
    // as "skip the check" — previously an empty/falsy normalizedOwner made
    // the whole guard a no-op, letting anyone approve this account's gifts.
    expect(xml).toContain('not authorized');
  });

  it('still matches owner and sender numbers formatted with dashes/parens, not just plain digits', async () => {
    giftDomainMock.fetchGiftCycleWithOwner.mockResolvedValue(giftCycleFixture);
    supabaseMock = createSupabaseAdminMock({
      signin: [{ data: { mobile_number: '+91 (98765)-43210' }, error: null }],
      gift_cycles: [{ data: { id: giftCycleFixture.id }, error: null }],
    });

    const params = {
      Body: `APPROVE_GIFT_${giftCycleFixture.id}_GRAND`,
      From: 'whatsapp:+919876543210',
    };
    const req = makeTwilioFormRequest(params);

    const POST = await importRoute();
    const res = await POST(req);
    expect(res.status).toBe(200);
    const xml = await res.text();
    expect(xml).not.toContain('not authorized');
    expect(xml).toContain('Book Bundle');
  });

  it('replies with the generic help message for a non-approval text', async () => {
    const params = { Body: 'hi there', From: 'whatsapp:+919876543210' };
    const req = makeTwilioFormRequest(params);

    const POST = await importRoute();
    const res = await POST(req);
    expect(res.status).toBe(200);
    const xml = await res.text();
    expect(xml).toContain('doodle_G Concierge');
  });
});

describe('POST /api/whatsapp/webhook — JSON simulator path (dev/dashboard only)', () => {
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'test');
    giftDomainMock.fetchGiftCycleWithOwner.mockReset();
    supabaseMock = createSupabaseAdminMock({
      signin: [{ data: { mobile_number: '+919876543210' }, error: null }],
      gift_cycles: [{ data: { id: giftCycleFixture.id }, error: null }],
    });
  });

  it('parses the APPROVE_GIFT_{orderId}_{tier} payload from a plain JSON body and returns JSON', async () => {
    giftDomainMock.fetchGiftCycleWithOwner.mockResolvedValue(giftCycleFixture);

    const req = makeJsonSimulatorRequest({
      Body: `APPROVE_GIFT_${giftCycleFixture.id}_GRAND`,
      From: '+919876543210',
    });

    const POST = await importRoute();
    const res = await POST(req);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.replyText).toContain('Book Bundle');
    expect(giftDomainMock.fetchGiftCycleWithOwner).toHaveBeenCalledWith(giftCycleFixture.id);
  });

  it('refuses the JSON simulator path in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const req = makeJsonSimulatorRequest({ Body: 'hi', From: '+919876543210' });

    const POST = await importRoute();
    const res = await POST(req);
    expect(res.status).toBe(415);
  });
});

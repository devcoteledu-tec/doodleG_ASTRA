import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from './helpers/mswServer';

// WhatsAppService reads TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_SENDER_NUMBER
// once, as `private static` class fields evaluated at module load time. Each
// test that needs different credential state must reset the module registry
// and re-import fresh, same as the AIService tests.
async function importFreshWhatsAppService() {
  vi.resetModules();
  const mod = await import('@/services/whatsapp');
  return mod.WhatsAppService;
}

const samplePackages = [
  { tier: 'CLASSIC', title: 'Cozy Hiking Kit', description: 'Warm gear for the trail', price: 2500 },
  { tier: 'GRAND', title: 'Book Bundle', description: 'Curated reads', price: 5000 },
];

describe('WhatsAppService.sendCurationPitch — mock fallback (no Twilio credentials)', () => {
  beforeEach(() => {
    vi.stubEnv('TWILIO_ACCOUNT_SID', '');
    vi.stubEnv('TWILIO_AUTH_TOKEN', '');
    vi.stubEnv('NODE_ENV', 'test');
  });

  it('returns a mock success without calling fetch', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const WhatsAppService = await importFreshWhatsAppService();

    const result = await WhatsAppService.sendCurationPitch({
      to: '+919876543210',
      recipientName: 'Jamie',
      occasionTitle: 'Anniversary',
      orderId: 'cycle-1',
      packages: samplePackages,
    });

    expect(result.success).toBe(true);
    expect(result.messageId).toMatch(/^SMmock_/);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('throws in production rather than silently simulating a send', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const WhatsAppService = await importFreshWhatsAppService();

    await expect(
      WhatsAppService.sendCurationPitch({
        to: '+919876543210',
        recipientName: 'Jamie',
        occasionTitle: 'Anniversary',
        orderId: 'cycle-1',
        packages: samplePackages,
      })
    ).rejects.toThrow(/TWILIO/);
  });
});

describe('WhatsAppService.sendCurationPitch — real Twilio path (credentials present)', () => {
  beforeEach(() => {
    vi.stubEnv('TWILIO_ACCOUNT_SID', 'ACtestsid');
    vi.stubEnv('TWILIO_AUTH_TOKEN', 'testtoken');
    vi.stubEnv('TWILIO_SENDER_NUMBER', 'whatsapp:+15551234567');
    vi.stubEnv('NODE_ENV', 'test');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('POSTs the correctly formatted To/From/Body payload to the Twilio Messages endpoint', async () => {
    let capturedAuthHeader: string | null = null;
    let capturedBody: string | undefined;

    server.use(
      http.post('https://api.twilio.com/2010-04-01/Accounts/ACtestsid/Messages.json', async ({ request }) => {
        capturedAuthHeader = request.headers.get('authorization');
        capturedBody = await request.text();
        return HttpResponse.json({ sid: 'SM_real_123' });
      })
    );

    const WhatsAppService = await importFreshWhatsAppService();

    const result = await WhatsAppService.sendCurationPitch({
      to: '+919876543210',
      recipientName: 'Jamie',
      occasionTitle: 'Anniversary',
      orderId: 'cycle-1',
      packages: samplePackages,
    });

    expect(result.success).toBe(true);
    expect(result.messageId).toBe('SM_real_123');

    expect(capturedAuthHeader).toBe('Basic ' + Buffer.from('ACtestsid:testtoken').toString('base64'));

    const sentParams = new URLSearchParams(capturedBody);
    expect(sentParams.get('To')).toBe('whatsapp:+919876543210');
    expect(sentParams.get('From')).toBe('whatsapp:+15551234567');
    expect(sentParams.get('Body')).toContain('CLASSIC');
    expect(sentParams.get('Body')).toContain('Cozy Hiking Kit');
  });

  it('returns success: false (without throwing) when Twilio responds with an error', async () => {
    server.use(
      http.post('https://api.twilio.com/2010-04-01/Accounts/ACtestsid/Messages.json', () =>
        HttpResponse.json({ message: 'Invalid To number' }, { status: 400 })
      )
    );

    const WhatsAppService = await importFreshWhatsAppService();
    const result = await WhatsAppService.sendCurationPitch({
      to: '+919876543210',
      recipientName: 'Jamie',
      occasionTitle: 'Anniversary',
      orderId: 'cycle-1',
      packages: samplePackages,
    });

    expect(result.success).toBe(false);
  });
});

describe('WhatsAppService.sendTextReply', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns true as a mock success when Twilio credentials are missing', async () => {
    vi.stubEnv('TWILIO_ACCOUNT_SID', '');
    vi.stubEnv('TWILIO_AUTH_TOKEN', '');
    vi.stubEnv('NODE_ENV', 'test');
    const WhatsAppService = await importFreshWhatsAppService();

    const result = await WhatsAppService.sendTextReply('+919876543210', 'Order confirmed!');
    expect(result).toBe(true);
  });

  it('sends the correct To/From/Body payload when credentials are present', async () => {
    vi.stubEnv('TWILIO_ACCOUNT_SID', 'ACtestsid');
    vi.stubEnv('TWILIO_AUTH_TOKEN', 'testtoken');
    vi.stubEnv('NODE_ENV', 'test');

    let capturedBody: string | undefined;
    server.use(
      http.post('https://api.twilio.com/2010-04-01/Accounts/ACtestsid/Messages.json', async ({ request }) => {
        capturedBody = await request.text();
        return HttpResponse.json({});
      })
    );

    const WhatsAppService = await importFreshWhatsAppService();
    const result = await WhatsAppService.sendTextReply('+919876543210', 'Order confirmed!');

    expect(result).toBe(true);
    const sentParams = new URLSearchParams(capturedBody);
    expect(sentParams.get('To')).toBe('whatsapp:+919876543210');
    expect(sentParams.get('Body')).toBe('Order confirmed!');
  });
});

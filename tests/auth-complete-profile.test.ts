import { describe, it, expect, vi, beforeEach } from 'vitest';
import { issueAuthFlowToken } from '@/lib/authTokens';
import { createSupabaseAdminMock } from './helpers/supabaseMock';

const sessionMock = vi.hoisted(() => ({
  createSession: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/session', () => sessionMock);

let supabaseMock: ReturnType<typeof createSupabaseAdminMock>;
vi.mock('@/lib/supabaseAdmin', () => ({
  get supabaseAdmin() {
    return supabaseMock;
  },
}));

async function importRoute() {
  const mod = await import('@/app/api/auth/complete-profile/route');
  return mod.POST;
}

function makeRequest(body: unknown) {
  return new Request('http://localhost/api/auth/complete-profile', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  }) as unknown as import('next/server').NextRequest;
}

const USER_ID = '33333333-3333-3333-3333-333333333333';

describe('POST /api/auth/complete-profile', () => {
  beforeEach(() => {
    sessionMock.createSession.mockClear();
  });

  it('rejects a mobile number that is not exactly 10 digits', async () => {
    supabaseMock = createSupabaseAdminMock({});
    const POST = await importRoute();

    const res = await POST(makeRequest({ completionToken: await issueAuthFlowToken(USER_ID, 'google-complete'), mobileNumber: '12345' }));
    expect(res.status).toBe(400);
    expect(sessionMock.createSession).not.toHaveBeenCalled();
  });

  it('returns 404 when the account does not exist', async () => {
    supabaseMock = createSupabaseAdminMock({
      signin: [{ data: null, error: null }],
    });
    const POST = await importRoute();

    const res = await POST(makeRequest({ completionToken: await issueAuthFlowToken(USER_ID, 'google-complete'), mobileNumber: '9876543210' }));
    expect(res.status).toBe(404);
  });

  it('rejects an unverified account with 403', async () => {
    supabaseMock = createSupabaseAdminMock({
      signin: [{ data: { id: USER_ID, user_name: 'sam', email: 'sam@example.com', mobile_number: null, email_verified: false }, error: null }],
    });
    const POST = await importRoute();

    const res = await POST(makeRequest({ completionToken: await issueAuthFlowToken(USER_ID, 'google-complete'), mobileNumber: '9876543210' }));
    expect(res.status).toBe(403);
    expect(sessionMock.createSession).not.toHaveBeenCalled();
  });

  it('saves the mobile number and issues a session', async () => {
    supabaseMock = createSupabaseAdminMock({
      signin: [
        { data: { id: USER_ID, user_name: 'sam', email: 'sam@example.com', mobile_number: null, email_verified: true }, error: null },
        { data: { id: USER_ID, user_name: 'sam', email: 'sam@example.com', mobile_number: '9876543210' }, error: null },
      ],
    });
    const POST = await importRoute();

    const res = await POST(makeRequest({ completionToken: await issueAuthFlowToken(USER_ID, 'google-complete'), mobileNumber: '9876543210' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.user.mobile_number).toBe('9876543210');
    expect(sessionMock.createSession).toHaveBeenCalledWith(USER_ID);
  });

  it('refuses to overwrite an existing mobile number (would let a stolen token hijack the WhatsApp channel)', async () => {
    supabaseMock = createSupabaseAdminMock({
      signin: [{
        data: { id: USER_ID, user_name: 'sam', email: 'sam@example.com', mobile_number: '1111111111', email_verified: true },
        error: null,
      }],
    });
    const POST = await importRoute();

    const res = await POST(makeRequest({
      completionToken: await issueAuthFlowToken(USER_ID, 'google-complete'),
      mobileNumber: '9999999999',
    }));
    expect(res.status).toBe(409);
    expect(sessionMock.createSession).not.toHaveBeenCalled();
  });

  it('rejects a token minted for the wrong purpose with 401', async () => {
    // Defense in depth: a verificationToken (from /signup) must NOT be
    // accepted here — complete-profile only accepts 'google-complete'.
    supabaseMock = createSupabaseAdminMock({});
    const POST = await importRoute();

    const wrongPurposeToken = await issueAuthFlowToken(USER_ID, 'signup-verify');
    const res = await POST(makeRequest({ completionToken: wrongPurposeToken, mobileNumber: '9876543210' }));
    expect(res.status).toBe(401);
    expect(sessionMock.createSession).not.toHaveBeenCalled();
  });

  it('rejects a request with a missing completion token', async () => {
    supabaseMock = createSupabaseAdminMock({});
    const POST = await importRoute();

    const res = await POST(makeRequest({ mobileNumber: '9876543210' }));
    expect(res.status).toBe(400);
    expect(sessionMock.createSession).not.toHaveBeenCalled();
  });
});

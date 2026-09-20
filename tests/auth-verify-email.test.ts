import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createSupabaseAdminMock } from './helpers/supabaseMock';
import { hashOtp } from '@/lib/otp';
import { issueAuthFlowToken } from '@/lib/authTokens';

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
  const mod = await import('@/app/api/auth/verify-email/route');
  return mod.POST;
}

function makeRequest(body: unknown) {
  return new Request('http://localhost/api/auth/verify-email', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  }) as unknown as import('next/server').NextRequest;
}

const USER_ID = '11111111-1111-1111-1111-111111111111';

describe('POST /api/auth/verify-email', () => {
  beforeEach(() => {
    sessionMock.createSession.mockClear();
  });

  it('rejects a malformed code with 400', async () => {
    supabaseMock = createSupabaseAdminMock({});
    const POST = await importRoute();

    const res = await POST(makeRequest({ verificationToken: await issueAuthFlowToken(USER_ID, 'signup-verify'), code: 'abc' }));
    expect(res.status).toBe(400);
  });

  it('rejects the wrong code with 400 and does not create a session', async () => {
    supabaseMock = createSupabaseAdminMock({
      signin: [{
        data: {
          id: USER_ID, user_name: 'sam', email: 'sam@example.com', mobile_number: null,
          email_verified: false, otp_code_hash: hashOtp('123456'), otp_expires_at: new Date(Date.now() + 60_000).toISOString(),
        },
        error: null,
      }],
    });
    const POST = await importRoute();

    const res = await POST(makeRequest({ verificationToken: await issueAuthFlowToken(USER_ID, 'signup-verify'), code: '000000' }));
    expect(res.status).toBe(400);
    expect(sessionMock.createSession).not.toHaveBeenCalled();
  });

  it('rejects an expired code with 410', async () => {
    supabaseMock = createSupabaseAdminMock({
      signin: [{
        data: {
          id: USER_ID, user_name: 'sam', email: 'sam@example.com', mobile_number: null,
          email_verified: false, otp_code_hash: hashOtp('123456'), otp_expires_at: new Date(Date.now() - 60_000).toISOString(),
        },
        error: null,
      }],
    });
    const POST = await importRoute();

    const res = await POST(makeRequest({ verificationToken: await issueAuthFlowToken(USER_ID, 'signup-verify'), code: '123456' }));
    expect(res.status).toBe(410);
  });

  it('verifies the correct code, marks the account verified, and issues a session', async () => {
    supabaseMock = createSupabaseAdminMock({
      signin: [{
        data: {
          id: USER_ID, user_name: 'sam', email: 'sam@example.com', mobile_number: null,
          email_verified: false, otp_code_hash: hashOtp('123456'), otp_expires_at: new Date(Date.now() + 60_000).toISOString(),
        },
        error: null,
      }, { data: { id: USER_ID }, error: null }],
    });
    const POST = await importRoute();

    const res = await POST(makeRequest({ verificationToken: await issueAuthFlowToken(USER_ID, 'signup-verify'), code: '123456' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.user.email_verified).toBe(true);
    expect(sessionMock.createSession).toHaveBeenCalledWith(USER_ID);
  });
  it('rejects replay after the account was verified', async () => {
    supabaseMock = createSupabaseAdminMock({ signin: [{ data: { id: USER_ID, email_verified: true }, error: null }] });
    const POST = await importRoute();
    const res = await POST(makeRequest({ verificationToken: await issueAuthFlowToken(USER_ID, 'signup-verify'), code: '000000' }));
    expect(res.status).toBe(409);
    expect(sessionMock.createSession).not.toHaveBeenCalled();
  });
  it('does not issue a session if verification persistence fails', async () => {
    supabaseMock = createSupabaseAdminMock({ signin: [{ data: { id: USER_ID, email_verified: false, otp_code_hash: hashOtp('123456'), otp_expires_at: new Date(Date.now()+60000).toISOString() }, error: null }, { data: null, error: { message: 'db down' } }] });
    const POST = await importRoute();
    const res = await POST(makeRequest({ verificationToken: await issueAuthFlowToken(USER_ID, 'signup-verify'), code: '123456' }));
    expect(res.status).toBe(409);
    expect(sessionMock.createSession).not.toHaveBeenCalled();
  });

});

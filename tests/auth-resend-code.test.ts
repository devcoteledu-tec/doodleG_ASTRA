import { describe, it, expect, vi, beforeEach } from 'vitest';
import { issueAuthFlowToken } from '@/lib/authTokens';
import { createSupabaseAdminMock } from './helpers/supabaseMock';

const emailMock = vi.hoisted(() => ({
  EmailService: { sendVerificationCode: vi.fn().mockResolvedValue({ success: true, messageId: 'mock_1' }) },
}));
vi.mock('@/services/email', () => emailMock);

let supabaseMock: ReturnType<typeof createSupabaseAdminMock>;
vi.mock('@/lib/supabaseAdmin', () => ({
  get supabaseAdmin() {
    return supabaseMock;
  },
}));

async function importRoute() {
  const mod = await import('@/app/api/auth/resend-code/route');
  return mod.POST;
}

function makeRequest(body: unknown) {
  return new Request('http://localhost/api/auth/resend-code', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  }) as unknown as import('next/server').NextRequest;
}

const USER_ID = '22222222-2222-2222-2222-222222222222';

describe('POST /api/auth/resend-code', () => {
  beforeEach(() => {
    emailMock.EmailService.sendVerificationCode.mockClear();
    emailMock.EmailService.sendVerificationCode.mockResolvedValue({ success: true, messageId: 'mock_1' });
  });

  it('rejects an invalid request with 400', async () => {
    supabaseMock = createSupabaseAdminMock({});
    const POST = await importRoute();

    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
  });

  it('rejects a token minted for the wrong purpose with 401', async () => {
    // Defense in depth: a completionToken (from /google) must NOT be
    // accepted here — resend-code only accepts 'signup-verify' tokens.
    supabaseMock = createSupabaseAdminMock({});
    const POST = await importRoute();

    const wrongPurposeToken = await issueAuthFlowToken(USER_ID, 'google-complete');
    const res = await POST(makeRequest({ verificationToken: wrongPurposeToken }));
    expect(res.status).toBe(401);
  });

  it('returns 404 when the account does not exist', async () => {
    supabaseMock = createSupabaseAdminMock({
      signin: [{ data: null, error: null }],
    });
    const POST = await importRoute();

    const res = await POST(makeRequest({ verificationToken: await issueAuthFlowToken(USER_ID, 'signup-verify') }));
    expect(res.status).toBe(404);
  });

  it('rejects an already-verified account with 409', async () => {
    supabaseMock = createSupabaseAdminMock({
      signin: [{ data: { id: USER_ID, user_name: 'sam', email: 'sam@example.com', email_verified: true }, error: null }],
    });
    const POST = await importRoute();

    const res = await POST(makeRequest({ verificationToken: await issueAuthFlowToken(USER_ID, 'signup-verify') }));
    expect(res.status).toBe(409);
    expect(emailMock.EmailService.sendVerificationCode).not.toHaveBeenCalled();
  });

  it('issues and emails a fresh code for an unverified account', async () => {
    supabaseMock = createSupabaseAdminMock({
      signin: [{ data: { id: USER_ID, user_name: 'sam', email: 'sam@example.com', email_verified: false }, error: null }],
    });
    const POST = await importRoute();

    const res = await POST(makeRequest({ verificationToken: await issueAuthFlowToken(USER_ID, 'signup-verify') }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.sent).toBe(true);
    expect(emailMock.EmailService.sendVerificationCode).toHaveBeenCalledTimes(1);
    expect(emailMock.EmailService.sendVerificationCode).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'sam@example.com' })
    );

    const updatedRow = supabaseMock.fromCalls.includes('signin');
    expect(updatedRow).toBe(true);
  });

  it('returns 502 when the email fails to send', async () => {
    emailMock.EmailService.sendVerificationCode.mockResolvedValueOnce({ success: false });
    supabaseMock = createSupabaseAdminMock({
      signin: [{ data: { id: USER_ID, user_name: 'sam', email: 'sam@example.com', email_verified: false }, error: null }],
    });
    const POST = await importRoute();

    const res = await POST(makeRequest({ verificationToken: await issueAuthFlowToken(USER_ID, 'signup-verify') }));
    expect(res.status).toBe(502);
  });
});

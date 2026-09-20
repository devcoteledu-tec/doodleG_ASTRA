import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createSupabaseAdminMock } from './helpers/supabaseMock';

const sessionMock = vi.hoisted(() => ({
  createSession: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/session', () => sessionMock);

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
  const mod = await import('@/app/api/auth/signup/route');
  return mod.POST;
}

function makeRequest(body: unknown) {
  return new Request('http://localhost/api/auth/signup', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  }) as unknown as import('next/server').NextRequest;
}

const validBody = {
  userName: 'giftgiver01',
  email: 'giftgiver01@example.com',
  mobileNumber: '9876543210',
  pincode: '695001',
  password: 'correct-horse-battery-staple',
};

describe('POST /api/auth/signup', () => {
  beforeEach(() => {
    sessionMock.createSession.mockClear();
    emailMock.EmailService.sendVerificationCode.mockClear();
    emailMock.EmailService.sendVerificationCode.mockResolvedValue({ success: true, messageId: 'mock_1' });
  });

  it('rejects invalid input with 400', async () => {
    supabaseMock = createSupabaseAdminMock({});
    const POST = await importRoute();

    const res = await POST(makeRequest({ userName: 'ab', email: 'not-an-email', password: '123' }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBeTruthy();
  });

  it('rejects missing fields entirely with 400', async () => {
    supabaseMock = createSupabaseAdminMock({});
    const POST = await importRoute();

    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
  });

  it('rejects a password shorter than the minimum length with 400', async () => {
    supabaseMock = createSupabaseAdminMock({});
    const POST = await importRoute();

    const res = await POST(makeRequest({ ...validBody, password: 'short1' }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/password/i);
  });

  it('rejects a mobile number that is not exactly 10 digits', async () => {
    supabaseMock = createSupabaseAdminMock({});
    const POST = await importRoute();

    const res = await POST(makeRequest({ ...validBody, mobileNumber: '12345' }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/mobile/i);
  });

  it('rejects a PIN code that is not a valid 6-digit format', async () => {
    supabaseMock = createSupabaseAdminMock({});
    const POST = await importRoute();

    const res = await POST(makeRequest({ ...validBody, pincode: '012345' })); // starts with 0
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/pin code/i);
  });

  it('rejects a duplicate username with 409', async () => {
    supabaseMock = createSupabaseAdminMock({
      signin: [{ data: { id: 'existing-user' }, error: null }],
    });
    const POST = await importRoute();

    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toMatch(/username/i);
  });

  it('rejects a duplicate email with 409', async () => {
    supabaseMock = createSupabaseAdminMock({
      signin: [
        { data: null, error: null }, // username check: no match
        { data: { id: 'existing-user' }, error: null }, // email check: match
      ],
    });
    const POST = await importRoute();

    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toMatch(/email/i);
  });

  it('creates an unverified account, emails a code, and does NOT issue a session yet', async () => {
    supabaseMock = createSupabaseAdminMock({
      signin: [
        { data: null, error: null }, // username check: no match
        { data: null, error: null }, // email check: no match
        {
          data: {
            id: 'new-user-id',
            user_name: validBody.userName,
            email: validBody.email,
            mobile_number: validBody.mobileNumber,
          },
          error: null,
        }, // insert signin row
      ],
      profile: [{ data: { id: 'new-profile-id' }, error: null }], // insert profile row
    });
    const POST = await importRoute();

    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.needsVerification).toBe(true);
    // Post-fix: signup no longer returns a raw userId. It returns a
    // signed verificationToken bound to the 'signup-verify' purpose.
    // Round-trip it through the verifier to confirm it references the
    // account we just created — that check is what the /verify-email
    // and /resend-code routes now do server-side.
    expect(typeof json.verificationToken).toBe('string');
    expect(json.verificationToken.length).toBeGreaterThan(0);
    expect(json.userId).toBeUndefined();
    const { verifyAuthFlowToken } = await import('@/lib/authTokens');
    const claim = await verifyAuthFlowToken(json.verificationToken, 'signup-verify');
    expect(claim?.userId).toBe('new-user-id');
    expect(json.email).toBe(validBody.email);

    // No session yet — the account is unverified until /api/auth/verify-email succeeds.
    expect(sessionMock.createSession).not.toHaveBeenCalled();
    expect(emailMock.EmailService.sendVerificationCode).toHaveBeenCalledTimes(1);

    // Both the signin row and the auto-created profile row must be written,
    // and the signin row must be created unverified with an OTP hash set.
    expect(supabaseMock.fromCalls).toContain('signin');
    expect(supabaseMock.fromCalls).toContain('profile');
    const insertedSignin = supabaseMock.insertedRows.signin[0] as Record<string, unknown>;
    expect(insertedSignin.email_verified).toBe(false);
    expect(insertedSignin.otp_code_hash).toBeTruthy();
    expect(insertedSignin.otp_expires_at).toBeTruthy();
  });
});

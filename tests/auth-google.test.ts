import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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
  const mod = await import('@/app/api/auth/google/route');
  return mod.POST;
}

function makeRequest(body: unknown) {
  return new Request('http://localhost/api/auth/google', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  }) as unknown as import('next/server').NextRequest;
}

const CLIENT_ID = 'test-client-id.apps.googleusercontent.com';

function mockTokenInfo(payload: Record<string, unknown>, ok = true) {
  global.fetch = vi.fn().mockResolvedValue({
    ok,
    json: () => Promise.resolve(payload),
    text: () => Promise.resolve(''),
  }) as unknown as typeof fetch;
}

describe('POST /api/auth/google', () => {
  const originalClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

  beforeEach(() => {
    sessionMock.createSession.mockClear();
    process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID = CLIENT_ID;
  });

  afterEach(() => {
    process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID = originalClientId;
    vi.restoreAllMocks();
  });

  it('returns 501 when Google sign-in is not configured', async () => {
    delete process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    supabaseMock = createSupabaseAdminMock({});
    const POST = await importRoute();

    const res = await POST(makeRequest({ credential: 'a'.repeat(30) }));
    expect(res.status).toBe(501);
  });

  it('rejects a token whose audience does not match our client id', async () => {
    mockTokenInfo({ aud: 'someone-else', sub: 'sub-1', email: 'a@example.com', email_verified: 'true' });
    supabaseMock = createSupabaseAdminMock({});
    const POST = await importRoute();

    const res = await POST(makeRequest({ credential: 'a'.repeat(30) }));
    expect(res.status).toBe(401);
    expect(sessionMock.createSession).not.toHaveBeenCalled();
  });

  it('rejects an unverified Google email', async () => {
    mockTokenInfo({ aud: CLIENT_ID, sub: 'sub-1', email: 'a@example.com', email_verified: 'false' });
    supabaseMock = createSupabaseAdminMock({});
    const POST = await importRoute();

    const res = await POST(makeRequest({ credential: 'a'.repeat(30) }));
    expect(res.status).toBe(401);
  });

  it('logs an existing account (with a mobile number already on file) straight in', async () => {
    mockTokenInfo({ aud: CLIENT_ID, sub: 'sub-1', email: 'a@example.com', email_verified: 'true', name: 'Alex' });
    supabaseMock = createSupabaseAdminMock({
      signin: [{ data: { id: 'user-1', user_name: 'alex', email: 'a@example.com', mobile_number: '9876543210' }, error: null }],
    });
    const POST = await importRoute();

    const res = await POST(makeRequest({ credential: 'a'.repeat(30) }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.user.id).toBe('user-1');
    expect(sessionMock.createSession).toHaveBeenCalledWith('user-1');
  });

  it('asks an existing google_sub account with no mobile number on file to complete their profile', async () => {
    mockTokenInfo({ aud: CLIENT_ID, sub: 'sub-1', email: 'a@example.com', email_verified: 'true', name: 'Alex' });
    supabaseMock = createSupabaseAdminMock({
      signin: [{ data: { id: 'user-1', user_name: 'alex', email: 'a@example.com', mobile_number: null }, error: null }],
    });
    const POST = await importRoute();

    const res = await POST(makeRequest({ credential: 'a'.repeat(30) }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.needsMobileNumber).toBe(true);
    // Post-fix: /google returns a signed completionToken instead of a
    // raw userId. Round-trip through the verifier to confirm identity.
    expect(json.userId).toBeUndefined();
    expect(typeof json.completionToken).toBe('string');
    const { verifyAuthFlowToken: verify1 } = await import('@/lib/authTokens');
    const claim1 = await verify1(json.completionToken, 'google-complete');
    expect(claim1?.userId).toBe('user-1');
    expect(sessionMock.createSession).not.toHaveBeenCalled();
  });

  it('creates a brand new account for a first-time Google sign-in and asks for a mobile number, without issuing a session yet', async () => {
    mockTokenInfo({ aud: CLIENT_ID, sub: 'sub-2', email: 'newbie@example.com', email_verified: 'true', name: 'New Bee' });
    supabaseMock = createSupabaseAdminMock({
      signin: [
        { data: null, error: null }, // lookup by google_sub: not found
        { data: null, error: null }, // lookup by email: not found
        { data: null, error: null }, // generateUniqueUsername availability check
        {
          data: { id: 'new-user-id', user_name: 'newbee', email: 'newbie@example.com', mobile_number: null },
          error: null,
        }, // insert signin row
      ],
      profile: [{ data: { id: 'new-profile-id' }, error: null }],
    });
    const POST = await importRoute();

    const res = await POST(makeRequest({ credential: 'a'.repeat(30) }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.needsMobileNumber).toBe(true);
    expect(json.userId).toBeUndefined();
    expect(typeof json.completionToken).toBe('string');
    const { verifyAuthFlowToken: verify2 } = await import('@/lib/authTokens');
    const claim2 = await verify2(json.completionToken, 'google-complete');
    expect(claim2?.userId).toBe('new-user-id');
    expect(json.email).toBe('newbie@example.com');
    // No session yet — /api/auth/complete-profile issues it once the mobile
    // number is supplied.
    expect(sessionMock.createSession).not.toHaveBeenCalled();
    expect(supabaseMock.fromCalls).toContain('profile');
  });

  it('wipes password_hash when linking Google to an unverified byEmail account (email-squatter mitigation)', async () => {
    // Scenario: attacker previously signed up with victim@example.com,
    // set their own password, never confirmed the OTP. The row is
    // email_verified=false but has a password_hash. When the real
    // victim now signs in with Google, the byEmail branch would
    // historically flip email_verified=true and leave the attacker's
    // password intact — allowing signin with the attacker's password.
    //
    // The fix must NULL out password_hash on that specific row before
    // linking so the attacker's password stops working.
    mockTokenInfo({ aud: CLIENT_ID, sub: 'sub-victim', email: 'squatted@example.com', email_verified: 'true', name: 'Victim' });
    supabaseMock = createSupabaseAdminMock({
      signin: [
        { data: null, error: null }, // lookup by google_sub: not found
        {
          // lookup by email: FOUND — but unverified, with a password on file (the squatter's)
          data: {
            id: 'squatted-user-id',
            user_name: 'squatter',
            email: 'squatted@example.com',
            mobile_number: null,
            email_verified: false,
            password_hash: '$2a$12$squatter.bcrypt.hash.here.......................',
          },
          error: null,
        },
      ],
    });
    const POST = await importRoute();

    const res = await POST(makeRequest({ credential: 'a'.repeat(30) }));
    expect(res.status).toBe(200);

    // The update call must have wiped the password and demoted the account
    // to google-only.
    const updatePayload = supabaseMock.lastUpdatePayload;
    expect(updatePayload).toBeDefined();
    expect(updatePayload).toMatchObject({
      google_sub: 'sub-victim',
      email_verified: true,
      password_hash: null,
      auth_provider: 'google',
    });
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import bcrypt from 'bcryptjs';
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
  const mod = await import('@/app/api/auth/signin/route');
  return mod.POST;
}

function makeRequest(body: unknown) {
  return new Request('http://localhost/api/auth/signin', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  }) as unknown as import('next/server').NextRequest;
}

describe('POST /api/auth/signin', () => {
  beforeEach(() => {
    sessionMock.createSession.mockClear();
  });

  it('rejects an empty payload with 400', async () => {
    supabaseMock = createSupabaseAdminMock({});
    const POST = await importRoute();

    const res = await POST(makeRequest({ userName: '', password: '' }));
    expect(res.status).toBe(400);
  });

  it('returns 401 for a username that does not exist', async () => {
    supabaseMock = createSupabaseAdminMock({
      signin: [{ data: null, error: null }],
    });
    const POST = await importRoute();

    const res = await POST(makeRequest({ userName: 'nobody', password: 'whatever123' }));
    expect(res.status).toBe(401);
    expect(sessionMock.createSession).not.toHaveBeenCalled();
  });

  it('returns 401 for a wrong password', async () => {
    const passwordHash = await bcrypt.hash('correct-password', 12);
    supabaseMock = createSupabaseAdminMock({
      signin: [
        {
          data: { id: 'user-1', user_name: 'alex', email: 'alex@example.com', mobile_number: null, password_hash: passwordHash, email_verified: true },
          error: null,
        },
      ],
    });
    const POST = await importRoute();

    const res = await POST(makeRequest({ userName: 'alex', password: 'totally-wrong' }));
    expect(res.status).toBe(401);
    expect(sessionMock.createSession).not.toHaveBeenCalled();
  });

  it('signs in successfully with the correct password when the email is verified', async () => {
    const passwordHash = await bcrypt.hash('correct-password', 12);
    supabaseMock = createSupabaseAdminMock({
      signin: [
        {
          data: { id: 'user-1', user_name: 'alex', email: 'alex@example.com', mobile_number: '+919876543210', password_hash: passwordHash, email_verified: true },
          error: null,
        },
      ],
    });
    const POST = await importRoute();

    const res = await POST(makeRequest({ userName: 'alex', password: 'correct-password' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.user.user_name).toBe('alex');
    expect(sessionMock.createSession).toHaveBeenCalledWith('user-1');
  });

  it('blocks sign-in for a correct password on an unverified account, without issuing a session', async () => {
    const passwordHash = await bcrypt.hash('correct-password', 12);
    supabaseMock = createSupabaseAdminMock({
      signin: [
        {
          data: { id: 'user-2', user_name: 'sam', email: 'sam@example.com', mobile_number: null, password_hash: passwordHash, email_verified: false },
          error: null,
        },
      ],
    });
    const POST = await importRoute();

    const res = await POST(makeRequest({ userName: 'sam', password: 'correct-password' }));
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.needsVerification).toBe(true);
    expect(typeof json.verificationToken).toBe('string');
    expect(json.userId).toBeUndefined();
    const { verifyAuthFlowToken } = await import('@/lib/authTokens');
    const claim = await verifyAuthFlowToken(json.verificationToken, 'signup-verify');
    expect(claim?.userId).toBe('user-2');
    expect(json.email).toBe('sam@example.com');
    expect(sessionMock.createSession).not.toHaveBeenCalled();
  });
});

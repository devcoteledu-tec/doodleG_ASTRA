'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

export interface AuthUser {
  id: string;
  user_name: string;
  email: string;
  mobile_number?: string;
  email_verified?: boolean;
}

/** Returned by signUp / signIn / verifyEmail / resendCode / googleSignIn so
 * the /auth page can drive its step machine (form → OTP → success).
 *
 * SECURITY: this shape used to carry a raw `userId`. It now carries a
 * signed `verificationToken` (post-signup / post-signin-needs-verify) or
 * `completionToken` (post-google / needs-mobile) instead. See
 * src/lib/authTokens.ts for the rationale — the short version is that
 * the previous scheme let anyone act as any user whose UUID they knew,
 * because the API routes trusted whatever `userId` the browser echoed
 * back. Tokens are opaque to the client; treat them as bearer secrets. */
export interface AuthActionResult {
  error?: string;
  needsVerification?: boolean;
  needsMobileNumber?: boolean;
  verificationToken?: string;
  completionToken?: string;
  email?: string;
  name?: string;
}

interface AuthContextType {
  user: AuthUser | null;
  loading: boolean;
  signUp: (params: { userName: string; email: string; mobileNumber: string; pincode: string; password: string }) => Promise<AuthActionResult>;
  signIn: (params: { userName: string; password: string }) => Promise<AuthActionResult>;
  verifyEmail: (params: { verificationToken: string; code: string }) => Promise<AuthActionResult>;
  resendCode: (params: { verificationToken: string }) => Promise<AuthActionResult>;
  googleSignIn: (credential: string) => Promise<AuthActionResult>;
  completeProfile: (params: { completionToken: string; mobileNumber: string }) => Promise<AuthActionResult>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  // Rehydrate the session by asking the server to verify the httpOnly
  // session cookie — the client never stores or trusts its own auth state.
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/auth/me');
        const data = await res.json();
        setUser(data.user ?? null);
      } catch {
        setUser(null);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const signUp = useCallback(async ({
    userName, email, mobileNumber, pincode, password,
  }: { userName: string; email: string; mobileNumber: string; pincode: string; password: string }): Promise<AuthActionResult> => {
    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userName, email, mobileNumber, pincode, password }),
      });
      const data = await res.json();
      if (!res.ok && !data.needsVerification) return { error: data.error || 'Sign-up failed.' };
      if (data.needsVerification) {
        return {
          needsVerification: true,
          verificationToken: data.verificationToken,
          email: data.email,
          error: data.error,
        };
      }
      setUser(data.user);
      return {};
    } catch {
      return { error: 'Network error. Please try again.' };
    }
  }, []);

  const signIn = useCallback(async ({
    userName, password,
  }: { userName: string; password: string }): Promise<AuthActionResult> => {
    try {
      const res = await fetch('/api/auth/signin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userName, password }),
      });
      const data = await res.json();
      if (data.needsVerification) {
        return {
          needsVerification: true,
          verificationToken: data.verificationToken,
          email: data.email,
          error: data.error,
        };
      }
      if (!res.ok || data.error) return { error: data.error || 'Sign-in failed.' };
      setUser(data.user);
      return {};
    } catch {
      return { error: 'Network error. Please try again.' };
    }
  }, []);

  const verifyEmail = useCallback(async ({
    verificationToken, code,
  }: { verificationToken: string; code: string }): Promise<AuthActionResult> => {
    try {
      const res = await fetch('/api/auth/verify-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ verificationToken, code }),
      });
      const data = await res.json();
      if (!res.ok || data.error) return { error: data.error || 'Verification failed.' };
      setUser(data.user);
      return {};
    } catch {
      return { error: 'Network error. Please try again.' };
    }
  }, []);

  const resendCode = useCallback(async ({
    verificationToken,
  }: { verificationToken: string }): Promise<AuthActionResult> => {
    try {
      const res = await fetch('/api/auth/resend-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ verificationToken }),
      });
      const data = await res.json();
      if (!res.ok || data.error) return { error: data.error || 'Could not resend code.' };
      return {};
    } catch {
      return { error: 'Network error. Please try again.' };
    }
  }, []);

  const googleSignIn = useCallback(async (credential: string): Promise<AuthActionResult> => {
    try {
      const res = await fetch('/api/auth/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential }),
      });
      const data = await res.json();
      if (data.needsMobileNumber) {
        return {
          needsMobileNumber: true,
          completionToken: data.completionToken,
          email: data.email,
          name: data.name,
        };
      }
      if (!res.ok || data.error) return { error: data.error || 'Google sign-in failed.' };
      setUser(data.user);
      return {};
    } catch {
      return { error: 'Network error. Please try again.' };
    }
  }, []);

  const completeProfile = useCallback(async ({
    completionToken, mobileNumber,
  }: { completionToken: string; mobileNumber: string }): Promise<AuthActionResult> => {
    try {
      const res = await fetch('/api/auth/complete-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completionToken, mobileNumber }),
      });
      const data = await res.json();
      if (!res.ok || data.error) return { error: data.error || 'Could not save your mobile number.' };
      setUser(data.user);
      return {};
    } catch {
      return { error: 'Network error. Please try again.' };
    }
  }, []);

  const signOut = useCallback(async () => {
    setUser(null);
    try {
      await fetch('/api/auth/signout', { method: 'POST' });
    } catch {
      // Cookie may already be gone; nothing more to do client-side.
    }
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, signUp, signIn, verifyEmail, resendCode, googleSignIn, completeProfile, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

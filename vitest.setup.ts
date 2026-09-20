/// <reference types="node" />
import '@testing-library/jest-dom/vitest';
import { beforeAll, afterEach, afterAll } from 'vitest';
import { server } from './tests/helpers/mswServer';

// Ensure src/lib/env.ts's alwaysRequiredSchema (and supabaseAdmin's client
// construction) has valid-looking values during tests, regardless of what's
// in the developer's local shell. Individual test files that need to
// exercise specific env states (e.g. "GEMINI_API_KEY missing") override
// these with vi.stubEnv() in their own beforeEach/it blocks.
if (!process.env.NODE_ENV) {
  // NODE_ENV is typed read-only by Next.js's type augmentation; Vitest sets
  // it to 'test' itself in practice, but this keeps the fallback honest.
  Object.defineProperty(process.env, 'NODE_ENV', { value: 'test', writable: true });
}
process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://test-project.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'test-anon-key';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-service-role-key';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'a'.repeat(32);

// ── MSW lifecycle: start with no handlers (so any un-mocked outbound call
//    fails loudly instead of hitting the real network), reset per-test
//    handlers added via server.use() after every test, and shut down after
//    the whole run. ──
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

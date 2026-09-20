import { setupServer } from 'msw/node';

/**
 * A single MSW server shared across the whole suite. Individual test files
 * add request handlers scoped to what they need via `server.use(...)` in a
 * `beforeEach`/`it`, and `vitest.setup.ts` resets handlers between tests and
 * closes the server after the run — see that file for the lifecycle hooks.
 */
export const server = setupServer();

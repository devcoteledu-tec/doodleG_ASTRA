# Verification record

Environment: Node 24.19.0, local Linux workspace. No live database or customer integrations were used.

| Check | Result |
|---|---|
| `npm ci` | Passed with the repaired lockfile; 601 packages installed |
| `npm run typecheck` | Passed |
| `npm run lint` | Passed with zero warnings |
| `npm run test:coverage` | 176 tests passed across 29 files |
| Scoped line coverage | 80.08% |
| Scoped statement coverage | 75.89% |
| Scoped branch coverage | 69.70% |
| Scoped function coverage | 71.26% |
| `npm run test:database` | Passed against local PGlite PostgreSQL |
| `npm run build` | Passed, including new orders/gifts/recovery/support routes |

Database assertions cover clean migration application, repair-migration reruns, service-role privileges, profile creation, payment replay and amount rejection, one-time stock deduction, captured-payment stock rollback, manual-review persistence after restock, terminal refunded attempts, custom-hamper idempotency/conflicts, anonymous access denial, catalog-priced onboarding/rollback, overlapping dispatch claims, one-time versus annual events and leap-day behavior.

The test named `razorpay-webhook.test.ts` validates the webhook boundary with mocked finalization; it is not a live E2E test. PGlite assertions test transactional behavior locally, not distributed load or production Supabase configuration. Coverage excludes much of the UI and some API routes; the percentages are not whole-project percentages.

The production build uses Next.js 16.2.12. Next reports that the legacy `middleware.ts` convention should migrate to `proxy.ts` in a future cleanup; the current build succeeds with it. npm reports deprecations in transitive tooling; no claim of a vulnerability-free dependency audit is made. Git-hook installation now skips source archives without a git worktree.

Not run: real processor charges/refunds, real Twilio/Resend/Google delivery, browser/device accessibility or visual QA, production load tests, live migration or deployment. Complete the staging checklist in `MANUAL_UPGRADE.md` before launch.

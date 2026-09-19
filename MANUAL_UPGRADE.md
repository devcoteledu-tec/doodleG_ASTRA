# Apply this upgrade manually

The patch ZIP contains complete replacement files under `files/`, preserving their exact project-relative paths. `CHANGE_MANIFEST.csv` lists every add/replace/delete and SHA-256 checksum. `CHANGES.md` lists paths in readable form. The full-source ZIP is an alternative starting point; it contains the same upgraded project without dependencies, build output or secrets.

## 1. Preserve your current installation

Back up your source and database. Keep your real `.env.local` outside the archive. If you have edited files since the uploaded ZIP, compare the replacement with your current file before copying it. These changes are based on `Doodle_G-main (26).zip`, not on an unseen repository revision.

The original upload is unchanged. There is no git push, deployment, real payment or outbound customer message in this work.

## 2. Copy the code

Open `CHANGES.md` or `CHANGE_MANIFEST.csv` in the patch archive. For each `ADD` or `REPLACE`, copy `files/<path>` to `<your-project>/<path>`, replacing the whole file. Apply entries marked `DELETE`; the old misleading `tests/e2e-gift-lifecycle.test.ts` is replaced by `tests/razorpay-webhook.test.ts`.

Copy **both** `package.json` and `package-lock.json`. Preserve `.env.local`; merge the newly documented variables from `.env.example` into it. Do not copy `node_modules`, `.next` or old coverage results.

## 3. Apply the database changes first, in staging

Choose one:

- **Existing database with the supplied base schema and migrations through 030:** apply `database/upgrade.sql` using the Supabase SQL editor. It bundles 031–037 in order, includes prerequisite checks, and does not delete customer data. If earlier schema is missing, apply the matching earlier migrations deliberately; do not guess from the numbering.
- **New, empty Supabase project:** apply `database/bootstrap.sql` once. It includes the base schema and applicable migrations, omitting destructive cleanup 002 and demo seeds 026/028. Add your actual products/providers afterward.

Do not run the bootstrap against an existing database. Unknown production views, enum types, duplicate slugs or manual schema changes may require adjustment: the live database was not available for inspection. Test the upgrade against a recent staging copy. The local database regression suite verifies the supplied schema and repeated repair migrations, not every possible deployed schema.

Notable changes: private profile access; new catalog view; profile creation trigger; onboarding RPC v2; planned occasions; checkout attempts; order idempotency/payment fields; dispatch claims; custom-hamper idempotency. Anonymous browser access to private tables is revoked. Any separate client querying those tables directly must use authenticated application routes instead.

## 4. Configure integrations

Use Node 24, matching `.nvmrc` and CI. Configure `.env.example`, especially:

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Database access; keep service key server-only |
| `SESSION_SECRET` | At least 32 random characters |
| `NEXT_PUBLIC_RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` | Matching test or live Razorpay credentials |
| `RAZORPAY_WEBHOOK_SECRET` | Strong separate secret for `/api/razorpay/webhook` |
| `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `SUPPORT_EMAIL` | Verified email sender and a monitored support inbox |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_SENDER_NUMBER` | Approved WhatsApp sender |
| `TWILIO_CONTENT_SID`, `TWILIO_WEBHOOK_URL` | Approved content template and exact public inbound webhook URL |
| `CRON_SECRET` | Bearer secret for both cron endpoints |
| `SHIPPING_FLAT_RATE_RUPEES` | Merchant charge per provider parcel; defaults to ₹40, capped at ₹800 total |
| `NEXT_PUBLIC_SITE_URL` | Your actual canonical domain |
| `GEMINI_API_KEY` | Optional AI ranking/card writing; catalog ranking works without it |

Production startup rejects missing required integration settings. Development may simulate email verification and WhatsApp delivery, but the support form never pretends to send. Existing sessions and in-progress auth-flow tokens will be invalidated by the stronger token claims; users must sign in again.

## 5. Install and verify

```sh
npm ci
npm run verify
npm run dev
```

`verify` runs typecheck, lint, scoped coverage, local PostgreSQL regressions and the production build. It requires no live service calls. Run with a staging database/configuration when testing the actual application.

## 6. Staging acceptance before live traffic

- Email signup, invalid/expired/replayed verification, resend, Google login if enabled, profile completion and sign-out.
- COD order and double-click/retry; custom hamper retry; unavailable stock; invalid size; mixed online/COD amounts.
- Razorpay test payment; close the tab after payment; reopen `/orders` or recovery; retry the same webhook; verify one order and one stock deduction. Configure captured-payment events and automatic capture appropriately for your account.
- A captured payment with insufficient stock must show `needs_review`; follow the refund/support runbook instead of charging again.
- Create a gift occasion within 14 days, run the protected cron, inspect a real approved-template delivery, approve as the owner and reject a different account/phone. Run cron again and confirm no duplicate send.
- Submit a support request and confirm it reaches the actual inbox; an email API receipt alone does not prove inbox delivery.
- Check mobile layout, keyboard navigation, checkout focus, Razorpay CSP behavior, real product imagery, policies and delivery promises.

## 7. Release and operate

Deploy only after staging acceptance. Set up the signed Razorpay webhook, the inbound Twilio URL and both scheduled jobs as described in `DEPLOYMENT.md`. A working build alone is not a production launch gate. Monitor paid attempts requiring review and uncertain message sends daily.

For application rollback, restore the prior source and retain the additive database tables/columns. Do not drop checkout-attempt records or payment identifiers. Stop new traffic/cron if necessary and reconcile captured payments first. Restoring a database backup can lose newer orders; it is not a routine code rollback.

# doodle_G

A Next.js gifting storefront with custom hampers, recipient/occasion planning and catalog-based gift recommendations. Purchases and gift preferences are separate: approving a suggestion does not charge a customer or arrange delivery.

This repository contains the complete application at its root. Run npm commands here; there is no `files/` application subdirectory. The original patch-upload layout has been restored to a full source tree. Your separately uploaded globe image is preserved as `public/uploaded-globe.webp`.

Start with **MANUAL_UPGRADE.md** for the database and integration configuration. **PROJECT_REVIEW.md** describes the review, remaining risks and score. **DEPLOYMENT.md** covers production operations.

## Local setup

Use Node 24 (the included `.nvmrc`); the installed development tools require at least Node 22.22.1.

```sh
npm ci
cp .env.example .env.local
# Fill in your own development credentials; never commit .env.local.
npm run dev
```

For an empty Supabase project, apply `database/bootstrap.sql`. For an existing project with the supplied schema through migration 030, follow the upgrade guide and apply `database/upgrade.sql`. Do not run both. Neither bundle seeds fake products.

## Verification

```sh
npm run verify
```

This runs TypeScript, ESLint with zero warnings, Vitest with coverage, a local PostgreSQL regression suite using PGlite, and a production build. Unit tests mock external services; MSW rejects unexpected network calls. The database suite executes SQL locally under real PostgreSQL semantics, including service-role and anonymous-role checks. It does not connect to your Supabase project.

Coverage is scoped explicitly in `vitest.config.ts`. It is not whole-project coverage. CI enforces 75% lines, 70% statements and 65% branches/functions over that scope. Live Razorpay, Twilio, email, Google sign-in and browser checkout still require staging acceptance.

## Main routes

| Route | Purpose |
|---|---|
| `/shop`, `/shop/[id]` | Catalog and product details |
| `/tailoring` | Build a custom hamper; COD checkout |
| `/cart` | Server-priced COD, online or mixed checkout |
| `/orders` | Signed-in purchase history |
| `/checkout/recover` | Resume/check a saved browser checkout |
| `/gifts` | Review and approve gift preferences |
| `/my-profile` | Profile and optional gift-personalization sharing |
| `/support` | FAQ and email-backed contact form |

Use `.env.example` as the configuration reference. Public environment variables are compiled into browser assets, so changes require a rebuild.

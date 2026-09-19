# Exact replacement paths

Paths are relative to your project root. All ADD/REPLACE files are complete files in `files/`. Do not paste them into unrelated files.

Read `MANUAL_UPGRADE.md` before copying code or running SQL. Preserve your `.env.local`.

## ADD (35)

- `.nvmrc`
- `MANUAL_UPGRADE.md`
- `PROJECT_REVIEW.md`
- `VERIFICATION.md`
- `database/bootstrap.sql`
- `database/upgrade.sql`
- `public/og-default.png`
- `scripts/install-hooks.mjs`
- `scripts/test-database.mjs`
- `src/app/api/checkout/status/route.ts`
- `src/app/api/cron/payments/route.ts`
- `src/app/api/razorpay/webhook/route.ts`
- `src/app/api/support/route.ts`
- `src/app/checkout/recover/RecoveryClient.tsx`
- `src/app/checkout/recover/page.tsx`
- `src/app/error.tsx`
- `src/app/gifts/GiftsClient.tsx`
- `src/app/gifts/page.tsx`
- `src/app/orders/OrdersClient.tsx`
- `src/app/orders/page.tsx`
- `src/lib/checkout.ts`
- `src/lib/checkoutSchema.ts`
- `src/lib/cronAuth.ts`
- `src/lib/phone.ts`
- `src/lib/razorpayBrowser.ts`
- `src/lib/sessionToken.ts`
- `supabase_migration_034_integrity_and_privacy.sql`
- `supabase_migration_035_checkout_recovery.sql`
- `supabase_migration_036_gift_dispatch.sql`
- `supabase_migration_037_custom_order_retries.sql`
- `tests/checkout-finalize.test.ts`
- `tests/order-pricing.test.ts`
- `tests/razorpay-webhook.test.ts`
- `tests/session-security.test.ts`
- `tests/support.test.ts`

## REPLACE (77)

- `.env.example`
- `.github/workflows/ci.yml`
- `ARCHITECTURE.md`
- `DEPLOYMENT.md`
- `README.md`
- `instrumentation.ts`
- `middleware.ts`
- `package-lock.json`
- `package.json`
- `scripts/test-gift-cycle-approval-loop.ts`
- `src/app/api/auth/complete-profile/route.ts`
- `src/app/api/auth/google/route.ts`
- `src/app/api/auth/resend-code/route.ts`
- `src/app/api/auth/signup/route.ts`
- `src/app/api/auth/verify-email/route.ts`
- `src/app/api/card-writer/route.ts`
- `src/app/api/checkout/razorpay-order/route.ts`
- `src/app/api/cron/route.ts`
- `src/app/api/curate/route.ts`
- `src/app/api/customization-orders/route.ts`
- `src/app/api/db-onboard/route.ts`
- `src/app/api/my-profile/route.ts`
- `src/app/api/orders/route.ts`
- `src/app/api/plan-for-later/route.ts`
- `src/app/api/products/[id]/delivery-check/route.ts`
- `src/app/api/products/[id]/route.ts`
- `src/app/api/products/route.ts`
- `src/app/api/providers/[id]/route.ts`
- `src/app/api/providers/route.ts`
- `src/app/api/update-order-tier/route.ts`
- `src/app/api/whatsapp/webhook/route.ts`
- `src/app/cart/CartPageClient.tsx`
- `src/app/my-profile/MyProfilePageClient.tsx`
- `src/app/shop/ShopPageClient.tsx`
- `src/app/shop/[id]/page.tsx`
- `src/app/sitemap.ts`
- `src/app/support/SupportPageClient.tsx`
- `src/app/support/page.tsx`
- `src/app/tailoring/TailoringPageClient.tsx`
- `src/lib/CartContext.tsx`
- `src/lib/authTokens.ts`
- `src/lib/env.ts`
- `src/lib/errors.ts`
- `src/lib/fetchProductsServer.ts`
- `src/lib/fetchProvidersServer.ts`
- `src/lib/giftDomain.ts`
- `src/lib/giftMatching.ts`
- `src/lib/orderPricing.ts`
- `src/lib/otp.ts`
- `src/lib/paymentPlan.ts`
- `src/lib/rateLimit.ts`
- `src/lib/session.ts`
- `src/lib/shipping.ts`
- `src/services/ai.ts`
- `src/services/email.ts`
- `src/services/whatsapp.ts`
- `supabase_migration_003_add_providers.sql`
- `supabase_migration_009_recipient_budget_tier_enum.sql`
- `supabase_migration_023_customization_products.sql`
- `supabase_schema.sql`
- `tests/auth-verify-email.test.ts`
- `tests/cart-shipping-estimate.test.ts`
- `tests/cron.test.ts`
- `tests/delivery-check.test.ts`
- `tests/helpers/supabaseMock.ts`
- `tests/orders-razorpay.test.ts`
- `tests/orders.test.ts`
- `tests/payment-breakdown.test.ts`
- `tests/rateLimit.test.ts`
- `tests/razorpay-order.test.ts`
- `tests/shipping.test.ts`
- `tests/update-order-tier.test.ts`
- `tests/whatsapp-service.test.ts`
- `tests/whatsapp-webhook.test.ts`
- `vercel.json`
- `vitest.config.ts`
- `vitest.setup.ts`

## DELETE (1)

- `tests/e2e-gift-lifecycle.test.ts`


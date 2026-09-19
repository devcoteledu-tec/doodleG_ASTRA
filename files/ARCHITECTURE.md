# Architecture

Next.js 16 App Router + React 19 + TypeScript. PostgreSQL/Supabase is the only persistence layer. Browser clients use session-checked application routes; `supabaseAdmin` stays server-side and uses the service role. Application authorization is required even where database RLS exists.

## Domains and trust boundaries

| Domain | Tables | Key behavior |
|---|---|---|
| Accounts | `signin`, `profile`, `follows` | Email verification and Google login; sessions require their own JWT purpose, issuer and audience. Auth-flow tokens cannot serve as sessions. |
| Catalog | `products_box`, `catalog_products`, `providers` | The catalog view preserves an existing active-products view where present. New installs expose active products only. |
| Purchases | `orders`, `order_items`, `order_shipping` | Server prices, transactional stock deduction, unique user/request and payment references. |
| Online checkout | `checkout_attempts` | Persisted priced payload before payment starts. Browser callback, signed webhook and reconciliation all share finalization. |
| Custom hampers | `order_customization` and child tables | Server pricing, COD only, atomic insert and idempotency wrapper. |
| Gift planning | `recipients`, `occasions`, `gift_cycles`, `gift_packages`, `planned_occasions` | Preferences and recurring occasion plans; not purchases or subscriptions. |
| Notifications | Dispatch columns on `gift_cycles` | Database claim, catalog curation, approved Twilio template, recorded receipt/uncertainty. |

## Checkout

1. A signed-in browser sends product IDs, quantities, delivery details and an idempotency UUID.
2. The server reads product availability/prices and calculates a merchant shipping tariff, discounts and online/COD portions.
3. Online checkout persists that snapshot, creates a Razorpay order and stores its ID before exposing it to the browser.
4. Confirmation re-fetches the payment and checks captured status, INR, exact amount, provider order and owner where applicable.
5. `finalize_checkout` locks the attempt and creates the order through an idempotent transaction. Duplicate callbacks return the original order. Failed stock/order creation preserves the captured payment as `needs_review`.

Stock is deducted at order creation, not reserved while the payment modal is open. A paid order can therefore require support/refund review. No automated refund or inventory reservation is claimed. Attempts without a saved Razorpay ID require operator inspection before resetting. Recovery storage is browser-session scoped; payments still reconcile server-side if it is lost.

## Gift dispatch

`claim_due_gifts` creates/claims one cycle per occasion occurrence within the next 14 days. Recurring occasions advance annually; one-time occasions do not. February 29 is observed on March 1 in non-leap years. New cycles use real, active, in-stock catalog products. The AI may rank those candidates; missing AI never creates imaginary catalog items.

Pre-send failures back off for an hour. A send whose outcome is uncertain enters `needs_review`; a process dying after entering `sending` requires operator inspection. Automatic retry is deliberately avoided in those cases because the provider may already have accepted the message. This is durable dispatch, not a claim of exactly-once external delivery.

Twilio replies verify the signature and account phone. The `/gifts` page checks session ownership. Approval saves a preference only. Fulfillment is a separate checkout and operational process.

## Known boundaries

There is no full merchant fulfillment/refund dashboard, carrier booking integration, verified WhatsApp-number enrollment or comprehensive browser E2E suite. Account deletion/retention workflows, accessibility, large-catalog pagination and load testing need further work. Do not treat generated types or mocked service tests as proof of live integration correctness.

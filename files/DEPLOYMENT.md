# Deployment and operations

Use Node 24. Build with `npm run build`; start with `npm start` on a Node host. This project needs server routes and cannot be hosted as static HTML. Apply the database bundle and environment configuration in `MANUAL_UPGRADE.md` before application rollout.

## Payment delivery and recovery

Configure Razorpay to send signed `payment.captured` and/or `order.paid` events to `https://YOUR_DOMAIN/api/razorpay/webhook`, using `RAZORPAY_WEBHOOK_SECRET`. The route validates the raw-body HMAC then re-fetches the payment. Invalid signatures fail; transient processing failures return 503 so delivery can retry. Do not use the API key secret as a substitute for the configured webhook secret.

`GET /api/cron/payments` reconciles up to five pending attempts per run, oldest checked first. Both cron endpoints require `Authorization: Bearer <CRON_SECRET>`. `vercel.json` requests a 15-minute schedule; verify that your host/plan supports this frequency. Otherwise use an external scheduler that supplies that header. Do not disable authentication to accommodate a scheduler.

Useful operator query (run privately with administrative access):

```sql
SELECT id, user_id, razorpay_order_id, payment_id, state, order_id,
       expected_paise, last_error, updated_at
FROM checkout_attempts
WHERE state = 'needs_review'
   OR (state = 'pending' AND created_at < now() - interval '30 minutes')
ORDER BY updated_at;
```

For `needs_review`, compare the payment with Razorpay and inspect the stock/order failure. This state deliberately blocks automatic re-finalization, even on repeated webhooks. To fulfill after resolving the issue, a trusted operator must confirm no refund is in progress, return the attempt to `pending`, and invoke reconciliation. To refund, issue the refund through Razorpay, verify it with the processor and mark the attempt `refunded`; never return a refunded attempt to `pending`. `refunded` is terminal for SQL finalization. There is no automated refund or operator UI in this release. Keep an audit record of each administrative resolution.

If an attempt lacks a stored Razorpay order ID, inspect the processor receipt `dg_<attempt UUID>` before clearing/restarting it. Creation might have succeeded before the database update failed. Never tell a customer to pay again simply because a browser callback failed.

## WhatsApp templates and dispatch

Create and obtain approval for a WhatsApp content template. The service sends `ContentSid` plus variables:

| Variable | Value |
|---|---|
| `1` | Recipient name |
| `2` | Occasion title |
| `3` | Available package summary |
| `4` | Gift cycle UUID |

Use a URL action pointing at `https://YOUR_DOMAIN/gifts?cycle={{4}}`. The gifts page verifies the signed-in owner and lists their gift cycles. For reply buttons, the inbound parser also supports `APPROVE_GIFT_<cycle UUID>_<CLASSIC|GRAND|LUXURY>` in `ButtonPayload` or message text; configure templates and payloads consistently.

Set `TWILIO_WEBHOOK_URL` to the exact externally visible inbound URL, including any query string, and configure Twilio to POST there. Signature validation depends on that exact URL. Follow [Twilio’s content-template sending documentation](https://www.twilio.com/docs/content/send-templates-created-with-the-content-template-builder). Send only to customers enrolled in your messaging program; phone ownership/consent verification needs a full production enrollment workflow.

```sql
SELECT id, occasion_id, occurrence_date, dispatch_state,
       dispatch_claimed_at, notification_message_id, dispatch_error
FROM gift_cycles
WHERE dispatch_state = 'needs_review'
   OR (dispatch_state = 'sending' AND dispatch_claimed_at < now() - interval '15 minutes');
```

Inspect Twilio before retrying uncertain sends. If delivered, mark the record sent with the provider receipt; if definitely not sent, reset it for retry. Never bulk-reset all sending/review rows: this can duplicate notifications. The database claim prevents simultaneous normal dispatch, but an external provider cannot be included in the PostgreSQL transaction.

## Operational launch requirements

Verify live email delivery, real inventory/provider fulfillment, shipping charges, support staffing and actual product policies. Add error alerts and database backups, and test restoration. Keep secrets out of logs and browser code. Configure retention and deletion procedures for addresses, recipient notes and checkout payloads. Review analytics configuration and consent needs for your actual deployment.

The payment and messaging integrations have bounded fetches where supported; processor SDK calls and live network failure modes still require staging/load verification. High-volume queue throughput, carrier booking, refunds and merchant administration remain outside this patch’s verified scope.

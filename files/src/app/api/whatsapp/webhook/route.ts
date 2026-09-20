import { normalizeIndianPhone } from '@/lib/phone';
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { fetchGiftCycleWithOwner } from '@/lib/giftDomain';

/**
 * Validates an inbound Twilio webhook request using Twilio's signature scheme:
 * base64(HMAC-SHA1(authToken, url + sorted(paramKey + paramValue))) must equal
 * the X-Twilio-Signature header. See:
 * https://www.twilio.com/docs/usage/security#validating-requests
 */
function verifyTwilioSignature(
  url: string,
  params: Record<string, string>,
  signature: string | null,
  authToken: string
): boolean {
  if (!signature || !authToken) return false;

  let data = url;
  for (const key of Object.keys(params).sort()) {
    data += key + params[key];
  }

  const expected = crypto.createHmac('sha1', authToken).update(Buffer.from(data, 'utf-8')).digest('base64');

  const expectedBuf = Buffer.from(expected);
  const signatureBuf = Buffer.from(signature);
  if (expectedBuf.length !== signatureBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, signatureBuf);
}

export async function POST(req: NextRequest) {
  try {
    let bodyText = '';
    let senderPhone = '';
    let isTwilioForm = false;

    const contentType = req.headers.get('content-type') || '';

    if (contentType.includes('application/x-www-form-urlencoded')) {
      isTwilioForm = true;
      const formData = await req.formData();
      const formParams: Record<string, string> = {};
      formData.forEach((value, key) => {
        formParams[key] = String(value);
      });
      bodyText = formParams['ButtonPayload'] || formParams['Body'] || '';
      senderPhone = formParams['From'] || '';

      // ── Verify this really came from Twilio before doing anything else ──
      const authToken = process.env.TWILIO_AUTH_TOKEN || '';
      const signature = req.headers.get('x-twilio-signature');
      const proto = req.headers.get('x-forwarded-proto') || 'https';
      const host = req.headers.get('x-forwarded-host') || req.headers.get('host') || '';
      const fullUrl = process.env.TWILIO_WEBHOOK_URL || `${proto}://${host}${req.nextUrl.pathname}${req.nextUrl.search}`;

      if (!authToken || !verifyTwilioSignature(fullUrl, formParams, signature, authToken)) {
        console.warn('Rejected WhatsApp webhook: invalid or missing Twilio signature.');
        return NextResponse.json({ error: 'Invalid signature.' }, { status: 403 });
      }
    } else {
      // JSON path is only for the local dashboard simulator — it can't carry a
      // Twilio signature, so never treat it as a trusted inbound message outside dev.
      if (process.env.NODE_ENV === 'production') {
        return NextResponse.json({ error: 'Unsupported content type.' }, { status: 415 });
      }
      const json = await req.json().catch(() => ({}));
      bodyText = json.Body || json.body || '';
      senderPhone = json.From || json.from || '';
    }



    // Parse button reply payload: APPROVE_GIFT_[giftCycleId]_[tier]
    if (bodyText.startsWith('APPROVE_GIFT_')) {
      const parts = bodyText.split('_');
      const tier = parts[parts.length - 1] as 'CLASSIC' | 'GRAND' | 'LUXURY';
      const giftCycleId = parts.slice(2, parts.length - 1).join('_');

      if (!giftCycleId || !['CLASSIC', 'GRAND', 'LUXURY'].includes(tier)) {
        return createResponse('❌ Failed to process approval. Invalid payload structure.', isTwilioForm);
      }

      // giftCycleId is a gift_cycles.id — the same id dashboard, cron, and
      // update-order-tier all use as "orderId", so this lookup always
      // resolves to the row the button was generated for.
      const giftCycle = await fetchGiftCycleWithOwner(giftCycleId);

      if (!giftCycle || !giftCycle.occasion?.recipient) {
        return createResponse('❌ Order record not found.', isTwilioForm);
      }

      const recipient = giftCycle.occasion.recipient;

      // Only the phone number this gift concerns may approve it over WhatsApp.
      const { data: ownerSignin } = await supabaseAdmin
        .from('signin')
        .select('mobile_number')
        .eq('id', recipient.profile?.user_id || '')
        .maybeSingle();

      const ownerPhone = ownerSignin?.mobile_number;
      // Strip the 'whatsapp:' prefix and any formatting characters (spaces,
      // dashes, parens) from both sides before comparing, so e.g.
      // "+91 98765-43210" and "whatsapp:+919876543210" are recognized as the
      // same number.
      const normalizePhone = (value: string) =>
        normalizeIndianPhone(value);
      const normalizedSender = normalizePhone(senderPhone);
      const normalizedOwner = normalizePhone(ownerPhone || '');
      // A missing owner phone number (no mobile_number on file) must REJECT
      // the approval, not silently skip the check — previously this branch
      // only fired when both numbers were present, so an account with no
      // phone on file let *anyone* approve its gifts over WhatsApp.
      if (!normalizedOwner || !normalizedSender || normalizedOwner !== normalizedSender) {
        console.warn('Rejected gift approval: owner mismatch.');
        return createResponse('❌ You are not authorized to approve this order.', isTwilioForm);
      }

      const selectedPackage = giftCycle.gift_packages.find((p) => p.tier === tier);
      if (!selectedPackage || giftCycle.status === 'COMPLETED') return createResponse('This gift selection is no longer available.', isTwilioForm);
      const packageName = selectedPackage ? selectedPackage.title : `${tier} Package`;
      const price = selectedPackage ? Number(selectedPackage.estimated_price) : 0;

      const { data: updated, error: updateErr } = await supabaseAdmin
        .from('gift_cycles')
        .update({
          selected_tier: tier,
          status: 'APPROVED',
          updated_at: new Date().toISOString(),
        })
        .eq('id', giftCycleId).in('status', ['CURATED', 'APPROVED']).select('id').maybeSingle();

      if (updateErr || !updated) {
        console.error('Failed to persist gift approval:', updateErr);
        return createResponse('❌ Failed to save your approval. Please try again.', isTwilioForm);
      }

      const replyText = `✅ *Gift preference saved!*\n\nYou chose the *${tier}* option: "${packageName}" (₹${price.toFixed(0)}) for *${recipient.name}*.\n\nThis saves your preference only. No payment, stock reservation, purchase or delivery booking has been made. Visit your gift dashboard to review your selection.`;

      return createResponse(replyText, isTwilioForm);
    }

    // Default response for simple texts or other keywords
    const helpReply = `👋 Welcome to doodle_G Concierge!\n\nThis channel processes automated curation approvals. Visit your Relationship Hub to manage your calendar.`;
    return createResponse(helpReply, isTwilioForm);
  } catch (error) {
    console.error('Webhook error:', error);
    return NextResponse.json({ error: 'Failed to process WhatsApp response webhook.' }, { status: 500 });
  }
}

/** Generates appropriate response format (XML TwiML for Twilio, or JSON for the dashboard simulator). */
function createResponse(text: string, isTwilioForm: boolean) {
  if (isTwilioForm) {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<Response>\n    <Message>${escapeXml(text)}</Message>\n</Response>`;
    return new NextResponse(xml, { headers: { 'Content-Type': 'application/xml' } });
  }
  return NextResponse.json({ success: true, replyText: text });
}

function escapeXml(unsafe: string) {
  return unsafe.replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '\'': return '&apos;';
      case '"': return '&quot;';
      default: return c;
    }
  });
}

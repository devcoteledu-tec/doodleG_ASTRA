import { createHash } from 'node:crypto';
import { checkRateLimit } from '@/lib/rateLimit';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getSessionFromRequest } from '@/lib/session';
import { computeCartShipping } from '@/lib/shipping';
import { resolvePincodeLocation } from '@/lib/indiaPost';
import { getErrorMessage } from '@/lib/errors';

// Same posture as src/app/api/orders/route.ts's shippingSchema — every
// field is mandatory, and zip is specifically a 6-digit Indian PIN code
// (not a free-form postal code), validated server-side rather than trusted
// from whatever the client sent.
const shippingSchema = z.object({
  name: z.string().trim().min(1, 'Full name is required').max(200),
  email: z.string().trim().email('Valid email is required').max(200),
  phone: z.string().trim().min(1, 'Phone number is required').max(30),
  address: z.string().trim().min(1, 'Street address is required').max(500),
  city: z.string().trim().min(1, 'City is required').max(200),
  zip: z.string().trim().regex(/^[1-9][0-9]{5}$/, 'Enter a valid 6-digit PIN code.'),
  country: z.string().trim().min(1).max(100).optional(),
});

// ── Price-integrity note (mirrors /api/orders exactly) ──
// The client sends *which* customization_products it wants and *how many*
// — never a price, name, or slot count. Every one of those is re-derived
// from the customization_products table in computeServerTrustedPricing()
// below, so editing the outgoing request in devtools cannot change what
// gets charged or what the order records as having been bought.
const itemSchema = z.object({
  productId: z.string().uuid('Invalid product.'),
  quantity: z.coerce.number().int().positive().max(50, 'Quantity per item is limited to 50.'),
});

const orderSchema = z.object({
  shipping: shippingSchema,
  items: z.array(itemSchema).min(1, 'Your hamper is empty.').max(100, 'Too many distinct items in one hamper.'),
  // Optional — there's no provider-selection UI on /tailoring yet. When
  // omitted, shipping falls back to the flat rate (see
  // computeCartShipping's "unattributed" leg) rather than blocking checkout.
  providerId: z.string().uuid('Invalid provider.').nullable().optional(),
  paymentMethod: z.literal('Cash on Delivery').optional(),
  idempotencyKey: z.string().uuid(),
});

interface PricedCustomizationItem {
  productId: string;
  productName: string;
  productEmoji: string;
  category: string;
  slots: number;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

interface ServerPricing {
  items: PricedCustomizationItem[];
  subtotal: number;
  totalSlots: number;
  shippingCost: number;
  shippingUnresolved: boolean;
  total: number;
}

/**
 * Re-derives every money amount, product name, and slot count for the
 * order from customization_products — never from the request body. Throws
 * a plain Error with a user-facing message on any problem; the caller
 * turns that into a 400.
 */
async function computeServerTrustedPricing(
  rawItems: { productId: string; quantity: number }[],
  providerId: string | null,
  buyerPincode: string
): Promise<ServerPricing> {
  const productIds = Array.from(new Set(rawItems.map(i => i.productId)));

  const { data: products, error: productsErr } = await supabaseAdmin
    .from('customization_products')
    .select('id, product_name, emoji, category, price_in_rupees, slots, is_active')
    .in('id', productIds);

  if (productsErr) throw productsErr;

  const productMap = new Map((products || []).map(p => [String(p.id), p]));

  const items: PricedCustomizationItem[] = rawItems.map(raw => {
    const product = productMap.get(raw.productId);
    if (!product || !product.is_active) {
      throw new Error('One of the items in your hamper is no longer available.');
    }

    const unitPrice = Number(product.price_in_rupees);
    if (!Number.isFinite(unitPrice) || unitPrice <= 0) throw new Error('This product cannot be ordered.');
    const slots = Number(product.slots) || 1;
    return {
      productId: String(product.id),
      productName: product.product_name,
      productEmoji: product.emoji || '🎁',
      category: product.category,
      slots,
      quantity: raw.quantity,
      unitPrice,
      lineTotal: unitPrice * raw.quantity,
    };
  });

  const subtotal = items.reduce((sum, i) => sum + i.lineTotal, 0);
  const totalSlots = items.reduce((sum, i) => sum + i.slots * i.quantity, 0);

  // A tailored hamper ships as one parcel from one provider — reuse the
  // same configured per-provider shipping the main shop cart uses (see
  // src/lib/shipping.ts), just with a single-element provider list instead
  // of one entry per cart item. No provider selected → the "unattributed"
  // flat-rate leg, not free shipping.
  const { totalShipping, anyUnresolved } = await computeCartShipping(buyerPincode, [providerId]);

  const total = subtotal + totalShipping;

  return { items, subtotal, totalSlots, shippingCost: totalShipping, shippingUnresolved: anyUnresolved, total };
}

export async function POST(req: NextRequest) {
  try {
    // Placing an order always requires a session — same rule and same
    // double enforcement as /api/orders: middleware.ts blocks unauthenticated
    // requests to this prefix before they ever reach this handler, and this
    // check re-enforces it independently in case that config ever drifts.
    // Unlike '/cart', '/tailoring' itself is intentionally public (so
    // building a hamper never requires signing in) — only this checkout
    // call is gated, which is why the frontend checks auth state itself
    // before calling this route rather than relying solely on the redirect.
    const session = await getSessionFromRequest(req);
    if (!session) {
      return NextResponse.json({ error: 'Sign in to place an order.' }, { status: 401 });
    }
    const userId = session.userId;
    const limit = await checkRateLimit(`custom-order:${userId}`, 30, 600000);
    if (!limit.allowed) return NextResponse.json({ error: 'Please try again shortly.' }, { status: 429 });

    const json = await req.json().catch(() => null);
    const parsed = orderSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || 'Invalid order payload.' },
        { status: 400 }
      );
    }
    const body = parsed.data;
    const requestHash = createHash('sha256').update(JSON.stringify(body)).digest('hex');
    const { data: existing, error: existingError } = await supabaseAdmin.from('order_customization')
      .select('id,order_number,checkout_request_hash,total_amount').eq('user_id',userId).eq('idempotency_key',body.idempotencyKey).maybeSingle();
    if (existingError) throw existingError;
    if (existing) {
      if (existing.checkout_request_hash !== requestHash) return NextResponse.json({ error: 'Checkout has changed. Start a new checkout.' }, { status: 409 });
      return NextResponse.json({success:true,orderId:existing.id,orderNumber:existing.order_number,total:existing.total_amount});
    }

    // If a provider was supplied, confirm it actually exists before doing
    // any further work — a bad id would otherwise only surface as an
    // opaque foreign-key error out of the RPC call further down.
    if (body.providerId) {
      const { data: provider, error: providerErr } = await supabaseAdmin
        .from('providers')
        .select('id')
        .eq('id', body.providerId)
        .maybeSingle();
      if (providerErr) throw providerErr;
      if (!provider) {
        return NextResponse.json({ error: 'Selected provider is no longer available.' }, { status: 400 });
      }
    }

    // ── Recompute every money amount, product name, and slot count from
    //    the database. Nothing past this point that ends up in the order
    //    comes from the request body except quantities and shipping
    //    contact details. ──
    let pricing: ServerPricing;
    try {
      pricing = await computeServerTrustedPricing(body.items, body.providerId ?? null, body.shipping.zip);
    } catch (pricingErr) {
      return NextResponse.json({ error: getErrorMessage(pricingErr, 'Unable to price this hamper.') }, { status: 400 });
    }

    // ── Insert the whole order atomically via create_customization_order_atomic.
    //    Master row + items + shipping all commit or roll back together —
    //    see supabase_migration_029_order_customization.sql. ──
    const itemsJson = pricing.items.map(item => ({
      product_id: item.productId,
      product_name: item.productName,
      product_emoji: item.productEmoji,
      category: item.category,
      slots: item.slots,
      quantity: item.quantity,
      unit_price: item.unitPrice,
    }));

    // Resolved server-side from the PIN via the live India Post API, never
    // trusted from the client — same convention as /api/orders. Non-blocking:
    // if the lookup is slow/down, these just stay null.
    const resolvedLocation = await resolvePincodeLocation(body.shipping.zip);
    const shippingJson = {
      full_name: body.shipping.name,
      email: body.shipping.email,
      phone: body.shipping.phone,
      street_address: body.shipping.address,
      city: body.shipping.city,
      zip_code: body.shipping.zip,
      country: body.shipping.country || 'India',
      gpo_name: resolvedLocation?.valid ? resolvedLocation.offices?.[0] ?? null : null,
      district: resolvedLocation?.valid ? resolvedLocation.district ?? null : null,
      state: resolvedLocation?.valid ? resolvedLocation.state ?? null : null,
    };

    const { data: rpcResult, error: rpcErr } = await supabaseAdmin.rpc('create_customization_order_safe', {
      p_idempotency_key: body.idempotencyKey,
      p_request_hash: requestHash,
      p_user_id: userId,
      p_provider_id: body.providerId ?? null,
      p_subtotal: pricing.subtotal,
      p_shipping_cost: pricing.shippingCost,
      p_total_amount: pricing.total,
      p_total_slots: pricing.totalSlots,
      p_items: itemsJson,
      p_shipping: shippingJson,
    });

    if (rpcErr) {
      console.error('[customization-orders] Atomic order RPC failed:', rpcErr);
      return NextResponse.json({ error: 'Failed to create order.' }, { status: 500 });
    }

    // RPC returns TABLE(order_id uuid, order_number text) — surfaced as an
    // array of one row.
    const row = Array.isArray(rpcResult) ? rpcResult[0] : rpcResult;
    if (!row?.order_id) {
      console.error('[customization-orders] Atomic order RPC returned no row:', rpcResult);
      return NextResponse.json({ error: 'Failed to create order.' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      orderId: row.order_id,
      orderNumber: row.order_number,
      subtotal: pricing.subtotal,
      shippingCost: pricing.shippingCost,
      total: pricing.total,
      shippingUnresolved: pricing.shippingUnresolved,
    });
  } catch (err) {
    console.error('[customization-orders] Unexpected error:', err);
    return NextResponse.json({ error: 'Unexpected error.' }, { status: 500 });
  }
}

// ── GET: fetch customization orders for the signed-in caller only ──
export async function GET(req: NextRequest) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: orders, error } = await supabaseAdmin
      .from('order_customization')
      .select(`
        id, order_number, status, subtotal, shipping_cost, total_amount, total_slots, payment_method, placed_at,
        order_customization_items ( product_id, product_name, product_emoji, category, slots, quantity, unit_price, line_total ),
        order_customization_shipping ( full_name, email, phone, street_address, city, zip_code, country, tracking_number, estimated_delivery )
      `)
      .eq('user_id', session.userId)
      .order('placed_at', { ascending: false });

    if (error) {
      console.error('[customization-orders] GET failed:', error);
      return NextResponse.json({ error: 'Failed to fetch orders.' }, { status: 500 });
    }

    return NextResponse.json({ orders });
  } catch (err) {
    console.error('[customization-orders] GET unexpected error:', err);
    return NextResponse.json({ error: 'An unexpected error occurred.' }, { status: 500 });
  }
}

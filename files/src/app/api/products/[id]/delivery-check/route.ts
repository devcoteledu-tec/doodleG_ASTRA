import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';
import { resolvePincodeLocation } from '@/lib/indiaPost';
import { computeCartShipping } from '@/lib/shipping';

// Powers the "Check delivery to your PIN" widget on the product detail
// page. Deliberately reuses computeCartShipping — the exact function the
// cart and order routes charge from — with a single-item list, so the
// number shown here always matches what checkout would actually charge for
// this one product. Never reimplement the shipping formula a second time.
const PINCODE_REGEX = /^[1-9][0-9]{5}$/;
// The [id] segment can be a real UUID OR a slug (see
// src/app/api/products/[id]/route.ts, which this mirrors) — product pages
// are commonly linked to by slug, so this route must resolve both the same
// way that one does, or a perfectly valid slug-addressed product looks
// like "not found" here even though the main detail fetch worked fine.
function isUUID(str: string) {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
}

const IP_LIMIT = 30;
const IP_WINDOW_MS = 10 * 60 * 1000;

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    const ip = getClientIp(req.headers);
    const { allowed, retryAfterSeconds } = await checkRateLimit(`delivery-check:ip:${ip}`, IP_LIMIT, IP_WINDOW_MS);
    if (!allowed) {
      return NextResponse.json(
        { error: 'Too many checks. Please slow down and try again.' },
        { status: 429, headers: { 'Retry-After': String(retryAfterSeconds) } }
      );
    }

    const pincode = req.nextUrl.searchParams.get('pincode')?.trim() || '';
    if (!PINCODE_REGEX.test(pincode)) {
      return NextResponse.json({ error: 'Enter a valid 6-digit PIN code.' }, { status: 400 });
    }

    const { data: product, error } = isUUID(id)
      ? await supabaseAdmin.from('catalog_products').select('id, provider_id').eq('id', id).maybeSingle()
      : await supabaseAdmin.from('catalog_products').select('id, provider_id').eq('slug', id).maybeSingle();

    if (error) {
      console.error('delivery-check product lookup error:', error);
      return NextResponse.json({ error: 'Something went wrong looking up this product.' }, { status: 500 });
    }
    if (!product) {
      return NextResponse.json({ error: 'Product not found.' }, { status: 404 });
    }

    const [location, shipping] = await Promise.all([
      resolvePincodeLocation(pincode),
      computeCartShipping(pincode, [product.provider_id ?? null]),
    ]);

    return NextResponse.json({
      valid: location?.valid ?? null, // null = couldn't verify (upstream down), not the same as false
      district: location?.valid ? location.district : null,
      state: location?.valid ? location.state : null,
      estimatedShipping: shipping.totalShipping,
      resolved: !shipping.anyUnresolved,
    });
  } catch (err) {
    console.error('delivery-check route error:', err);
    return NextResponse.json({ error: 'An unexpected error occurred.' }, { status: 500 });
  }
}

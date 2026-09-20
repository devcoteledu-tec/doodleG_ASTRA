import { NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabaseAdmin';
import { getErrorMessage } from '@/lib/errors';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';

// Public, unauthenticated catalog-read endpoint for the /tailoring hamper
// builder — same posture as GET /api/products, including the per-IP
// throttle (see that route for the full rationale).
const IP_LIMIT = 60;
const IP_WINDOW_MS = 5 * 60 * 1000;

export async function GET(req: Request) {
  try {
    const ip = getClientIp(req.headers);
    const { allowed, retryAfterSeconds } = await checkRateLimit(
      `customization-products-list:ip:${ip}`,
      IP_LIMIT,
      IP_WINDOW_MS
    );
    if (!allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again shortly.' },
        { status: 429, headers: { 'Retry-After': String(retryAfterSeconds) } }
      );
    }

    // Only rows an admin has marked active are ever shown on the tailoring
    // page — see supabase_migration_023_customization_products.sql.
    const { data: products, error } = await supabase
      .from('customization_products')
      .select('*')
      .eq('is_active', true)
      .order('category', { ascending: true })
      .order('display_order', { ascending: true });

    if (error) throw error;

    return NextResponse.json({ products });
  } catch (error: unknown) {
    console.error('Error in GET /api/customization-products:', error);
    return NextResponse.json(
      { error: getErrorMessage(error, 'Failed to fetch customization products') },
      { status: 500 }
    );
  }
}

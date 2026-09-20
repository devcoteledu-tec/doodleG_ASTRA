import { NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabaseAdmin';
import { getErrorMessage } from '@/lib/errors';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';

// Public, unauthenticated, catalog-scan endpoint — no session gate would
// stop an attacker from turning it into a DB-flooding vector. Per-IP
// throttle keeps a single client from hammering it. 60 requests / 5min is
// several orders of magnitude above genuine UI traffic (each shop page
// makes one call, cached client-side afterwards) but low enough to blunt
// script-driven scrapers / accidental infinite retry loops.
const IP_LIMIT = 60;
const IP_WINDOW_MS = 5 * 60 * 1000;

export async function GET(req: Request) {
  try {
    const ip = getClientIp(req.headers);
    const { allowed, retryAfterSeconds } = await checkRateLimit(`products-list:ip:${ip}`, IP_LIMIT, IP_WINDOW_MS);
    if (!allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again shortly.' },
        { status: 429, headers: { 'Retry-After': String(retryAfterSeconds) } }
      );
    }

    // 1. Fetch products from Supabase
    const { data: products, error } = await supabase
      .from('catalog_products')
      .select('*')
      .order('date_of_listed', { ascending: false });

    if (error) throw error;



    return NextResponse.json({ products });
  } catch (error: unknown) {
    console.error('Error in GET /api/products:', error);
    return NextResponse.json({ error: getErrorMessage(error, 'Failed to fetch products') }, { status: 500 });
  }
}

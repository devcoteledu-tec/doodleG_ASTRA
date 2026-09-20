import { NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabaseAdmin';

// Serves the three ad slots used by the home page's mobile feed:
//   hero        -> ads_hero_banner  (single big banner)
//   autoScroll  -> ads_auto_scroll  (auto-advances every 5s on the client)
//   scrollBoxes -> ads_scroll_boxes (uniform, hand-scrollable tiles)
//
// Each slot is fetched and fails independently. This used to be one
// Promise.all with a single try/catch that threw on any one slot's error —
// so a single missing or renamed table (e.g. ads_hero_banner being dropped)
// silently wiped out the other two perfectly-fine slots as well, since the
// whole handler fell into the catch-all "return all empty" branch. A
// missing ad table is expected/decorative and shouldn't take down ad slots
// that have nothing wrong with them.
async function fetchAdSlot(table: string) {
  try {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .eq('is_active', true)
      .order('display_order', { ascending: true });
    if (error) throw error;
    return data ?? [];
  } catch (error) {
    console.error(`Error fetching ad slot "${table}":`, error);
    return [];
  }
}

export async function GET() {
  const [hero, autoScroll, scrollBoxes] = await Promise.all([
    fetchAdSlot('ads_hero_banner'),
    fetchAdSlot('ads_auto_scroll'),
    fetchAdSlot('ads_scroll_boxes'),
  ]);

  return NextResponse.json({ hero, autoScroll, scrollBoxes });
}

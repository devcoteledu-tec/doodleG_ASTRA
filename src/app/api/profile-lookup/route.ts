import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getSessionFromRequest } from '@/lib/session';

// Backs the onboarding "tag their doodle_G profile" typeahead. Session-gated
// (not public) because it's a name-search over real member profiles — even
// though it only returns id/name/avatar, letting an unauthenticated caller
// enumerate member names by trying queries is exactly the kind of thing
// that should sit behind a session, not be open to the world. See
// middleware.ts PROTECTED_API_PREFIXES.
export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const query = (req.nextUrl.searchParams.get('query') || '').trim();
  if (query.length < 2) {
    // Too short to be a useful search and cheap to abuse for enumeration
    // (e.g. querying every single letter to walk the whole table) — require
    // at least 2 characters, matching the typeahead's own client-side
    // debounce/minlength.
    return NextResponse.json({ profiles: [] });
  }

  // Find this caller's own profile id so we can exclude "tag yourself" from
  // the results — self-tagging a recipient makes no sense and would just
  // be visual clutter.
  const { data: ownProfile } = await supabaseAdmin
    .from('profile')
    .select('id')
    .eq('user_id', session.userId)
    .maybeSingle();

  let queryBuilder = supabaseAdmin
    .from('profile')
    .select('id, name, avatar_url')
    // Escape existing % / _ so a query like "50%" or "a_b" can't turn into
    // an unintended SQL LIKE wildcard.
    .ilike('name', `%${query.replace(/[%_]/g, (m) => `\\${m}`)}%`)
    .limit(8);

  if (ownProfile?.id) {
    queryBuilder = queryBuilder.neq('id', ownProfile.id);
  }

  const { data, error } = await queryBuilder;
  if (error) {
    console.error('GET /api/profile-lookup error:', error);
    return NextResponse.json({ error: 'Failed to search profiles.' }, { status: 500 });
  }

  return NextResponse.json({
    profiles: (data || []).map((p) => ({ id: p.id, name: p.name, avatarUrl: p.avatar_url })),
  });
}

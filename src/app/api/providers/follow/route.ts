import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getSessionFromRequest } from '@/lib/session';
import { getErrorMessage } from '@/lib/errors';

// Lets a signed-in user follow / unfollow a gift provider from the
// /profiles directory (src/app/profiles/page.tsx "Follow" button). Rows are
// written to the shared `follows` table via `provider_id` (see migration
// 006 + supabase_schema.sql) so future features (recommendations, "people
// you follow just listed a new gift", etc) can read one junction table
// instead of several bespoke ones.
//
// As a side effect, following a provider merges that provider's
// `specialty` tags into the user's `profile.topic_interested` array — a
// lightweight, always-on signal of what this user is into, without needing
// a separate interest-tracking table. Unfollowing intentionally does NOT
// remove those tags; interest signals are meant to accumulate over time
// rather than be erased by a single unfollow.

const followSchema = z.object({
  providerId: z.string().min(1, 'providerId is required.'),
});

async function getFollowerProfileId(userId: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from('profile')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle();
  if (error || !data) return null;
  return data.id as string;
}

/** GET /api/providers/follow — provider IDs the current user follows. Empty list (not a 401) when signed out, so the directory page can render normally for anonymous visitors. */
export async function GET(req: NextRequest) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session) return NextResponse.json({ following: [] });

    const profileId = await getFollowerProfileId(session.userId);
    if (!profileId) return NextResponse.json({ following: [] });

    const { data, error } = await supabaseAdmin
      .from('follows')
      .select('provider_id')
      .eq('follower_id', profileId)
      .not('provider_id', 'is', null);

    if (error) throw error;

    return NextResponse.json({
      following: (data ?? []).map(row => row.provider_id as string),
    });
  } catch (error: unknown) {
    console.error('Error fetching followed providers:', error);
    return NextResponse.json({ error: getErrorMessage(error, 'Failed to fetch followed providers') }, { status: 500 });
  }
}

/** POST /api/providers/follow — toggles follow state for { providerId }. */
export async function POST(req: NextRequest) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session) return NextResponse.json({ error: 'Sign in to follow providers.' }, { status: 401 });

    const json = await req.json().catch(() => null);
    const parsed = followSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: 'providerId is required.' }, { status: 400 });
    }
    const { providerId } = parsed.data;

    const profileId = await getFollowerProfileId(session.userId);
    if (!profileId) {
      return NextResponse.json({ error: 'Profile not found.' }, { status: 404 });
    }

    const { data: provider, error: providerErr } = await supabaseAdmin
      .from('providers')
      .select('id, specialty')
      .eq('id', providerId)
      .maybeSingle();
    if (providerErr || !provider) {
      return NextResponse.json({ error: 'Provider not found.' }, { status: 404 });
    }

    const { data: existing, error: existingErr } = await supabaseAdmin
      .from('follows')
      .select('id')
      .eq('follower_id', profileId)
      .eq('provider_id', providerId)
      .maybeSingle();
    if (existingErr) throw existingErr;

    if (existing) {
      const { error: deleteErr } = await supabaseAdmin
        .from('follows')
        .delete()
        .eq('id', existing.id);
      if (deleteErr) throw deleteErr;

      return NextResponse.json({ following: false });
    }

    const { error: insertErr } = await supabaseAdmin
      .from('follows')
      .insert({ follower_id: profileId, provider_id: providerId });
    if (insertErr) throw insertErr;

    // Best-effort interest tracking: merge this provider's specialty tags
    // into the follower's topic_interested. Failure here shouldn't fail the
    // follow action itself.
    const specialty: string[] = provider.specialty ?? [];
    if (specialty.length) {
      const { data: profileRow } = await supabaseAdmin
        .from('profile')
        .select('topic_interested')
        .eq('id', profileId)
        .maybeSingle();
      const current: string[] = profileRow?.topic_interested ?? [];
      const merged = Array.from(new Set([...current, ...specialty]));
      if (merged.length !== current.length) {
        await supabaseAdmin.from('profile').update({ topic_interested: merged }).eq('id', profileId);
      }
    }

    return NextResponse.json({ following: true });
  } catch (error: unknown) {
    console.error('Error toggling provider follow:', error);
    return NextResponse.json({ error: getErrorMessage(error, 'Failed to update follow status') }, { status: 500 });
  }
}

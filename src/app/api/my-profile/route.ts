import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getSessionFromRequest } from '@/lib/session';

export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile, error } = await supabaseAdmin
    .from('profile')
    .select('*')
    .eq('user_id', session.userId)
    .maybeSingle();

  if (error || !profile) {
    return NextResponse.json({ error: 'Profile not found.' }, { status: 404 });
  }

  return NextResponse.json({ profile });
}

const patchSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  age: z.union([z.string(), z.number()]).nullable().optional(),
  date_of_birth: z.string().nullable().optional(),
  avatar_url: z.string().trim().max(2000).optional(),
  topic_interested: z.array(z.string().max(50)).max(50).optional(),
  gift_personalization_opt_in: z.boolean().optional(),
});

export async function PATCH(req: NextRequest) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const json = await req.json().catch(() => null);
    const parsed = patchSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || 'Invalid input.' },
        { status: 400 }
      );
    }
    const body = parsed.data;

    const updateData: Record<string, unknown> = {};
    if (body.name !== undefined) updateData.name = body.name;
    if (body.age !== undefined) updateData.age = body.age ? Number(body.age) : null;
    if (body.date_of_birth !== undefined) updateData.date_of_birth = body.date_of_birth || null;
    if (body.avatar_url !== undefined) updateData.avatar_url = body.avatar_url;
    if (body.topic_interested !== undefined) updateData.topic_interested = body.topic_interested;
    if (body.gift_personalization_opt_in !== undefined) updateData.gift_personalization_opt_in = body.gift_personalization_opt_in;

    // Scoped to the session's own user_id — a caller can never patch another user's profile.
    const { data, error } = await supabaseAdmin
      .from('profile')
      .update(updateData)
      .eq('user_id', session.userId)
      .select()
      .single();

    if (error) {
      console.error('Profile update error:', error);
      return NextResponse.json({ error: 'Failed to update profile.' }, { status: 500 });
    }

    return NextResponse.json({ profile: data });
  } catch (err) {
    console.error('Profile patch error:', err);
    return NextResponse.json({ error: 'An unexpected error occurred.' }, { status: 500 });
  }
}

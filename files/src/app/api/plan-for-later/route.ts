import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getSessionFromRequest } from '@/lib/session';
const schema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0,10) === value, 'Choose a valid date.'),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
});
export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Choose a valid date and time.' }, { status: 400 });
  const { data, error } = await supabaseAdmin.from('planned_occasions').upsert({
    user_id: session.userId, planned_date: parsed.data.date, planned_time: parsed.data.time || null,
  }, { onConflict: 'user_id,planned_date' }).select('id').single();
  if (error) return NextResponse.json({ error: 'Could not save your plan. Please try again.' }, { status: 503 });
  return NextResponse.json({ success: true, planId: data.id });
}

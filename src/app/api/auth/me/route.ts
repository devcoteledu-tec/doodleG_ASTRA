import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/session';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) {
    return NextResponse.json({ user: null });
  }

  const { data: signinRow } = await supabaseAdmin
    .from('signin')
    .select('id, user_name, email, mobile_number')
    .eq('id', session.userId)
    .maybeSingle();

  if (!signinRow) {
    return NextResponse.json({ user: null });
  }

  return NextResponse.json({ user: signinRow });
}

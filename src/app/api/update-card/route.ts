import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getSessionFromRequest } from '@/lib/session';
import { fetchGiftCycleWithOwner } from '@/lib/giftDomain';

const schema = z.object({
  orderId: z.string().min(1), // gift_cycles.id
  customCardMessage: z.string().max(2000),
});

export async function POST(req: NextRequest) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const json = await req.json().catch(() => null);
    const parsed = schema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || 'Missing required parameters: orderId, customCardMessage' },
        { status: 400 }
      );
    }
    const { orderId, customCardMessage } = parsed.data;

    const giftCycle = await fetchGiftCycleWithOwner(orderId);
    if (!giftCycle) {
      return NextResponse.json({ error: 'Record not found.' }, { status: 404 });
    }

    const owningUserId = giftCycle.occasion?.recipient?.profile?.user_id;
    if (owningUserId !== session.userId) {
      return NextResponse.json({ error: 'Record not found.' }, { status: 404 });
    }

    const { error: updateErr } = await supabaseAdmin
      .from('gift_cycles')
      .update({
        custom_card_message: customCardMessage,
        updated_at: new Date().toISOString(),
      })
      .eq('id', orderId);

    if (updateErr) throw updateErr;

    return NextResponse.json({
      success: true,
      order: {
        id: orderId,
        customCardMessage,
        status: giftCycle.status,
        selectedTier: giftCycle.selected_tier,
      },
    });
  } catch (error) {
    console.error('Error updating card message:', error);
    return NextResponse.json({ error: 'Failed to update custom card message.' }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getSessionFromRequest } from '@/lib/session';
import { fetchGiftCycleWithOwner } from '@/lib/giftDomain';

const schema = z.object({
  orderId: z.string().min(1), // gift_cycles.id
  selectedTier: z.enum(['CLASSIC', 'GRAND', 'LUXURY']),
});

export async function POST(req: NextRequest) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const json = await req.json().catch(() => null);
    const parsed = schema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || 'Missing required parameters: orderId, selectedTier' },
        { status: 400 }
      );
    }
    const { orderId, selectedTier } = parsed.data;

    // Fetch the gift cycle together with the owning profile/account, so we
    // can confirm this row actually belongs to the caller.
    const giftCycle = await fetchGiftCycleWithOwner(orderId);
    if (!giftCycle) {
      return NextResponse.json({ error: 'Record not found.' }, { status: 404 });
    }

    const owningUserId = giftCycle.occasion?.recipient?.profile?.user_id;
    if (owningUserId !== session.userId) {
      // 404 rather than 403 so we don't confirm the row's existence to a non-owner.
      return NextResponse.json({ error: 'Record not found.' }, { status: 404 });
    }

    if (giftCycle.status === 'COMPLETED' || !giftCycle.gift_packages.some(p => p.tier === selectedTier)) return NextResponse.json({ error: 'This package is no longer available.' }, { status: 409 });

    const { data: updated, error: updateErr } = await supabaseAdmin
      .from('gift_cycles')
      .update({
        selected_tier: selectedTier,
        status: 'APPROVED',
        updated_at: new Date().toISOString(),
      })
      .eq('id', orderId).in('status', ['CURATED', 'APPROVED']).select('id').maybeSingle();

    if (updateErr) throw updateErr;
    if (!updated) return NextResponse.json({ error: 'This selection has changed. Refresh and try again.' }, { status: 409 });

    return NextResponse.json({
      success: true,
      order: {
        id: orderId,
        selectedTier,
        status: 'APPROVED',
        customCardMessage: giftCycle.custom_card_message || null,
      },
    });
  } catch (error) {
    console.error('Error updating order tier:', error);
    return NextResponse.json({ error: 'Failed to update package selection.' }, { status: 500 });
  }
}

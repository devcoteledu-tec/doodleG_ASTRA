import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getSessionFromRequest } from '@/lib/session';
import { getErrorMessage } from '@/lib/errors';

const packageSchema = z.object({
  id: z.string().optional(),
  tier: z.enum(['CLASSIC', 'GRAND', 'LUXURY']),
  title: z.string(),
  description: z.string().optional(),
  estimatedPrice: z.union([z.string(), z.number()]).optional(),
  reason: z.string().optional(),
  productId: z.string().uuid(),
});

const onboardSchema = z.object({
  recipientName: z.string().trim().min(1),
  relationship: z.string().trim().optional(),
  interests: z.string().trim().optional(),
  quirks: z.string().optional(),
  dynamic: z.string().optional(),
  occasionTitle: z.string().trim().min(1),
  occasionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  isRecurring: z.boolean().optional(),
  // The sender's stated DEFAULT budget preference from onboarding Step 4 —
  // distinct from `selectedTier` below (the tier actually chosen for THIS
  // gift cycle in Step 6). Previously these were conflated: recipients.budget_tier
  // was set from `selectedTier`, so Step 4's own selector had no effect on
  // anything ever persisted. See recipients.budget_tier vs gift_cycles.selected_tier.
  budgetTier: z.enum(['CLASSIC', 'GRAND', 'LUXURY']).optional(),
  selectedTier: z.enum(['CLASSIC', 'GRAND', 'LUXURY']),
  curatedPackages: z.array(packageSchema).min(1).max(3).refine(p => new Set(p.map(x => x.tier)).size === p.length, 'Each tier must be unique.'),
  // Present when the sender tagged the recipient as an existing doodle_G
  // member (see /api/profile-lookup). Re-validated against the `profile`
  // table below — never trusted just because the client sent it.
  taggedProfileId: z.string().uuid().optional(),
  // The onboarding WhatsApp-number field actually persists now (see the
  // signin.mobile_number update below) — previously captured in the UI and
  // silently dropped because this schema never declared it, so Zod stripped
  // it from every request.
  userPhone: z.string().trim().max(30).optional(),
});

// recipients.budget_tier is a legacy-named enum column that predates the
// CLASSIC/GRAND/LUXURY tiers (see supabase_migration_009) and still only
// accepts the two original price-range strings. Mapping GRAND and LUXURY
// onto the same legacy value would reproduce the exact bug this route's
// comments already describe fixing once (a LUXURY recipient silently
// displaying as GRAND everywhere) — so migration 015 widens the column to
// the same `gift_tier` enum gift_cycles.selected_tier already uses instead
// of lossily mapping onto the old two-value range here.

export async function POST(req: NextRequest) {
  try {
    // The acting user comes from the session — never from a client-supplied
    // email/name. The previous version of this route trusted a `userEmail`
    // field in the request body to find-or-create an account, which meant
    // anyone could attach data to (and silently overwrite the name/phone of)
    // any account just by guessing or supplying its email address.
    const session = await getSessionFromRequest(req);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const json = await req.json().catch(() => null);
    const parsed = onboardSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || 'Missing required onboarding data fields.' },
        { status: 400 }
      );
    }
    const {
      recipientName,
      relationship,
      interests,
      quirks,
      dynamic,
      occasionTitle,
      occasionDate,
      isRecurring,
      budgetTier,
      selectedTier,
      curatedPackages,
      taggedProfileId,
      userPhone,
    } = parsed.data;

    // A client-supplied taggedProfileId is never trusted just because it
    // parsed as a UUID — confirm it actually names a real profile before it
    // ever reaches the database. The RPC's FK constraint would reject a
    // bogus id too, but checking here lets us give the user a clear,
    // actionable error ("that profile no longer exists") instead of a raw
    // 500 from a foreign-key violation deep in the transaction.
    if (taggedProfileId) {
      const { data: taggedProfile, error: taggedErr } = await supabaseAdmin
        .from('profile')
        .select('id')
        .eq('id', taggedProfileId)
        .maybeSingle();
      if (taggedErr || !taggedProfile) {
        return NextResponse.json(
          { error: 'The tagged profile could not be found. It may have been removed — try searching again.' },
          { status: 400 }
        );
      }
    }

    // Needed for the card message signature and the profile lazy-create
    // fallback name inside the RPC reads this itself, but we also want the
    // real name here for the card message text below.
    const { data: existingProfile } = await supabaseAdmin
      .from('profile')
      .select('name')
      .eq('user_id', session.userId)
      .maybeSingle();
    let userName = existingProfile?.name;
    if (!userName) {
      const { data: userSign } = await supabaseAdmin
        .from('signin')
        .select('user_name')
        .eq('id', session.userId)
        .maybeSingle();
      userName = userSign?.user_name || 'there';
    }

    const cardMessage = `Dear ${recipientName},\n\nThinking of you on this special ${occasionTitle}! Wishing you a wonderful day ahead.\n\nLove,\n${userName}`;

    const packagesJson = curatedPackages.map((pkg) => ({
      tier: pkg.tier,
      title: pkg.title,
      description: pkg.description || '',
      estimated_price: Number(pkg.estimatedPrice) || 0,
      reason: pkg.reason || '',
      // Links this package back to the real products_box row the AI curation
      // engine matched it to (see src/lib/giftMatching.ts +
      // AIService.curateGiftsFromCatalog). Empty for legacy free-text
      // curations that don't reference an actual sellable product — the RPC
      // turns '' into a real SQL NULL (NULLIF), never an invalid empty uuid.
      product_id: pkg.productId || '',
    }));

    // The shape create_onboarding_bundle_v2 actually returns (see
    // supabase_migration_015...sql's RETURNS TABLE clause). supabaseAdmin is
    // a plain, untyped SupabaseClient (no generated Database generic — see
    // src/lib/supabaseAdmin.ts), so .rpc(...) resolves to an untyped
    // response and `result` below would otherwise be `{}`. That's a
    // TypeScript-only problem — the actual Postgres data is correct at
    // runtime — but `next build` type-checks by default and fails the
    // whole build on it, which is why every deploy since this RPC call was
    // added has errored. Asserting the real shape here fixes the build
    // without touching runtime behavior at all.
    type OnboardingBundleResult = {
      profile_id: string;
      recipient_id: string;
      occasion_id: string;
      gift_cycle_id: string;
    };

    // Everything below used to be five separate sequential inserts with no
    // shared transaction: a failure partway (e.g. gift_packages) left an
    // orphaned recipient + occasion + gift_cycle behind, and retrying
    // created a second orphaned set instead of resuming. One RPC call means
    // Postgres rolls back the entire write on any failure — see
    // supabase_migration_015_recipient_mentions_and_onboarding_txn.sql.
    const rpcResponse = await supabaseAdmin
      .rpc('create_onboarding_bundle_v2', {
        p_user_id: session.userId,
        p_recipient_name: recipientName,
        p_relationship: relationship || 'Family',
        p_hobbies_and_interest: interests || '',
        p_quirks: quirks || '',
        p_dynamic: dynamic || '',
        // Falls back to the cycle's selected tier only if Step 4 was somehow
        // skipped (defensive — the client always sends it) so this can
        // never violate the column's NOT NULL constraint.
        p_budget_tier: budgetTier || selectedTier,
        p_recipient_profile_id: taggedProfileId || null,
        p_occasion_title: occasionTitle,
        p_occasion_date: occasionDate,
        p_is_recurring: isRecurring !== undefined ? isRecurring : true,
        p_selected_tier: selectedTier,
        p_custom_card_message: cardMessage,
        p_packages: packagesJson,
      })
      .single();
    const rpcError = rpcResponse.error;
    const result = rpcResponse.data as OnboardingBundleResult | null;

    if (rpcError || !result) {
      throw rpcError || new Error('Failed to save onboarding data.');
    }

    // Persist the WhatsApp number onboarding just collected. This used to be
    // captured in the UI and silently discarded (the schema never declared
    // the field, so Zod stripped it) — signin.mobile_number is the real
    // column the cron dispatcher and WhatsApp webhook both key off of (see
    // src/app/api/cron/route.ts, src/app/api/whatsapp/webhook/route.ts), so
    // writing it here is what actually makes "automated WhatsApp reminders"
    // true rather than just a promise in the UI copy. Best-effort: if this
    // fails, the onboarding data itself is already safely committed above,
    // so we log and continue rather than fail the whole request over a
    // secondary update.
    if (userPhone) {
      const { error: phoneErr } = await supabaseAdmin
        .from('signin')
        .update({ mobile_number: userPhone })
        .eq('id', session.userId);
      if (phoneErr) {
        console.error('Failed to persist onboarding WhatsApp number (non-fatal):', phoneErr);
      }
    }

    return NextResponse.json({
      success: true,
      profileId: result.profile_id,
      recipientId: result.recipient_id,
      occasionId: result.occasion_id,
      giftCycleId: result.gift_cycle_id,
    });
  } catch (error: unknown) {
    console.error('Onboarding Database Setup Error:', error);
    return NextResponse.json(
      { error: getErrorMessage(error, 'Failed to save onboarding subscription details to database.') },
      { status: 500 }
    );
  }
}

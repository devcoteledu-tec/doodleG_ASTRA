import { supabaseAdmin } from '@/lib/supabaseAdmin';

/**
 * Shared types + query helpers for the "gift concierge" domain
 * (recipients -> occasions -> gift_cycles -> gift_packages).
 *
 * This is the single place every route should go through to read or write
 * this domain, so that `orderId` / `recipientId` / `occasionId` always mean
 * the same thing everywhere they appear. See ARCHITECTURE.md for the
 * end-to-end lifecycle this supports.
 */

export type GiftTier = 'CLASSIC' | 'GRAND' | 'LUXURY';
export type GiftCycleStatus = 'PENDING' | 'CURATED' | 'APPROVED' | 'COMPLETED';

export interface GiftPackageRow {
  id: string;
  gift_cycle_id: string;
  tier: GiftTier;
  title: string;
  description: string;
  estimated_price: number;
  reason: string;
}

export interface GiftCycleRow {
  id: string;
  occasion_id: string;
  status: GiftCycleStatus;
  selected_tier: GiftTier | null;
  custom_card_message: string | null;
  gift_packages: GiftPackageRow[];
}

export interface OccasionRow {
  id: string;
  recipient_id: string;
  title: string;
  occasion_date: string;
  is_recurring: boolean;
  gift_cycles: GiftCycleRow[];
}

export interface RecipientRow {
  id: string;
  profile_id: string;
  name: string;
  relationship: string;
  hobbies_and_interest: string;
  quirks: string | null;
  dynamic: string | null;
  budget_tier: string;
  occasions: OccasionRow[];
}

/**
 * Given an occasion's stored date and "today", returns how many days away
 * the *next* occurrence of that occasion is: same year if it hasn't
 * happened yet this year, otherwise rolled forward to next year. This is
 * the single source of truth for the cron job's T-14-day matching window,
 * pulled out of the route handler so it can be unit tested without a
 * request/response cycle or a database.
 *
 * Mirrors the exact logic the cron route used inline: build "this year's"
 * occurrence from the occasion's month/day, roll to next year if that date
 * has already passed today, then diff in whole days (via Math.ceil, so a
 * same-day match is 0 and a match exactly two weeks out is 14).
 *
 * Feb 29 occasions naturally overflow into Mar 1 in non-leap years, because
 * `new Date(year, 1, 29)` always has in JS — this is intentional, not a
 * bug, and is covered explicitly in the test suite.
 */
export function daysUntilNextOccurrence(occasionDateStr: string, today: Date = new Date()): number {
  const occasionDate = new Date(occasionDateStr);
  if (isNaN(occasionDate.getTime())) {
    throw new Error(`Invalid occasion date: ${occasionDateStr}`);
  }

  const normalizedToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  const nextOccurrence = new Date(normalizedToday.getFullYear(), occasionDate.getMonth(), occasionDate.getDate());
  if (nextOccurrence.getTime() < normalizedToday.getTime()) {
    nextOccurrence.setFullYear(normalizedToday.getFullYear() + 1);
  }

  const diffTime = nextOccurrence.getTime() - normalizedToday.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

/** Whether an occasion is exactly T-14 days out (the cron dispatch window). */
export function isCurationDispatchWindow(occasionDateStr: string, today: Date = new Date()): boolean {
  return daysUntilNextOccurrence(occasionDateStr, today) === 14;
}

/** Nested select shape shared by every route that needs the full recipient hub. */
const RECIPIENT_HUB_SELECT = `
  id, profile_id, name, relationship, hobbies_and_interest, quirks, dynamic, budget_tier,
  occasions (
    id, recipient_id, title, occasion_date, is_recurring,
    gift_cycles (
      id, occasion_id, status, selected_tier, custom_card_message,
      gift_packages ( id, gift_cycle_id, tier, title, description, estimated_price, reason )
    )
  )
`;

/** All recipients (with occasions/gift-cycles/packages) belonging to one profile. */
export async function fetchRecipientsForProfile(profileId: string): Promise<RecipientRow[]> {
  const { data, error } = await supabaseAdmin
    .from('recipients')
    .select(RECIPIENT_HUB_SELECT)
    .eq('profile_id', profileId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data || []) as unknown as RecipientRow[];
}

/** Every recipient across every profile, for system/cron-scoped jobs. */
export async function fetchAllRecipientsWithOwner(): Promise<
  (RecipientRow & { profile: { id: string; name: string; signin: { id: string; user_name: string; email: string; mobile_number: string | null } | null } | null })[]
> {
  const { data, error } = await supabaseAdmin
    .from('recipients')
    .select(`
      ${RECIPIENT_HUB_SELECT},
      profile:profile_id (
        id, name,
        signin:user_id ( id, user_name, email, mobile_number )
      )
    `);

  if (error) throw error;
  return (data || []) as unknown as (RecipientRow & {
    profile: { id: string; name: string; signin: { id: string; user_name: string; email: string; mobile_number: string | null } | null } | null;
  })[];
}

/** Fetch one gift cycle plus the chain needed to verify ownership (occasion -> recipient -> profile). */
export async function fetchGiftCycleWithOwner(giftCycleId: string) {
  const { data, error } = await supabaseAdmin
    .from('gift_cycles')
    .select(`
      id, status, selected_tier, custom_card_message,
      gift_packages ( id, tier, title, description, estimated_price, reason ),
      occasion:occasion_id (
        id, title, occasion_date,
        recipient:recipient_id (
          id, name,
          profile:profile_id ( id, user_id )
        )
      )
    `)
    .eq('id', giftCycleId)
    .maybeSingle();

  if (error) throw error;
  return data as unknown as {
    id: string;
    status: GiftCycleStatus;
    selected_tier: GiftTier | null;
    custom_card_message: string | null;
    gift_packages: GiftPackageRow[];
    occasion: {
      id: string;
      title: string;
      occasion_date: string;
      recipient: {
        id: string;
        name: string;
        profile: { id: string; user_id: string } | null;
      } | null;
    } | null;
  } | null;
}

/**
 * recipients.budget_tier stores the GiftTier value directly (see
 * supabase_migration_009_recipient_budget_tier_enum.sql). It used to store a
 * price-range string ('100-500' | '500-1000') that collapsed GRAND and
 * LUXURY onto the same value — this falls back to that old two-value scheme
 * only for rows that haven't been through the migration yet. Any legacy
 * '500-1000' row is conservatively treated as GRAND, same as the migration's
 * one-time data conversion, since the range scheme never recorded which of
 * those were actually LUXURY.
 */
function normalizeBudgetTier(value: string): GiftTier {
  if (value === 'CLASSIC' || value === 'GRAND' || value === 'LUXURY') return value;
  if (value === '100-500') return 'CLASSIC';
  return 'GRAND';
}

/**
 * Map a normalized RecipientRow into the flat JSON shape the frontend
 * (`src/app/page.tsx`) already expects. Only the *storage* layer changed
 * (JSON blob -> normalized tables) — the API response contract for the
 * dashboard is intentionally kept stable so no client rewrite is required.
 */
export function mapRecipientToDashboardShape(r: RecipientRow) {
 return { id:r.id,name:r.name,relationship:r.relationship,interests:r.hobbies_and_interest,quirks:r.quirks||'',dynamic:r.dynamic||'',budgetTier:normalizeBudgetTier(r.budget_tier),
 occasions:r.occasions.map(o=>({id:o.id,title:o.title,date:o.occasion_date,isRecurring:o.is_recurring})),
 orders:r.occasions.flatMap(o=>o.gift_cycles.map(c=>({id:c.id,status:c.status,selectedTier:c.selected_tier,customCardMessage:c.custom_card_message,giftPackages:c.gift_packages.map(p=>({id:p.id,tier:p.tier,title:p.title,description:p.description,estimatedPrice:Number(p.estimated_price),reason:p.reason}))}))) };
}

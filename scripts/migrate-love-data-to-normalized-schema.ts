/**
 * One-time data migration: copies every existing `love_data` row (the old
 * "one JSON blob per recipient" model) into the normalized
 * recipients / occasions / gift_cycles / gift_packages tables.
 *
 * Safe to re-run: it skips any love_data row that has already been migrated
 * (tracked via a `migrated_recipient_id` note kept in-memory per run, and by
 * checking whether a recipient with the same profile_id + name + relationship
 * + occasion title already exists before inserting).
 *
 * Usage:
 *   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/migrate-love-data-to-normalized-schema.ts
 *   (add --dry-run to only print what would happen, without writing anything)
 *
 * After running this against production and verifying the output (row
 * counts, spot-checking a few recipients in the app), drop the legacy table
 * with supabase_migration_002_cleanup_drop_love_data.sql.
 */
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!supabaseUrl || !serviceRoleKey) {
  console.error(
    'Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in the environment. ' +
      'This script must run with the same server credentials as the app.'
  );
  process.exit(1);
}

const dryRun = process.argv.includes('--dry-run');
const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

type LoveDataRow = {
  id: string;
  profile_id: string;
  profile_name: string;
  relationship: string;
  hobbies_and_interest: string;
  unique_or_secret_preferences: string | null;
  trigger: string;
  date_autorenew_details: string | null;
  budget_tier: string;
};

type Preferences = {
  quirks?: string;
  dynamic?: string;
  status?: 'PENDING' | 'CURATED' | 'APPROVED' | 'COMPLETED';
  selectedTier?: 'CLASSIC' | 'GRAND' | 'LUXURY';
  customCardMessage?: string;
  isRecurring?: boolean;
  giftPackages?: Array<{
    id?: string;
    tier: 'CLASSIC' | 'GRAND' | 'LUXURY';
    title: string;
    description?: string;
    estimatedPrice?: number | string;
    reason?: string;
  }>;
};

function parsePreferences(raw: string | null): Preferences {
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Preferences;
  } catch {
    console.warn('  ⚠️  Failed to parse unique_or_secret_preferences JSON — treating as empty.');
    return {};
  }
}

/** love_data.date_autorenew_details was a free-text TEXT column; occasions.occasion_date is a DATE. */
function normalizeDate(raw: string | null): string {
  if (!raw) return new Date().toISOString().slice(0, 10);
  const d = new Date(raw);
  if (isNaN(d.getTime())) return new Date().toISOString().slice(0, 10);
  return d.toISOString().slice(0, 10);
}

async function alreadyMigrated(row: LoveDataRow): Promise<boolean> {
  const { data } = await supabase
    .from('recipients')
    .select('id, occasions ( id, title )')
    .eq('profile_id', row.profile_id)
    .eq('name', row.profile_name)
    .eq('relationship', row.relationship);

  return (data || []).some((r: { occasions?: { title: string }[] | null }) =>
    (r.occasions || []).some((o: { title: string }) => o.title === row.trigger)
  );
}

async function migrateRow(row: LoveDataRow, index: number, total: number) {
  console.log(`\n[${index + 1}/${total}] love_data ${row.id} — "${row.profile_name}" (${row.trigger})`);

  if (await alreadyMigrated(row)) {
    console.log('  ↷ Skipping — a matching recipient/occasion already exists in the normalized tables.');
    return { skipped: true as const };
  }

  const prefs = parsePreferences(row.unique_or_secret_preferences);

  // recipients.budget_tier now stores the GiftTier value directly (see
  // supabase_migration_009_recipient_budget_tier_enum.sql) rather than the
  // old '100-500'/'500-1000' price-range string love_data used. Prefer the
  // actual tier the recipient's gift cycle was curated/approved at
  // (prefs.selectedTier, from the JSON blob) when we have it — that's a
  // real GiftTier value and can distinguish LUXURY, which the coarse range
  // string never could. Only fall back to a best-effort range->tier mapping
  // (which conflates GRAND and LUXURY, same as the SQL migration) when
  // there's no selectedTier recorded.
  const recipientBudgetTier: 'CLASSIC' | 'GRAND' | 'LUXURY' =
    prefs.selectedTier || (row.budget_tier === '100-500' ? 'CLASSIC' : 'GRAND');

  if (dryRun) {
    console.log(
      `  [dry-run] would create: recipient "${row.profile_name}", occasion "${row.trigger}", ` +
        `gift_cycle status=${prefs.status || 'PENDING'} tier=${prefs.selectedTier || 'null'}, ` +
        `${(prefs.giftPackages || []).length} gift package(s).`
    );
    return { skipped: false as const };
  }

  const { data: recipient, error: recipientErr } = await supabase
    .from('recipients')
    .insert({
      profile_id: row.profile_id,
      name: row.profile_name,
      relationship: row.relationship,
      hobbies_and_interest: row.hobbies_and_interest,
      quirks: prefs.quirks || '',
      dynamic: prefs.dynamic || '',
      budget_tier: recipientBudgetTier,
    })
    .select('id')
    .single();
  if (recipientErr || !recipient) throw recipientErr || new Error('recipient insert returned no row');

  const { data: occasion, error: occasionErr } = await supabase
    .from('occasions')
    .insert({
      recipient_id: recipient.id,
      title: row.trigger,
      occasion_date: normalizeDate(row.date_autorenew_details),
      is_recurring: prefs.isRecurring !== undefined ? prefs.isRecurring : true,
    })
    .select('id')
    .single();
  if (occasionErr || !occasion) throw occasionErr || new Error('occasion insert returned no row');

  const { data: giftCycle, error: cycleErr } = await supabase
    .from('gift_cycles')
    .insert({
      occasion_id: occasion.id,
      status: prefs.status || 'PENDING',
      selected_tier: prefs.selectedTier || null,
      custom_card_message: prefs.customCardMessage || null,
    })
    .select('id')
    .single();
  if (cycleErr || !giftCycle) throw cycleErr || new Error('gift_cycle insert returned no row');

  const packageRows = (prefs.giftPackages || []).map((pkg) => ({
    gift_cycle_id: giftCycle.id,
    tier: pkg.tier,
    title: pkg.title,
    description: pkg.description || '',
    estimated_price: Number(pkg.estimatedPrice) || 0,
    reason: pkg.reason || '',
  }));

  if (packageRows.length > 0) {
    const { error: pkgErr } = await supabase.from('gift_packages').insert(packageRows);
    if (pkgErr) throw pkgErr;
  }

  console.log(
    `  ✅ Migrated -> recipient=${recipient.id} occasion=${occasion.id} gift_cycle=${giftCycle.id} ` +
      `(${packageRows.length} package(s))`
  );
  return { skipped: false as const };
}

async function main() {
  console.log(`Migrating love_data -> normalized schema${dryRun ? ' [DRY RUN]' : ''}...`);

  const { data: rows, error } = await supabase
    .from('love_data')
    .select('id, profile_id, profile_name, relationship, hobbies_and_interest, unique_or_secret_preferences, trigger, date_autorenew_details, budget_tier')
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Failed to read love_data:', error);
    process.exit(1);
  }

  const total = rows?.length || 0;
  console.log(`Found ${total} love_data row(s).`);

  let migrated = 0;
  let skipped = 0;
  let failed = 0;

  for (let i = 0; i < (rows || []).length; i++) {
    try {
      const result = await migrateRow(rows![i] as LoveDataRow, i, total);
      if (result.skipped) skipped++;
      else migrated++;
    } catch (err) {
      failed++;
      console.error(`  ❌ Failed to migrate love_data ${rows![i].id}:`, err);
    }
  }

  console.log(`\nDone. migrated=${migrated} skipped=${skipped} failed=${failed} total=${total}`);
  if (failed > 0) process.exit(1);
}

main();

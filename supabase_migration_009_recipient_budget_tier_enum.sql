-- Migration 009: Store the gift tier directly in recipients.budget_tier
-- ---------------------------------------------------------------------------
-- Run this against an existing database. Safe to re-run.
--
-- Context: recipients.budget_tier previously stored a *price range* string
-- ('100-500' | '500-1000') rather than the GiftTier itself. That scheme could
-- only round-trip two of the three tiers:
--   - src/app/api/db-onboard/route.ts wrote
--       selectedTier === 'CLASSIC' ? '100-500' : '500-1000'
--     which mapped BOTH 'GRAND' and 'LUXURY' onto '500-1000'.
--   - src/lib/giftDomain.ts's mapRecipientToDashboardShape then read
--       budget_tier === '100-500' ? 'CLASSIC' : 'GRAND'
--     so a LUXURY recipient displayed as GRAND everywhere the dashboard shows
--     the recipient-level budget tier badge.
-- Meanwhile src/app/api/cron/route.ts was already reading recipient.budget_tier
-- as if it held a GiftTier value directly
-- (`giftCycle.selected_tier || recipient.budget_tier || 'GRAND'`), which only
-- ever worked by coincidence for CLASSIC/GRAND. Storing the GiftTier value
-- directly makes every read site agree, and actually distinguishes LUXURY.

-- Best-effort conversion of existing rows under the old range scheme. The old
-- scheme could never distinguish a LUXURY selection from GRAND (both stored
-- '500-1000'), so any existing '500-1000' row is conservatively mapped to
-- GRAND — there's no way to recover which of these were originally LUXURY
-- from this column alone.
ALTER TABLE recipients DROP CONSTRAINT IF EXISTS recipients_budget_tier_check;
UPDATE recipients SET budget_tier = 'CLASSIC' WHERE budget_tier = '100-500';
UPDATE recipients SET budget_tier = 'GRAND' WHERE budget_tier = '500-1000';


ALTER TABLE recipients ADD CONSTRAINT recipients_budget_tier_check
  CHECK (budget_tier IN ('CLASSIC', 'GRAND', 'LUXURY'));
ALTER TABLE recipients ALTER COLUMN budget_tier SET DEFAULT 'CLASSIC';

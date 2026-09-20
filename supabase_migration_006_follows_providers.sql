-- Migration 006: Reuse `follows` for user → provider follows
-- ---------------------------------------------------------------------------
-- Run this against an existing database. Safe to re-run.
--
-- Context: the /profiles directory page (src/app/profiles/page.tsx) gets a
-- "Follow" button so a signed-in user can follow a gift *provider* (not
-- another customer, which is what `follows.following_id -> profile(id)`
-- originally modelled and what the app no longer does). Rather than add a
-- brand-new table, `follows` is extended with a `provider_id` column so it
-- can express either kind of edge:
--   - following_id set, provider_id NULL  -> legacy user-follows-user (unused)
--   - provider_id set, following_id NULL  -> user-follows-provider (new)
--
-- See src/app/api/providers/follow/route.ts for the read/write API.

ALTER TABLE follows ADD COLUMN IF NOT EXISTS provider_id UUID REFERENCES providers(id) ON DELETE CASCADE;

-- Exactly one target per row.
ALTER TABLE follows DROP CONSTRAINT IF EXISTS follows_target_check;
ALTER TABLE follows ADD CONSTRAINT follows_target_check CHECK (
  (following_id IS NOT NULL AND provider_id IS NULL) OR
  (following_id IS NULL AND provider_id IS NOT NULL)
);

-- The original UNIQUE (follower_id, following_id) doesn't stop duplicate
-- provider-follows, since Postgres treats every NULL following_id as
-- distinct. A partial unique index covers the provider case instead.
CREATE UNIQUE INDEX IF NOT EXISTS idx_follows_follower_provider_unique
  ON follows(follower_id, provider_id)
  WHERE provider_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_follows_provider ON follows(provider_id);

COMMENT ON COLUMN follows.provider_id IS 'Set when this row is a user following a gift provider (src/app/profiles/page.tsx "Follow" button). Mutually exclusive with following_id — see follows_target_check.';

-- Migration 011: Provider profile "overview" template fields
-- ---------------------------------------------------------------------------
-- Run this against an existing database. Safe to re-run.
--
-- Context: the individual provider profile page
-- (src/app/profiles/[id]/page.tsx) was redesigned to match a social-style
-- profile template (banner photo, handle, title/role line, location,
-- primary website link, founded date, joined date, followers/products
-- counts). Most of that already exists on `providers` (name, bio,
-- description, avatar_url, specialty, is_verified, created_at, and the
-- follower count is computed at query time from `follows`) — this
-- migration adds the handful of columns that don't have anywhere to live
-- yet.

-- 1. Handle shown as "@username" under the display name.
ALTER TABLE providers ADD COLUMN IF NOT EXISTS username TEXT;
COMMENT ON COLUMN providers.username IS 'Handle shown as "@username" on the profile page (src/app/profiles/[id]/page.tsx), e.g. "petalworkshop". No leading @.';

-- Case-insensitive uniqueness, same pattern as migration 007's
-- uq_signin_user_name_lower. Partial index (WHERE username IS NOT NULL) so
-- existing providers without a handle yet don't block each other.
CREATE UNIQUE INDEX IF NOT EXISTS uq_providers_username_lower
  ON providers (LOWER(username))
  WHERE username IS NOT NULL;

-- 2. Banner / cover photo shown behind the avatar at the top of the profile.
ALTER TABLE providers ADD COLUMN IF NOT EXISTS cover_url TEXT;
COMMENT ON COLUMN providers.cover_url IS 'Banner image shown behind the avatar on the profile page. Falls back to a neutral gradient in the UI when null.';

-- 3. Short role/title line shown next to a briefcase icon (e.g.
--    "Florist & Studio Owner"), distinct from the `specialty` tag list.
ALTER TABLE providers ADD COLUMN IF NOT EXISTS title TEXT;
COMMENT ON COLUMN providers.title IS 'Short role/tagline shown next to the briefcase icon on the profile page, e.g. "Florist & Studio Owner".';

-- 4. Free-text location shown next to a pin icon.
ALTER TABLE providers ADD COLUMN IF NOT EXISTS location TEXT;
COMMENT ON COLUMN providers.location IS 'Free-text location shown next to the pin icon on the profile page, e.g. "Kochi, Kerala".';

-- 5. Primary website, shown as its own clickable line (distinct from the
--    `internal_links` JSONB list, which stays for the secondary
--    portfolio/price-list/booking links further down the page).
ALTER TABLE providers ADD COLUMN IF NOT EXISTS website_url TEXT;
COMMENT ON COLUMN providers.website_url IS 'Primary website shown next to the link icon on the profile page. Secondary links (portfolio, price list, etc.) stay in internal_links.';

-- 6. Founded date, shown next to a gift icon (business equivalent of the
--    template's personal "Born" field).
ALTER TABLE providers ADD COLUMN IF NOT EXISTS founded_date DATE;
COMMENT ON COLUMN providers.founded_date IS 'Date the business/studio was founded, shown next to the gift icon on the profile page (business equivalent of a personal "born on" field).';

-- `providers.created_at` already exists and is reused as-is for the
-- "Joined <month year>" line — no new column needed for that one.

-- ── Optional backfill for the two sample providers seeded in earlier
--    migrations, so the new profile page isn't empty right after migrating.
--    Safe to delete/edit.
UPDATE providers SET
  username = 'petalworkshop',
  title = 'Florist & Studio Owner',
  location = 'Kochi, Kerala',
  website_url = 'https://instagram.com/thepetalworkshop',
  founded_date = '2019-03-01',
  cover_url = 'https://images.unsplash.com/photo-1490750967868-88aa4486c946?auto=format&fit=crop&w=1200&q=80'
WHERE name = 'The Petal Workshop' AND username IS NULL;

UPDATE providers SET
  username = 'grainwoodcraftco',
  title = 'Woodworker & Founder',
  location = 'Bengaluru, Karnataka',
  website_url = 'https://instagram.com/grainwoodcraftco',
  founded_date = '2020-08-15',
  cover_url = 'https://images.unsplash.com/photo-1601058268499-e52658b8bb88?auto=format&fit=crop&w=1200&q=80'
WHERE name = 'Grainwood Craft Co.' AND username IS NULL;

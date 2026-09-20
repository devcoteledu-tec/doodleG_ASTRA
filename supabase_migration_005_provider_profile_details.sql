-- Migration 005: Provider profile page — description + internal links
-- ---------------------------------------------------------------------------
-- Run this against an existing database that was created before these
-- columns existed on `providers`. Safe to re-run.
--
-- Context: the public provider directory (/profiles) only ever showed the
-- short `bio` teaser. The new individual profile page
-- (src/app/profiles/[id]/page.tsx) needs two more things per provider:
--
--   1. `description`   — a longer, "About Me" style write-up (bio stays as
--                         the short card teaser, description is the full
--                         story shown on the profile page).
--   2. `internal_links` — a small JSONB list of links the provider wants to
--                         surface on their own profile page (portfolio site,
--                         price list, booking page, etc). Shape:
--                           [{ "label": "Portfolio", "url": "https://..." }]
--                         Kept as JSONB (not a join table) since these are
--                         purely display links, not relational data.

ALTER TABLE providers ADD COLUMN IF NOT EXISTS description TEXT DEFAULT '';
ALTER TABLE providers ADD COLUMN IF NOT EXISTS internal_links JSONB DEFAULT '[]'::jsonb NOT NULL;

COMMENT ON COLUMN providers.description IS 'Long-form "About Me" copy for the provider profile page (src/app/profiles/[id]/page.tsx). Distinct from the short `bio` teaser shown on provider cards.';
COMMENT ON COLUMN providers.internal_links IS 'JSONB array of {label, url} link objects the provider wants shown on their profile page, e.g. portfolio site, price list, booking page.';

-- Backfill a couple of the sample providers from migration 003 so the new
-- profile page isn't empty right after migrating. Safe to delete/edit.
UPDATE providers SET
  description = 'We hand-tie every bouquet to order in small batches, sourcing seasonal stems from local growers wherever we can. What started as a kitchen-table hobby has grown into a studio that now ships preserved flower boxes across the country — but every order still gets the same close attention as our very first one.',
  internal_links = '[{"label":"Portfolio","url":"https://instagram.com/thepetalworkshop"},{"label":"Price List","url":"https://instagram.com/thepetalworkshop"}]'::jsonb
WHERE name = 'The Petal Workshop' AND (description IS NULL OR description = '');

UPDATE providers SET
  description = 'Grainwood Craft Co. is a two-person woodshop specialising in engraved keepsakes — cutting boards, jewellery boxes, and home decor pieces that are built to be handed down. Every piece is sanded, finished, and packed by hand before it ships.',
  internal_links = '[{"label":"Portfolio","url":"https://instagram.com/grainwoodcraftco"}]'::jsonb
WHERE name = 'Grainwood Craft Co.' AND (description IS NULL OR description = '');

-- Migration 007: Enforce username uniqueness at the DB level
-- ---------------------------------------------------------------------------
-- Run this against an existing database. Safe to re-run.
--
-- Context: src/app/api/auth/signup/route.ts's pre-insert check
-- (`.ilike('user_name', userName).maybeSingle()`) is a bare TOCTOU race
-- without a backing unique index — two concurrent signups for the same
-- username can both pass the check and both INSERT successfully. Once that
-- happens, src/app/api/auth/signin/route.ts's own
-- `.ilike('user_name', userName).maybeSingle()` throws (PGRST116, "multiple
-- (or no) rows returned") for *both* accounts, which the route currently
-- treats identically to a bad password — permanently locking out both users
-- with no recovery path short of a manual DB fix.
--
-- This index is what the 23505-handling branch in signup/route.ts has always
-- assumed exists (see that file's comment referencing "migration 007") —
-- this file is what actually creates it.

-- ── Before running the CREATE UNIQUE INDEX below ──
-- CREATE UNIQUE INDEX will fail outright if any duplicate (case-insensitive)
-- usernames already exist. Run this query first to find them:
--
--   SELECT LOWER(user_name) AS lower_user_name, array_agg(id ORDER BY created_at) AS ids, count(*)
--   FROM signin
--   GROUP BY LOWER(user_name)
--   HAVING count(*) > 1;
--
-- For each duplicate group, decide which row is the "real" account (e.g. the
-- oldest, or whichever still receives login attempts) and rename or remove
-- the others before proceeding, e.g.:
--
--   UPDATE signin SET user_name = user_name || '-dup-' || substr(id::text, 1, 8)
--   WHERE id = '<the row(s) you are NOT keeping>';

CREATE UNIQUE INDEX IF NOT EXISTS uq_signin_user_name_lower
  ON signin (LOWER(user_name));

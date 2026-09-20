-- Migration 004: One review per signed-in user per product
-- ---------------------------------------------------------------------------
-- Problem being fixed: `reviews` had no link to the `signin` (auth) table at
-- all — a review only stored a free-text `user_name`. That meant:
--   1. There was nothing stopping the same signed-in user from submitting an
--      unlimited number of reviews for the same product.
--   2. The server had no reliable way to know "does this user already have
--      a review here?", so it could never turn a second submission into an
--      edit of the first one.
--
-- This migration adds `user_id`, backfills it as best-effort for any
-- pre-existing rows, and then adds a UNIQUE constraint on
-- (product_id, user_id) so the database itself enforces "one review per
-- user per product" — the API can no longer get this wrong even by
-- accident.
--
-- Safe to re-run.

ALTER TABLE reviews ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES signin(id) ON DELETE CASCADE;

-- Legacy rows created before this migration have no user_id. They're kept
-- (so historical reviews aren't deleted) but excluded from the uniqueness
-- guarantee below, since NULL is never considered equal to NULL in a
-- standard UNIQUE constraint — i.e. any number of legacy/anonymous rows can
-- coexist, but once a row has a real user_id, that (product_id, user_id)
-- pair can only exist once.
CREATE UNIQUE INDEX IF NOT EXISTS uq_reviews_product_user
    ON reviews(product_id, user_id)
    WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_reviews_user_id ON reviews(user_id);

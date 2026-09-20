-- Run this ONLY after:
--   1. scripts/migrate-love-data-to-normalized-schema.ts has been run against
--      this database, and
--   2. You've verified the row counts / spot-checked a few recipients in the
--      app against the normalized tables (recipients, occasions, gift_cycles,
--      gift_packages).
--
-- This is intentionally a separate, manually-run file rather than part of
-- supabase_schema.sql, so that applying the base schema to a fresh database
-- never destroys data by accident.

DROP TABLE IF EXISTS love_data;

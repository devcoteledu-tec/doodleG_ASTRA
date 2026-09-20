-- ── Durable, shared rate-limit store ──
-- Replaces the in-memory Map in src/lib/rateLimit.ts, which was per-instance
-- and reset on every cold start / redeploy — on Vercel that meant the real
-- effective limit was (configured limit × running instance count), not the
-- configured limit, making brute-force protection on auth routes and the
-- billing guard on the unauthenticated AI routes (/api/curate,
-- /api/card-writer) both effectively bypassable.
--
-- This table + function make the fixed-window counter global (one row per
-- key, shared by every serverless instance) and atomic (no separate
-- SELECT-then-UPDATE, so concurrent requests for the same key can't race
-- past the limit).

create table if not exists rate_limit_windows (
  key text primary key,
  count integer not null default 0,
  reset_at timestamptz not null
);

-- Supports a future scheduled cleanup job (`delete from rate_limit_windows
-- where reset_at < now() - <grace period>`) so the table doesn't grow
-- unbounded. Not built in this migration — expired rows are harmless (they
-- just get overwritten/reset on next use of that key) so cleanup is a
-- follow-up, not a blocker for closing the race condition itself.
create index if not exists rate_limit_windows_reset_at_idx on rate_limit_windows (reset_at);

-- Atomically checks whether `p_key` is within `p_limit` requests per
-- `p_window_ms`, incrementing its counter if so.
--
-- Race-safety: this locks the row for `p_key` with `SELECT ... FOR UPDATE`
-- before deciding anything, so two concurrent calls for the same key
-- serialize on that row instead of both reading a stale count and both
-- incrementing past the limit (the exact bug this migration exists to
-- fix). The whole function body runs as part of the single statement the
-- Supabase client issues to call it, so the lock, the read, and the
-- eventual update all happen inside one atomic unit of work.
--
-- For a brand-new key, the initial row doesn't exist yet to lock, so a
-- `INSERT ... ON CONFLICT (key) DO NOTHING` is used first to create it (or
-- silently no-op if a concurrent call just created it), then the loop goes
-- back around to lock whichever row now exists.
create or replace function check_and_increment_rate_limit(
  p_key text,
  p_limit integer,
  p_window_ms bigint
)
returns table (allowed boolean, retry_after_seconds integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_new_reset_at timestamptz := v_now + (p_window_ms::text || ' milliseconds')::interval;
  v_count integer;
  v_reset_at timestamptz;
  v_allowed boolean;
  v_retry_after integer;
begin
  loop
    select w.count, w.reset_at
      into v_count, v_reset_at
      from rate_limit_windows w
     where w.key = p_key
       for update;

    exit when found;

    insert into rate_limit_windows (key, count, reset_at)
    values (p_key, 0, v_now)
    on conflict (key) do nothing;
    -- Loop back around: either our insert landed and the next iteration
    -- locks it, or a concurrent call's insert won and we lock that one.
  end loop;

  if v_reset_at <= v_now then
    -- No row, or the previous window has expired: start a fresh one.
    v_count := 1;
    v_reset_at := v_new_reset_at;
    v_allowed := true;
    v_retry_after := 0;
  elsif v_count < p_limit then
    v_count := v_count + 1;
    v_allowed := true;
    v_retry_after := 0;
  else
    -- At/over the limit: reject WITHOUT incrementing, and report how long
    -- until the current window resets.
    v_allowed := false;
    v_retry_after := greatest(0, ceil(extract(epoch from (v_reset_at - v_now)))::integer);
  end if;

  update rate_limit_windows
     set count = v_count,
         reset_at = v_reset_at
   where key = p_key;

  return query select v_allowed, v_retry_after;
end;
$$;

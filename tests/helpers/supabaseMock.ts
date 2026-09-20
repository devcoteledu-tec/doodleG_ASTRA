import { vi } from 'vitest';

interface MockResult {
  data: unknown;
  error: unknown;
}

/**
 * A minimal fake for supabaseAdmin's fluent query builder
 * (`.from(table).select().eq().order()...`). Responses are queued
 * per-table, FIFO: the first `.from('orders')` call in a test consumes the
 * first entry in `tableResponses.orders`, the second consumes the second,
 * and so on. This is enough to smoke-test route handlers without a real
 * Supabase project, as long as each test asserts the calls it cares about
 * rather than relying on exact query semantics (filtering, ordering, etc.)
 * actually being applied — the mock doesn't filter/sort, it just returns
 * whatever was queued.
 */
export function createSupabaseAdminMock(tableResponses: Record<string, MockResult[]>) {
  const cursors: Record<string, number> = {};
  const fromCalls: string[] = [];
  // Every argument ever passed to `.insert(...)`, keyed by table, in call
  // order — lets tests assert on exactly what would have been written
  // (e.g. that a server-computed price landed in the row, not a
  // client-supplied one) rather than only which tables were touched.
  const insertedRows: Record<string, unknown[]> = {};
  // Same idea for `.update(...)` payloads — needed to assert on partial
  // writes like the auth/google email-squatter mitigation (which must
  // wipe password_hash + auth_provider on the affected row).
  const updatedRows: Record<string, unknown[]> = {};
  let lastUpdatePayload: unknown = undefined;
  // Every `.rpc(fnName, params)` call, in call order — lets tests assert on
  // exactly which Postgres function was called and with what arguments.
  const rpcCalls: { fn: string; params: unknown }[] = [];

  function nextResult(table: string): MockResult {
    const queue = tableResponses[table] || [];
    const idx = cursors[table] ?? 0;
    cursors[table] = idx + 1;
    return queue[idx] ?? (table === 'rpc:check_and_increment_rate_limit' ? { data: [{ allowed: true, retry_after_seconds: 0 }], error: null } : { data: null, error: null });
  }

  function makeBuilder(table: string) {
    const builder: Record<string, unknown> = {};
    const chain = (): unknown => builder;
    for (const method of ['select', 'eq', 'ilike', 'order', 'delete', 'neq', 'in', 'gte', 'lte', 'limit', 'is', 'not', 'range', 'gt']) {
      builder[method] = vi.fn(chain);
    }
    builder.update = vi.fn((payload: unknown) => {
      (updatedRows[table] ??= []).push(payload);
      lastUpdatePayload = payload;
      return chain();
    });
    builder.upsert = vi.fn((rows: unknown) => { (insertedRows[table] ??= []).push(rows); return chain(); });
    builder.insert = vi.fn((rows: unknown) => {
      (insertedRows[table] ??= []).push(rows);
      return chain();
    });
    builder.single = vi.fn(() => Promise.resolve(nextResult(table)));
    builder.maybeSingle = vi.fn(() => Promise.resolve(nextResult(table)));
    // Support `await supabaseAdmin.from(x).insert(y)` with no terminal
    // .single()/.maybeSingle() call, by making the builder itself thenable.
    builder.then = (resolve: (v: MockResult) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(nextResult(table)).then(resolve, reject);
    return builder;
  }

  const from = vi.fn((table: string) => {
    fromCalls.push(table);
    return makeBuilder(table);
  });

  // `.rpc('fnName', params)` calls are queued FIFO per function name, same
  // pattern as `.from(table)...` above: queue responses under
  // `tableResponses['rpc:fnName']` and the Nth call to that function
  // consumes the Nth queued entry.
  const rpc = vi.fn((fn: string, params: unknown) => {
    rpcCalls.push({ fn, params });
    return Promise.resolve(nextResult(`rpc:${fn}`));
  });

  return {
    from,
    fromCalls,
    insertedRows,
    updatedRows,
    /** Convenience: last payload passed to any `.update(...)` call. */
    get lastUpdatePayload() {
      return lastUpdatePayload;
    },
    rpc,
    rpcCalls,
  };
}

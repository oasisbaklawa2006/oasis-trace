// Bounded retry for inserts whose row includes a randomly-generated
// human-readable identifier (src/lib/numbering.ts) that can collide under
// concurrent multi-terminal use. On a confirmed unique-constraint violation
// (23505) the row is rebuilt — including a freshly generated identifier —
// and the insert retried, up to a hard attempt cap. Any other error, or
// exhausting the cap, propagates immediately; this never loops unbounded.
import { insertRow, isDuplicateError } from "@/lib/data";

const DEFAULT_MAX_ATTEMPTS = 5;

/**
 * @param table Supabase/demo table name.
 * @param buildRow Builds the row to insert. Called once per attempt so it
 *   must generate a fresh identifier each time (e.g. `num.carton()`), not
 *   reuse a value computed before the first attempt.
 * @param maxAttempts Hard cap on insert attempts (default 5). Never retries
 *   more than this many times, regardless of error type.
 */
export async function insertWithUniqueRetry<T>(
  table: string,
  buildRow: () => object,
  maxAttempts = DEFAULT_MAX_ATTEMPTS,
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await insertRow<T>(table, buildRow());
    } catch (e: unknown) {
      lastErr = e;
      if (!isDuplicateError(e) || attempt === maxAttempts) throw e;
      // else: confirmed ID collision with attempts remaining — loop and
      // rebuild the row (buildRow regenerates the identifier).
    }
  }
  // Unreachable — the loop always returns or throws — but keeps TS happy
  // and guards against a future refactor silently falling through.
  throw lastErr instanceof Error ? lastErr : new Error(`Failed to insert into ${table} after ${maxAttempts} attempts.`);
}

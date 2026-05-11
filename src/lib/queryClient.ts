// Centralized react-query keys for ols_ tables. Pages can use these to share
// cache + invalidate consistently. Backwards-compatible: existing useEffect
// fetches still work; this is opt-in.
export const olsKeys = {
  all: ["ols"] as const,
  table: (t: string) => ["ols", t] as const,
  row: (t: string, id: string) => ["ols", t, id] as const,
};

/** Suggested staleTime tiers (ms). */
export const STALE = {
  master: 5 * 60_000,    // products, departments, printers
  hot: 5_000,            // labels, cartons, scans
};

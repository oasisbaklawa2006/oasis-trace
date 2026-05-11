// Print lock + recent-print tracker.
//
// Goal: prevent accidental rapid double-prints (operator double-clicks, scanner
// re-fires, network hiccup retry). Two layers:
//   1) hard lock: same ref cannot fire again for `LOCK_MS` (default 2.5s).
//   2) soft warning: same ref printed within `RECENT_MS` (default 60s)
//      surfaces a "printed recently" hint so the caller can confirm.
//
// All state is in-memory + sessionStorage (per-tab). Cleared on reload.
// This is intentionally client-side only; the authoritative duplicate check
// is the `ols_print_logs` insert + downstream report.

const LOCK_MS = 2500;
const RECENT_MS = 60_000;
const KEY = "ols_recent_prints";

interface RecentEntry { at: number; count: number; }

const locks = new Map<string, number>(); // ref -> unlock timestamp

function loadRecent(): Record<string, RecentEntry> {
  try { return JSON.parse(sessionStorage.getItem(KEY) || "{}"); } catch { return {}; }
}
function saveRecent(m: Record<string, RecentEntry>) {
  try { sessionStorage.setItem(KEY, JSON.stringify(m)); } catch { /* ignore */ }
}

function key(refType: string, refId: string) { return `${refType}:${refId}`; }

/** Returns true if this ref is currently print-locked. */
export function isLocked(refType: string, refId: string): boolean {
  const k = key(refType, refId);
  const until = locks.get(k);
  if (!until) return false;
  if (Date.now() >= until) { locks.delete(k); return false; }
  return true;
}

/** Acquire the print lock. Returns false if already locked. */
export function acquireLock(refType: string, refId: string, ms = LOCK_MS): boolean {
  if (isLocked(refType, refId)) return false;
  locks.set(key(refType, refId), Date.now() + ms);
  return true;
}

export function releaseLock(refType: string, refId: string) {
  locks.delete(key(refType, refId));
}

/** Returns { recent, count, ageMs } if this ref was printed within RECENT_MS. */
export function checkRecent(refType: string, refId: string): { recent: boolean; count: number; ageMs: number } {
  const m = loadRecent();
  const k = key(refType, refId);
  const e = m[k];
  if (!e) return { recent: false, count: 0, ageMs: Infinity };
  const age = Date.now() - e.at;
  if (age > RECENT_MS) return { recent: false, count: e.count, ageMs: age };
  return { recent: true, count: e.count, ageMs: age };
}

/** Record a successful print. Called after the actual print fires. */
export function markPrinted(refType: string, refId: string) {
  const m = loadRecent();
  const k = key(refType, refId);
  const prev = m[k];
  m[k] = { at: Date.now(), count: (prev?.count || 0) + 1 };
  // Trim — keep only entries from last 5 minutes
  const cutoff = Date.now() - 5 * 60_000;
  for (const kk of Object.keys(m)) if (m[kk].at < cutoff) delete m[kk];
  saveRecent(m);
}

/**
 * One-shot guard suitable for inline use:
 *
 *   const guard = guardPrint("production_label", id);
 *   if (!guard.ok) { toast.warning(guard.message); return; }
 *   try { await fire(); guard.confirm(); } finally { guard.release(); }
 */
export function guardPrint(refType: string, refId: string, opts?: {
  /** If true, recent prints block instead of warn. */
  blockOnRecent?: boolean;
}) {
  if (isLocked(refType, refId)) {
    return { ok: false as const, message: "Already printing — please wait.", confirm: () => {}, release: () => {} };
  }
  const recent = checkRecent(refType, refId);
  if (recent.recent && opts?.blockOnRecent) {
    return { ok: false as const, message: `Printed ${Math.round(recent.ageMs / 1000)}s ago — duplicate blocked.`, confirm: () => {}, release: () => {} };
  }
  acquireLock(refType, refId);
  return {
    ok: true as const,
    warning: recent.recent ? `Printed ${Math.round(recent.ageMs / 1000)}s ago (×${recent.count}). Continue?` : undefined,
    confirm: () => markPrinted(refType, refId),
    release: () => releaseLock(refType, refId),
  };
}

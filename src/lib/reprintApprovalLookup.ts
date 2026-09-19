import { supabase, supabaseConfigured } from "@/lib/supabase";
import type { ReprintRefType, ReprintRow } from "@/lib/reprintPolicy";
import type { PrintLogRow } from "@/lib/types";

function logContainsRequest(log: PrintLogRow, requestId: string): boolean {
  const reason = log.reason ?? log.metadata?.reason ?? "";
  return reason.split("|").some(part => part === `request=${requestId}`);
}

/**
 * Live-only reusable-approval lookup for governed reprints.
 *
 * Unlike listTable(), this never falls back to the local demo store: a failed
 * configured-live read throws instead of resolving to an empty result. A
 * caller in live mode must treat that failure as "unknown", not as "no
 * approved request exists" — the latter would let confirmLive create a new
 * pending request and obtain a new Core reprint-count allocation for a
 * reprint that was already approved.
 */
export async function findReusableApprovedRequestLive(
  refType: ReprintRefType,
  refId: string,
): Promise<ReprintRow | null> {
  if (!supabaseConfigured || !supabase) {
    throw new Error("Live reusable-approval lookup requires a configured Supabase backend");
  }

  const [reqResult, logResult] = await Promise.all([
    supabase
      .from("ols_reprint_requests")
      .select("*")
      .eq("ref_type", refType)
      .eq("ref_id", refId)
      .eq("status", "approved"),
    supabase
      .from("ols_print_logs")
      .select("*")
      .eq("ref_type", refType)
      .eq("ref_id", refId)
      .eq("is_reprint", true)
      .eq("success", true),
  ]);

  if (reqResult.error) {
    throw new Error(`Live reusable-approval lookup failed: ${reqResult.error.message}`);
  }
  if (logResult.error) {
    throw new Error(`Live reprint-log lookup failed: ${logResult.error.message}`);
  }

  const requests = (reqResult.data ?? []) as ReprintRow[];
  const logs = (logResult.data ?? []) as PrintLogRow[];

  const candidates = requests
    .filter(row => Boolean(row.approved_by))
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));

  return candidates.find(row => !logs.some(log => logContainsRequest(log, row.id))) ?? null;
}

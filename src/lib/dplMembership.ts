// ols_dpl_cartons is the authoritative DPL <-> carton membership relation.
// order_ref is a soft, non-FK grouping (multiple DPLs/PIs can share one
// order_ref) and must never be used to infer DPL membership — doing so can
// surface a carton that was never actually placed on the selected DPL, or
// let a Finance PI silently accept cartons that belong to a different DPL.
import type { Carton, DplCarton } from "@/lib/types";

type DplCartonLink = Pick<DplCarton, "dpl_id" | "carton_id">;

/** Returns only the cartons genuinely linked to `dplId` via ols_dpl_cartons. */
export function resolveDplMemberCartons(dplId: string, dplCartons: DplCartonLink[], cartons: Carton[]): Carton[] {
  const memberIds = new Set(dplCartons.filter(dc => dc.dpl_id === dplId).map(dc => dc.carton_id));
  return cartons.filter(c => memberIds.has(c.id));
}

// Deliberately a flat shape (not a discriminated union) — this repo builds
// with strictNullChecks disabled (tsconfig.app.json strict:false), under
// which TS's control-flow narrowing of `{ok:true;dplId}|{ok:false;reason}`
// unions is unreliable (confirmed: `if (!x.ok) x.reason` fails to narrow).
// `ok` is always present; `dplId` is set when ok is true, `reason` when false.
export interface CartonDplCheck {
  ok: boolean;
  dplId?: string;
  reason?: string;
}

/**
 * Looks up which DPL (if any) a carton is a genuine FK member of. Fails
 * closed: a carton with no ols_dpl_cartons row is NOT eligible, since Trace
 * has no approved contract permitting a Finance PI (or any downstream
 * document) to accept a carton that was never placed on a DPL.
 */
export function checkCartonDplMembership(cartonId: string, dplCartons: DplCartonLink[]): CartonDplCheck {
  const link = dplCartons.find(dc => dc.carton_id === cartonId);
  if (!link) {
    return { ok: false, reason: "Carton is not linked to any DPL — add it to a DPL before Finance PI." };
  }
  return { ok: true, dplId: link.dpl_id };
}

/**
 * Validates a scanned carton against the DPL an in-progress Finance PI is
 * already committed to (if any), so a PI can never mix cartons from two
 * different DPLs. `activePiDplId` is undefined for a PI created before this
 * enforcement existed (never rewritten) — such legacy PIs are not
 * retroactively restricted, only newly-created ones are.
 */
export function validateCartonForPi(
  cartonId: string,
  activePiDplId: string | null | undefined,
  dplCartons: DplCartonLink[],
): CartonDplCheck {
  const membership = checkCartonDplMembership(cartonId, dplCartons);
  if (!membership.ok) return membership;
  if (activePiDplId && membership.dplId !== activePiDplId) {
    return { ok: false, reason: "Carton belongs to a different DPL than this Finance PI — cannot mix DPLs on one PI." };
  }
  return membership;
}

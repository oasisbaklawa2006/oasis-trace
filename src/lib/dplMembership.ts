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
 * Looks up which DPL a carton is a genuine FK member of. Fails closed: a
 * carton with no ols_dpl_cartons row is NOT eligible, since Trace has no
 * approved contract permitting a Finance PI (or any downstream document) to
 * accept a carton that was never placed on a DPL. Also fails closed when a
 * carton has links to more than one distinct DPL — an ambiguous membership
 * is a blocking integrity error, never a best-effort pick of the first match.
 * (The DB additionally enforces a carton-belongs-to-one-DPL uniqueness
 * constraint; this defends against pre-constraint or stale client state.)
 */
export function checkCartonDplMembership(cartonId: string, dplCartons: DplCartonLink[]): CartonDplCheck {
  const links = dplCartons.filter(dc => dc.carton_id === cartonId);
  const distinctDpls = new Set(links.map(l => l.dpl_id));
  if (distinctDpls.size === 0) {
    return { ok: false, reason: "Carton is not linked to any DPL — add it to a DPL before Finance PI." };
  }
  if (distinctDpls.size > 1) {
    return { ok: false, reason: "Carton is ambiguously linked to multiple DPLs — membership cannot be proven." };
  }
  return { ok: true, dplId: links[0].dpl_id };
}

/**
 * Validates a scanned carton against the DPL an in-progress Finance PI is
 * already committed to, so a PI can never mix cartons from two different
 * DPLs. `activePi` distinguishes "no PI yet" (null/undefined — a new PI may
 * be started) from "a PI already exists" — an existing PI with no provable
 * dpl_id is rejected outright (fail closed), never treated as unrestricted.
 */
export function validateCartonForPi(
  cartonId: string,
  activePi: { dpl_id?: string | null } | null | undefined,
  dplCartons: DplCartonLink[],
): CartonDplCheck {
  const membership = checkCartonDplMembership(cartonId, dplCartons);
  if (!membership.ok) return membership;
  if (activePi) {
    if (!activePi.dpl_id) {
      return { ok: false, reason: "Active Finance PI has no proven DPL — cannot verify carton membership." };
    }
    if (membership.dplId !== activePi.dpl_id) {
      return { ok: false, reason: "Carton belongs to a different DPL than this Finance PI — cannot mix DPLs on one PI." };
    }
  }
  return membership;
}

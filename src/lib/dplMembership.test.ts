import { describe, it, expect } from "vitest";
import { resolveDplMemberCartons, checkCartonDplMembership, validateCartonForPi } from "./dplMembership";
import type { Carton, DplCarton } from "@/lib/types";

const cartons: Carton[] = [
  { id: "carton-1", carton_no: "CTN-001", order_ref: "SO-1", status: "packed" },
  { id: "carton-2", carton_no: "CTN-002", order_ref: "SO-1", status: "packed" }, // same order_ref, different DPL
  { id: "carton-3", carton_no: "CTN-003", order_ref: "SO-1", status: "packed" }, // same order_ref, no DPL at all
];

const dplCartons: DplCarton[] = [
  { id: "link-1", dpl_id: "dpl-A", carton_id: "carton-1", position: 1 },
  { id: "link-2", dpl_id: "dpl-B", carton_id: "carton-2", position: 1 },
];

describe("resolveDplMemberCartons", () => {
  it("returns only cartons with a genuine ols_dpl_cartons link to the selected DPL", () => {
    const members = resolveDplMemberCartons("dpl-A", dplCartons, cartons);
    expect(members.map(c => c.id)).toEqual(["carton-1"]);
  });

  it("does not include a carton merely because its order_ref matches — requirement 4", () => {
    const members = resolveDplMemberCartons("dpl-A", dplCartons, cartons);
    expect(members.some(c => c.id === "carton-2")).toBe(false); // linked to dpl-B, same order_ref
    expect(members.some(c => c.id === "carton-3")).toBe(false); // no DPL link at all, same order_ref
  });
});

describe("checkCartonDplMembership", () => {
  it("accepts a carton with a real DPL link and returns its dpl_id", () => {
    expect(checkCartonDplMembership("carton-1", dplCartons)).toEqual({ ok: true, dplId: "dpl-A" });
  });

  it("fails closed for a carton with no DPL membership at all", () => {
    const result = checkCartonDplMembership("carton-3", dplCartons);
    expect(result.ok).toBe(false);
    expect(result.reason).toBeTruthy();
  });
});

describe("validateCartonForPi", () => {
  it("requirement 1: same SO + selected-DPL member -> accepted", () => {
    const result = validateCartonForPi("carton-1", "dpl-A", dplCartons);
    expect(result).toEqual({ ok: true, dplId: "dpl-A" });
  });

  it("requirement 2: same SO + different DPL -> rejected", () => {
    const result = validateCartonForPi("carton-2", "dpl-A", dplCartons);
    expect(result.ok).toBe(false);
  });

  it("requirement 3: same SO + no DPL membership -> rejected (fail closed)", () => {
    const result = validateCartonForPi("carton-3", "dpl-A", dplCartons);
    expect(result.ok).toBe(false);
  });

  it("requirement 5: a PI cannot mix cartons from different DPLs across multiple scans", () => {
    const first = validateCartonForPi("carton-1", undefined, dplCartons);
    expect(first).toEqual({ ok: true, dplId: "dpl-A" });
    // Once the PI is committed to dpl-A (from the first scan), a carton on
    // dpl-B must be rejected even though nothing else about it is invalid.
    const second = validateCartonForPi("carton-2", first.dplId, dplCartons);
    expect(second.ok).toBe(false);
  });

  it("does not restrict a legacy PI that has no dpl_id (never rewritten)", () => {
    // activePiDplId undefined/null represents a PI created before this
    // enforcement existed; it should not retroactively reject cartons based
    // on DPL identity, only require SOME DPL membership.
    const result = validateCartonForPi("carton-1", null, dplCartons);
    expect(result).toEqual({ ok: true, dplId: "dpl-A" });
  });
});

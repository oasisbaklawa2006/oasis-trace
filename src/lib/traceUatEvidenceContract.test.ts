import { describe, expect, it } from "vitest";
import {
  TRACE_UAT_PHYSICAL_SCANNER_DISCLAIMER,
  TRACE_UAT_SCENARIOS,
  TRACE_UAT_SYNTHETIC_GATE_BARCODE,
  assertScenarioRoutesRegistered,
  classifyMutationRequest,
  isMutationUrlAllowed,
} from "./traceUatEvidenceContract";
import { classifyCartonBarcode } from "./scanContract";

describe("traceUatEvidenceContract — governed read-only UAT harness", () => {
  it("maps UAT-0128..0131 to registered Trace census routes", () => {
    expect(() => assertScenarioRoutesRegistered()).not.toThrow();
    expect(TRACE_UAT_SCENARIOS.map(s => s.uatId)).toEqual([
      "UAT-0128",
      "UAT-0129",
      "UAT-0130",
      "UAT-0131",
    ]);
    expect(TRACE_UAT_SCENARIOS.find(s => s.uatId === "UAT-0128")?.route).toBe("/");
    expect(TRACE_UAT_SCENARIOS.find(s => s.uatId === "UAT-0129")?.route).toBe("/gate");
    expect(TRACE_UAT_SCENARIOS.find(s => s.uatId === "UAT-0130")?.route).toBe("/cartons");
    expect(TRACE_UAT_SCENARIOS.find(s => s.uatId === "UAT-0131")?.route).toBe("/gate");
  });

  it("documents physical scanner separation", () => {
    expect(TRACE_UAT_PHYSICAL_SCANNER_DISCLAIMER.toLowerCase()).toContain("physical scanner");
    expect(TRACE_UAT_PHYSICAL_SCANNER_DISCLAIMER.toLowerCase()).toContain("leap13");
  });

  it("uses synthetic gate barcode that does not classify as legacy shipping QR", () => {
    expect(classifyCartonBarcode(TRACE_UAT_SYNTHETIC_GATE_BARCODE)).toBe("central");
  });

  it("fail-closed mutation classifier treats POST as mutation unless allowlisted", () => {
    expect(classifyMutationRequest("POST", "https://example.supabase.co/rest/v1/ols_gate_scans")).toBe(true);
    expect(classifyMutationRequest("GET", "https://example.supabase.co/rest/v1/ols_gate_scans")).toBe(false);
    expect(isMutationUrlAllowed("https://noop.example/allowed")).toBe(false);
  });

  it("locks forbidden mutation actions on gate and carton scenarios", () => {
    const gate = TRACE_UAT_SCENARIOS.find(s => s.uatId === "UAT-0129");
    const carton = TRACE_UAT_SCENARIOS.find(s => s.uatId === "UAT-0130");
    expect(gate?.forbiddenActions).toContain("central_submit");
    expect(gate?.forbiddenActions).toContain("legacy_gate_dispatch_mutation");
    expect(carton?.forbiddenActions).toContain("start_carton");
    expect(carton?.forbiddenActions).toContain("seal_carton");
  });
});

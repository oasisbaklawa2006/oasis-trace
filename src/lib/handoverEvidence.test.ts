import { describe, expect, it } from "vitest";
import {
  assertSoftwareChainEvidence,
  buildHandoverEvidence,
  isAuthenticatedHandoverEvidence,
  verifyHandoverEvidence,
} from "./handoverEvidence";

describe("handoverEvidence", () => {
  it("builds verifiable handover evidence", async () => {
    const evidence = await buildHandoverEvidence("gate", "shipping_label", "lbl-1", "SHP-0001", { result: "green" });
    expect(evidence.version).toBe("1.0");
    expect(evidence.integrityClass).toBe("software_chain_v1");
    expect(evidence.contentHash).toHaveLength(64);
    expect(await verifyHandoverEvidence(evidence)).toBe(true);
  });

  it("chains prior hash into subsequent evidence", async () => {
    const first = await buildHandoverEvidence("packing", "carton", "c-1", "CTN-1", { labels: 3 });
    const second = await buildHandoverEvidence(
      "dispatch",
      "carton",
      "c-1",
      "CTN-1",
      { status: "dispatched" },
      { priorHash: first.chainHash },
    );
    expect(second.chainHash).not.toBe(first.chainHash);
    expect(await verifyHandoverEvidence(second, first.chainHash)).toBe(true);
  });

  it("marks software_chain evidence as not authenticated", async () => {
    const evidence = await buildHandoverEvidence("packing", "carton", "c-1", "CTN-1", {});
    expect(isAuthenticatedHandoverEvidence(evidence)).toBe(false);
    assertSoftwareChainEvidence(evidence);
  });
});

import { describe, it, expect } from "vitest";
import {
  PACKING_CARTON_CONTRACT_VERSION,
  PACKING_PRODUCER_CONSUMER_MATRIX,
  computeCartonWeights,
  isCartonEditable,
  isCartonSealed,
  isPermanentPackingFailure,
  validateAddContent,
  validateCreateCarton,
  validateDplHandoffBoundary,
  validateOrderPackTotals,
  validatePackedCartonForDownstream,
  validateReopenGovernance,
  validateSealCarton,
} from "./packingContract";
import type { Carton, CartonContent, OrderCache, ProductionLabel } from "./types";

const ORDER_ID = "550e8400-e29b-41d4-a716-446655440000";
const ORDER_NUMBER = "SO-2026-0001";

const orders: Pick<OrderCache, "id" | "order_number" | "metadata">[] = [
  { id: ORDER_ID, order_number: ORDER_NUMBER },
  {
    id: "660e8400-e29b-41d4-a716-446655440001",
    order_number: "SO-2026-0099",
    metadata: { lines: [{ sku: "CPB-5000", quantity: 2 }] },
  },
];

const draftCarton: Carton = {
  id: "carton-draft-1",
  carton_no: "CTN-20260906-0001",
  order_ref: ORDER_NUMBER,
  status: "draft",
};

const packedCarton: Carton = {
  id: "carton-packed-1",
  carton_no: "CTN-20260906-0002",
  order_ref: ORDER_NUMBER,
  status: "packed",
  net_weight: 5,
  gross_weight: 5.25,
};

const labels: ProductionLabel[] = [
  {
    id: "label-1",
    label_no: "PL-20260906-0001",
    net_weight: 2,
    gross_weight: 2.18,
    metadata: { sku: "CPB-5000", product_name: "Cashew Pyramid" },
  },
  {
    id: "label-2",
    label_no: "PL-20260906-0002",
    net_weight: 3,
    gross_weight: 3.07,
    metadata: { sku: "ASB-2000", product_name: "Assorted Baklawa" },
  },
  {
    id: "label-3",
    label_no: "PL-20260906-0003",
    metadata: { sku: "CPB-5000" },
  },
];

describe("PACKING_PRODUCER_CONSUMER_MATRIX", () => {
  it("documents all Point 92 packing surfaces for census", () => {
    const surfaces = PACKING_PRODUCER_CONSUMER_MATRIX.map(r => r.surface);
    expect(surfaces).toContain("carton_identity");
    expect(surfaces).toContain("carton_contents");
    expect(surfaces).toContain("sealed_composition_immutability");
    expect(surfaces).toContain("dpl_handoff_boundary");
    expect(surfaces).toContain("central_carton_identity_gate");
    expect(PACKING_PRODUCER_CONSUMER_MATRIX.every(r => r.version === PACKING_CARTON_CONTRACT_VERSION)).toBe(
      true,
    );
  });
});

describe("validateCreateCarton", () => {
  it("accepts create when order exists in canonical cache", () => {
    const r = validateCreateCarton({ orderRef: ORDER_NUMBER, orders });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data?.order.id).toBe(ORDER_ID);
  });

  it("rejects unresolved order reference", () => {
    const r = validateCreateCarton({ orderRef: "", orders });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("order_unresolved");
  });

  it("rejects order not in canonical cache", () => {
    const r = validateCreateCarton({ orderRef: "SO-2026-999999", orders });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("order_not_found");
  });

  it("rejects duplicate carton_no", () => {
    const r = validateCreateCarton({
      orderRef: ORDER_NUMBER,
      orders,
      existingCartonNos: ["CTN-20260906-0001"],
      proposedCartonNo: "CTN-20260906-0001",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("duplicate_carton_no");
  });
});

describe("validateAddContent", () => {
  const contents: CartonContent[] = [];

  it("accepts label add to draft carton", () => {
    const r = validateAddContent({
      carton: draftCarton,
      labelId: "label-1",
      label: labels[0],
      existingContents: contents,
      packedLabelIds: new Set(),
    });
    expect(r.ok).toBe(true);
  });

  it("rejects add to sealed carton", () => {
    const r = validateAddContent({
      carton: packedCarton,
      labelId: "label-1",
      label: labels[0],
      existingContents: [],
      packedLabelIds: new Set(),
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("content_edit_after_seal");
  });

  it("rejects duplicate label in same carton", () => {
    const r = validateAddContent({
      carton: draftCarton,
      labelId: "label-1",
      label: labels[0],
      existingContents: [{ production_label_id: "label-1" }],
      packedLabelIds: new Set(),
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("duplicate_label");
  });

  it("rejects label already packed elsewhere", () => {
    const r = validateAddContent({
      carton: draftCarton,
      labelId: "label-1",
      label: labels[0],
      existingContents: [],
      packedLabelIds: new Set(["label-1"]),
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("label_already_packed");
  });

  it("rejects unknown label", () => {
    const r = validateAddContent({
      carton: draftCarton,
      labelId: "missing",
      label: null,
      existingContents: [],
      packedLabelIds: new Set(),
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("label_not_found");
  });
});

describe("validateSealCarton", () => {
  it("accepts seal when identity verified for central order", () => {
    const r = validateSealCarton({
      carton: draftCarton,
      contents: [{ production_label_id: "label-1" }],
      labels,
      identityVerified: true,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data?.net).toBe(2);
      expect(r.data?.gross).toBe(2.18);
    }
  });

  it("blocks seal without CTN-SO identity for central orders", () => {
    const r = validateSealCarton({
      carton: draftCarton,
      contents: [{ production_label_id: "label-1" }],
      labels,
      identityVerified: false,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("identity_not_verified");
  });

  it("rejects empty carton seal", () => {
    const r = validateSealCarton({
      carton: draftCarton,
      contents: [],
      labels,
      identityVerified: true,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("empty_carton");
  });

  it("rejects seal when label weights are missing", () => {
    const r = validateSealCarton({
      carton: draftCarton,
      contents: [{ production_label_id: "label-3" }],
      labels,
      identityVerified: true,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("missing_weight_authority");
  });

  it("rejects re-seal of already packed carton", () => {
    const r = validateSealCarton({
      carton: packedCarton,
      contents: [{ production_label_id: "label-1" }],
      labels,
      identityVerified: true,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("carton_already_sealed");
  });
});

describe("computeCartonWeights", () => {
  it("sums weights from production label authority only", () => {
    const totals = computeCartonWeights(
      [
        { production_label_id: "label-1" },
        { production_label_id: "label-2" },
      ],
      labels,
    );
    expect(totals.net).toBe(5);
    expect(totals.gross).toBeCloseTo(5.25);
    expect(totals.hasMissingWeights).toBe(false);
  });

  it("flags missing weight authority without inventing values", () => {
    const totals = computeCartonWeights(
      [{ production_label_id: "label-3" }],
      labels,
    );
    expect(totals.net).toBe(0);
    expect(totals.hasMissingWeights).toBe(true);
  });
});

describe("validateOrderPackTotals — overpack protection", () => {
  it("passes when order has no authoritative line metadata", () => {
    const r = validateOrderPackTotals({
      order: orders[0],
      orderRef: ORDER_NUMBER,
      allCartonContents: [],
      cartonsForOrder: [draftCarton],
      labels,
      proposedLabelId: "label-1",
    });
    expect(r.ok).toBe(true);
  });

  it("rejects when pack exceeds ordered quantity from metadata", () => {
    const orderWithLines = orders[1];
    const r = validateOrderPackTotals({
      order: orderWithLines,
      orderRef: "SO-2026-0099",
      allCartonContents: [
        { carton_id: "other", production_label_id: "label-1" },
        { carton_id: "other", production_label_id: "label-1b" },
      ],
      cartonsForOrder: [{ id: "other", order_ref: "SO-2026-0099", status: "draft" }],
      labels: [
        ...labels,
        { id: "label-1b", label_no: "PL-x", metadata: { sku: "CPB-5000" } },
      ],
      proposedLabelId: "label-3",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("overpack_exceeds_order");
  });
});

describe("validateReopenGovernance", () => {
  it("allows reopen of draft carton without approval", () => {
    expect(validateReopenGovernance({ status: "draft" }).ok).toBe(true);
  });

  it("blocks reopen of sealed carton without approval", () => {
    const r = validateReopenGovernance({ status: "packed" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("unauthorized_reopen");
  });

  it("allows reopen of sealed carton with supervisor approval", () => {
    const r = validateReopenGovernance({ status: "packed" }, { approvedBy: "supervisor-1" });
    expect(r.ok).toBe(true);
  });
});

describe("validateDplHandoffBoundary", () => {
  it("accepts packed cartons with proven contents and weights", () => {
    const r = validateDplHandoffBoundary(
      [packedCarton],
      [{ carton_id: packedCarton.id, production_label_id: "label-1" }],
      [packedCarton.id],
      ORDER_NUMBER,
    );
    expect(r.ok).toBe(true);
  });

  it("rejects draft cartons for DPL", () => {
    const r = validateDplHandoffBoundary(
      [draftCarton],
      [],
      [draftCarton.id],
      ORDER_NUMBER,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("dpl_handoff_prerequisite");
  });

  it("rejects cartons with order binding mismatch", () => {
    const r = validateDplHandoffBoundary(
      [{ ...packedCarton, order_ref: "SO-2026-OTHER" }],
      [{ carton_id: packedCarton.id, production_label_id: "label-1" }],
      [packedCarton.id],
      ORDER_NUMBER,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("dpl_handoff_prerequisite");
  });
});

describe("validatePackedCartonForDownstream", () => {
  it("accepts packed carton for Finance PI scan", () => {
    expect(validatePackedCartonForDownstream(packedCarton).ok).toBe(true);
  });

  it("rejects draft carton for downstream", () => {
    const r = validatePackedCartonForDownstream(draftCarton);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("not_packed_for_downstream");
  });
});

describe("carton status helpers", () => {
  it("identifies editable vs sealed statuses", () => {
    expect(isCartonEditable({ status: "draft" })).toBe(true);
    expect(isCartonSealed({ status: "packed" })).toBe(true);
    expect(isCartonEditable({ status: "packed" })).toBe(false);
  });
});

describe("isPermanentPackingFailure", () => {
  it("marks integrity violations as permanent", () => {
    expect(isPermanentPackingFailure("content_edit_after_seal")).toBe(true);
    expect(isPermanentPackingFailure("identity_not_verified")).toBe(true);
    expect(isPermanentPackingFailure("invalid_contract")).toBe(false);
  });
});

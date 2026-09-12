import { beforeEach, describe, expect, it, vi } from "vitest";
import { PREVIEW_BARCODE_IDENTITIES } from "./barcodeIdentity";

const inserted: Array<{ table: string; row: Record<string, unknown> }> = [];
const templates = [
  { id: "tpl-prod", name: "Product 75x50", label_type: "product", width_mm: 75, height_mm: 50 },
  { id: "tpl-carton", name: "Carton 100x75", label_type: "carton", width_mm: 100, height_mm: 75 },
  { id: "tpl-ship", name: "Shipping 100x150", label_type: "shipping", width_mm: 100, height_mm: 150 },
];

vi.mock("@/lib/data", () => ({
  listTable: vi.fn(async (table: string) => {
    if (table === "ols_label_templates") return templates;
    if (table === "ols_printers") return [{ id: "p1", name: "TSC", command_lang: "TSPL" }];
    if (table === "ols_production_labels") {
      return [{
        id: "lbl-1",
        label_no: "PL-20260906-0001",
        mfg_date: "2026-09-06",
        best_before: "2026-12-05",
        net_weight: 5,
        gross_weight: 5.25,
        metadata: { product_name: "Test", sku: "SKU-1", batch_no: "BAT-1" },
      }];
    }
    if (table === "ols_cartons") {
      return [{
        id: "ctn-1",
        carton_no: "CTN-20260906-0001",
        order_ref: "SO-2026-0001",
        customer_name: "Customer",
        carton_index: 1,
        net_weight: 10,
        metadata: { barcode_mode: "legacy", legacy_carton_no: "CTN-20260906-0001" },
      }];
    }
    if (table === "ols_carton_contents") {
      return [
        { id: "cc-1", carton_id: "ctn-1", production_label_id: "lbl-1" },
        { id: "cc-2", carton_id: "ctn-1", manual_sku: "SKU-2", manual_qty: 2 },
      ];
    }
    if (table === "ols_shipping_labels") {
      return [{
        id: "ship-1",
        shipping_no: "SHP-20260906-0001",
        qr_ref: "QR-202609060001",
        consignee: "Customer",
        invoice_ref: "INV-1",
      }];
    }
    return [];
  }),
  insertRow: vi.fn(async (table: string, row: Record<string, unknown>) => {
    const full = { id: `${table}-${inserted.length + 1}`, ...row };
    inserted.push({ table, row: full });
    return full;
  }),
}));

import {
  executeGovernedPrint,
  executeGovernedPrintBatch,
  executeGovernedReprint,
  rebuildGovernedPrintRequest,
  resolveTemplateForSurface,
  validatePrintIdentity,
  verifyPrintEquivalence,
  PRINT_AUTHORITY_CENSUS,
} from "./governedPrint";
import { buildProductionLabelPayload, buildShippingLabelPayload } from "./labelPayloads";

beforeEach(() => {
  inserted.length = 0;
  vi.restoreAllMocks();
  Object.assign(navigator, { clipboard: { writeText: vi.fn(async () => {}) } });
});

describe("PRINT_AUTHORITY_CENSUS", () => {
  it("covers production, carton, and shipping surfaces", () => {
    const surfaces = PRINT_AUTHORITY_CENSUS.map(r => r.surface);
    expect(surfaces).toContain("production_label");
    expect(surfaces).toContain("carton");
    expect(surfaces).toContain("shipping");
  });
});

describe("validatePrintIdentity — preview and malformed rejection", () => {
  it("rejects preview identities in production flows", () => {
    const r = validatePrintIdentity("production_label", PREVIEW_BARCODE_IDENTITIES.productionLabel);
    expect(r.ok).toBe(false);
    if (r.ok === false) expect(r.code).toBe("identity_preview");
  });

  it("accepts canonical production label identity", () => {
    const r = validatePrintIdentity("production_label", "PL-20260906-0001");
    expect(r.ok).toBe(true);
  });

  it("accepts central carton barcode for carton surface", () => {
    const r = validatePrintIdentity("carton", "CTN-SO-2026-000136");
    expect(r.ok).toBe(true);
  });
});

describe("resolveTemplateForSurface — template/version binding", () => {
  it("binds production surface to product template from DB", async () => {
    const t = await resolveTemplateForSurface("production_label");
    expect("ok" in t && t.ok === false).toBe(false);
    if (!("ok" in t)) {
      expect(t.version).toBe("Product 75x50@75x50");
      expect(t.widthMm).toBe(75);
    }
  });
});

describe("verifyPrintEquivalence", () => {
  it("passes when barcode matches identity and template dimensions align", () => {
    const payload = buildProductionLabelPayload({
      batchNo: "B", mfgDate: "2026-01-01", shelfLifeDays: 1,
      netWeight: 1, grossWeight: 1, labelNo: "PL-20260906-0001",
    });
    const v = verifyPrintEquivalence(
      payload,
      "PL-20260906-0001",
      { name: "Product 75x50", version: "v1", labelType: "product", widthMm: 75, heightMm: 50, commandLang: "TSPL" },
    );
    expect(v.ok).toBe(true);
  });

  it("fails when displayed barcode does not match canonical identity", () => {
    const payload = buildProductionLabelPayload({
      batchNo: "B", mfgDate: "2026-01-01", shelfLifeDays: 1,
      netWeight: 1, grossWeight: 1, labelNo: "PL-WRONG-0001",
    });
    const v = verifyPrintEquivalence(
      payload,
      "PL-20260906-0001",
      { name: "Product 75x50", version: "v1", labelType: "product", widthMm: 75, heightMm: 50, commandLang: "TSPL" },
    );
    expect(v.ok).toBe(false);
    expect(v.barcodeMatchesIdentity).toBe(false);
  });

  it("verifies shipping QR derivation equivalence", () => {
    const shp = "SHP-20260906-0001";
    const payload = buildShippingLabelPayload({ shippingNo: shp, qrRef: "QR-202609060001" });
    const v = verifyPrintEquivalence(
      payload,
      shp,
      { name: "Shipping", version: "v1", labelType: "shipping", widthMm: 100, heightMm: 150, commandLang: "TSPL" },
      { qrIdentity: "QR-202609060001" },
    );
    expect(v.ok).toBe(true);
    expect(v.qrMatchesShipping).toBe(true);
  });

  it("fails closed when a canonical shipping QR is required but payload QR is missing", () => {
    const shp = "SHP-20260906-0001";
    const payload = buildShippingLabelPayload({ shippingNo: shp, qrRef: "QR-202609060001" });
    delete payload.qr;
    const v = verifyPrintEquivalence(
      payload,
      shp,
      { name: "Shipping", version: "v1", labelType: "shipping", widthMm: 100, heightMm: 150, commandLang: "TSPL" },
      { qrIdentity: "QR-202609060001" },
    );
    expect(v.ok).toBe(false);
    expect(v.qrMatchesShipping).toBe(false);
    expect(v.message).toContain("qr=missing");
  });
});

describe("executeGovernedPrint", () => {
  it("persists print job + log with identity and template metadata", async () => {
    const result = await executeGovernedPrint({
      surface: "production_label",
      refId: "lbl-1",
      barcodeIdentity: "PL-20260906-0001",
      payload: buildProductionLabelPayload({
        batchNo: "BAT-1", mfgDate: "2026-09-06", shelfLifeDays: 90,
        netWeight: 5, grossWeight: 5.25, labelNo: "PL-20260906-0001",
      }),
      actorName: "operator@oasis",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.state).toBe("GENERATED");
      expect(result.command).toContain("PL-20260906-0001");
      const log = inserted.find(r => r.table === "ols_print_logs")?.row;
      expect(String(log?.reason)).toContain("identity=PL-20260906-0001");
      expect(String(log?.reason)).toContain("job=GENERATED");
      expect(String(log?.reason)).toContain("actor=operator@oasis");
    }
  });

  it("fails closed on preview identity", async () => {
    const result = await executeGovernedPrint({
      surface: "production_label",
      refId: "lbl-1",
      barcodeIdentity: PREVIEW_BARCODE_IDENTITIES.productionLabel,
      payload: buildProductionLabelPayload({
        batchNo: "B", mfgDate: "2026-01-01", shelfLifeDays: 1,
        netWeight: 1, grossWeight: 1, labelNo: PREVIEW_BARCODE_IDENTITIES.productionLabel,
      }),
    });
    expect(result.ok).toBe(false);
    if (result.ok === false) expect(result.code).toBe("identity_preview");
    expect(inserted).toHaveLength(0);
  });

  it("fails closed when a supplied printer id cannot be resolved", async () => {
    const result = await executeGovernedPrint({
      surface: "production_label",
      refId: "lbl-1",
      barcodeIdentity: "PL-20260906-0001",
      printerId: "missing-printer",
      payload: buildProductionLabelPayload({
        batchNo: "B", mfgDate: "2026-01-01", shelfLifeDays: 1,
        netWeight: 1, grossWeight: 1, labelNo: "PL-20260906-0001",
      }),
    });
    expect(result.ok).toBe(false);
    if (result.ok === false) expect(result.code).toBe("unsupported_transport");
    expect(inserted).toHaveLength(0);
  });
});

describe("executeGovernedPrintBatch", () => {
  it("preserves actor attribution in batch print logs", async () => {
    const result = await executeGovernedPrintBatch([{
      surface: "production_label",
      refId: "lbl-1",
      barcodeIdentity: "PL-20260906-0001",
      actorName: "batch.operator@oasis",
      payload: buildProductionLabelPayload({
        batchNo: "BAT-1", mfgDate: "2026-09-06", shelfLifeDays: 90,
        netWeight: 5, grossWeight: 5.25, labelNo: "PL-20260906-0001",
      }),
    }]);
    expect(result.results[0]?.ok).toBe(true);
    const log = inserted.find(r => r.table === "ols_print_logs")?.row;
    expect(String(log?.reason)).toContain("actor=batch.operator@oasis");
  });
});

describe("executeGovernedReprint — invariance and reason", () => {
  it("requires a reprint reason", async () => {
    const result = await executeGovernedReprint({
      surface: "shipping",
      refId: "ship-1",
      barcodeIdentity: "SHP-20260906-0001",
      qrIdentity: "QR-202609060001",
      payload: buildShippingLabelPayload({ shippingNo: "SHP-20260906-0001", qrRef: "QR-202609060001" }),
      reprintReason: "",
      isReprint: true,
      reprintCount: 1,
    });
    expect(result.ok).toBe(false);
    if (result.ok === false) expect(result.code).toBe("reprint_reason_required");
  });

  it("preserves original identity and applies watermark", async () => {
    const result = await executeGovernedReprint({
      surface: "shipping",
      refId: "ship-1",
      barcodeIdentity: "SHP-20260906-0001",
      qrIdentity: "QR-202609060001",
      payload: buildShippingLabelPayload({ shippingNo: "SHP-20260906-0001", qrRef: "QR-202609060001" }),
      reprintReason: "Damaged label",
      reprintCount: 1,
      watermark: "DUPLICATE COPY",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.identity).toBe("SHP-20260906-0001");
      expect(result.command).toContain("DUPLICATE COPY");
      const log = inserted.find(r => r.table === "ols_print_logs")?.row;
      expect(log?.is_reprint).toBe(true);
      expect(String(log?.reason)).toContain("reprint=Damaged label");
    }
  });
});

describe("rebuildGovernedPrintRequest", () => {
  it("rebuilds shipping payload from persisted row without re-allocating identity", async () => {
    const req = await rebuildGovernedPrintRequest("shipping", "ship-1");
    expect("ok" in req && req.ok === false).toBe(false);
    if (!("ok" in req)) {
      expect(req.barcodeIdentity).toBe("SHP-20260906-0001");
      expect(req.qrIdentity).toBe("QR-202609060001");
      expect(req.payload.barcode).toBe("SHP-20260906-0001");
    }
  });

  it("rebuilds production shelf-life from persisted mfg/best-before dates", async () => {
    const req = await rebuildGovernedPrintRequest("production_label", "lbl-1");
    expect("ok" in req && req.ok === false).toBe(false);
    if (!("ok" in req)) {
      expect(req.payload.lines.some(line => line.includes("Shelf 90d"))).toBe(true);
    }
  });

  it("rebuilds carton item count from persisted carton contents", async () => {
    const req = await rebuildGovernedPrintRequest("carton", "ctn-1");
    expect("ok" in req && req.ok === false).toBe(false);
    if (!("ok" in req)) {
      expect(req.payload.lines.some(line => line.includes("Items 2"))).toBe(true);
    }
  });
});

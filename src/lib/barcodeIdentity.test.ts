import { describe, it, expect, beforeEach } from "vitest";
import {
  allocateTraceIdentity,
  BARCODE_IDENTITY_AUTHORITY_MATRIX,
  classifyBarcodeIdentity,
  deriveCentralCartonBarcode,
  deriveShippingQrRef,
  isPreviewIdentity,
  normalizeBarcodeIdentity,
  parseBarcodeIdentity,
  PREVIEW_BARCODE_IDENTITIES,
  resetTraceIdentityCounters,
  validateBarcodeIdentity,
} from "./barcodeIdentity";

beforeEach(() => {
  resetTraceIdentityCounters();
});

describe("allocateTraceIdentity — deterministic monotonic allocation", () => {
  const fixedDate = new Date("2026-09-06T12:00:00Z");

  it("allocates sequential production labels per day", () => {
    expect(allocateTraceIdentity("production_label", { date: fixedDate, sequence: 1 })).toBe("PL-20260906-0001");
    expect(allocateTraceIdentity("production_label", { date: fixedDate, sequence: 2 })).toBe("PL-20260906-0002");
  });

  it("increments monotonically without explicit sequence", () => {
    const a = allocateTraceIdentity("legacy_carton", { date: fixedDate });
    const b = allocateTraceIdentity("legacy_carton", { date: fixedDate });
    expect(a).toBe("CTN-20260906-0001");
    expect(b).toBe("CTN-20260906-0002");
  });

  it("allocates all Trace-owned kinds with correct prefixes", () => {
    expect(allocateTraceIdentity("batch", { date: fixedDate, sequence: 1 })).toBe("BAT-20260906-001");
    expect(allocateTraceIdentity("dpl", { date: fixedDate, sequence: 1 })).toBe("DPL-20260906-001");
    expect(allocateTraceIdentity("pi", { date: fixedDate, sequence: 1 })).toBe("PI-20260906-001");
    expect(allocateTraceIdentity("shipping", { date: fixedDate, sequence: 1 })).toBe("SHP-20260906-0001");
  });

  it("accepts maximum-width sequence for each kind", () => {
    expect(allocateTraceIdentity("batch", { date: fixedDate, sequence: 999 })).toBe("BAT-20260906-999");
    expect(allocateTraceIdentity("production_label", { date: fixedDate, sequence: 9999 })).toBe("PL-20260906-9999");
  });

  it("rejects sequence overflow beyond spec width", () => {
    expect(() => allocateTraceIdentity("batch", { date: fixedDate, sequence: 1000 })).toThrow(/out of range/);
    expect(() => allocateTraceIdentity("production_label", { date: fixedDate, sequence: 10000 })).toThrow(/out of range/);
  });
});

describe("deriveCentralCartonBarcode — Point93 compatible derivation", () => {
  it("derives CTN-SO from order number", () => {
    expect(deriveCentralCartonBarcode("SO-2026-000136")).toBe("CTN-SO-2026-000136");
  });

  it("rejects invalid order numbers", () => {
    expect(() => deriveCentralCartonBarcode("INVALID")).toThrow();
  });
});

describe("deriveShippingQrRef — deterministic from shipping_no", () => {
  it("derives QR from SHP identity", () => {
    expect(deriveShippingQrRef("SHP-20260906-0001")).toBe("QR-202609060001");
  });

  it("rejects malformed shipping_no", () => {
    expect(() => deriveShippingQrRef("INVALID")).toThrow();
  });
});

describe("classifyBarcodeIdentity", () => {
  it("classifies all canonical kinds", () => {
    expect(classifyBarcodeIdentity("PL-20260906-0001")).toBe("production_label");
    expect(classifyBarcodeIdentity("BAT-20260906-001")).toBe("batch");
    expect(classifyBarcodeIdentity("CTN-SO-2026-0001")).toBe("central_carton");
    expect(classifyBarcodeIdentity("CTN-20260906-0042")).toBe("legacy_carton");
    expect(classifyBarcodeIdentity("SHP-20260906-0001")).toBe("shipping");
    expect(classifyBarcodeIdentity("QR-202609060001")).toBe("shipping_qr");
    expect(classifyBarcodeIdentity("DPL-20260906-001")).toBe("dpl");
    expect(classifyBarcodeIdentity("PI-20260906-001")).toBe("pi");
    expect(classifyBarcodeIdentity("PL-PREVIEW-0001")).toBe("preview");
    expect(classifyBarcodeIdentity("GARBAGE")).toBe("invalid");
  });

  it("does not confuse legacy CTN with central CTN-SO", () => {
    expect(classifyBarcodeIdentity("CTN-20260906-0001")).toBe("legacy_carton");
    expect(classifyBarcodeIdentity("CTN-SO-2026-000136")).toBe("central_carton");
  });
});

describe("parseBarcodeIdentity", () => {
  it("extracts order number from central carton barcode", () => {
    const p = parseBarcodeIdentity("ctn-so-2026-000136");
    expect(p.kind).toBe("central_carton");
    expect(p.orderNumber).toBe("SO-2026-000136");
    expect(p.normalized).toBe("CTN-SO-2026-000136");
  });

  it("normalizes casing and whitespace", () => {
    expect(normalizeBarcodeIdentity("  pl-20260906-0001  ")).toBe("PL-20260906-0001");
  });
});

describe("validateBarcodeIdentity — fail-closed", () => {
  it("accepts valid production label", () => {
    const r = validateBarcodeIdentity("PL-20260906-0001", { expectedKind: "production_label" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.kind).toBe("production_label");
  });

  it("rejects empty identity", () => {
    const r = validateBarcodeIdentity("   ");
    expect(r.ok).toBe(false);
    if (r.ok === false) expect(r.code).toBe("empty");
  });

  it("rejects malformed identity", () => {
    const r = validateBarcodeIdentity("PL-BAD");
    expect(r.ok).toBe(false);
    if (r.ok === false) expect(r.code).toBe("malformed");
  });

  it("rejects preview fixtures in production flows", () => {
    const r = validateBarcodeIdentity(PREVIEW_BARCODE_IDENTITIES.productionLabel);
    expect(r.ok).toBe(false);
    if (r.ok === false) expect(r.code).toBe("preview_in_production");
  });

  it("allows preview fixtures when explicitly permitted", () => {
    const r = validateBarcodeIdentity(PREVIEW_BARCODE_IDENTITIES.productionLabel, { allowPreview: true });
    expect(r.ok).toBe(true);
  });

  it("rejects wrong expected kind", () => {
    const r = validateBarcodeIdentity("CTN-SO-2026-0001", { expectedKind: "production_label" });
    expect(r.ok).toBe(false);
    if (r.ok === false) expect(r.code).toBe("malformed");
  });

  it("rejects PL barcode at central carton gate", () => {
    const r = validateBarcodeIdentity("PL-20260101-0001", { expectedKind: "central_carton" });
    expect(r.ok).toBe(false);
  });
});

describe("preview fixtures", () => {
  it("identifies preview identities", () => {
    expect(isPreviewIdentity("PL-PREVIEW-0001")).toBe(true);
    expect(isPreviewIdentity("PL-20260906-0001")).toBe(false);
  });
});

describe("BARCODE_IDENTITY_AUTHORITY_MATRIX", () => {
  it("census covers all Trace-owned identity surfaces", () => {
    const kinds = BARCODE_IDENTITY_AUTHORITY_MATRIX.map(r => r.kind);
    expect(kinds).toContain("production_label");
    expect(kinds).toContain("central_carton");
    expect(kinds).toContain("legacy_carton");
    expect(kinds).toContain("shipping_qr");
    expect(kinds).toContain("order_truth");
  });
});

describe("cross-contract compatibility", () => {
  it("central carton round-trips with order number", () => {
    const order = "SO-2026-0001";
    const barcode = deriveCentralCartonBarcode(order);
    const parsed = parseBarcodeIdentity(barcode);
    expect(parsed.orderNumber).toBe(order);
    const v = validateBarcodeIdentity(barcode, { expectedKind: "central_carton" });
    expect(v.ok).toBe(true);
  });

  it("shipping QR resolves back to shipping_no", () => {
    const shp = "SHP-20260906-0042";
    const qr = deriveShippingQrRef(shp);
    const parsed = parseBarcodeIdentity(qr);
    expect(parsed.shippingNo).toBe(shp);
  });
});

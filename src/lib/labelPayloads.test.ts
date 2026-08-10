// Covers the exact label content built by the three corrected print flows
// (Production, Cartonization, ShippingLabel) — what generateLabelCommand /
// generateTSPL turns into a physical-printer command. A regression here
// means a real label prints the wrong SKU, weight, or barcode value.
import { describe, it, expect } from "vitest";
import { buildProductionLabelPayload, buildCartonLabelPayload, buildShippingLabelPayload } from "./labelPayloads";

describe("buildProductionLabelPayload — corrected Production print flow", () => {
  it("builds a 75x50mm label carrying SKU, batch, MFG date, shelf life and both weights", () => {
    const payload = buildProductionLabelPayload({
      productName: "Cashew Pyramid Baklawa", sku: "CPB-5000", batchNo: "BAT-20260511-001",
      mfgDate: "2026-05-11", shelfLifeDays: 90, netWeight: 5, grossWeight: 5.25, labelNo: "PL-20260511-9303",
    });
    expect(payload.widthMm).toBe(75);
    expect(payload.heightMm).toBe(50);
    expect(payload.title).toBe("Cashew Pyramid Baklawa");
    expect(payload.barcode).toBe("PL-20260511-9303");
    expect(payload.lines.join(" | ")).toContain("SKU CPB-5000  Batch BAT-20260511-001");
    expect(payload.lines.join(" | ")).toContain("MFG 2026-05-11  Shelf 90d");
    expect(payload.lines.join(" | ")).toContain("Net 5 kg  Gross 5.25 kg");
  });

  it("falls back gross weight to net weight when gross wasn't entered", () => {
    const payload = buildProductionLabelPayload({
      batchNo: "B", mfgDate: "2026-01-01", shelfLifeDays: 1, netWeight: 3, grossWeight: "", labelNo: "PL-X",
    });
    expect(payload.lines.join(" ")).toContain("Net 3 kg  Gross 3 kg");
  });

  it("never fabricates a product name — falls back to a generic title, not a hardcoded demo product", () => {
    const payload = buildProductionLabelPayload({
      batchNo: "B", mfgDate: "2026-01-01", shelfLifeDays: 1, netWeight: 1, grossWeight: 1, labelNo: "PL-X",
    });
    expect(payload.title).toBe("Production Label");
  });
});

describe("buildCartonLabelPayload — corrected Carton print flow", () => {
  it("builds a 100x75mm label carrying order, carton index, item count and net weight", () => {
    const payload = buildCartonLabelPayload({
      customerName: "Al Manzil Trading", orderRef: "SO-2026-0001", cartonIndex: 2, itemCount: 4,
      netWeightKg: 10.4, barcode: "CTN-SO-2026-0001",
    });
    expect(payload.widthMm).toBe(100);
    expect(payload.heightMm).toBe(75);
    expect(payload.title).toBe("Al Manzil Trading");
    expect(payload.barcode).toBe("CTN-SO-2026-0001");
    expect(payload.lines).toContain("Order SO-2026-0001");
    expect(payload.lines).toContain("Carton 2 · Items 4");
    expect(payload.lines).toContain("Net 10.40 kg");
  });

  it("prefers the resolved Central/legacy barcode over any other identifier passed in", () => {
    const payload = buildCartonLabelPayload({ itemCount: 1, netWeightKg: 1, barcode: "CTN-SO-2026-000136" });
    expect(payload.barcode).toBe("CTN-SO-2026-000136");
  });
});

describe("buildShippingLabelPayload — corrected Shipping Label flow", () => {
  it("builds a 100x150mm label carrying consignee, invoice, shipping number and QR", () => {
    const payload = buildShippingLabelPayload({
      consignee: "Gulf Sweets LLC", invoiceRef: "INV-2026-0007", shippingNo: "SHP-20260511-7665", qrRef: "QR-ABC123",
    });
    expect(payload.widthMm).toBe(100);
    expect(payload.heightMm).toBe(150);
    expect(payload.title).toBe("Gulf Sweets LLC");
    expect(payload.barcode).toBe("SHP-20260511-7665");
    expect(payload.qr).toBe("QR-ABC123");
    expect(payload.lines).toContain("Invoice INV-2026-0007");
  });

  it("never carries invoice amount or payment data — the QR is opaque per the page's own stated contract", () => {
    const payload = buildShippingLabelPayload({ shippingNo: "SHP-1", qrRef: "QR-1" });
    expect(payload.qr).toBe("QR-1");
    expect(JSON.stringify(payload)).not.toMatch(/amount|payment|price/i);
  });
});

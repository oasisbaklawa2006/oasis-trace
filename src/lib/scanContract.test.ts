import { describe, it, expect } from "vitest";
import {
  generateCartonOrderBarcode,
  parseCartonOrderBarcode,
  parseLegacyCartonBarcode,
  classifyCartonBarcode,
  verifyCartonBarcodeMatch,
  scanIdempotencyKey,
  buildDispatchGateScanPayload,
  buildCartonIdentityScanPayload,
  getScanUserMessage,
  supportsCentralBarcode,
} from "./scanContract";

describe("generateCartonOrderBarcode", () => {
  it("generates CTN-SO barcode from order number", () => {
    expect(generateCartonOrderBarcode("SO-2026-000136")).toBe("CTN-SO-2026-000136");
  });

  it("supports demo order numbers (4-digit suffix)", () => {
    expect(generateCartonOrderBarcode("SO-2026-0001")).toBe("CTN-SO-2026-0001");
  });

  it("normalizes casing", () => {
    expect(generateCartonOrderBarcode("so-2026-000136")).toBe("CTN-SO-2026-000136");
  });

  it("rejects invalid order numbers", () => {
    expect(() => generateCartonOrderBarcode("SO-26-136")).toThrow();
  });
});

describe("parseCartonOrderBarcode", () => {
  it("parses CTN-SO barcode to order number", () => {
    const parsed = parseCartonOrderBarcode("CTN-SO-2026-000136");
    expect(parsed.valid).toBe(true);
    expect(parsed.orderNumber).toBe("SO-2026-000136");
  });

  it("returns invalid for non-CTN-SO barcodes", () => {
    const parsed = parseCartonOrderBarcode("PL-20260101-0001");
    expect(parsed.valid).toBe(false);
    expect(parsed.orderNumber).toBeNull();
  });
});

describe("legacy CTN format", () => {
  it("parses legacy CTN-YYYYMMDD-####", () => {
    const p = parseLegacyCartonBarcode("CTN-20260602-0042");
    expect(p.valid).toBe(true);
  });

  it("classifies legacy vs central", () => {
    expect(classifyCartonBarcode("CTN-SO-2026-0001")).toBe("central");
    expect(classifyCartonBarcode("CTN-20260602-0042")).toBe("legacy");
    expect(classifyCartonBarcode("INVALID")).toBe("invalid");
  });
});

describe("verifyCartonBarcodeMatch", () => {
  it("detects verified match", () => {
    const r = verifyCartonBarcodeMatch("CTN-SO-2026-000136", "ctn-so-2026-000136");
    expect(r.match).toBe(true);
    expect(r.verification_status).toBe("verified");
  });

  it("detects mismatch", () => {
    const r = verifyCartonBarcodeMatch("CTN-SO-2026-000136", "CTN-SO-2026-000137");
    expect(r.match).toBe(false);
    expect(r.verification_status).toBe("mismatch");
  });
});

describe("scan user messages", () => {
  it("returns human-readable messages", () => {
    expect(getScanUserMessage("barcode_format_invalid")).toBe("Barcode format invalid");
    expect(getScanUserMessage("scan_already_recorded")).toBe("Scan already recorded");
  });
});

describe("supportsCentralBarcode", () => {
  it("true for valid SO numbers", () => {
    expect(supportsCentralBarcode("SO-2026-0001")).toBe(true);
  });
});

describe("scanIdempotencyKey", () => {
  it("is stable for same inputs", () => {
    const a = scanIdempotencyKey("dispatch_gate", "CTN-SO-2026-000136", "uuid-1");
    const b = scanIdempotencyKey("dispatch_gate", "ctn-so-2026-000136", "uuid-1");
    expect(a).toBe(b);
  });
});

describe("Central payload builders", () => {
  it("builds dispatch_gate payload", () => {
    const p = buildDispatchGateScanPayload({
      order_id: "550e8400-e29b-41d4-a716-446655440000",
      order_number: "SO-2026-000136",
      barcode_value: "CTN-SO-2026-000136",
      expected_barcode: "CTN-SO-2026-000136",
    });
    expect(p.source_app).toBe("barcode_app");
    expect(p.scan_type).toBe("dispatch_gate");
    expect(p.verification_status).toBe("verified");
    expect(p.scan_source).toBe("barcode_app_gate_scan");
  });

  it("builds carton identity payload", () => {
    const p = buildCartonIdentityScanPayload({
      barcode_value: "CTN-SO-2026-000136",
      expected_barcode: "CTN-SO-2026-000136",
    });
    expect(p.scan_type).toBe("carton");
    expect(p.verification_type).toBe("identity_match");
    expect(p.verification_status).toBe("verified");
    expect(p.scan_source).toBe("barcode_app_carton_scan");
  });
});

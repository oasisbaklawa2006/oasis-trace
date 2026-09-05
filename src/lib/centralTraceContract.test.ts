import { describe, it, expect } from "vitest";
import {
  CENTRAL_TRACE_CONTRACT_VERSION,
  CENTRAL_TRACE_PRODUCER_CONSUMER_MATRIX,
  validateCentralScanPayload,
  validateIdempotencyKeyConsistency,
  validateCentralSubmitEnvelope,
  isPermanentContractFailure,
} from "./centralTraceContract";
import {
  buildDispatchGateScanPayload,
  buildCartonIdentityScanPayload,
  scanIdempotencyKey,
} from "./scanContract";

const ORDER_ID = "550e8400-e29b-41d4-a716-446655440000";

describe("CENTRAL_TRACE_PRODUCER_CONSUMER_MATRIX", () => {
  it("documents all contract surfaces for Point 93 census", () => {
    const surfaces = CENTRAL_TRACE_PRODUCER_CONSUMER_MATRIX.map(r => r.surface);
    expect(surfaces).toContain("dispatch_gate_scan_payload");
    expect(surfaces).toContain("carton_identity_scan_payload");
    expect(surfaces).toContain("central_scan_submit_envelope");
    expect(surfaces).toContain("order_truth");
    expect(CENTRAL_TRACE_PRODUCER_CONSUMER_MATRIX.every(r => r.version === CENTRAL_TRACE_CONTRACT_VERSION)).toBe(
      true,
    );
  });
});

describe("validateCentralScanPayload — valid handoff", () => {
  it("accepts verified dispatch_gate payload", () => {
    const payload = buildDispatchGateScanPayload({
      order_id: ORDER_ID,
      order_number: "SO-2026-000136",
      barcode_value: "CTN-SO-2026-000136",
      expected_barcode: "CTN-SO-2026-000136",
    });
    const r = validateCentralScanPayload(payload);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.contractVersion).toBe("1.0");
      expect(r.payload.scan_type).toBe("dispatch_gate");
    }
  });

  it("accepts verified carton identity payload", () => {
    const payload = buildCartonIdentityScanPayload({
      order_id: ORDER_ID,
      order_number: "SO-2026-000136",
      barcode_value: "CTN-SO-2026-000136",
      expected_barcode: "CTN-SO-2026-000136",
    });
    const r = validateCentralScanPayload(payload);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.payload.scan_type).toBe("carton");
  });
});

describe("validateCentralScanPayload — malformed / missing identity", () => {
  it("rejects non-object payload", () => {
    const r = validateCentralScanPayload(null);
    expect(r.ok).toBe(false);
    if (r.ok === false) expect(r.code).toBe("unsupported_shape");
  });

  it("rejects dispatch_gate without order_id UUID", () => {
    const r = validateCentralScanPayload({
      source_app: "barcode_app",
      order_id: "not-a-uuid",
      order_number: "SO-2026-0001",
      scan_type: "dispatch_gate",
      verification_type: "gate_check",
      entity_type: "order",
      barcode_value: "CTN-SO-2026-0001",
      expected_barcode: "CTN-SO-2026-0001",
      verification_status: "verified",
      scan_source: "barcode_app_gate_scan",
    });
    expect(r.ok).toBe(false);
    if (r.ok === false) expect(r.code).toBe("missing_identity");
  });

  it("rejects empty barcode_value", () => {
    const payload = buildDispatchGateScanPayload({
      order_id: ORDER_ID,
      order_number: "SO-2026-0001",
      barcode_value: "CTN-SO-2026-0001",
      expected_barcode: "CTN-SO-2026-0001",
    });
    const r = validateCentralScanPayload({ ...payload, barcode_value: "   " });
    expect(r.ok).toBe(false);
    if (r.ok === false) expect(r.code).toBe("malformed_barcode");
  });

  it("rejects invalid order_number format", () => {
    const r = validateCentralScanPayload({
      source_app: "barcode_app",
      order_id: ORDER_ID,
      order_number: "SO-26-1",
      scan_type: "dispatch_gate",
      verification_type: "gate_check",
      entity_type: "order",
      barcode_value: "CTN-SO-2026-0001",
      expected_barcode: "CTN-SO-2026-0001",
      verification_status: "verified",
      scan_source: "barcode_app_gate_scan",
    });
    expect(r.ok).toBe(false);
    if (r.ok === false) expect(r.code).toBe("missing_identity");
  });
});

describe("validateCentralScanPayload — unknown version / shape", () => {
  it("rejects unknown scan_type", () => {
    const r = validateCentralScanPayload({
      source_app: "barcode_app",
      scan_type: "warehouse_pick",
      barcode_value: "X",
    });
    expect(r.ok).toBe(false);
    if (r.ok === false) expect(r.code).toBe("unknown_scan_type");
  });

  it("rejects unknown contract_version on payload", () => {
    const payload = buildDispatchGateScanPayload({
      order_id: ORDER_ID,
      order_number: "SO-2026-0001",
      barcode_value: "CTN-SO-2026-0001",
      expected_barcode: "CTN-SO-2026-0001",
    });
    const r = validateCentralScanPayload({ ...payload, contract_version: "99.0" });
    expect(r.ok).toBe(false);
    if (r.ok === false) expect(r.code).toBe("unknown_contract_version");
  });

  it("rejects unsupported opts.contractVersion", () => {
    const payload = buildDispatchGateScanPayload({
      order_id: ORDER_ID,
      order_number: "SO-2026-0001",
      barcode_value: "CTN-SO-2026-0001",
      expected_barcode: "CTN-SO-2026-0001",
    });
    const r = validateCentralScanPayload(payload, { contractVersion: "2.0" });
    expect(r.ok).toBe(false);
    if (r.ok === false) expect(r.code).toBe("unknown_contract_version");
  });

  it("accepts optional literal contract_version on strict v1 schema", () => {
    const payload = buildDispatchGateScanPayload({
      order_id: ORDER_ID,
      order_number: "SO-2026-0001",
      barcode_value: "CTN-SO-2026-0001",
      expected_barcode: "CTN-SO-2026-0001",
    });
    const r = validateCentralScanPayload({ ...payload, contract_version: "1.0" });
    expect(r.ok).toBe(true);
  });

  it("rejects unrecognized top-level field on strict v1 schema", () => {
    const payload = buildDispatchGateScanPayload({
      order_id: ORDER_ID,
      order_number: "SO-2026-0001",
      barcode_value: "CTN-SO-2026-0001",
      expected_barcode: "CTN-SO-2026-0001",
    });
    const r = validateCentralScanPayload({ ...payload, unexpected_field: "reject-me" });
    expect(r.ok).toBe(false);
    if (r.ok === false) expect(r.code).toBe("invalid_contract");
  });
});

describe("validateIdempotencyKeyConsistency — duplicate / retry safety", () => {
  it("accepts matching idempotency key for dispatch_gate", () => {
    const payload = buildDispatchGateScanPayload({
      order_id: ORDER_ID,
      order_number: "SO-2026-0001",
      barcode_value: "CTN-SO-2026-0001",
      expected_barcode: "CTN-SO-2026-0001",
    });
    const key = scanIdempotencyKey("dispatch_gate", payload.barcode_value, payload.order_id);
    const r = validateIdempotencyKeyConsistency(key, payload);
    expect(r.ok).toBe(true);
  });

  it("rejects stale or tampered idempotency key", () => {
    const payload = buildDispatchGateScanPayload({
      order_id: ORDER_ID,
      order_number: "SO-2026-0001",
      barcode_value: "CTN-SO-2026-0001",
      expected_barcode: "CTN-SO-2026-0001",
    });
    const r = validateIdempotencyKeyConsistency("barcode_app|carton|WRONG|other-id", payload);
    expect(r.ok).toBe(false);
    if (r.ok === false) expect(r.code).toBe("idempotency_mismatch");
  });
});

describe("validateCentralSubmitEnvelope — full handoff", () => {
  it("validates complete submit envelope", () => {
    const payload = buildCartonIdentityScanPayload({
      order_id: ORDER_ID,
      order_number: "SO-2026-0002",
      barcode_value: "CTN-SO-2026-0002",
      expected_barcode: "CTN-SO-2026-0002",
    });
    const key = scanIdempotencyKey("carton", payload.barcode_value, payload.order_id);
    const r = validateCentralSubmitEnvelope(key, payload);
    expect(r.ok).toBe(true);
  });

  it("rejects missing idempotency_key", () => {
    const payload = buildDispatchGateScanPayload({
      order_id: ORDER_ID,
      order_number: "SO-2026-0001",
      barcode_value: "CTN-SO-2026-0001",
      expected_barcode: "CTN-SO-2026-0001",
    });
    const r = validateCentralSubmitEnvelope("", payload);
    expect(r.ok).toBe(false);
    if (r.ok === false) expect(r.code).toBe("missing_identity");
  });
});

describe("isPermanentContractFailure", () => {
  it("marks contract rejections as permanent (no silent retry)", () => {
    expect(isPermanentContractFailure("invalid_contract")).toBe(true);
    expect(isPermanentContractFailure("idempotency_mismatch")).toBe(true);
    expect(isPermanentContractFailure("unknown_scan_type")).toBe(true);
  });
});

/**
 * Central-compatible scan contract helpers (Sprint 1 — readiness only).
 * Full connector integration is deferred to a later sprint.
 */

export const SOURCE_APP = "barcode_app" as const;
export const CARTON_ORDER_BARCODE_PREFIX = "CTN-";

/** Order numbers accepted for CTN-SO barcodes (e.g. SO-2026-000136). */
const ORDER_NUMBER_RE = /^SO-\d{4}-\d{6}$/;

export type VerificationStatus = "verified" | "mismatch" | "rejected";
export type ScanType = "dispatch_gate" | "carton";
export type VerificationType = "gate_check" | "identity_match";

export interface CentralDispatchGateScanPayload {
  source_app: typeof SOURCE_APP;
  order_id: string;
  order_number: string;
  scan_type: "dispatch_gate";
  verification_type: "gate_check";
  entity_type: "order";
  barcode_value: string;
  expected_barcode: string;
  verification_status: VerificationStatus;
  scan_source: "barcode_app_gate_scan";
}

export interface CentralCartonIdentityScanPayload {
  source_app: typeof SOURCE_APP;
  order_id?: string;
  order_number?: string;
  scan_type: "carton";
  verification_type: "identity_match";
  entity_type: "order";
  barcode_value: string;
  expected_barcode?: string;
  verification_status: VerificationStatus;
  scan_source?: "barcode_app_carton_scan";
}

/** Build carton barcode from sales order number: SO-2026-000136 → CTN-SO-2026-000136 */
export function generateCartonOrderBarcode(orderNumber: string): string {
  const normalized = orderNumber.trim().toUpperCase();
  if (!ORDER_NUMBER_RE.test(normalized)) {
    throw new Error(`Invalid order number format: ${orderNumber}`);
  }
  if (normalized.startsWith(CARTON_ORDER_BARCODE_PREFIX)) return normalized;
  return `${CARTON_ORDER_BARCODE_PREFIX}${normalized}`;
}

export interface ParsedCartonOrderBarcode {
  valid: boolean;
  orderNumber: string | null;
  barcode: string;
}

/** Parse CTN-SO-* barcode back to order number. */
export function parseCartonOrderBarcode(barcode: string): ParsedCartonOrderBarcode {
  const raw = barcode.trim().toUpperCase();
  if (!raw.startsWith(CARTON_ORDER_BARCODE_PREFIX)) {
    return { valid: false, orderNumber: null, barcode: raw };
  }
  const orderNumber = raw.slice(CARTON_ORDER_BARCODE_PREFIX.length);
  const valid = ORDER_NUMBER_RE.test(orderNumber);
  return { valid, orderNumber: valid ? orderNumber : null, barcode: raw };
}

export interface BarcodeMatchResult {
  match: boolean;
  scanned: string;
  expected: string;
  verification_status: VerificationStatus;
  reason?: string;
}

/** Compare scanned vs expected carton-order barcodes (case-insensitive). */
export function verifyCartonBarcodeMatch(scanned: string, expected: string): BarcodeMatchResult {
  const s = scanned.trim().toUpperCase();
  const e = expected.trim().toUpperCase();
  if (!s || !e) {
    return {
      match: false,
      scanned: s,
      expected: e,
      verification_status: "rejected",
      reason: "empty_barcode",
    };
  }
  const match = s === e;
  return {
    match,
    scanned: s,
    expected: e,
    verification_status: match ? "verified" : "mismatch",
    reason: match ? undefined : "barcode_mismatch",
  };
}

/** Stable idempotency key for Central scan deduplication. */
export function scanIdempotencyKey(
  scanType: ScanType,
  barcodeValue: string,
  orderId?: string,
): string {
  const parts = [SOURCE_APP, scanType, barcodeValue.trim().toUpperCase()];
  if (orderId) parts.push(orderId);
  return parts.join("|");
}

/** Build dispatch_gate payload shape for Central (not yet emitted by GateScan UI). */
export function buildDispatchGateScanPayload(opts: {
  order_id: string;
  order_number: string;
  barcode_value: string;
  expected_barcode: string;
  verification_status?: VerificationStatus;
}): CentralDispatchGateScanPayload {
  const verification = verifyCartonBarcodeMatch(opts.barcode_value, opts.expected_barcode);
  return {
    source_app: SOURCE_APP,
    order_id: opts.order_id,
    order_number: opts.order_number.trim().toUpperCase(),
    scan_type: "dispatch_gate",
    verification_type: "gate_check",
    entity_type: "order",
    barcode_value: verification.scanned,
    expected_barcode: verification.expected,
    verification_status: opts.verification_status ?? verification.verification_status,
    scan_source: "barcode_app_gate_scan",
  };
}

/** Build carton identity payload shape for Central. */
export function buildCartonIdentityScanPayload(opts: {
  order_id?: string;
  order_number?: string;
  barcode_value: string;
  expected_barcode?: string;
}): CentralCartonIdentityScanPayload {
  const expected = opts.expected_barcode ?? opts.barcode_value;
  const verification = verifyCartonBarcodeMatch(opts.barcode_value, expected);
  return {
    source_app: SOURCE_APP,
    order_id: opts.order_id,
    order_number: opts.order_number?.trim().toUpperCase(),
    scan_type: "carton",
    verification_type: "identity_match",
    entity_type: "order",
    barcode_value: verification.scanned,
    expected_barcode: verification.expected,
    verification_status: verification.verification_status,
    scan_source: "barcode_app_carton_scan",
  };
}

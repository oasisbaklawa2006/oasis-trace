/**
 * Central-compatible scan contract helpers.
 * Sprint 2: CTN-SO + legacy CTN-YYYYMMDD-#### classification.
 */

export const SOURCE_APP = "barcode_app" as const;
export const CARTON_ORDER_BARCODE_PREFIX = "CTN-";

/** Matches SO-2026-0001 (demo) and SO-2026-000136 (production). */
export const ORDER_NUMBER_RE = /^SO-\d{4}-\d{4,6}$/;

/** Legacy local carton IDs: CTN-YYYYMMDD-#### */
export const LEGACY_CTN_RE = /^CTN-\d{8}-\d{4}$/;

export type VerificationStatus = "verified" | "mismatch" | "rejected";
export type ScanType = "dispatch_gate" | "carton";
export type VerificationType = "gate_check" | "identity_match";
export type CartonBarcodeMode = "central" | "legacy";
export type CartonBarcodeKind = "central" | "legacy" | "invalid";

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
  scan_source: "barcode_app_carton_scan";
}

export type ScanMessageCode =
  | "gate_scan_verified"
  | "carton_identity_verified"
  | "wrong_carton_for_order"
  | "order_not_found"
  | "barcode_format_invalid"
  | "scan_already_recorded";

export const SCAN_USER_MESSAGES: Record<ScanMessageCode, string> = {
  gate_scan_verified: "Gate scan verified",
  carton_identity_verified: "Carton identity verified",
  wrong_carton_for_order: "Wrong carton for this order",
  order_not_found: "Order not found",
  barcode_format_invalid: "Barcode format invalid",
  scan_already_recorded: "Scan already recorded",
};

export function getScanUserMessage(code: ScanMessageCode): string {
  return SCAN_USER_MESSAGES[code];
}

export function isValidOrderNumber(orderNumber: string): boolean {
  return ORDER_NUMBER_RE.test(orderNumber.trim().toUpperCase());
}

export function supportsCentralBarcode(orderNumber: string): boolean {
  return isValidOrderNumber(orderNumber);
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

export interface ParsedLegacyCartonBarcode {
  valid: boolean;
  barcode: string;
}

export function parseLegacyCartonBarcode(barcode: string): ParsedLegacyCartonBarcode {
  const raw = barcode.trim().toUpperCase();
  return { valid: LEGACY_CTN_RE.test(raw), barcode: raw };
}

export function classifyCartonBarcode(barcode: string): CartonBarcodeKind {
  const raw = barcode.trim().toUpperCase();
  if (parseCartonOrderBarcode(raw).valid) return "central";
  if (LEGACY_CTN_RE.test(raw)) return "legacy";
  return "invalid";
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

/** Build dispatch_gate payload shape for Central. */
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
  verification_status?: VerificationStatus;
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
    verification_status: opts.verification_status ?? verification.verification_status,
    scan_source: "barcode_app_carton_scan",
  };
}

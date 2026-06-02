/**
 * Scan flow orchestration — CTN-SO verification, Central payload build,
 * idempotency guard, local scan history (no Central submit).
 */
import { listTable, insertRow } from "@/lib/data";
import {
  buildCartonIdentityScanPayload,
  buildDispatchGateScanPayload,
  generateCartonOrderBarcode,
  getScanUserMessage,
  parseCartonOrderBarcode,
  scanIdempotencyKey,
  verifyCartonBarcodeMatch,
  type CentralCartonIdentityScanPayload,
  type CentralDispatchGateScanPayload,
  type ScanMessageCode,
} from "@/lib/scanContract";

export interface OrderRef {
  id: string;
  order_number: string;
}

export interface ScanFlowResult {
  ok: boolean;
  userMessage: string;
  messageCode?: ScanMessageCode;
  idempotencyKey?: string;
  payload?: CentralDispatchGateScanPayload | CentralCartonIdentityScanPayload;
  readyForCentral: boolean;
  duplicate?: boolean;
  recorded?: boolean;
}

export async function hasIdempotentScan(idempotencyKey: string): Promise<boolean> {
  const rows = await listTable<{ metadata?: { central_idempotency_key?: string } }>(
    "ols_scan_history",
    { limit: 1000 },
  );
  return rows.some(r => r.metadata?.central_idempotency_key === idempotencyKey);
}

async function recordCentralScanEvent(opts: {
  scan_value: string;
  scan_context: string;
  result: "green" | "red";
  idempotencyKey: string;
  payload?: CentralDispatchGateScanPayload | CentralCartonIdentityScanPayload;
  messageCode?: ScanMessageCode;
  userMessage?: string;
}) {
  await insertRow("ols_scan_history", {
    scan_value: opts.scan_value,
    scan_context: opts.scan_context,
    result: opts.result,
    metadata: {
      central_idempotency_key: opts.idempotencyKey,
      central_payload: opts.payload ?? null,
      message_code: opts.messageCode ?? null,
      user_message: opts.userMessage ?? null,
      central_sync_status: "preview_only",
    },
  });
}

export async function processDispatchGateCtnSoScan(
  scannedBarcode: string,
  orders: OrderRef[],
): Promise<ScanFlowResult> {
  const parsed = parseCartonOrderBarcode(scannedBarcode);
  if (!parsed.valid || !parsed.orderNumber) {
    return {
      ok: false,
      userMessage: getScanUserMessage("barcode_format_invalid"),
      messageCode: "barcode_format_invalid",
      readyForCentral: false,
    };
  }

  const order = orders.find(o => o.order_number.toUpperCase() === parsed.orderNumber);
  if (!order) {
    return {
      ok: false,
      userMessage: getScanUserMessage("order_not_found"),
      messageCode: "order_not_found",
      readyForCentral: false,
    };
  }

  const expected = generateCartonOrderBarcode(order.order_number);
  const match = verifyCartonBarcodeMatch(scannedBarcode, expected);
  if (!match.match) {
    return {
      ok: false,
      userMessage: getScanUserMessage("wrong_carton_for_order"),
      messageCode: "wrong_carton_for_order",
      readyForCentral: false,
      payload: buildDispatchGateScanPayload({
        order_id: order.id,
        order_number: order.order_number,
        barcode_value: match.scanned,
        expected_barcode: match.expected,
        verification_status: "mismatch",
      }),
    };
  }

  const idempotencyKey = scanIdempotencyKey("dispatch_gate", match.scanned, order.id);
  if (await hasIdempotentScan(idempotencyKey)) {
    return {
      ok: false,
      userMessage: getScanUserMessage("scan_already_recorded"),
      messageCode: "scan_already_recorded",
      idempotencyKey,
      duplicate: true,
      readyForCentral: false,
    };
  }

  const payload = buildDispatchGateScanPayload({
    order_id: order.id,
    order_number: order.order_number,
    barcode_value: match.scanned,
    expected_barcode: match.expected,
    verification_status: "verified",
  });

  await recordCentralScanEvent({
    scan_value: match.scanned,
    scan_context: "gate_ctn_so",
    result: "green",
    idempotencyKey,
    payload,
    messageCode: "gate_scan_verified",
    userMessage: getScanUserMessage("gate_scan_verified"),
  });

  await insertRow("ols_gate_scans", {
    qr_ref: match.scanned,
    result: "green",
    reason: "CTN-SO gate verified (Central payload preview)",
  });

  return {
    ok: true,
    userMessage: getScanUserMessage("gate_scan_verified"),
    messageCode: "gate_scan_verified",
    idempotencyKey,
    payload,
    readyForCentral: true,
    recorded: true,
  };
}

export async function processCartonIdentityScan(
  scannedBarcode: string,
  activeOrderRef: string,
  orders: OrderRef[],
): Promise<ScanFlowResult> {
  const parsed = parseCartonOrderBarcode(scannedBarcode);
  if (!parsed.valid || !parsed.orderNumber) {
    return {
      ok: false,
      userMessage: getScanUserMessage("barcode_format_invalid"),
      messageCode: "barcode_format_invalid",
      readyForCentral: false,
    };
  }

  const order = orders.find(o => o.order_number.toUpperCase() === activeOrderRef.toUpperCase());
  if (!order) {
    return {
      ok: false,
      userMessage: getScanUserMessage("order_not_found"),
      messageCode: "order_not_found",
      readyForCentral: false,
    };
  }

  const expected = generateCartonOrderBarcode(order.order_number);
  const match = verifyCartonBarcodeMatch(scannedBarcode, expected);

  if (parsed.orderNumber !== order.order_number.toUpperCase()) {
    return {
      ok: false,
      userMessage: getScanUserMessage("wrong_carton_for_order"),
      messageCode: "wrong_carton_for_order",
      readyForCentral: false,
      payload: buildCartonIdentityScanPayload({
        order_id: order.id,
        order_number: order.order_number,
        barcode_value: match.scanned,
        expected_barcode: match.expected,
        verification_status: "mismatch",
      }),
    };
  }

  if (!match.match) {
    return {
      ok: false,
      userMessage: getScanUserMessage("wrong_carton_for_order"),
      messageCode: "wrong_carton_for_order",
      readyForCentral: false,
      payload: buildCartonIdentityScanPayload({
        order_id: order.id,
        order_number: order.order_number,
        barcode_value: match.scanned,
        expected_barcode: match.expected,
        verification_status: "mismatch",
      }),
    };
  }

  const idempotencyKey = scanIdempotencyKey("carton", match.scanned, order.id);
  if (await hasIdempotentScan(idempotencyKey)) {
    return {
      ok: false,
      userMessage: getScanUserMessage("scan_already_recorded"),
      messageCode: "scan_already_recorded",
      idempotencyKey,
      duplicate: true,
      readyForCentral: false,
    };
  }

  const payload = buildCartonIdentityScanPayload({
    order_id: order.id,
    order_number: order.order_number,
    barcode_value: match.scanned,
    expected_barcode: match.expected,
    verification_status: "verified",
  });

  await recordCentralScanEvent({
    scan_value: match.scanned,
    scan_context: "carton_identity",
    result: "green",
    idempotencyKey,
    payload,
    messageCode: "carton_identity_verified",
    userMessage: getScanUserMessage("carton_identity_verified"),
  });

  return {
    ok: true,
    userMessage: getScanUserMessage("carton_identity_verified"),
    messageCode: "carton_identity_verified",
    idempotencyKey,
    payload,
    readyForCentral: true,
    recorded: true,
  };
}

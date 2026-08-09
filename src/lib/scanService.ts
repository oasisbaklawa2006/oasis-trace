/**
 * Scan flow orchestration — CTN-SO verification, Central payload build,
 * idempotency guard, local scan history, ready_to_submit status.
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

export interface GateResolutionContext {
  cartons: Array<{ id: string; order_ref?: string }>;
  shippingLabels: Array<{ id: string; carton_id?: string }>;
}

/**
 * Deterministically resolve the single shipping label for a CTN-SO
 * (order-level) gate scan, when unambiguous. A CTN-SO barcode identifies an
 * order, not a specific carton, so an order with zero or multiple shipping
 * labels has no single correct answer — this returns undefined (never a
 * guess) in that case, matching ols_gate_scans.shipping_label_id's nullable
 * FK. Only the exactly-one-candidate case is a real, provable link.
 */
function resolveUnambiguousShippingLabelId(orderNumber: string, ctx?: GateResolutionContext): string | undefined {
  if (!ctx) return undefined;
  const orderCartonIds = new Set(ctx.cartons.filter(c => c.order_ref?.toUpperCase() === orderNumber.toUpperCase()).map(c => c.id));
  const candidates = ctx.shippingLabels.filter(s => s.carton_id && orderCartonIds.has(s.carton_id));
  return candidates.length === 1 ? candidates[0].id : undefined;
}

export interface ScanFlowResult {
  ok: boolean;
  userMessage: string;
  messageCode?: ScanMessageCode;
  idempotencyKey?: string;
  scanHistoryId?: string;
  payload?: CentralDispatchGateScanPayload | CentralCartonIdentityScanPayload;
  readyForCentral: boolean;
  centralSyncStatus?: "ready_to_submit" | "preview_only";
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
  syncStatus?: "preview_only" | "ready_to_submit";
}): Promise<string | undefined> {
  const row = await insertRow<{ id: string }>("ols_scan_history", {
    scan_value: opts.scan_value,
    scan_context: opts.scan_context,
    result: opts.result,
    metadata: {
      central_idempotency_key: opts.idempotencyKey,
      central_payload: opts.payload ?? null,
      message_code: opts.messageCode ?? null,
      user_message: opts.userMessage ?? null,
      central_sync_status: opts.syncStatus ?? (opts.result === "green" ? "ready_to_submit" : "preview_only"),
    },
  });
  return row?.id;
}

export async function processDispatchGateCtnSoScan(
  scannedBarcode: string,
  orders: OrderRef[],
  resolutionCtx?: GateResolutionContext,
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

  const scanHistoryId = await recordCentralScanEvent({
    scan_value: match.scanned,
    scan_context: "gate_ctn_so",
    result: "green",
    idempotencyKey,
    payload,
    messageCode: "gate_scan_verified",
    userMessage: getScanUserMessage("gate_scan_verified"),
    syncStatus: "ready_to_submit",
  });

  // Real FK when unambiguous; never a guess when the order has zero or
  // multiple shipping labels (see resolveUnambiguousShippingLabelId).
  const shippingLabelId = resolveUnambiguousShippingLabelId(order.order_number, resolutionCtx);

  await insertRow("ols_gate_scans", {
    qr_ref: match.scanned,
    shipping_label_id: shippingLabelId,
    result: "green",
    reason: "CTN-SO gate verified — ready for Central submit",
  });

  return {
    ok: true,
    userMessage: getScanUserMessage("gate_scan_verified"),
    messageCode: "gate_scan_verified",
    idempotencyKey,
    scanHistoryId,
    payload,
    readyForCentral: true,
    centralSyncStatus: "ready_to_submit",
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

  const scanHistoryId = await recordCentralScanEvent({
    scan_value: match.scanned,
    scan_context: "carton_identity",
    result: "green",
    idempotencyKey,
    payload,
    messageCode: "carton_identity_verified",
    userMessage: getScanUserMessage("carton_identity_verified"),
    syncStatus: "ready_to_submit",
  });

  return {
    ok: true,
    userMessage: getScanUserMessage("carton_identity_verified"),
    messageCode: "carton_identity_verified",
    idempotencyKey,
    scanHistoryId,
    payload,
    readyForCentral: true,
    centralSyncStatus: "ready_to_submit",
    recorded: true,
  };
}

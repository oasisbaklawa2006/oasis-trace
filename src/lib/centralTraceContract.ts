/**
 * Point 93 — Central↔Trace contract adapter (Trace-owned).
 *
 * Canonical closure for scan handoff: typed validation, fail-closed rejection,
 * idempotency consistency, and explicit producer/consumer authority.
 *
 * Central #459 defines Point 93 = Central–Trace software contract lane.
 * Physical scanner UAT remains separate (#462 / original Point96).
 */
import { z } from "zod";
import {
  SOURCE_APP,
  ORDER_NUMBER_RE,
  scanIdempotencyKey,
  type CentralCartonIdentityScanPayload,
  type CentralDispatchGateScanPayload,
  type ScanType,
} from "@/lib/scanContract";

/** Trace contract revision — bump when breaking Central ingest shape changes. */
export const CENTRAL_TRACE_CONTRACT_VERSION = "1.0";

export type CentralTraceContractVersion = typeof CENTRAL_TRACE_CONTRACT_VERSION;

export type ContractRejectionCode =
  | "invalid_contract"
  | "missing_identity"
  | "malformed_barcode"
  | "idempotency_mismatch"
  | "unknown_scan_type"
  | "unknown_contract_version"
  | "unsupported_shape";

export interface ContractValidationSuccess<T> {
  ok: true;
  contractVersion: CentralTraceContractVersion;
  payload: T;
}

export interface ContractValidationFailure {
  ok: false;
  code: ContractRejectionCode;
  message: string;
  details?: string[];
}

export type ContractValidationResult<T> =
  | ContractValidationSuccess<T>
  | ContractValidationFailure;

export type CentralScanPayloadV1 =
  | CentralDispatchGateScanPayload
  | CentralCartonIdentityScanPayload;

/** Producer/consumer authority for each Central↔Trace contract surface. */
export const CENTRAL_TRACE_PRODUCER_CONSUMER_MATRIX = [
  {
    surface: "carton_order_barcode",
    identifier: "CTN-SO-{order_number}",
    producer: "Trace (scanContract.generateCartonOrderBarcode)",
    consumer: "Central dispatch gate + carton identity ingest",
    authBoundary: "Trace verifies locally; Central ingests signed payload",
    idempotencyKey: "barcode_app|{scan_type}|{barcode}|{order_id?}",
    failureSemantics: "mismatch → rejected locally; never submitted",
    version: CENTRAL_TRACE_CONTRACT_VERSION,
    sources: ["src/lib/scanContract.ts", "src/lib/barcodeCarton.ts"],
    tests: ["src/lib/scanContract.test.ts", "src/lib/barcodeCarton.test.ts"],
  },
  {
    surface: "legacy_carton_barcode",
    identifier: "CTN-YYYYMMDD-####",
    producer: "Trace (numbering.num.carton — legacy mode only)",
    consumer: "Trace gate (shipping QR path); not Central CTN-SO ingest",
    authBoundary: "Trace-only legacy gate; no Central submit",
    idempotencyKey: "n/a (legacy path)",
    failureSemantics: "local gate RED; no Central handoff",
    version: CENTRAL_TRACE_CONTRACT_VERSION,
    sources: ["src/lib/scanContract.ts", "src/lib/scanService.ts"],
    tests: ["src/lib/legacyGateDecision.test.ts", "src/lib/scanService.test.ts"],
  },
  {
    surface: "dispatch_gate_scan_payload",
    identifier: "scan_type=dispatch_gate",
    producer: "Trace (scanService.processDispatchGateCtnSoScan)",
    consumer: "Central scan ingest (via Core edge submit-central-scan)",
    authBoundary: "JWT ols_roles dispatch|security|admin + HMAC signature",
    idempotencyKey: "scanIdempotencyKey(dispatch_gate, barcode, order_id)",
    failureSemantics: "duplicate → scan_already_recorded; invalid → fail-closed",
    version: CENTRAL_TRACE_CONTRACT_VERSION,
    sources: ["src/lib/scanContract.ts", "src/lib/scanService.ts", "src/lib/centralSubmit.ts"],
    tests: ["src/lib/scanService.test.ts", "src/lib/centralTraceContract.test.ts"],
  },
  {
    surface: "carton_identity_scan_payload",
    identifier: "scan_type=carton",
    producer: "Trace (scanService.processCartonIdentityScan)",
    consumer: "Central scan ingest (via Core edge submit-central-scan)",
    authBoundary: "JWT ols_roles dispatch|security|admin + HMAC signature",
    idempotencyKey: "scanIdempotencyKey(carton, barcode, order_id)",
    failureSemantics: "duplicate → scan_already_recorded; invalid → fail-closed",
    version: CENTRAL_TRACE_CONTRACT_VERSION,
    sources: ["src/lib/scanContract.ts", "src/lib/scanService.ts", "src/lib/centralSubmit.ts"],
    tests: ["src/lib/scanService.test.ts", "src/lib/centralTraceContract.test.ts"],
  },
  {
    surface: "central_scan_submit_envelope",
    identifier: "idempotency_key + payload + scan_history_id",
    producer: "Trace client (centralSubmit.submitCentralScan)",
    consumer: "Core edge function submit-central-scan → Central CENTRAL_SCAN_INGEST_URL",
    authBoundary: "Supabase JWT session; signing secret server-side only",
    idempotencyKey: "client-provided; deduped in ols_central_scan_submissions",
    failureSemantics: "409 duplicate; 502 Central reject; permanent client failures not retried",
    version: CENTRAL_TRACE_CONTRACT_VERSION,
    sources: ["src/lib/centralSubmit.ts"],
    tests: ["src/lib/centralSubmit.test.ts", "src/lib/scanSubmitQueue.test.ts"],
    corePrerequisite: "oasis-supabase-core: submit-central-scan server-side v1.0 validation (frozen legacy copy in Trace repo)",
  },
  {
    surface: "offline_retry_queue",
    identifier: "PendingScanEnvelope",
    producer: "Trace (scanSubmitQueue — Point96)",
    consumer: "Same submit envelope → centralSubmit (no duplicate authority)",
    authBoundary: "ownerUserId must match replay session",
    idempotencyKey: "unchanged across retries",
    failureSemantics: "transient → backoff; permanent → visible failure, no silent drop",
    version: CENTRAL_TRACE_CONTRACT_VERSION,
    sources: ["src/lib/scanSubmitQueue.ts"],
    tests: ["src/lib/scanSubmitQueue.test.ts"],
  },
  {
    surface: "order_truth",
    identifier: "order_id UUID + order_number SO-YYYY-####",
    producer: "Core/Central (ols_orders_cache read-only in Trace)",
    consumer: "Trace scan flows reference only; Trace does not mint order truth",
    authBoundary: "Core-owned cache; Trace fail-closed on missing order",
    idempotencyKey: "n/a",
    failureSemantics: "order_not_found → no payload submit",
    version: CENTRAL_TRACE_CONTRACT_VERSION,
    sources: ["src/lib/scanService.ts", "db/ols_init.sql"],
    tests: ["src/lib/scanService.test.ts"],
  },
  {
    surface: "deep_link_route",
    identifier: "Trace /gate, /cartons (no Central /admin embed)",
    producer: "Trace App.tsx routes",
    consumer: "Operator browser; Central does not embed Trace",
    authBoundary: "AuthGate + ols_roles for submit actions",
    idempotencyKey: "n/a",
    failureSemantics: "unauthenticated → AuthGate block",
    version: CENTRAL_TRACE_CONTRACT_VERSION,
    sources: ["src/App.tsx", "src/components/AuthGate.tsx"],
    tests: ["src/lib/roles.test.ts"],
  },
] as const;

const verificationStatusSchema = z.enum(["verified", "mismatch", "rejected"]);

const dispatchGatePayloadSchema = z
  .object({
    contract_version: z.literal(CENTRAL_TRACE_CONTRACT_VERSION).optional(),
    source_app: z.literal(SOURCE_APP),
    order_id: z.string().uuid({ message: "order_id must be a UUID" }),
    order_number: z.string().regex(ORDER_NUMBER_RE, "order_number must match SO-YYYY-####"),
    scan_type: z.literal("dispatch_gate"),
    verification_type: z.literal("gate_check"),
    entity_type: z.literal("order"),
    barcode_value: z.string().min(1),
    expected_barcode: z.string().min(1),
    verification_status: verificationStatusSchema,
    scan_source: z.literal("barcode_app_gate_scan"),
  })
  .strict();

const cartonIdentityPayloadSchema = z
  .object({
    contract_version: z.literal(CENTRAL_TRACE_CONTRACT_VERSION).optional(),
    source_app: z.literal(SOURCE_APP),
    order_id: z.string().uuid().optional(),
    order_number: z.string().regex(ORDER_NUMBER_RE).optional(),
    scan_type: z.literal("carton"),
    verification_type: z.literal("identity_match"),
    entity_type: z.literal("order"),
    barcode_value: z.string().min(1),
    expected_barcode: z.string().optional(),
    verification_status: verificationStatusSchema,
    scan_source: z.literal("barcode_app_carton_scan"),
  })
  .strict();

const centralScanPayloadSchema = z.discriminatedUnion("scan_type", [
  dispatchGatePayloadSchema,
  cartonIdentityPayloadSchema,
]);

function formatZodErrors(error: z.ZodError): string[] {
  return error.issues.map(i => `${i.path.join(".") || "payload"}: ${i.message}`);
}

/**
 * Fail-closed validation of a Central scan payload (v1.0 shape).
 * Unknown top-level scan_type, unrecognized fields (.strict()), or unsupported
 * contract_version values are rejected safely.
 */
export function validateCentralScanPayload(
  input: unknown,
  opts?: { contractVersion?: string },
): ContractValidationResult<CentralScanPayloadV1> {
  if (opts?.contractVersion && opts.contractVersion !== CENTRAL_TRACE_CONTRACT_VERSION) {
    return {
      ok: false,
      code: "unknown_contract_version",
      message: `Unsupported contract version: ${opts.contractVersion}`,
    };
  }

  if (!input || typeof input !== "object") {
    return {
      ok: false,
      code: "unsupported_shape",
      message: "Payload must be a JSON object",
    };
  }

  const raw = input as Record<string, unknown>;
  if (raw.contract_version !== undefined && raw.contract_version !== CENTRAL_TRACE_CONTRACT_VERSION) {
    return {
      ok: false,
      code: "unknown_contract_version",
      message: `Unsupported payload contract_version: ${String(raw.contract_version)}`,
    };
  }

  const scanType = raw.scan_type;
  if (scanType !== "dispatch_gate" && scanType !== "carton") {
    return {
      ok: false,
      code: "unknown_scan_type",
      message: `Unknown scan_type: ${String(scanType)}`,
    };
  }

  const parsed = centralScanPayloadSchema.safeParse(input);
  if (!parsed.success) {
    const details = formatZodErrors(parsed.error);
    const hasIdentityGap = details.some(d =>
      d.includes("order_id") || d.includes("order_number") || d.includes("barcode_value"),
    );
    return {
      ok: false,
      code: hasIdentityGap ? "missing_identity" : "invalid_contract",
      message: hasIdentityGap ? "Missing or invalid scan identity fields" : "Invalid Central scan payload",
      details,
    };
  }

  const payload = parsed.data;
  if (payload.scan_type === "dispatch_gate" && !payload.order_id) {
    return {
      ok: false,
      code: "missing_identity",
      message: "dispatch_gate payload requires order_id",
    };
  }

  if (!payload.barcode_value.trim()) {
    return {
      ok: false,
      code: "malformed_barcode",
      message: "barcode_value must not be empty",
    };
  }

  return {
    ok: true,
    contractVersion: CENTRAL_TRACE_CONTRACT_VERSION,
    payload: payload as CentralScanPayloadV1,
  };
}

/** Ensure client idempotency key matches payload scan_type + barcode + order_id. */
export function validateIdempotencyKeyConsistency(
  idempotencyKey: string,
  payload: CentralScanPayloadV1,
): ContractValidationResult<CentralScanPayloadV1> {
  const scanType = payload.scan_type as ScanType;
  const expected = scanIdempotencyKey(scanType, payload.barcode_value, payload.order_id);
  if (idempotencyKey.trim() !== expected) {
    return {
      ok: false,
      code: "idempotency_mismatch",
      message: "Idempotency key does not match payload identity",
      details: [`expected: ${expected}`, `received: ${idempotencyKey}`],
    };
  }
  return {
    ok: true,
    contractVersion: CENTRAL_TRACE_CONTRACT_VERSION,
    payload,
  };
}

/** Full submit-envelope validation before Central handoff. */
export function validateCentralSubmitEnvelope(
  idempotencyKey: string,
  payload: unknown,
): ContractValidationResult<CentralScanPayloadV1> {
  const key = idempotencyKey?.trim();
  if (!key) {
    return {
      ok: false,
      code: "missing_identity",
      message: "idempotency_key is required",
    };
  }

  const payloadResult = validateCentralScanPayload(payload);
  if (!payloadResult.ok) return payloadResult;

  return validateIdempotencyKeyConsistency(key, payloadResult.payload);
}

/** Map contract rejection to permanent (non-retry) submit failure. */
export function isPermanentContractFailure(code: ContractRejectionCode): boolean {
  return [
    "invalid_contract",
    "missing_identity",
    "malformed_barcode",
    "idempotency_mismatch",
    "unknown_scan_type",
    "unknown_contract_version",
    "unsupported_shape",
  ].includes(code);
}

const CENTRAL_ORDER_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Order reference with optional Core/Central canonical UUID binding. */
export interface CentralOrderRef {
  id: string;
  order_number: string;
  external_ref?: string;
}

/**
 * Resolve canonical Central order UUID from cache row.
 * Trace must not mint order truth — returns null when external_ref is absent or invalid.
 */
export function resolveCentralOrderId(order: CentralOrderRef): string | null {
  const ref = order.external_ref?.trim();
  if (!ref || !CENTRAL_ORDER_ID_RE.test(ref)) return null;
  return ref;
}

/** Stamp v1.0 contract version on a producer payload before Central handoff. */
export function stampContractVersion<T extends CentralScanPayloadV1>(payload: T): T {
  return { ...payload, contract_version: CENTRAL_TRACE_CONTRACT_VERSION };
}

/**
 * Producer-side fail-closed gate: stamp version + validate envelope before handoff.
 */
export function finalizeCentralScanHandoff(
  idempotencyKey: string,
  payload: CentralScanPayloadV1,
): ContractValidationResult<CentralScanPayloadV1> {
  return validateCentralSubmitEnvelope(idempotencyKey, stampContractVersion(payload));
}

/** Map submit failureReason strings to permanent (non-retry) classification. */
export function isPermanentSubmitFailureReason(reason?: string): boolean {
  if (!reason) return false;
  const normalized = reason.toLowerCase();
  if (normalized === "invalid_contract") return true;
  if (PERMANENT_SUBMIT_FAILURE_REASONS.has(normalized)) return true;
  if (normalized.includes("forbidden") || normalized.includes("not_verified")) return true;
  return false;
}

/** Shared permanent failure reasons for submit + offline retry lanes. */
export const PERMANENT_SUBMIT_FAILURE_REASONS = new Set([
  "unauthenticated",
  "forbidden",
  "not_verified",
  "invalid_request",
  "invalid_contract",
  "submit_disabled",
]);

/**
 * Point 92 — Trace packing/carton contract (Trace-owned).
 *
 * Canonical closure for carton composition and packing truth: fail-closed
 * validation, immutable sealed-carton composition, and consumption of
 * canonical backend identity (ols_orders_cache, ols_production_labels).
 *
 * Boundaries (do not absorb):
 * - Point 93: Central↔Trace scan transport (`centralTraceContract.ts`)
 * - Point 94: barcode identity (`scanContract.ts`, `barcodeCarton.ts`)
 * - Point 95: label print/reprint (`reprintPolicy.ts`, `labelPrintLog.ts`)
 * - Point 96: scan retry (`scanSubmitQueue.ts`)
 * - Point 97: physical custody handoff (separate UAT lane)
 * - DPL membership authority: Core/Central via `ols_dpl_cartons` FK (`dplMembership.ts`)
 *
 * SOFTWARE CONTRACT / EVIDENCE ONLY — no production mutation or physical-success claims.
 */
import { supportsCentralBarcode } from "@/lib/scanContract";
import type { Carton, CartonContent, OrderCache, ProductionLabel } from "@/lib/types";

/** Trace packing contract revision — bump when breaking packing shape changes. */
export const PACKING_CARTON_CONTRACT_VERSION = "1.0";

export type PackingCartonContractVersion = typeof PACKING_CARTON_CONTRACT_VERSION;

/** Carton statuses that allow content edits (packing in progress). */
export const EDITABLE_CARTON_STATUSES = ["draft"] as const;

/** Carton statuses where composition is sealed and must not be mutated. */
export const SEALED_CARTON_STATUSES = ["packed", "finance_received", "dispatched", "held"] as const;

export type PackingRejectionCode =
  | "order_not_found"
  | "order_unresolved"
  | "carton_not_found"
  | "carton_not_editable"
  | "carton_already_sealed"
  | "content_edit_after_seal"
  | "duplicate_label"
  | "label_not_found"
  | "label_already_packed"
  | "empty_carton"
  | "identity_not_verified"
  | "duplicate_carton_no"
  | "overpack_exceeds_order"
  | "missing_weight_authority"
  | "unauthorized_reopen"
  | "dpl_handoff_prerequisite"
  | "not_packed_for_downstream"
  | "invalid_contract";

export interface PackingValidationSuccess<T = void> {
  ok: true;
  contractVersion: PackingCartonContractVersion;
  data?: T;
}

export interface PackingValidationFailure {
  ok: false;
  code: PackingRejectionCode;
  message: string;
  details?: string[];
}

/** Flat result shape — reliable under strictNullChecks:false (see dplMembership.ts). */
export interface PackingValidationResult<T = unknown> {
  ok: boolean;
  contractVersion?: PackingCartonContractVersion;
  code?: PackingRejectionCode;
  message?: string;
  details?: string[];
  data?: T;
}

export interface CartonWeightTotals {
  net: number;
  gross: number;
  /** True when any packed label lacks weight authority from production labels. */
  hasMissingWeights: boolean;
}

/** Producer/consumer matrix for Point 92 census. */
export const PACKING_PRODUCER_CONSUMER_MATRIX = [
  {
    surface: "carton_identity",
    identifier: "ols_cartons.id + carton_no (legacy CTN-YYYYMMDD-####)",
    producer: "Trace (numbering.num.carton + insertWithUniqueRetry)",
    consumer: "Trace packing UI, DPL, Finance PI, gate",
    authBoundary: "Core RPC trace_finalize_carton_v1 seals; draft edits Trace-local only",
    idempotencyKey: "finalize-carton:{carton_id}",
    failureSemantics: "duplicate carton_no → bounded retry; sealed → content_edit_after_seal",
    version: PACKING_CARTON_CONTRACT_VERSION,
    sources: ["src/pages/Cartonization.tsx", "src/lib/numbering.ts", "src/lib/insertWithRetry.ts"],
    tests: ["src/lib/packingContract.test.ts"],
  },
  {
    surface: "order_binding",
    identifier: "ols_cartons.order_ref → ols_orders_cache.order_number",
    producer: "Core/Central (ols_orders_cache read-only in Trace)",
    consumer: "Trace packing create/seal flows",
    authBoundary: "Trace fail-closed on missing order; does not mint order truth",
    idempotencyKey: "n/a",
    failureSemantics: "order_not_found → no carton create",
    version: PACKING_CARTON_CONTRACT_VERSION,
    sources: ["src/lib/packingContract.ts", "db/ols_init.sql"],
    tests: ["src/lib/packingContract.test.ts"],
  },
  {
    surface: "carton_contents",
    identifier: "ols_carton_contents.production_label_id (unique active)",
    producer: "Trace packing scan (Cartonization)",
    consumer: "Seal totals, DPL rollup, PI rollup, traceability chain",
    authBoundary: "DB unique index ols_carton_contents_active_label_uniq",
    idempotencyKey: "n/a (DB enforces label uniqueness)",
    failureSemantics: "duplicate_label / label_already_packed → rejected",
    version: PACKING_CARTON_CONTRACT_VERSION,
    sources: ["src/pages/Cartonization.tsx", "db/ols_init.sql"],
    tests: ["src/lib/packingContract.test.ts"],
  },
  {
    surface: "central_carton_identity_gate",
    identifier: "CTN-SO-{order_number} verified before seal",
    producer: "Trace (scanService.processCartonIdentityScan — Point 94/93 boundary)",
    consumer: "Trace seal gate only; Central ingest is Point 93",
    authBoundary: "supportsCentralBarcode orders require identity_not_verified block",
    idempotencyKey: "scanIdempotencyKey(carton, barcode, order_id)",
    failureSemantics: "identity_not_verified → seal blocked",
    version: PACKING_CARTON_CONTRACT_VERSION,
    sources: ["src/lib/scanService.ts", "src/lib/packingContract.ts"],
    tests: ["src/lib/packingContract.test.ts", "src/lib/scanService.test.ts"],
  },
  {
    surface: "sealed_composition_immutability",
    identifier: "status packed+ → no content mutations",
    producer: "Trace (packingContract + Core trace_finalize_carton_v1)",
    consumer: "All downstream surfaces (DPL, PI, shipping, gate)",
    authBoundary: "Trace client rejects edits; Core RPC is authoritative seal",
    idempotencyKey: "finalize-carton:{carton_id}",
    failureSemantics: "content_edit_after_seal / carton_not_editable",
    version: PACKING_CARTON_CONTRACT_VERSION,
    sources: ["src/lib/packingContract.ts", "src/lib/traceMutations.ts"],
    tests: ["src/lib/packingContract.test.ts"],
  },
  {
    surface: "weight_totals",
    identifier: "ols_cartons.net_weight / gross_weight from production labels",
    producer: "Trace (computeCartonWeights — label authority only)",
    consumer: "Seal RPC, DPL totals, carton label preview",
    authBoundary: "Never invent weights; missing label weights flagged",
    idempotencyKey: "n/a",
    failureSemantics: "missing_weight_authority → prerequisite returned, not shadow truth",
    version: PACKING_CARTON_CONTRACT_VERSION,
    sources: ["src/lib/packingContract.ts", "src/pages/Cartonization.tsx"],
    tests: ["src/lib/packingContract.test.ts"],
  },
  {
    surface: "dpl_handoff_boundary",
    identifier: "packed cartons with proven contents → ols_dpl_cartons",
    producer: "Core (trace_create_dpl_v1)",
    consumer: "DPL page; membership read via dplMembership.ts",
    authBoundary: "Trace validates prerequisites; DPL FK truth is Core-owned",
    idempotencyKey: "create-dpl:{dpl_no}",
    failureSemantics: "dpl_handoff_prerequisite → fail-closed; no order_ref inference",
    version: PACKING_CARTON_CONTRACT_VERSION,
    sources: ["src/lib/packingContract.ts", "src/lib/dplMembership.ts", "src/pages/DPL.tsx"],
    tests: ["src/lib/packingContract.test.ts", "src/lib/dplMembership.test.ts"],
  },
  {
    surface: "reopen_governance",
    identifier: "sealed carton reopen requires explicit approval",
    producer: "Trace (reprintPolicy governance — Point 95 adjacent)",
    consumer: "Operator supervisor/admin approval path",
    authBoundary: "unauthorized_reopen without approvedBy",
    idempotencyKey: "n/a",
    failureSemantics: "unauthorized_reopen → blocked",
    version: PACKING_CARTON_CONTRACT_VERSION,
    sources: ["src/lib/packingContract.ts", "src/lib/reprintPolicy.ts"],
    tests: ["src/lib/packingContract.test.ts"],
  },
] as const;

export function isCartonEditable(carton: Pick<Carton, "status">): boolean {
  return EDITABLE_CARTON_STATUSES.includes(carton.status as (typeof EDITABLE_CARTON_STATUSES)[number]);
}

export function isCartonSealed(carton: Pick<Carton, "status">): boolean {
  return SEALED_CARTON_STATUSES.includes(carton.status as (typeof SEALED_CARTON_STATUSES)[number]);
}

export function isCartonPackedForDownstream(carton: Pick<Carton, "status">): boolean {
  return isCartonSealed(carton) && carton.status !== "held";
}

function fail<T = unknown>(code: PackingRejectionCode, message: string, details?: string[]): PackingValidationResult<T> {
  return { ok: false, code, message, details };
}

function ok<T>(data?: T): PackingValidationResult<T> {
  return { ok: true, contractVersion: PACKING_CARTON_CONTRACT_VERSION, data };
}

/** Resolve order from canonical backend cache — fail-closed when absent. */
export function resolveOrder(
  orderRef: string,
  orders: Pick<OrderCache, "id" | "order_number">[],
): PackingValidationResult<Pick<OrderCache, "id" | "order_number">> {
  const normalized = orderRef?.trim();
  if (!normalized) {
    return fail("order_unresolved", "Order reference is required");
  }
  const order = orders.find(o => o.order_number.toUpperCase() === normalized.toUpperCase());
  if (!order) {
    return fail("order_not_found", `Order ${normalized} not found in canonical orders cache`);
  }
  return ok(order);
}

/** Validate carton create request against canonical order identity. */
export function validateCreateCarton(input: {
  orderRef: string;
  orders: Pick<OrderCache, "id" | "order_number">[];
  existingCartonNos?: string[];
  proposedCartonNo?: string;
}): PackingValidationResult<{ order: Pick<OrderCache, "id" | "order_number"> }> {
  const orderResult = resolveOrder(input.orderRef, input.orders);
  if (!orderResult.ok) {
    return fail(orderResult.code!, orderResult.message!, orderResult.details);
  }

  if (input.proposedCartonNo && input.existingCartonNos?.length) {
    const dup = input.existingCartonNos.some(
      n => n.toUpperCase() === input.proposedCartonNo!.toUpperCase(),
    );
    if (dup) {
      return fail("duplicate_carton_no", `Carton number ${input.proposedCartonNo} already exists`);
    }
  }

  return ok({ order: orderResult.data! });
}

/** Validate adding a production label to a draft carton. */
export function validateAddContent(input: {
  carton: Pick<Carton, "id" | "status" | "order_ref">;
  labelId: string;
  label?: Pick<ProductionLabel, "id" | "label_no"> | null;
  existingContents: Pick<CartonContent, "production_label_id">[];
  packedLabelIds: Set<string> | string[];
}): PackingValidationResult {
  if (!input.carton) {
    return fail("carton_not_found", "Carton not found");
  }
  if (isCartonSealed(input.carton)) {
    return fail("content_edit_after_seal", "Cannot add content to a sealed carton");
  }
  if (!isCartonEditable(input.carton)) {
    return fail("carton_not_editable", `Carton status ${input.carton.status} does not allow packing edits`);
  }
  if (!input.labelId?.trim()) {
    return fail("label_not_found", "Production label identity is required");
  }
  if (!input.label) {
    return fail("label_not_found", "Production label not found in canonical label cache");
  }

  const packed = input.packedLabelIds instanceof Set
    ? input.packedLabelIds
    : new Set(input.packedLabelIds);

  if (packed.has(input.labelId)) {
    return fail("label_already_packed", "Label is already packed in another active carton");
  }
  if (input.existingContents.some(c => c.production_label_id === input.labelId)) {
    return fail("duplicate_label", "Label is already in this carton");
  }

  return ok();
}

/** Compute carton weights from production label authority only — never invent. */
export function computeCartonWeights(
  contents: Pick<CartonContent, "production_label_id">[],
  labels: Pick<ProductionLabel, "id" | "net_weight" | "gross_weight">[],
): CartonWeightTotals {
  let net = 0;
  let gross = 0;
  let hasMissingWeights = false;

  for (const content of contents) {
    if (!content.production_label_id) continue;
    const label = labels.find(l => l.id === content.production_label_id);
    if (!label) {
      hasMissingWeights = true;
      continue;
    }
    if (label.net_weight == null || label.gross_weight == null) {
      hasMissingWeights = true;
    } else {
      net += label.net_weight;
      gross += label.gross_weight;
    }
  }

  return { net, gross, hasMissingWeights };
}

/**
 * Validate seal (finalize) request. Central orders require verified CTN-SO
 * identity (Point 94 scan boundary); Central submit transport is Point 93.
 */
export function validateSealCarton(input: {
  carton: Pick<Carton, "id" | "status" | "order_ref">;
  contents: Pick<CartonContent, "production_label_id">[];
  labels: Pick<ProductionLabel, "id" | "net_weight" | "gross_weight">[];
  identityVerified: boolean;
  /** When true, missing weights block seal instead of writing zero shadow truth. */
  requireWeightAuthority?: boolean;
}): PackingValidationResult<CartonWeightTotals> {
  if (!input.carton) {
    return fail("carton_not_found", "Carton not found");
  }
  if (isCartonSealed(input.carton)) {
    return fail("carton_already_sealed", "Carton is already sealed");
  }
  if (!isCartonEditable(input.carton)) {
    return fail("carton_not_editable", `Carton status ${input.carton.status} cannot be sealed`);
  }
  if (!input.contents.length) {
    return fail("empty_carton", "Add at least one production label before sealing");
  }

  const orderRef = input.carton.order_ref || "";
  if (supportsCentralBarcode(orderRef) && !input.identityVerified) {
    return fail(
      "identity_not_verified",
      "Verify Central carton identity (CTN-SO) before sealing",
    );
  }

  const weights = computeCartonWeights(input.contents, input.labels);
  if (input.requireWeightAuthority !== false && weights.hasMissingWeights) {
    return fail(
      "missing_weight_authority",
      "Cannot seal carton — production label weight authority is missing",
      ["Prerequisite: canonical net_weight and gross_weight on all packed labels"],
    );
  }

  return ok(weights);
}

/**
 * Overpack guard when order metadata carries authoritative line quantities.
 * When absent, returns ok (no shadow order truth invented).
 */
export function validateOrderPackTotals(input: {
  order: Pick<OrderCache, "metadata">;
  orderRef: string;
  allCartonContents: Pick<CartonContent, "carton_id" | "production_label_id">[];
  cartonsForOrder: Pick<Carton, "id" | "order_ref" | "status">[];
  labels: Pick<ProductionLabel, "id" | "metadata">[];
  proposedLabelId?: string;
}): PackingValidationResult {
  const lines = input.order.metadata?.lines as Array<{ sku?: string; quantity?: number }> | undefined;
  if (!lines?.length) {
    return ok();
  }

  const orderCartonIds = new Set(
    input.cartonsForOrder
      .filter(c => c.order_ref === input.orderRef && c.status !== "cancelled")
      .map(c => c.id),
  );

  const packedBySku: Record<string, number> = {};
  for (const content of input.allCartonContents) {
    if (!content.production_label_id || !orderCartonIds.has(content.carton_id)) continue;
    const label = input.labels.find(l => l.id === content.production_label_id);
    const sku = label?.metadata?.sku;
    if (!sku) continue;
    packedBySku[sku] = (packedBySku[sku] || 0) + 1;
  }

  if (input.proposedLabelId) {
    const proposed = input.labels.find(l => l.id === input.proposedLabelId);
    const sku = proposed?.metadata?.sku;
    if (sku) packedBySku[sku] = (packedBySku[sku] || 0) + 1;
  }

  const violations: string[] = [];
  for (const line of lines) {
    if (!line.sku || line.quantity == null) continue;
    const packed = packedBySku[line.sku] || 0;
    if (packed > line.quantity) {
      violations.push(`${line.sku}: packed ${packed} exceeds ordered ${line.quantity}`);
    }
  }

  if (violations.length) {
    return fail("overpack_exceeds_order", "Pack quantity exceeds ordered quantity", violations);
  }

  return ok();
}

/** Reopen governance — sealed cartons require explicit approval to revert to draft. */
export function validateReopenGovernance(
  carton: Pick<Carton, "status">,
  opts?: { approvedBy?: string | null },
): PackingValidationResult {
  if (!isCartonSealed(carton)) {
    return ok();
  }
  if (!opts?.approvedBy?.trim()) {
    return fail(
      "unauthorized_reopen",
      "Reopening a sealed carton requires supervisor approval",
    );
  }
  return ok();
}

/** Validate cartons are eligible for DPL handoff (Point 92 → Core DPL boundary). */
export function validateDplHandoffBoundary(
  cartons: Pick<Carton, "id" | "status" | "order_ref" | "net_weight" | "gross_weight" | "carton_no">[],
  contents: Pick<CartonContent, "carton_id" | "production_label_id">[],
  cartonIds: string[],
  orderRef: string,
): PackingValidationResult {
  if (!cartonIds.length) {
    return fail("dpl_handoff_prerequisite", "No cartons selected for DPL");
  }

  const details: string[] = [];
  for (const id of cartonIds) {
    const carton = cartons.find(c => c.id === id);
    if (!carton) {
      details.push(`${id}: carton_not_found`);
      continue;
    }
    if (carton.order_ref !== orderRef) {
      details.push(`${carton.carton_no ?? id}: order binding mismatch`);
      continue;
    }
    if (!isCartonPackedForDownstream(carton)) {
      details.push(`${carton.id}: status ${carton.status} — must be packed before DPL`);
      continue;
    }
    const cartonContents = contents.filter(c => c.carton_id === id && c.production_label_id);
    if (!cartonContents.length) {
      details.push(`${carton.id}: no proven contents`);
      continue;
    }
    if (carton.net_weight == null || carton.gross_weight == null) {
      details.push(`${carton.id}: missing sealed weight authority`);
    }
  }

  if (details.length) {
    return fail(
      "dpl_handoff_prerequisite",
      "One or more cartons fail DPL handoff prerequisites",
      details,
    );
  }

  return ok();
}

/** Validate a carton scan for Finance PI / downstream dispatch (must be sealed). */
export function validatePackedCartonForDownstream(
  carton: Pick<Carton, "id" | "status" | "carton_no"> | undefined,
): PackingValidationResult {
  if (!carton) {
    return fail("carton_not_found", "Carton not found");
  }
  if (!isCartonPackedForDownstream(carton)) {
    return fail(
      "not_packed_for_downstream",
      `Carton ${carton.carton_no} is not packed — complete packing before downstream handoff`,
    );
  }
  return ok();
}

/** Map packing rejections that must not be silently retried or overridden. */
export function isPermanentPackingFailure(code: PackingRejectionCode): boolean {
  return [
    "order_not_found",
    "order_unresolved",
    "content_edit_after_seal",
    "carton_already_sealed",
    "duplicate_label",
    "label_already_packed",
    "identity_not_verified",
    "duplicate_carton_no",
    "overpack_exceeds_order",
    "missing_weight_authority",
    "unauthorized_reopen",
    "dpl_handoff_prerequisite",
    "not_packed_for_downstream",
  ].includes(code);
}

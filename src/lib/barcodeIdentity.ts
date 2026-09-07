/**
 * Point 94 — Canonical Trace barcode identity authority (Trace-owned).
 *
 * Single fail-closed source for identity formats, allocation, parse,
 * normalization, and classification. Core/Central remain canonical for
 * product/EAN and order truth; CTN-SO derivation stays Point93-compatible.
 *
 * Physical print/scanner UAT remains separate (Point95/96).
 */
import {
  generateCartonOrderBarcode,
  ORDER_NUMBER_RE,
  parseCartonOrderBarcode,
  parseLegacyCartonBarcode,
  supportsCentralBarcode,
} from "@/lib/scanContract";

/** Trace-owned allocatable identity kinds (excludes derived central carton barcodes). */
export type TraceAllocatableKind =
  | "production_label"
  | "batch"
  | "legacy_carton"
  | "dpl"
  | "pi"
  | "shipping";

export type BarcodeIdentityKind =
  | TraceAllocatableKind
  | "central_carton"
  | "shipping_qr"
  | "preview"
  | "invalid";

export type IdentityRejectionCode =
  | "empty"
  | "malformed"
  | "ambiguous"
  | "preview_in_production"
  | "unresolvable";

export interface ParsedBarcodeIdentity {
  kind: BarcodeIdentityKind;
  normalized: string;
  /** Present for central_carton identities. */
  orderNumber?: string;
  /** Present for shipping_qr derived from shipping_no. */
  shippingNo?: string;
}

export interface IdentityValidationSuccess extends ParsedBarcodeIdentity {
  ok: true;
}

export interface IdentityValidationFailure {
  ok: false;
  code: IdentityRejectionCode;
  message: string;
  normalized: string;
}

export type IdentityValidationResult = IdentityValidationSuccess | IdentityValidationFailure;

/** Non-authoritative preview fixtures — UI/templates only, never allocated in production. */
export const PREVIEW_BARCODE_IDENTITIES = {
  productionLabel: "PL-PREVIEW-0001",
  cartonCentral: "CTN-SO-2026-000136",
  cartonLegacy: "CTN-PREVIEW-0001",
} as const;

const PREVIEW_RE = /-PREVIEW-/i;

const ALLOC_SPECS: Record<TraceAllocatableKind, { prefix: string; seqDigits: number }> = {
  production_label: { prefix: "PL", seqDigits: 4 },
  batch: { prefix: "BAT", seqDigits: 3 },
  legacy_carton: { prefix: "CTN", seqDigits: 4 },
  dpl: { prefix: "DPL", seqDigits: 3 },
  pi: { prefix: "PI", seqDigits: 3 },
  shipping: { prefix: "SHP", seqDigits: 4 },
};

const TRACE_IDENTITY_RES: Record<TraceAllocatableKind, RegExp> = {
  production_label: /^PL-\d{8}-\d{4}$/,
  batch: /^BAT-\d{8}-\d{3}$/,
  legacy_carton: /^CTN-\d{8}-\d{4}$/,
  dpl: /^DPL-\d{8}-\d{3}$/,
  pi: /^PI-\d{8}-\d{3}$/,
  shipping: /^SHP-\d{8}-\d{4}$/,
};

/** Shipping QR refs: QR-{12+ alnum} — typically derived from SHP identity. */
export const SHIPPING_QR_RE = /^QR-[A-Z0-9]{8,16}$/;

const counters = new Map<string, number>();

function ymd(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

/** Test-only: reset monotonic counters between cases. */
export function resetTraceIdentityCounters(): void {
  counters.clear();
}

function nextSequence(kind: TraceAllocatableKind, date = new Date()): number {
  const key = `${kind}:${ymd(date)}`;
  const n = (counters.get(key) ?? 0) + 1;
  counters.set(key, n);
  return n;
}

/** Normalize raw scan/input to uppercase trimmed form. */
export function normalizeBarcodeIdentity(raw: string): string {
  return raw.trim().toUpperCase();
}

export function isPreviewIdentity(value: string): boolean {
  return PREVIEW_RE.test(normalizeBarcodeIdentity(value));
}

/**
 * Deterministic Trace-owned identity allocation (monotonic per kind per day).
 * Demo/preview/tests only — use {@link allocateProductionIdentity} for live writes.
 */
export function allocateTraceIdentity(
  kind: TraceAllocatableKind,
  opts?: { date?: Date; sequence?: number },
): string {
  const spec = ALLOC_SPECS[kind];
  const seq = opts?.sequence ?? nextSequence(kind, opts?.date);
  const maximum = 10 ** spec.seqDigits - 1;
  if (!Number.isInteger(seq) || seq < 1 || seq > maximum) {
    throw new Error(`Sequence out of range for ${kind}: ${seq} (max ${maximum})`);
  }
  return `${spec.prefix}-${ymd(opts?.date)}-${String(seq).padStart(spec.seqDigits, "0")}`;
}

/** Derive CTN-SO barcode from Core/Central order number (not client-random). */
export function deriveCentralCartonBarcode(orderNumber: string): string {
  return generateCartonOrderBarcode(orderNumber);
}

/**
 * Deterministic shipping QR ref from authoritative shipping_no.
 * Central gate resolves legacy flow via qr_ref / shipping_no lookup.
 */
export function deriveShippingQrRef(shippingNo: string): string {
  const normalized = normalizeBarcodeIdentity(shippingNo);
  if (!TRACE_IDENTITY_RES.shipping.test(normalized)) {
    throw new Error(`Invalid shipping_no for QR derivation: ${shippingNo}`);
  }
  const suffix = normalized.replace(/^SHP-/, "").replace(/-/g, "");
  return `QR-${suffix}`;
}

/** Classify any barcode/QR value without fail-closed rejection. */
export function classifyBarcodeIdentity(raw: string): BarcodeIdentityKind {
  const normalized = normalizeBarcodeIdentity(raw);
  if (!normalized) return "invalid";
  if (isPreviewIdentity(normalized)) return "preview";
  if (parseCartonOrderBarcode(normalized).valid) return "central_carton";
  if (TRACE_IDENTITY_RES.legacy_carton.test(normalized)) return "legacy_carton";
  if (TRACE_IDENTITY_RES.production_label.test(normalized)) return "production_label";
  if (TRACE_IDENTITY_RES.batch.test(normalized)) return "batch";
  if (TRACE_IDENTITY_RES.dpl.test(normalized)) return "dpl";
  if (TRACE_IDENTITY_RES.pi.test(normalized)) return "pi";
  if (TRACE_IDENTITY_RES.shipping.test(normalized)) return "shipping";
  if (SHIPPING_QR_RE.test(normalized)) return "shipping_qr";
  return "invalid";
}

/** Parse identity into structured form; invalid kinds return kind=invalid. */
export function parseBarcodeIdentity(raw: string): ParsedBarcodeIdentity {
  const normalized = normalizeBarcodeIdentity(raw);
  const kind = classifyBarcodeIdentity(normalized);
  if (kind === "central_carton") {
    const parsed = parseCartonOrderBarcode(normalized);
    return { kind, normalized, orderNumber: parsed.orderNumber ?? undefined };
  }
  if (kind === "shipping_qr") {
    const maybeShipping = normalized.replace(/^QR-/, "");
    const shippingNo = maybeShipping.length === 12
      ? `SHP-${maybeShipping.slice(0, 8)}-${maybeShipping.slice(8)}`
      : undefined;
    return { kind, normalized, shippingNo };
  }
  return { kind, normalized };
}

/**
 * Fail-closed validation. Rejects empty, malformed, ambiguous, preview-in-production,
 * and unresolvable identities.
 */
export function validateBarcodeIdentity(
  raw: string,
  opts?: { expectedKind?: BarcodeIdentityKind; allowPreview?: boolean },
): IdentityValidationResult {
  const normalized = normalizeBarcodeIdentity(raw);
  if (!normalized) {
    return { ok: false, code: "empty", message: "Barcode identity is empty", normalized };
  }

  if (isPreviewIdentity(normalized) && !opts?.allowPreview) {
    return {
      ok: false,
      code: "preview_in_production",
      message: "Preview fixture identities are not valid in production flows",
      normalized,
    };
  }

  const parsed = parseBarcodeIdentity(normalized);

  if (parsed.kind === "invalid") {
    return {
      ok: false,
      code: "malformed",
      message: "Barcode identity format is not recognized",
      normalized,
    };
  }

  if (parsed.kind === "legacy_carton" && parseCartonOrderBarcode(normalized).valid) {
    return {
      ok: false,
      code: "ambiguous",
      message: "Barcode matches both legacy CTN and central CTN-SO patterns",
      normalized,
    };
  }

  if (opts?.expectedKind && parsed.kind !== opts.expectedKind) {
    return {
      ok: false,
      code: "malformed",
      message: `Expected ${opts.expectedKind} identity, got ${parsed.kind}`,
      normalized,
    };
  }

  if (parsed.kind === "central_carton" && !parsed.orderNumber) {
    return {
      ok: false,
      code: "unresolvable",
      message: "Central carton barcode does not resolve to an order number",
      normalized,
    };
  }

  return { ok: true, ...parsed };
}

/** True when order supports Central CTN-SO (delegates to Point93 scanContract). */
export function orderSupportsCentralCartonBarcode(orderNumber: string): boolean {
  return supportsCentralBarcode(orderNumber);
}

/** Authority matrix for census / contract documentation. */
export const BARCODE_IDENTITY_AUTHORITY_MATRIX = [
  {
    kind: "production_label",
    format: "PL-YYYYMMDD-####",
    producer: "Trace (allocateTraceIdentity)",
    uniqueness: "Trace DB unique on ols_production_labels.label_no",
    centralResolvable: false,
    eanGs1: "Trace label barcode only — Core owns retail product/EAN",
    sources: ["src/lib/barcodeIdentity.ts", "src/pages/ProductionEntry.tsx"],
    tests: ["src/lib/barcodeIdentity.test.ts"],
  },
  {
    kind: "batch",
    format: "BAT-YYYYMMDD-###",
    producer: "Trace (allocateTraceIdentity)",
    uniqueness: "Trace DB unique on ols_production_batches.batch_no",
    centralResolvable: false,
    eanGs1: "n/a",
    sources: ["src/lib/barcodeIdentity.ts"],
    tests: ["src/lib/barcodeIdentity.test.ts"],
  },
  {
    kind: "central_carton",
    format: "CTN-SO-{order_number}",
    producer: "Trace derive from Core order_number (scanContract)",
    uniqueness: "Deterministic 1:1 with SO-YYYY-####",
    centralResolvable: true,
    eanGs1: "n/a",
    sources: ["src/lib/scanContract.ts", "src/lib/barcodeCarton.ts"],
    tests: ["src/lib/scanContract.test.ts", "src/lib/barcodeIdentity.test.ts"],
  },
  {
    kind: "legacy_carton",
    format: "CTN-YYYYMMDD-####",
    producer: "Trace (allocateTraceIdentity — legacy orders only)",
    uniqueness: "Trace DB unique on ols_cartons.carton_no",
    centralResolvable: false,
    eanGs1: "n/a",
    sources: ["src/lib/barcodeIdentity.ts", "src/lib/scanContract.ts"],
    tests: ["src/lib/barcodeIdentity.test.ts", "src/lib/legacyGateDecision.test.ts"],
  },
  {
    kind: "shipping",
    format: "SHP-YYYYMMDD-####",
    producer: "Trace (allocateTraceIdentity)",
    uniqueness: "Trace DB unique on ols_shipping_labels.shipping_no",
    centralResolvable: false,
    eanGs1: "n/a",
    sources: ["src/lib/barcodeIdentity.ts", "src/pages/ShippingLabel.tsx"],
    tests: ["src/lib/barcodeIdentity.test.ts"],
  },
  {
    kind: "shipping_qr",
    format: "QR-{derived from SHP}",
    producer: "Trace (deriveShippingQrRef)",
    uniqueness: "Trace DB unique on ols_shipping_labels.qr_ref",
    centralResolvable: "Legacy gate only (qr_ref lookup)",
    eanGs1: "n/a",
    sources: ["src/lib/barcodeIdentity.ts", "src/lib/scanService.ts"],
    tests: ["src/lib/barcodeIdentity.test.ts", "src/lib/legacyGateDecision.test.ts"],
  },
  {
    kind: "dpl",
    format: "DPL-YYYYMMDD-###",
    producer: "Trace (allocateTraceIdentity)",
    uniqueness: "Trace DB unique on ols_dpl_documents.dpl_no",
    centralResolvable: false,
    eanGs1: "n/a",
    sources: ["src/lib/barcodeIdentity.ts"],
    tests: ["src/lib/barcodeIdentity.test.ts"],
  },
  {
    kind: "pi",
    format: "PI-YYYYMMDD-###",
    producer: "Trace (allocateTraceIdentity)",
    uniqueness: "Trace DB unique on ols_finance_pi.pi_no",
    centralResolvable: false,
    eanGs1: "n/a",
    sources: ["src/lib/barcodeIdentity.ts"],
    tests: ["src/lib/barcodeIdentity.test.ts"],
  },
  {
    kind: "order_truth",
    format: "SO-YYYY-####",
    producer: "Core/Central (ols_orders_cache)",
    uniqueness: "Core-owned",
    centralResolvable: true,
    eanGs1: "n/a",
    sources: ["src/lib/scanContract.ts", "db/ols_init.sql"],
    tests: ["src/lib/scanContract.test.ts"],
  },
] as const;

/** Re-export legacy parse for backward compatibility at call sites. */
export { parseLegacyCartonBarcode, ORDER_NUMBER_RE };

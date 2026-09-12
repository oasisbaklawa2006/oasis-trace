/**
 * Point 95 — Governed label print / reprint / verification closure (Trace-owned).
 *
 * Single fail-closed contract for production, carton, and shipping label surfaces.
 * Uses Point 94 canonical identities; does not fabricate physical print success.
 * Physical printer UAT remains downstream (Point 96 / #459).
 */
import { listTable, insertRow } from "@/lib/data";
import {
  validateBarcodeIdentity,
  deriveShippingQrRef,
  type BarcodeIdentityKind,
} from "@/lib/barcodeIdentity";
import {
  buildProductionLabelPayload,
  buildCartonLabelPayload,
  buildShippingLabelPayload,
} from "@/lib/labelPayloads";
import { generateTSPL, generateZPL, type LabelPayload } from "@/lib/printerCommands";
import { copyToClipboardBestEffort } from "@/lib/labelPrintLog";
import { resolveCartonBarcodeDisplay } from "@/lib/barcodeCarton";
import type {
  Carton,
  CartonContent,
  LabelTemplateRow,
  PrinterRow,
  ProductionLabel,
  ShippingLabelRow,
} from "@/lib/types";
import type { ReprintRefType } from "@/lib/reprintPolicy";

export type PrintSurface = ReprintRefType;
export type PrintJobState = "GENERATED" | "SENT" | "FAILED" | "UNSUPPORTED_TRANSPORT";

export type GovernedPrintRejectionCode =
  | "identity_empty"
  | "identity_malformed"
  | "identity_preview"
  | "identity_mismatch"
  | "template_unavailable"
  | "unsupported_transport"
  | "reprint_reason_required"
  | "entity_not_found"
  | "payload_verification_failed";

export interface ResolvedTemplate {
  id?: string;
  name: string;
  version: string;
  labelType: string;
  widthMm: number;
  heightMm: number;
  commandLang: "TSPL" | "ZPL" | "BROWSER";
}

export interface PrintVerificationResult {
  ok: boolean;
  barcodeMatchesIdentity: boolean;
  templateBound: boolean;
  qrMatchesShipping?: boolean;
  message: string;
}

export interface GovernedPrintRequest {
  surface: PrintSurface;
  refId: string;
  /** Canonical barcode identity that must appear on the physical label. */
  barcodeIdentity: string;
  payload: LabelPayload;
  actorId?: string;
  actorName?: string;
  printerId?: string;
  commandLang?: "TSPL" | "ZPL";
  isReprint?: boolean;
  reprintCount?: number;
  reprintReason?: string;
  watermark?: string;
  /** Optional shipping QR — verified against deriveShippingQrRef when present. */
  qrIdentity?: string;
}

export interface GovernedPrintFailure {
  ok: false;
  code: GovernedPrintRejectionCode;
  message: string;
}

export interface GovernedPrintSuccess {
  ok: true;
  jobId: string;
  logId: string;
  command: string;
  copiedToClipboard: boolean;
  state: PrintJobState;
  template: ResolvedTemplate;
  identity: string;
  verification: PrintVerificationResult;
}

export type GovernedPrintResult = GovernedPrintSuccess | GovernedPrintFailure;

export const NO_PHYSICAL_PRINT_NOTE =
  "Label command generated (TSPL/ZPL) — no printer transport connected yet, so this has not physically printed.";

const SURFACE_TEMPLATE_TYPES: Record<PrintSurface, string[]> = {
  production_label: ["product", "production"],
  carton: ["carton"],
  shipping: ["shipping"],
  dpl: ["dpl"],
  pi: ["pi"],
};

const BUILTIN_TEMPLATES: Partial<Record<PrintSurface, ResolvedTemplate>> = {
  production_label: {
    name: "Product 75x50",
    version: "builtin:product-75x50",
    labelType: "product",
    widthMm: 75,
    heightMm: 50,
    commandLang: "TSPL",
  },
  carton: {
    name: "Carton 100x75",
    version: "builtin:carton-100x75",
    labelType: "carton",
    widthMm: 100,
    heightMm: 75,
    commandLang: "TSPL",
  },
  shipping: {
    name: "Shipping 100x150",
    version: "builtin:shipping-100x150",
    labelType: "shipping",
    widthMm: 100,
    heightMm: 150,
    commandLang: "TSPL",
  },
};

const IDENTITY_KINDS: Partial<Record<PrintSurface, BarcodeIdentityKind[]>> = {
  production_label: ["production_label"],
  carton: ["central_carton", "legacy_carton"],
  shipping: ["shipping"],
};

/** Authority census for Point 95 print/reprint surfaces (software scope only). */
export const PRINT_AUTHORITY_CENSUS = [
  {
    surface: "production_label",
    template: "ols_label_templates label_type product|production (75×50 default)",
    commandPath: "TSPL via generateTSPL; ZPL via generateZPL; BROWSER fails closed",
    persistence: "ols_print_jobs + ols_print_logs",
    identity: "Point94 PL-YYYYMMDD-#### via label_no",
    reprint: "ReprintModal reason + DUPLICATE COPY watermark; identity preserved",
    verification: "verifyPrintEquivalence — payload.barcode === canonical identity",
    sources: ["src/pages/ProductionEntry.tsx", "src/lib/governedPrint.ts"],
    physicalUat: "downstream — not claimed by software",
  },
  {
    surface: "carton",
    template: "ols_label_templates label_type carton (100×75 default)",
    commandPath: "TSPL/ZPL; print bridge optional via Printers/Templates",
    persistence: "ols_print_jobs + ols_print_logs",
    identity: "Point94 CTN-SO or legacy CTN via resolveCartonBarcodeDisplay",
    reprint: "PrintLogs / ReprintModal — reason required, same barcode",
    verification: "barcode === central or legacy canonical identity",
    sources: ["src/pages/Cartonization.tsx", "src/lib/barcodeCarton.ts"],
    physicalUat: "downstream",
  },
  {
    surface: "shipping",
    template: "ols_label_templates label_type shipping (100×150 default)",
    commandPath: "TSPL/ZPL; QR derived via deriveShippingQrRef",
    persistence: "ols_print_jobs + ols_print_logs",
    identity: "Point94 SHP- + QR- derived from shipping_no",
    reprint: "ShippingLabel ReprintModal — preserves shipping_no/qr_ref",
    verification: "barcode + QR equivalence to canonical identities",
    sources: ["src/pages/ShippingLabel.tsx", "src/lib/barcodeIdentity.ts"],
    physicalUat: "downstream",
  },
  {
    surface: "templates_demo",
    template: "ols_label_templates editor + LabelPreview",
    commandPath: "TSPL/ZPL copy or print-bridge; window.print is preview-only A4",
    persistence: "none for browser print",
    identity: "PREVIEW_BARCODE_IDENTITIES only — blocked in governed production path",
    reprint: "n/a",
    verification: "preview identities rejected by validatePrintIdentity",
    sources: ["src/pages/Templates.tsx", "src/lib/barcodeIdentity.ts"],
    physicalUat: "downstream",
  },
] as const;

export type PrintIdentityValidation =
  | GovernedPrintFailure
  | { ok: true; normalized: string; kind: BarcodeIdentityKind };

export function validatePrintIdentity(surface: PrintSurface, rawIdentity: string): PrintIdentityValidation {
  const allowed = IDENTITY_KINDS[surface];
  if (!allowed) {
    const v = validateBarcodeIdentity(rawIdentity);
    if (v.ok === false) return { ok: false, code: mapIdentityCode(v.code), message: v.message };
    return { ok: true, normalized: v.normalized, kind: v.kind };
  }
  for (const kind of allowed) {
    const v = validateBarcodeIdentity(rawIdentity, { expectedKind: kind });
    if (v.ok) return { ok: true, normalized: v.normalized, kind: v.kind };
  }
  const probe = validateBarcodeIdentity(rawIdentity);
  if (probe.ok === false) return { ok: false, code: mapIdentityCode(probe.code), message: probe.message };
  return {
    ok: false,
    code: "identity_mismatch",
    message: `Identity kind ${probe.kind} is not valid for ${surface} print`,
  };
}

function mapIdentityCode(code: string): GovernedPrintRejectionCode {
  if (code === "empty") return "identity_empty";
  if (code === "preview_in_production") return "identity_preview";
  return "identity_malformed";
}

export async function resolveTemplateForSurface(
  surface: PrintSurface,
  templates?: LabelTemplateRow[],
): Promise<ResolvedTemplate | GovernedPrintFailure> {
  const rows = templates ?? await listTable<LabelTemplateRow>("ols_label_templates");
  const types = SURFACE_TEMPLATE_TYPES[surface] ?? [];
  const match = rows.find(t => types.includes(t.label_type));
  if (match) {
    return {
      id: match.id,
      name: match.name,
      version: `${match.name}@${match.width_mm}x${match.height_mm}`,
      labelType: match.label_type,
      widthMm: Number(match.width_mm),
      heightMm: Number(match.height_mm),
      commandLang: "TSPL",
    };
  }
  const builtin = BUILTIN_TEMPLATES[surface];
  if (builtin) return builtin;
  return { ok: false, code: "template_unavailable", message: `No authoritative template for ${surface} label surface` };
}

export function verifyPrintEquivalence(
  payload: LabelPayload,
  identity: string,
  template: ResolvedTemplate,
  opts?: { qrIdentity?: string },
): PrintVerificationResult {
  const normalized = identity.trim().toUpperCase();
  const barcodeMatches = (payload.barcode ?? "").trim().toUpperCase() === normalized;
  const templateBound = payload.widthMm === template.widthMm && payload.heightMm === template.heightMm;

  let qrMatchesShipping: boolean | undefined;
  const expectedQrIdentity = opts?.qrIdentity?.trim();
  if (expectedQrIdentity) {
    if (!payload.qr?.trim()) {
      qrMatchesShipping = false;
    } else {
      try {
        const expected = deriveShippingQrRef(normalized);
        qrMatchesShipping =
          payload.qr.trim().toUpperCase() === expectedQrIdentity.toUpperCase() &&
          expectedQrIdentity.toUpperCase() === expected;
      } catch {
        qrMatchesShipping = false;
      }
    }
  }

  const ok = barcodeMatches && templateBound && (qrMatchesShipping === undefined || qrMatchesShipping);
  const parts: string[] = [];
  if (!barcodeMatches) parts.push("barcode≠identity");
  if (!templateBound) parts.push("template≠dimensions");
  if (qrMatchesShipping === false) parts.push(payload.qr?.trim() ? "qr≠derived" : "qr=missing");

  return {
    ok,
    barcodeMatchesIdentity: barcodeMatches,
    templateBound,
    qrMatchesShipping,
    message: ok ? "payload matches canonical identity and template" : parts.join("; "),
  };
}

function packLogReason(parts: Record<string, string | number | boolean | undefined>): string {
  const base = parts.base as string;
  const extras = Object.entries(parts)
    .filter(([k]) => k !== "base")
    .filter(([, v]) => v !== undefined && v !== "")
    .map(([k, v]) => `${k}=${v}`)
    .join("|");
  return extras ? `${base}|${extras}` : base;
}

async function resolveCommandLang(
  printerId?: string,
  override?: "TSPL" | "ZPL",
): Promise<"TSPL" | "ZPL" | GovernedPrintFailure> {
  if (override) return override;
  if (!printerId) return "TSPL";
  const printers = await listTable<PrinterRow>("ols_printers");
  const printer = printers.find(p => p.id === printerId);
  if (!printer) {
    return {
      ok: false,
      code: "unsupported_transport",
      message: "Selected printer is not registered; governed command generation was blocked",
    };
  }
  if (printer.command_lang === "BROWSER") {
    return {
      ok: false,
      code: "unsupported_transport",
      message: "Browser-print printers cannot be used for governed thermal label commands",
    };
  }
  if (printer.command_lang === "ZPL") return "ZPL";
  return "TSPL";
}

/** Fail-closed governed print — generates command, persists job+log, never claims physical print. */
export async function executeGovernedPrint(req: GovernedPrintRequest): Promise<GovernedPrintResult> {
  if (req.isReprint && !req.reprintReason?.trim()) {
    return { ok: false, code: "reprint_reason_required", message: "Reprint requires a documented reason — cannot silently re-allocate identity" };
  }
  const idCheck = validatePrintIdentity(req.surface, req.barcodeIdentity);
  if (idCheck.ok === false) return idCheck;
  const templateResult = await resolveTemplateForSurface(req.surface);
  if ("ok" in templateResult && templateResult.ok === false) return templateResult;
  const template = templateResult as ResolvedTemplate;
  const langResult = await resolveCommandLang(req.printerId, req.commandLang);
  if (typeof langResult !== "string") return langResult;

  const payload: LabelPayload = {
    ...req.payload,
    widthMm: template.widthMm,
    heightMm: template.heightMm,
    barcode: idCheck.normalized,
    watermark: req.watermark ?? req.payload.watermark,
  };
  const verification = verifyPrintEquivalence(payload, idCheck.normalized, template, { qrIdentity: req.qrIdentity });
  if (!verification.ok) return { ok: false, code: "payload_verification_failed", message: verification.message };

  const command = langResult === "ZPL" ? generateZPL(payload) : generateTSPL(payload);
  const copiedToClipboard = await copyToClipboardBestEffort(command);
  const jobRow = await insertRow<{ id: string }>("ols_print_jobs", {
    template_id: template.id ?? null,
    printer_id: req.printerId ?? null,
    command_lang: langResult,
    command_payload: command,
    status: "generated",
  });
  const logRow = await insertRow<{ id: string }>("ols_print_logs", {
    ref_type: req.surface,
    ref_id: req.refId,
    printer_id: req.printerId ?? null,
    is_reprint: req.isReprint ?? false,
    reprint_count: req.reprintCount ?? 0,
    success: true,
    reason: packLogReason({
      base: copiedToClipboard ? "command_generated_clipboard_copied" : "command_generated_clipboard_unavailable",
      identity: idCheck.normalized,
      tpl: template.version,
      job: "GENERATED",
      actor: req.actorName ?? req.actorId,
      reprint: req.isReprint ? req.reprintReason : undefined,
    }),
  });
  return {
    ok: true,
    jobId: jobRow.id,
    logId: logRow.id,
    command,
    copiedToClipboard,
    state: "GENERATED",
    template,
    identity: idCheck.normalized,
    verification,
  };
}

/** Reprint wrapper — preserves original identity; reason is mandatory. */
export async function executeGovernedReprint(
  req: GovernedPrintRequest & { reprintReason: string },
): Promise<GovernedPrintResult> {
  return executeGovernedPrint({ ...req, isReprint: true });
}

/** Batch governed print for multi-tray production runs (single clipboard block). */
export async function executeGovernedPrintBatch(
  items: GovernedPrintRequest[],
): Promise<{ results: GovernedPrintResult[]; copiedToClipboard: boolean }> {
  const results: GovernedPrintResult[] = [];
  const commands: string[] = [];

  for (const item of items) {
    const idCheck = validatePrintIdentity(item.surface, item.barcodeIdentity);
    if (idCheck.ok === false) { results.push(idCheck); continue; }
    const templateResult = await resolveTemplateForSurface(item.surface);
    if ("ok" in templateResult && templateResult.ok === false) { results.push(templateResult); continue; }
    const template = templateResult as ResolvedTemplate;
    const payload: LabelPayload = {
      ...item.payload,
      widthMm: template.widthMm,
      heightMm: template.heightMm,
      barcode: idCheck.normalized,
    };
    const verification = verifyPrintEquivalence(payload, idCheck.normalized, template);
    if (!verification.ok) {
      results.push({ ok: false, code: "payload_verification_failed", message: verification.message });
      continue;
    }
    const command = generateTSPL(payload);
    commands.push(command);
    const jobRow = await insertRow<{ id: string }>("ols_print_jobs", {
      template_id: template.id ?? null,
      command_lang: "TSPL",
      command_payload: command,
      status: "generated",
    });
    const logRow = await insertRow<{ id: string }>("ols_print_logs", {
      ref_type: item.surface,
      ref_id: item.refId,
      is_reprint: false,
      reprint_count: 0,
      success: true,
      reason: packLogReason({
        base: "command_generated_batch",
        identity: idCheck.normalized,
        tpl: template.version,
        job: "GENERATED",
        batch_job: jobRow.id,
        actor: item.actorName ?? item.actorId,
      }),
    });
    results.push({
      ok: true,
      jobId: jobRow.id,
      logId: logRow.id,
      command,
      copiedToClipboard: false,
      state: "GENERATED",
      template,
      identity: idCheck.normalized,
      verification,
    });
  }

  const copiedToClipboard = commands.length > 0 ? await copyToClipboardBestEffort(commands.join("\n\n")) : false;
  return { results, copiedToClipboard };
}

function deriveShelfLifeDays(mfgDate?: string | null, bestBefore?: string | null): string {
  if (!mfgDate || !bestBefore) return "—";
  const start = Date.parse(`${mfgDate}T00:00:00Z`);
  const end = Date.parse(`${bestBefore}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return "—";
  return String(Math.round((end - start) / 86_400_000));
}

/** Rebuild payload from persisted entity for reprint from PrintLogs / approval flow. */
export async function rebuildGovernedPrintRequest(
  refType: PrintSurface,
  refId: string,
): Promise<GovernedPrintRequest | GovernedPrintFailure> {
  switch (refType) {
    case "production_label": {
      const labels = await listTable<ProductionLabel>("ols_production_labels");
      const label = labels.find(l => l.id === refId);
      if (!label) return { ok: false, code: "entity_not_found", message: "Production label not found" };
      return {
        surface: "production_label",
        refId,
        barcodeIdentity: label.label_no,
        payload: buildProductionLabelPayload({
          productName: label.metadata?.product_name,
          sku: label.metadata?.sku,
          batchNo: label.metadata?.batch_no || label.batch_no || "—",
          mfgDate: label.mfg_date || "—",
          shelfLifeDays: deriveShelfLifeDays(label.mfg_date, label.best_before),
          netWeight: label.net_weight ?? "—",
          grossWeight: label.gross_weight ?? label.net_weight ?? "—",
          labelNo: label.label_no,
        }),
      };
    }
    case "carton": {
      const [cartons, allContents] = await Promise.all([
        listTable<Carton>("ols_cartons"),
        listTable<CartonContent>("ols_carton_contents"),
      ]);
      const carton = cartons.find(c => c.id === refId);
      if (!carton) return { ok: false, code: "entity_not_found", message: "Carton not found" };
      const display = resolveCartonBarcodeDisplay(carton.order_ref || "", carton.carton_no, carton.metadata);
      const itemCount = allContents.filter(content => content.carton_id === carton.id).length;
      return {
        surface: "carton",
        refId,
        barcodeIdentity: display.labelBarcode,
        payload: buildCartonLabelPayload({
          customerName: carton.customer_name,
          orderRef: carton.order_ref,
          cartonIndex: carton.carton_index,
          itemCount,
          netWeightKg: carton.net_weight ?? 0,
          barcode: display.labelBarcode,
        }),
      };
    }
    case "shipping": {
      const labels = await listTable<ShippingLabelRow>("ols_shipping_labels");
      const lbl = labels.find(l => l.id === refId);
      if (!lbl) return { ok: false, code: "entity_not_found", message: "Shipping label not found" };
      return {
        surface: "shipping",
        refId,
        barcodeIdentity: lbl.shipping_no,
        qrIdentity: lbl.qr_ref,
        payload: buildShippingLabelPayload({
          consignee: lbl.consignee,
          invoiceRef: lbl.invoice_ref,
          shippingNo: lbl.shipping_no,
          qrRef: lbl.qr_ref,
        }),
      };
    }
    default:
      return { ok: false, code: "template_unavailable", message: `Governed reprint not supported for ref_type ${refType}` };
  }
}

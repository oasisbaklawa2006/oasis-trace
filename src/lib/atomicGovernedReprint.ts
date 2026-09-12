import { invokeTraceMutation, listTable } from "@/lib/data";
import { supabaseConfigured } from "@/lib/supabase";
import { validateBarcodeIdentity, type BarcodeIdentityKind } from "@/lib/barcodeIdentity";
import { generateTSPL, generateZPL, type LabelPayload } from "@/lib/printerCommands";
import { copyToClipboardBestEffort } from "@/lib/labelPrintLog";
import type { PrinterRow } from "@/lib/types";
import {
  executeGovernedReprint,
  resolveTemplateForSurface,
  verifyPrintEquivalence,
  type GovernedPrintRequest,
  type GovernedPrintResult,
  type GovernedPrintFailure,
  type GovernedPrintRejectionCode,
  type ResolvedTemplate,
} from "@/lib/governedPrint";

interface AtomicReprintExecution {
  job_id: string;
  log_id: string;
  reprint_request_id: string;
  ref_type: string;
  ref_id: string;
  reprint_count: number;
  idempotency_replayed: boolean;
}

function rejectionCode(code: string): GovernedPrintRejectionCode {
  if (code === "empty") return "identity_empty";
  if (code === "preview_in_production") return "identity_preview";
  return "identity_malformed";
}

function validateIdentity(surface: GovernedPrintRequest["surface"], raw: string):
  | { ok: true; normalized: string }
  | GovernedPrintFailure {
  const expected: Partial<Record<GovernedPrintRequest["surface"], BarcodeIdentityKind[]>> = {
    production_label: ["production_label"],
    carton: ["central_carton", "legacy_carton"],
    shipping: ["shipping"],
  };
  const allowed = expected[surface];
  if (!allowed) {
    return { ok: false, code: "template_unavailable", message: `Governed reprint not supported for ${surface}` };
  }
  const result = validateBarcodeIdentity(raw);
  if (result.ok === false) {
    return { ok: false, code: rejectionCode(result.code), message: result.message };
  }
  if (!allowed.includes(result.kind)) {
    return { ok: false, code: "identity_mismatch", message: `Identity kind ${result.kind} is not valid for ${surface}` };
  }
  return { ok: true, normalized: result.normalized };
}

async function resolveLanguage(req: GovernedPrintRequest, template: ResolvedTemplate): Promise<"TSPL" | "ZPL" | GovernedPrintFailure> {
  if (req.commandLang === "TSPL" || req.commandLang === "ZPL") return req.commandLang;
  if (req.printerId) {
    const printers = await listTable<PrinterRow>("ols_printers");
    const printer = printers.find(row => row.id === req.printerId);
    if (!printer) {
      return { ok: false, code: "unsupported_transport", message: "Selected printer is not registered" };
    }
    if (printer.command_lang === "ZPL") return "ZPL";
    if (printer.command_lang === "BROWSER") {
      return { ok: false, code: "unsupported_transport", message: "Browser print is not valid for governed thermal reprints" };
    }
    return "TSPL";
  }
  if (template.commandLang === "ZPL") return "ZPL";
  if (template.commandLang === "BROWSER") {
    return { ok: false, code: "unsupported_transport", message: "Browser print is not valid for governed thermal reprints" };
  }
  return "TSPL";
}

function packReason(parts: Record<string, string | number | undefined>): string {
  return Object.entries(parts)
    .filter(([, value]) => value !== undefined && value !== "")
    .map(([key, value]) => `${key}=${value}`)
    .join("|");
}

/**
 * Live governed reprint execution uses Core's atomic durable claim. Demo mode
 * retains the legacy local path because it is explicitly non-authoritative.
 */
export async function executeAtomicGovernedReprint(
  req: GovernedPrintRequest & { reprintReason: string },
): Promise<GovernedPrintResult> {
  if (!supabaseConfigured) return executeGovernedReprint(req);
  if (!req.reprintRequestId?.trim()) {
    return { ok: false, code: "reprint_request_required", message: "Live reprint requires a persisted governed request id" };
  }
  if (!req.reprintReason?.trim()) {
    return { ok: false, code: "reprint_reason_required", message: "Reprint requires a documented reason" };
  }
  if (!Number.isInteger(req.reprintCount) || (req.reprintCount ?? 0) < 1) {
    return { ok: false, code: "reprint_request_required", message: "Live reprint requires the Core-allocated reprint count" };
  }

  const identity = validateIdentity(req.surface, req.barcodeIdentity);
  if (identity.ok === false) return identity;

  const templateResult = await resolveTemplateForSurface(req.surface);
  if ("ok" in templateResult && templateResult.ok === false) return templateResult;
  const template = templateResult as ResolvedTemplate;
  const language = await resolveLanguage(req, template);
  if (typeof language !== "string") return language;

  const payload: LabelPayload = {
    ...req.payload,
    widthMm: template.widthMm,
    heightMm: template.heightMm,
    barcode: identity.normalized,
    watermark: req.watermark ?? req.payload.watermark,
  };
  const verification = verifyPrintEquivalence(payload, identity.normalized, template, { qrIdentity: req.qrIdentity });
  if (!verification.ok) {
    return { ok: false, code: "payload_verification_failed", message: verification.message };
  }

  const command = language === "ZPL" ? generateZPL(payload) : generateTSPL(payload);
  const reason = packReason({
    base: "command_generated",
    identity: identity.normalized,
    tpl: template.version,
    request: req.reprintRequestId,
    actor: req.actorName ?? req.actorId,
    reprint: req.reprintReason,
  });

  const recorded = await invokeTraceMutation<AtomicReprintExecution>(
    "trace_record_reprint_command_v1",
    {
      p_reprint_request_id: req.reprintRequestId,
      p_ref_type: req.surface,
      p_ref_id: req.refId,
      p_template_id: template.id ?? null,
      p_printer_id: req.printerId ?? null,
      p_command_lang: language,
      p_command_payload: command,
      p_reprint_count: req.reprintCount,
      p_reason: reason,
    },
  );

  const canonicalSurface = req.surface === "shipping" ? "shipping_label" : req.surface;
  if (
    !recorded ||
    typeof recorded.job_id !== "string" || !recorded.job_id ||
    typeof recorded.log_id !== "string" || !recorded.log_id ||
    recorded.reprint_request_id !== req.reprintRequestId ||
    recorded.ref_type !== canonicalSurface ||
    recorded.ref_id !== req.refId ||
    recorded.reprint_count !== req.reprintCount ||
    typeof recorded.idempotency_replayed !== "boolean"
  ) {
    throw new Error("Core returned an invalid atomic governed reprint execution response");
  }

  // Only the caller that won the durable Core claim is allowed to expose the
  // generated command to a physical transport/clipboard path. Replays are inert.
  const copiedToClipboard = recorded.idempotency_replayed
    ? false
    : await copyToClipboardBestEffort(command);

  return {
    ok: true,
    jobId: recorded.job_id,
    logId: recorded.log_id,
    command: recorded.idempotency_replayed ? "" : command,
    copiedToClipboard,
    state: "GENERATED",
    template,
    identity: identity.normalized,
    verification,
  };
}

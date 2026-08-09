// Truthful print-lifecycle logging.
//
// This app can prove a TSPL command was GENERATED and, best-effort, copied
// to the clipboard. It cannot prove a physical printer received (SENT) or
// printed (CONFIRMED_PRINTED) it — no local/network/USB print transport
// exists in this repository yet (see the Trace Phase 0.5 deep-verification
// audit). Until a real print bridge exists, `ols_print_logs` must not be
// written or presented to the user as evidence of physical printing.
//
// `ols_print_logs` has no dedicated lifecycle column (GENERATED / SENT /
// CONFIRMED_PRINTED) and this pass is not authorized to add one via
// migration, so the truthful outcome is recorded in the existing `reason`
// text column instead. `success` continues to mean "this log write itself
// succeeded" — it has never meant, and must not be read as, "the label
// physically printed."
import { insertRow } from "@/lib/data";
import { generateTSPL, type LabelPayload } from "@/lib/printerCommands";
import type { PrintLogRow } from "@/lib/types";

export interface GeneratedLabelResult {
  command: string;
  copiedToClipboard: boolean;
}

/** Generates a TSPL command for a label and best-effort copies it to the clipboard. */
export async function generateLabelCommand(payload: LabelPayload): Promise<GeneratedLabelResult> {
  const command = generateTSPL(payload);
  let copiedToClipboard = false;
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      await navigator.clipboard.writeText(command);
      copiedToClipboard = true;
    }
  } catch {
    // Clipboard unavailable — not fatal, the command was still generated.
  }
  return { command, copiedToClipboard };
}

/**
 * Records that a label command was GENERATED (and, best-effort, copied to
 * the clipboard) for the given entity. Never call this to mean the label
 * physically printed — see the file header.
 */
export async function recordLabelGenerated(opts: {
  refType: string;
  refId: string;
  copiedToClipboard: boolean;
  isReprint?: boolean;
  reprintCount?: number;
}): Promise<void> {
  await insertRow<PrintLogRow>("ols_print_logs", {
    ref_type: opts.refType,
    ref_id: opts.refId,
    success: true,
    is_reprint: opts.isReprint ?? false,
    reprint_count: opts.reprintCount ?? 0,
    reason: opts.copiedToClipboard ? "command_generated_clipboard_copied" : "command_generated_clipboard_unavailable",
  });
}

/** User-facing note clarifying what "generated" does and does not mean. */
export const NO_PHYSICAL_PRINT_NOTE =
  "Label command generated (TSPL) — no printer transport is connected yet, so this has not physically printed.";

/**
 * PR #38 findings B and C (CodeRabbit Major):
 *
 * B. resolveLanguage() used to honor a caller-supplied commandLang before
 *    resolving/validating printerId, so an unknown printer could be bypassed
 *    by also supplying commandLang. printerId must now be resolved first;
 *    an unknown printer always fails, and a supplied commandLang must agree
 *    with the registered printer's language.
 *
 * C. verifyPrintEquivalence() only checks QR equivalence when qrIdentity is
 *    supplied, so a shipping reprint without one could pass. Shipping
 *    reprints must now fail closed before verification/execution when
 *    qrIdentity is missing or blank.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LabelPayload } from "@/lib/printerCommands";
import type { GovernedPrintRequest } from "@/lib/governedPrint";

const templates: Array<Record<string, unknown>> = [];
const printers = [
  { id: "printer-tspl", name: "TSC", command_lang: "TSPL" },
  { id: "printer-zpl", name: "Zebra", command_lang: "ZPL" },
  { id: "printer-browser", name: "Browser Bridge", command_lang: "BROWSER" },
];

const { invokeTraceMutation } = vi.hoisted(() => ({ invokeTraceMutation: vi.fn() }));

vi.mock("@/lib/data", () => ({
  listTable: vi.fn(async (table: string) => {
    if (table === "ols_label_templates") return templates;
    if (table === "ols_printers") return printers;
    return [];
  }),
  invokeTraceMutation: (...args: unknown[]) => invokeTraceMutation(...args),
}));

vi.mock("@/lib/supabase", () => ({ supabaseConfigured: true }));

vi.mock("@/lib/labelPrintLog", () => ({
  copyToClipboardBestEffort: vi.fn(async () => true),
}));

import { executeAtomicGovernedReprint } from "./atomicGovernedReprint";

function shippingPayload(): LabelPayload {
  return {
    widthMm: 100,
    heightMm: 150,
    lines: ["From Oasis Baklawa LLC"],
    barcode: "SHP-20260906-0001",
    qr: "QR-202609060001",
  };
}

function baseReq(overrides: Partial<GovernedPrintRequest> = {}): GovernedPrintRequest & { reprintReason: string } {
  return {
    surface: "shipping",
    refId: "ship-1",
    barcodeIdentity: "SHP-20260906-0001",
    qrIdentity: "QR-202609060001",
    payload: shippingPayload(),
    reprintRequestId: "req-1",
    reprintReason: "Damaged label",
    reprintCount: 1,
    ...overrides,
  };
}

beforeEach(() => {
  invokeTraceMutation.mockReset();
  invokeTraceMutation.mockResolvedValue({
    job_id: "job-1",
    log_id: "log-1",
    reprint_request_id: "req-1",
    ref_type: "shipping_label",
    ref_id: "ship-1",
    reprint_count: 1,
    idempotency_replayed: false,
  });
  Object.assign(navigator, { clipboard: { writeText: vi.fn(async () => {}) } });
});

describe("executeAtomicGovernedReprint — printer resolved before commandLang (finding B)", () => {
  it("uses the registered printer's language for a valid known printer", async () => {
    const result = await executeAtomicGovernedReprint(baseReq({ printerId: "printer-zpl" }));
    expect(result.ok).toBe(true);
    expect(invokeTraceMutation).toHaveBeenCalledWith(
      "trace_record_reprint_command_v1",
      expect.objectContaining({ p_command_lang: "ZPL", p_printer_id: "printer-zpl" }),
    );
  });

  it("rejects an unknown printerId even when a valid commandLang is also supplied", async () => {
    const result = await executeAtomicGovernedReprint(
      baseReq({ printerId: "printer-does-not-exist", commandLang: "TSPL" }),
    );
    expect(result.ok).toBe(false);
    if (result.ok === false) expect(result.code).toBe("unsupported_transport");
    expect(invokeTraceMutation).not.toHaveBeenCalled();
  });

  it("honors a supplied commandLang that matches the registered printer's language", async () => {
    const result = await executeAtomicGovernedReprint(
      baseReq({ printerId: "printer-tspl", commandLang: "TSPL" }),
    );
    expect(result.ok).toBe(true);
    expect(invokeTraceMutation).toHaveBeenCalledWith(
      "trace_record_reprint_command_v1",
      expect.objectContaining({ p_command_lang: "TSPL" }),
    );
  });

  it("rejects a supplied commandLang that mismatches the registered printer's language", async () => {
    const result = await executeAtomicGovernedReprint(
      baseReq({ printerId: "printer-zpl", commandLang: "TSPL" }),
    );
    expect(result.ok).toBe(false);
    if (result.ok === false) expect(result.code).toBe("unsupported_transport");
    expect(invokeTraceMutation).not.toHaveBeenCalled();
  });
});

describe("executeAtomicGovernedReprint — shipping reprint requires QR identity (finding C)", () => {
  it("fails closed when qrIdentity is missing, before any command generation or Core mutation", async () => {
    const result = await executeAtomicGovernedReprint(baseReq({ qrIdentity: undefined }));
    expect(result.ok).toBe(false);
    if (result.ok === false) expect(result.code).toBe("payload_verification_failed");
    expect(invokeTraceMutation).not.toHaveBeenCalled();
  });

  it("fails closed when qrIdentity is blank", async () => {
    const result = await executeAtomicGovernedReprint(baseReq({ qrIdentity: "   " }));
    expect(result.ok).toBe(false);
    if (result.ok === false) expect(result.code).toBe("payload_verification_failed");
    expect(invokeTraceMutation).not.toHaveBeenCalled();
  });

  it("succeeds when qrIdentity is present and matches the derived QR for the shipping identity", async () => {
    const result = await executeAtomicGovernedReprint(baseReq());
    expect(result.ok).toBe(true);
  });

  it("fails verification when qrIdentity is present but does not match the derived QR", async () => {
    const result = await executeAtomicGovernedReprint(baseReq({ qrIdentity: "QR-000000000000" }));
    expect(result.ok).toBe(false);
    if (result.ok === false) expect(result.code).toBe("payload_verification_failed");
    expect(invokeTraceMutation).not.toHaveBeenCalled();
  });
});

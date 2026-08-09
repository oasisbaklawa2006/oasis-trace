// Verifies the print lifecycle invariant: this app can prove a label
// command was GENERATED (and, best-effort, copied to the clipboard) but
// must never claim or record physical print success — see the header
// comment in labelPrintLog.ts and the Trace Phase 0.5 audit finding this
// fixes.
import { describe, it, expect, vi, beforeEach } from "vitest";

const inserted: Array<{ table: string; row: Record<string, unknown> }> = [];

vi.mock("@/lib/data", () => ({
  insertRow: vi.fn(async (table: string, row: Record<string, unknown>) => {
    inserted.push({ table, row });
    return { id: "row-1", ...row };
  }),
}));

import { generateLabelCommand, generateLabelCommandBatch, recordLabelGenerated, NO_PHYSICAL_PRINT_NOTE } from "./labelPrintLog";

describe("generateLabelCommand", () => {
  beforeEach(() => {
    inserted.length = 0;
    vi.restoreAllMocks();
  });

  it("generates a real TSPL command containing the barcode value", async () => {
    const { command } = await generateLabelCommand({
      widthMm: 75, heightMm: 50, title: "Test Label", lines: ["line 1"], barcode: "PL-TEST-0001",
    });
    expect(command).toContain("SIZE 75 mm,50 mm");
    expect(command).toContain("PL-TEST-0001");
  });

  it("reports clipboard success when navigator.clipboard.writeText resolves", async () => {
    const writeText = vi.fn(async () => {});
    Object.assign(navigator, { clipboard: { writeText } });
    const result = await generateLabelCommand({ widthMm: 75, heightMm: 50, lines: [], barcode: "X" });
    expect(result.copiedToClipboard).toBe(true);
    expect(writeText).toHaveBeenCalledWith(result.command);
  });

  it("reports clipboard failure (not a thrown error) when the clipboard API rejects", async () => {
    const writeText = vi.fn(async () => { throw new Error("denied"); });
    Object.assign(navigator, { clipboard: { writeText } });
    const result = await generateLabelCommand({ widthMm: 75, heightMm: 50, lines: [], barcode: "X" });
    expect(result.copiedToClipboard).toBe(false);
    // A command was still generated even though clipboard copy failed.
    expect(result.command.length).toBeGreaterThan(0);
  });
});

describe("generateLabelCommandBatch", () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it("generates one command per payload and copies all of them in a single clipboard write", async () => {
    const writeText = vi.fn(async (_text: string) => {});
    Object.assign(navigator, { clipboard: { writeText } });
    const result = await generateLabelCommandBatch([
      { widthMm: 75, heightMm: 50, lines: [], barcode: "PL-1" },
      { widthMm: 75, heightMm: 50, lines: [], barcode: "PL-2" },
    ]);
    expect(result.commands).toHaveLength(2);
    expect(result.commands[0]).toContain("PL-1");
    expect(result.commands[1]).toContain("PL-2");
    expect(result.copiedToClipboard).toBe(true);
    // A single clipboard write carrying every command, not one write per label.
    expect(writeText).toHaveBeenCalledTimes(1);
    const written = writeText.mock.calls[0][0];
    expect(written).toContain("PL-1");
    expect(written).toContain("PL-2");
  });

  it("reports clipboard failure without throwing when the clipboard API rejects", async () => {
    const writeText = vi.fn(async () => { throw new Error("denied"); });
    Object.assign(navigator, { clipboard: { writeText } });
    const result = await generateLabelCommandBatch([{ widthMm: 75, heightMm: 50, lines: [], barcode: "PL-1" }]);
    expect(result.copiedToClipboard).toBe(false);
    expect(result.commands).toHaveLength(1);
  });
});

describe("recordLabelGenerated — must never assert physical print success", () => {
  beforeEach(() => { inserted.length = 0; });

  it("writes success:true (log write succeeded) but a truthful, non-'printed' reason when clipboard copy worked", async () => {
    await recordLabelGenerated({ refType: "production_label", refId: "label-1", copiedToClipboard: true });
    expect(inserted).toHaveLength(1);
    const [{ table, row }] = inserted;
    expect(table).toBe("ols_print_logs");
    expect(row.success).toBe(true);
    expect(row.reason).toBe("command_generated_clipboard_copied");
    expect(String(row.reason)).not.toMatch(/printed/i);
  });

  it("records clipboard-unavailable outcome truthfully when copy failed", async () => {
    await recordLabelGenerated({ refType: "carton", refId: "carton-1", copiedToClipboard: false });
    const [{ row }] = inserted;
    expect(row.reason).toBe("command_generated_clipboard_unavailable");
    expect(String(row.reason)).not.toMatch(/printed/i);
  });

  it("defaults is_reprint/reprint_count so reprint-path callers aren't silently miscounted", async () => {
    await recordLabelGenerated({ refType: "shipping", refId: "ship-1", copiedToClipboard: true });
    const [{ row }] = inserted;
    expect(row.is_reprint).toBe(false);
    expect(row.reprint_count).toBe(0);
  });
});

describe("NO_PHYSICAL_PRINT_NOTE", () => {
  it("is user-facing copy that does not claim physical printing", () => {
    expect(NO_PHYSICAL_PRINT_NOTE.toLowerCase()).toContain("not physically printed");
  });
});

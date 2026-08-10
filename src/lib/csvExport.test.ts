import { describe, it, expect } from "vitest";
import { toCSV } from "./csvExport";

describe("toCSV", () => {
  it("preserves negative numeric values instead of forcing them to text", () => {
    const csv = toCSV({
      title: "t",
      columns: [{ key: "qty", header: "Qty" }],
      rows: [{ qty: -42 }],
    });
    expect(csv).toBe("Qty\n-42");
  });

  it("still guards formula-triggering leading characters on string values", () => {
    const csv = toCSV({
      title: "t",
      columns: [{ key: "note", header: "Note" }],
      rows: [{ note: "=SUM(A1:A9)" }],
    });
    expect(csv).toBe("Note\n'=SUM(A1:A9)");
  });
});

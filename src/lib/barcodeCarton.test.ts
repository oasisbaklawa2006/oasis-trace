import { describe, it, expect } from "vitest";
import { buildCartonMetadata, resolveCartonBarcodeDisplay } from "./barcodeCarton";

describe("barcodeCarton", () => {
  it("resolves central barcode for SO orders", () => {
    const d = resolveCartonBarcodeDisplay("SO-2026-0001", "CTN-20260602-0001", {
      barcode_mode: "central",
      central_barcode: "CTN-SO-2026-0001",
      legacy_carton_no: "CTN-20260602-0001",
    });
    expect(d.mode).toBe("central");
    expect(d.centralBarcode).toBe("CTN-SO-2026-0001");
    expect(d.labelBarcode).toBe("CTN-SO-2026-0001");
  });

  it("builds metadata with central and legacy fields", () => {
    const m = buildCartonMetadata("SO-2026-0001", "CTN-20260602-0099");
    expect(m.barcode_mode).toBe("central");
    expect(m.central_barcode).toBe("CTN-SO-2026-0001");
    expect(m.legacy_carton_no).toBe("CTN-20260602-0099");
  });
});

// Safety-critical: this is the only file in the repo that turns label data
// into the bytes an actual thermal printer will receive. A regression here
// silently corrupts every physical label — wrong size, unreadable barcode,
// wrong offset — with no other test layer to catch it.
import { describe, it, expect } from "vitest";
import { generateTSPL, generateZPL, testPrintPayload, type LabelPayload } from "./printerCommands";
import { mmToDots, dotsToMm, code128ModuleMm, wouldOverflow } from "./labelGeometry";

const basePayload: LabelPayload = {
  widthMm: 75, heightMm: 50,
  title: "Cashew Pyramid Baklawa",
  lines: ["SKU CPB-5000  Batch BAT-20260511-001", "Net 5.00 kg  Gross 5.25 kg"],
  barcode: "PL-20260511-9303",
};

describe("generateTSPL — dimensions and structure", () => {
  it("emits SIZE in mm matching the payload, GAP by default, and one PRINT command", () => {
    const cmd = generateTSPL(basePayload);
    expect(cmd).toContain("SIZE 75 mm,50 mm");
    expect(cmd).toContain("GAP 3 mm,0 mm");
    expect(cmd).toMatch(/PRINT 1,1$/);
  });

  it("emits the setup commands in TSPL's required order, with CLS before any field command", () => {
    const lines = generateTSPL({ ...basePayload, profile: { darkness: 8, speed: 4 } }).split("\n");
    const at = (prefix: string) => lines.findIndex(l => l.startsWith(prefix));
    expect(at("SIZE")).toBe(0);
    expect(at("GAP")).toBeGreaterThan(at("SIZE"));
    expect(at("DENSITY")).toBeGreaterThan(at("GAP"));
    expect(at("SPEED")).toBeGreaterThan(at("DENSITY"));
    expect(at("DIRECTION")).toBeGreaterThan(at("SPEED"));
    expect(at("CLS")).toBeGreaterThan(at("DIRECTION"));
    expect(at("CLS")).toBeLessThan(at("TEXT"));
    expect(at("CLS")).toBeLessThan(at("BARCODE"));
  });

  it("uses BLINE instead of GAP when a black-mark offset is configured", () => {
    const cmd = generateTSPL({ ...basePayload, profile: { blackMarkMm: 2 } });
    expect(cmd).toContain("BLINE 2 mm,0 mm");
    expect(cmd).not.toContain("GAP");
  });

  it("clamps DENSITY/SPEED into the documented TSPL ranges (0-15 / 1-10)", () => {
    const cmd = generateTSPL({ ...basePayload, profile: { darkness: 99, speed: -5 } });
    expect(cmd).toContain("DENSITY 15");
    expect(cmd).toContain("SPEED 1");
  });

  it("respects the copies count", () => {
    const cmd = generateTSPL({ ...basePayload, copies: 3 });
    expect(cmd).toContain("PRINT 3,1");
  });

  it("includes a BARCODE command carrying the exact barcode value", () => {
    const cmd = generateTSPL(basePayload);
    expect(cmd).toContain('"128"');
    expect(cmd).toContain(`"${basePayload.barcode}"`);
  });

  it("includes a QRCODE command carrying the exact QR value when qr is set", () => {
    const cmd = generateTSPL({ ...basePayload, qr: "QR-ABC123" });
    expect(cmd).toContain("QRCODE");
    expect(cmd).toContain('"QR-ABC123"');
  });

  it("omits QRCODE entirely when no qr is set", () => {
    const cmd = generateTSPL(basePayload);
    expect(cmd).not.toContain("QRCODE");
  });

  it("switches to error-correction L and a smaller cell for long QR payloads (>180 chars)", () => {
    const longQr = "Q".repeat(200);
    const cmd = generateTSPL({ ...basePayload, qr: longQr });
    expect(cmd).toMatch(/QRCODE .*,L,4,/);
  });

  it("uses error-correction M and a larger cell for short QR payloads", () => {
    const cmd = generateTSPL({ ...basePayload, qr: "short" });
    expect(cmd).toMatch(/QRCODE .*,M,5,/);
  });

  it("emits a watermark TEXT command only when watermark is set", () => {
    const withWatermark = generateTSPL({ ...basePayload, watermark: "DUPLICATE COPY" });
    const without = generateTSPL(basePayload);
    expect(withWatermark).toContain("DUPLICATE COPY");
    expect(without).not.toContain("DUPLICATE COPY");
  });

  it("escapes embedded double quotes so the TSPL string literal stays well-formed", () => {
    const cmd = generateTSPL({ ...basePayload, title: 'Say "hi"' });
    expect(cmd).not.toMatch(/"Say "hi""/); // would break the TSPL string
    expect(cmd).toContain("Say 'hi'");
  });

  it("sets DIRECTION 0 for 180° rotation and 1 otherwise (TSPL's inverted-print convention)", () => {
    expect(generateTSPL({ ...basePayload, rotation: 180 })).toContain("DIRECTION 0");
    expect(generateTSPL({ ...basePayload, rotation: 0 })).toContain("DIRECTION 1");
    expect(generateTSPL({ ...basePayload, rotation: 90 })).toContain("DIRECTION 1");
  });
});

describe("generateTSPL — calibration offsets actually move content", () => {
  it("shifts the first TEXT command's X coordinate by xOffsetMm converted to dots", () => {
    const noOffset = generateTSPL(basePayload);
    const withOffset = generateTSPL({ ...basePayload, profile: { xOffsetMm: 5, dpi: 203 } });
    const firstX = (cmd: string) => Number(cmd.match(/TEXT (\d+),/)?.[1]);
    const expectedDelta = mmToDots(5, 203);
    expect(firstX(withOffset) - firstX(noOffset)).toBe(expectedDelta);
  });

  it("shifts the first TEXT command's Y coordinate by thermalOffsetMm converted to dots", () => {
    const noOffset = generateTSPL(basePayload);
    const withOffset = generateTSPL({ ...basePayload, profile: { thermalOffsetMm: 3, dpi: 203 } });
    const firstY = (cmd: string) => Number(cmd.match(/TEXT \d+,(\d+),/)?.[1]);
    expect(firstY(withOffset) - firstY(noOffset)).toBe(mmToDots(3, 203));
  });
});

describe("generateZPL — dimensions and structure", () => {
  it("wraps output in ^XA / ^XZ and sets ^PW/^LL from mm converted to dots at 203 dpi", () => {
    const cmd = generateZPL(basePayload);
    expect(cmd.startsWith("^XA")).toBe(true);
    expect(cmd.trim().endsWith("^XZ")).toBe(true);
    expect(cmd).toContain(`^PW${mmToDots(75, 203)}`);
    expect(cmd).toContain(`^LL${mmToDots(50, 203)}`);
  });

  it("respects an explicit 300 dpi profile in the dot conversion", () => {
    const cmd = generateZPL({ ...basePayload, profile: { dpi: 300 } });
    expect(cmd).toContain(`^PW${mmToDots(75, 300)}`);
  });

  it("includes a Code128 barcode field (^BCN) carrying the exact barcode value", () => {
    const cmd = generateZPL(basePayload);
    expect(cmd).toContain("^BCN");
    expect(cmd).toContain(`^FD${basePayload.barcode}^FS`);
  });

  it("includes a QR field (^BQN) carrying the exact QR value when qr is set", () => {
    const cmd = generateZPL({ ...basePayload, qr: "QR-XYZ" });
    expect(cmd).toContain("^BQN");
    expect(cmd).toContain("QR-XYZ");
  });

  it("respects the print-quantity command ^PQ", () => {
    expect(generateZPL({ ...basePayload, copies: 5 })).toContain("^PQ5");
    expect(generateZPL(basePayload)).toContain("^PQ1");
  });

  it("maps rotation to the correct ^FW orientation code", () => {
    expect(generateZPL({ ...basePayload, rotation: 0 })).toContain("^A0N");
    expect(generateZPL({ ...basePayload, rotation: 90 })).toContain("^A0R");
    expect(generateZPL({ ...basePayload, rotation: 180 })).toContain("^A0I");
    expect(generateZPL({ ...basePayload, rotation: 270 })).toContain("^A0B");
  });

  it("strips ZPL control characters (^ and ~) from escaped text so field data can't break out", () => {
    const cmd = generateZPL({ ...basePayload, title: "Bad^Field~Data" });
    expect(cmd).toContain("BadFieldData");
  });

  it("switches black-mark mode (^MNM) vs gap mode (^MNY) based on profile", () => {
    expect(generateZPL(basePayload)).toContain("^MNY");
    expect(generateZPL({ ...basePayload, profile: { blackMarkMm: 2 } })).toContain("^MNM");
  });
});

describe("testPrintPayload", () => {
  it("builds a small, self-identifying calibration label carrying the given profile", () => {
    const payload = testPrintPayload({ dpi: 300 });
    expect(payload.title).toContain("OASIS LABEL STUDIO");
    expect(payload.lines.join(" ")).toContain("DPI 300");
    expect(payload.profile?.dpi).toBe(300);
  });

  it("defaults to 203 dpi when no profile is given", () => {
    const payload = testPrintPayload();
    expect(payload.lines.join(" ")).toContain("DPI 203");
  });

  it("produces valid, non-empty TSPL and ZPL for the calibration label", () => {
    const payload = testPrintPayload();
    expect(generateTSPL(payload)).toContain("SIZE 75 mm,50 mm");
    expect(generateZPL(payload).startsWith("^XA")).toBe(true);
  });
});

describe("barcode fit / overflow guard integration (labelGeometry <-> printerCommands)", () => {
  it("a barcode value that wouldOverflow() flags on a narrow label still produces a command, not a crash", () => {
    const longValue = "X".repeat(60); // clearly too long for a 30mm-wide label
    expect(wouldOverflow(longValue.length, 30 - 6)).toBe(true);
    const cmd = generateTSPL({ widthMm: 30, heightMm: 20, lines: [], barcode: longValue });
    expect(cmd).toContain("BARCODE");
  });

  it("module width computed for the command matches code128ModuleMm's own guarantee (never below the printable floor)", () => {
    const moduleMm = code128ModuleMm(basePayload.barcode!.length, basePayload.widthMm - 6);
    const cmd = generateTSPL(basePayload);
    const dots = Number(cmd.match(/"128",60,1,\d+,(\d+),/)?.[1]);
    expect(dots).toBe(Math.max(1, Math.round(mmToDots(moduleMm, 203))));
  });
});

describe("labelGeometry round-trip sanity (dependency of printerCommands)", () => {
  it("mmToDots / dotsToMm are approximate inverses at 203 dpi", () => {
    const mm = 12.5;
    expect(dotsToMm(mmToDots(mm, 203), 203)).toBeCloseTo(mm, 1);
  });
});

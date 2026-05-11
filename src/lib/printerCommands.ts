// TSPL (TSC) and ZPL (Zebra) command generators — covers production / carton /
// shipping / DPL header. Best-effort, suitable for preview, copy/paste and a
// future local print bridge.
import { code128ModuleMm, mmToDots, type Dpi } from "./labelGeometry";

export type Rotation = 0 | 90 | 180 | 270;

export interface PrinterProfile {
  dpi?: Dpi;
  darkness?: number;          // 0–15
  speed?: number;             // 1–10 (in/s on TSC)
  gapMm?: number;             // label gap
  blackMarkMm?: number;       // black mark offset
  thermalOffsetMm?: number;   // vertical thermal compensation
  xOffsetMm?: number;         // horizontal calibration offset
}

export interface LabelPayload {
  widthMm: number;
  heightMm: number;
  title?: string;
  lines: string[];
  barcode?: string;
  qr?: string;
  copies?: number;
  rotation?: Rotation;
  watermark?: string;     // e.g. "DUPLICATE COPY"
  profile?: PrinterProfile;
}

const escTSPL = (s: string) => s.replace(/"/g, "'");
const escZPL = (s: string) => s.replace(/\^/g, "").replace(/~/g, "");

/** Auto-shrink a font step based on character count vs available mm width. */
function autoFont(text: string, availableMm: number, baseStep: number): number {
  // ~1.6 mm per char at TSPL font 3, ~1.2 mm at ZPL 38pt — use a generic factor
  const per = 1.5;
  const need = text.length * per;
  if (need <= availableMm) return baseStep;
  const ratio = availableMm / need;
  return Math.max(1, Math.round(baseStep * ratio));
}

export function generateTSPL(p: LabelPayload): string {
  const w = p.widthMm, h = p.heightMm;
  const gap = p.profile?.gapMm ?? 3;
  const bm = p.profile?.blackMarkMm;
  const dark = p.profile?.darkness;
  const speed = p.profile?.speed;
  const yOff = mmToDots(p.profile?.thermalOffsetMm ?? 0, p.profile?.dpi);
  const xOff = mmToDots(p.profile?.xOffsetMm ?? 0, p.profile?.dpi);
  const rot = (p.rotation ?? 0) === 0 ? 0 : p.rotation === 90 ? 90 : p.rotation === 180 ? 180 : 270;
  const dir = rot === 180 ? 0 : 1;
  const lines: string[] = [];
  lines.push(`SIZE ${w} mm,${h} mm`);
  if (bm) lines.push(`BLINE ${bm} mm,0 mm`); else lines.push(`GAP ${gap} mm,0 mm`);
  if (dark != null) lines.push(`DENSITY ${Math.max(0, Math.min(15, dark))}`);
  if (speed != null) lines.push(`SPEED ${Math.max(1, Math.min(10, speed))}`);
  lines.push(`DIRECTION ${dir}`); lines.push(`CLS`);
  let y = 12 + yOff;
  if (p.title) {
    const f = autoFont(p.title, w - 6, 3);
    lines.push(`TEXT ${12 + xOff},${y},"${f}",${rot},1,1,"${escTSPL(p.title)}"`); y += 32;
  }
  for (const ln of p.lines) {
    const f = autoFont(ln, w - 6, 2);
    lines.push(`TEXT ${12 + xOff},${y},"${f}",${rot},1,1,"${escTSPL(ln)}"`); y += 26;
  }
  if (p.barcode) {
    const moduleMm = code128ModuleMm(p.barcode.length, w - 6);
    const moduleDots = Math.max(1, Math.round(mmToDots(moduleMm, p.profile?.dpi)));
    lines.push(`BARCODE ${12 + xOff},${y},"128",60,1,${rot},${moduleDots},${moduleDots * 2},"${escTSPL(p.barcode)}"`);
  }
  if (p.qr) {
    const ec = p.qr.length > 180 ? "L" : "M";
    const cell = p.qr.length > 180 ? 4 : 5;
    lines.push(`QRCODE ${mmToDots(w, p.profile?.dpi) - 130 + xOff},${12 + yOff},${ec},${cell},A,${rot},"${escTSPL(p.qr)}"`);
  }
  if (p.watermark) lines.push(`TEXT ${mmToDots(w, p.profile?.dpi) / 4 + xOff},${mmToDots(h, p.profile?.dpi) / 2 + yOff},"4",${rot},1,1,"${escTSPL(p.watermark)}"`);
  lines.push(`PRINT ${p.copies ?? 1},1`);
  return lines.join("\n");
}

export function generateZPL(p: LabelPayload): string {
  const dpi = p.profile?.dpi;
  const w = mmToDots(p.widthMm, dpi), h = mmToDots(p.heightMm, dpi);
  const dark = p.profile?.darkness;
  const speed = p.profile?.speed;
  const yOff = mmToDots(p.profile?.thermalOffsetMm ?? 0, dpi);
  const xOff = mmToDots(p.profile?.xOffsetMm ?? 0, dpi);
  const rot = (p.rotation ?? 0);
  const fwo = rot === 0 ? "N" : rot === 90 ? "R" : rot === 180 ? "I" : "B";
  const out: string[] = [];
  out.push("^XA");
  out.push(`^PW${w}`); out.push(`^LL${h}`);
  if (dark != null) out.push(`~SD${String(Math.max(0, Math.min(30, dark * 2))).padStart(2, "0")}`);
  if (speed != null) out.push(`^PR${Math.max(1, Math.min(14, speed))}`);
  if (p.profile?.blackMarkMm) out.push(`^MNM`); else out.push(`^MNY`);
  out.push(`^FWN`);
  let y = 24 + yOff;
  if (p.title) {
    const sz = autoFont(p.title, p.widthMm - 6, 38);
    out.push(`^FO${24 + xOff},${y}^A0${fwo},${sz},${sz}^FD${escZPL(p.title)}^FS`); y += 52;
  }
  for (const ln of p.lines) {
    const sz = autoFont(ln, p.widthMm - 6, 28);
    out.push(`^FO${24 + xOff},${y}^A0${fwo},${sz},${sz}^FD${escZPL(ln)}^FS`); y += 36;
  }
  if (p.barcode) {
    const moduleMm = code128ModuleMm(p.barcode.length, p.widthMm - 6);
    const moduleDots = Math.max(1, Math.round(mmToDots(moduleMm, dpi)));
    out.push(`^BY${moduleDots}`);
    out.push(`^FO${24 + xOff},${y}^BCN,80,Y,N,N^FD${escZPL(p.barcode)}^FS`);
  }
  if (p.qr) {
    const ec = p.qr.length > 180 ? "L" : "M";
    const cell = p.qr.length > 180 ? 4 : 6;
    out.push(`^FO${w - 200 + xOff},${24 + yOff}^BQN,2,${cell}^FD${ec}A,${escZPL(p.qr)}^FS`);
  }
  if (p.watermark) out.push(`^FO${w / 4 + xOff},${h / 2 + yOff}^A0${fwo},60,60^FD${escZPL(p.watermark)}^FS`);
  out.push(`^PQ${p.copies ?? 1}`);
  out.push("^XZ");
  return out.join("\n");
}

/** Pre-built test print payload for printer calibration. */
export function testPrintPayload(profile?: PrinterProfile): LabelPayload {
  return {
    widthMm: 75, heightMm: 50,
    title: "OASIS LABEL STUDIO",
    lines: ["TEST PRINT", `DPI ${profile?.dpi ?? 203}`, new Date().toLocaleString()],
    barcode: "TEST-CALIBRATION",
    qr: "TEST-QR",
    copies: 1,
    profile,
  };
}

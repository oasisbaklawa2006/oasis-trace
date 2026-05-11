// TSPL (TSC) and ZPL (Zebra) command generators — covers production / carton /
// shipping / DPL header. Best-effort, suitable for preview, copy/paste and a
// future local print bridge.
import { mmToDots, type Dpi } from "./labelGeometry";

export type Rotation = 0 | 90 | 180 | 270;

export interface PrinterProfile {
  dpi?: Dpi;
  darkness?: number;     // 0–15
  speed?: number;        // 1–10 (in/s on TSC)
  gapMm?: number;        // label gap
  blackMarkMm?: number;  // black mark offset
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
  watermark?: string;     // e.g. "DUPLICATE"
  profile?: PrinterProfile;
}

const escTSPL = (s: string) => s.replace(/"/g, "'");
const escZPL = (s: string) => s.replace(/\^/g, "").replace(/~/g, "");

export function generateTSPL(p: LabelPayload): string {
  const w = p.widthMm, h = p.heightMm;
  const gap = p.profile?.gapMm ?? 3;
  const bm = p.profile?.blackMarkMm;
  const dark = p.profile?.darkness;
  const speed = p.profile?.speed;
  const rot = (p.rotation ?? 0) === 0 ? 0 : p.rotation === 90 ? 90 : p.rotation === 180 ? 180 : 270;
  const dir = rot === 180 ? 0 : 1;
  const lines: string[] = [];
  lines.push(`SIZE ${w} mm,${h} mm`);
  if (bm) lines.push(`BLINE ${bm} mm,0 mm`); else lines.push(`GAP ${gap} mm,0 mm`);
  if (dark != null) lines.push(`DENSITY ${Math.max(0, Math.min(15, dark))}`);
  if (speed != null) lines.push(`SPEED ${Math.max(1, Math.min(10, speed))}`);
  lines.push(`DIRECTION ${dir}`); lines.push(`CLS`);
  let y = 12;
  if (p.title) { lines.push(`TEXT 12,${y},"3",${rot},1,1,"${escTSPL(p.title)}"`); y += 32; }
  for (const ln of p.lines) { lines.push(`TEXT 12,${y},"2",${rot},1,1,"${escTSPL(ln)}"`); y += 26; }
  if (p.barcode) lines.push(`BARCODE 12,${y},"128",60,1,${rot},2,2,"${escTSPL(p.barcode)}"`);
  if (p.qr) lines.push(`QRCODE ${mmToDots(w) - 130},12,L,5,A,${rot},"${escTSPL(p.qr)}"`);
  if (p.watermark) lines.push(`TEXT ${mmToDots(w) / 4},${mmToDots(h) / 2},"4",${rot},1,1,"${escTSPL(p.watermark)}"`);
  lines.push(`PRINT ${p.copies ?? 1},1`);
  return lines.join("\n");
}

export function generateZPL(p: LabelPayload): string {
  const w = mmToDots(p.widthMm), h = mmToDots(p.heightMm);
  const dark = p.profile?.darkness;
  const speed = p.profile?.speed;
  const rot = (p.rotation ?? 0);
  const fwo = rot === 0 ? "N" : rot === 90 ? "R" : rot === 180 ? "I" : "B";
  const out: string[] = [];
  out.push("^XA");
  out.push(`^PW${w}`); out.push(`^LL${h}`);
  if (dark != null) out.push(`~SD${String(Math.max(0, Math.min(30, dark * 2))).padStart(2, "0")}`);
  if (speed != null) out.push(`^PR${Math.max(1, Math.min(14, speed))}`);
  if (p.profile?.blackMarkMm) out.push(`^MNM`); else out.push(`^MNY`);
  out.push(`^FWN`);
  let y = 24;
  if (p.title) { out.push(`^FO24,${y}^A0${fwo},38,38^FD${escZPL(p.title)}^FS`); y += 52; }
  for (const ln of p.lines) { out.push(`^FO24,${y}^A0${fwo},28,28^FD${escZPL(ln)}^FS`); y += 36; }
  if (p.barcode) out.push(`^FO24,${y}^BCN,80,Y,N,N^FD${escZPL(p.barcode)}^FS`);
  if (p.qr) out.push(`^FO${w - 200},24^BQN,2,6^FDLA,${escZPL(p.qr)}^FS`);
  if (p.watermark) out.push(`^FO${w / 4},${h / 2}^A0${fwo},60,60^FD${escZPL(p.watermark)}^FS`);
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

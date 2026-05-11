// Generators for TSPL (TSC) and ZPL (Zebra) command strings. Best-effort,
// suitable for preview, copy/paste and a future local print bridge.
export interface LabelPayload {
  widthMm: number;
  heightMm: number;
  gapMm?: number;
  title?: string;
  lines: string[];
  barcode?: string;
  qr?: string;
  copies?: number;
}
const mmToDots = (mm: number, dpi = 203) => Math.round((mm / 25.4) * dpi);

export function generateTSPL(p: LabelPayload): string {
  const w = p.widthMm, h = p.heightMm, gap = p.gapMm ?? 3;
  const lines: string[] = [];
  lines.push(`SIZE ${w} mm,${h} mm`);
  lines.push(`GAP ${gap} mm,0 mm`);
  lines.push(`DIRECTION 1`); lines.push(`CLS`);
  let y = 10;
  if (p.title) { lines.push(`TEXT 10,${y},"3",0,1,1,"${escTSPL(p.title)}"`); y += 30; }
  for (const ln of p.lines) { lines.push(`TEXT 10,${y},"2",0,1,1,"${escTSPL(ln)}"`); y += 24; }
  if (p.barcode) lines.push(`BARCODE 10,${y},"128",60,1,0,2,2,"${escTSPL(p.barcode)}"`);
  if (p.qr) lines.push(`QRCODE ${mmToDots(w) - 120},10,L,5,A,0,"${escTSPL(p.qr)}"`);
  lines.push(`PRINT ${p.copies ?? 1},1`);
  return lines.join("\n");
}
function escTSPL(s: string) { return s.replace(/"/g, "'"); }

export function generateZPL(p: LabelPayload): string {
  const w = mmToDots(p.widthMm), h = mmToDots(p.heightMm);
  const out: string[] = [];
  out.push("^XA"); out.push(`^PW${w}`); out.push(`^LL${h}`);
  let y = 20;
  if (p.title) { out.push(`^FO20,${y}^A0N,38,38^FD${escZPL(p.title)}^FS`); y += 50; }
  for (const ln of p.lines) { out.push(`^FO20,${y}^A0N,28,28^FD${escZPL(ln)}^FS`); y += 36; }
  if (p.barcode) { out.push(`^FO20,${y}^BCN,80,Y,N,N^FD${escZPL(p.barcode)}^FS`); }
  if (p.qr) out.push(`^FO${w - 180},20^BQN,2,6^FDLA,${escZPL(p.qr)}^FS`);
  out.push(`^PQ${p.copies ?? 1}`); out.push("^XZ");
  return out.join("\n");
}
function escZPL(s: string) { return s.replace(/\^/g, "").replace(/~/g, ""); }

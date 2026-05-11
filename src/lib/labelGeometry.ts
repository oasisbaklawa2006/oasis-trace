// Label geometry helpers — mm/dot/px conversions and safe-area math.
// Keeps every label-rendering surface (preview, barcode, TSPL/ZPL) honest
// about thermal printer DPI and quiet-zone requirements.

export type Dpi = 203 | 300;

export const SCREEN_DPI = 96;

export function mmToDots(mm: number, dpi: Dpi = 203): number {
  return Math.round((mm / 25.4) * dpi);
}
export function dotsToMm(dots: number, dpi: Dpi = 203): number {
  return (dots / dpi) * 25.4;
}
/** mm → CSS pixels at a given screen-display scale (default ~3.78 px/mm at 96 DPI). */
export function mmToPx(mm: number, scale = 1): number {
  return Math.round(((mm / 25.4) * SCREEN_DPI) * scale);
}

/** Quiet zone in mm required around a barcode/QR for reliable scanning. */
export const QUIET_ZONE_MM = {
  CODE128: 2.5,   // ~10x module width at 0.25mm modules
  EAN13: 3.5,
  QR: 2.0,
};

/** Safe printable area inset (mm) inside the label edge. */
export const SAFE_AREA_MM = 2;

/** Recommended barcode height (mm) ≈ 15% of barcode width, clamped to readable range. */
export function recommendedBarcodeHeightMm(widthMm: number): number {
  return Math.min(20, Math.max(8, widthMm * 0.18));
}

/** Recommended QR side (mm) — clamped 12–32 mm and ≤40% of shorter label side. */
export function recommendedQrSizeMm(labelWmm: number, labelHmm: number): number {
  const shortest = Math.min(labelWmm, labelHmm);
  return Math.max(12, Math.min(32, shortest * 0.4));
}

/** Module width (mm) for CODE128 — guarantees fit within available width incl. quiet zones. */
export function code128ModuleMm(valueLength: number, availableWmm: number): number {
  // CODE128 character ≈ 11 modules + 13 modules start/stop/check overhead.
  const modules = valueLength * 11 + 35;
  const usable = Math.max(10, availableWmm - QUIET_ZONE_MM.CODE128 * 2);
  return Math.max(0.18, Math.min(0.5, usable / modules));
}

/** Returns true if a barcode of given value would overflow the available width. */
export function wouldOverflow(valueLength: number, availableWmm: number, minModuleMm = 0.2): boolean {
  return code128ModuleMm(valueLength, availableWmm) < minModuleMm;
}

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

/** Hard floor — never accept a quiet zone smaller than this (scanners fail). */
export const MIN_QUIET_ZONE_MM = 1.5;

/** Safe printable area inset (mm) inside the label edge. */
export const SAFE_AREA_MM = 2;

/** Minimum readable CODE128 module width (mm) at 203 DPI. Below this scanners fail. */
export const MIN_MODULE_MM = 0.20;

/** Minimum readable QR module side (mm) — anything below ≈0.4mm becomes micro-QR. */
export const MIN_QR_MODULE_MM = 0.4;
/** Minimum overall QR side (mm) for hand scanners. */
export const MIN_QR_SIZE_MM = 12;

/** Recommended barcode height (mm) ≈ 15% of barcode width, clamped to readable range. */
export function recommendedBarcodeHeightMm(widthMm: number): number {
  return Math.min(20, Math.max(8, widthMm * 0.18));
}

/** Recommended QR side (mm) — clamped 12–32 mm and ≤40% of shorter label side. */
export function recommendedQrSizeMm(labelWmm: number, labelHmm: number): number {
  const shortest = Math.min(labelWmm, labelHmm);
  return Math.max(MIN_QR_SIZE_MM, Math.min(32, shortest * 0.4));
}

/** Module width (mm) for CODE128 — guarantees fit within available width incl. quiet zones. */
export function code128ModuleMm(valueLength: number, availableWmm: number): number {
  // CODE128 character ≈ 11 modules + 13 modules start/stop/check overhead.
  const modules = valueLength * 11 + 35;
  const usable = Math.max(10, availableWmm - QUIET_ZONE_MM.CODE128 * 2);
  return Math.max(MIN_MODULE_MM * 0.9, Math.min(0.5, usable / modules));
}

/** Returns true if a barcode of given value would overflow / become unreadable. */
export function wouldOverflow(valueLength: number, availableWmm: number, minModuleMm = MIN_MODULE_MM): boolean {
  return code128ModuleMm(valueLength, availableWmm) < minModuleMm;
}

/** Returns true if a QR of given (size, content length) would render below readable density. */
export function qrTooDense(contentLength: number, sizeMm: number): boolean {
  // Rough heuristic: each ≈25 chars adds one QR version (4 modules per side).
  // Version 1 = 21 modules. Density (mm per module) = sizeMm / sideModules.
  const versions = Math.ceil(Math.max(1, contentLength) / 25);
  const sideModules = 21 + (versions - 1) * 4;
  const moduleMm = sizeMm / sideModules;
  return moduleMm < MIN_QR_MODULE_MM || sizeMm < MIN_QR_SIZE_MM;
}

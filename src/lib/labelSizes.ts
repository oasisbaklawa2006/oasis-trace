export type LabelSize = { id: string; w: number; h: number; label: string; type?: string };

export const PRESET_SIZES: LabelSize[] = [
  { id: "50x25", w: 50, h: 25, label: "50 × 25 mm", type: "production" },
  { id: "50x50", w: 50, h: 50, label: "50 × 50 mm" },
  { id: "75x50", w: 75, h: 50, label: "75 × 50 mm", type: "product" },
  { id: "100x50", w: 100, h: 50, label: "100 × 50 mm" },
  { id: "100x75", w: 100, h: 75, label: "100 × 75 mm", type: "carton" },
  { id: "100x100", w: 100, h: 100, label: "100 × 100 mm" },
  { id: "100x150", w: 100, h: 150, label: "100 × 150 mm (shipping)", type: "shipping" },
];

export const MAX_W = 100;
export const MAX_H = 150;

export function validateSize(w: number, h: number) {
  if (w <= 0 || h <= 0) return "Size must be positive";
  if (w > MAX_W) return `Width must not exceed ${MAX_W} mm`;
  if (h > MAX_H) return `Length must not exceed ${MAX_H} mm`;
  return null;
}

// Human-readable number generators. Format: PREFIX-YYYYMMDD-####
function ymd(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}
function rand(n = 4) {
  return Math.floor(Math.random() * 10 ** n)
    .toString()
    .padStart(n, "0");
}
export const num = {
  productionLabel: () => `PL-${ymd()}-${rand(4)}`,
  batch: () => `BAT-${ymd()}-${rand(3)}`,
  carton: () => `CTN-${ymd()}-${rand(4)}`,
  dpl: () => `DPL-${ymd()}-${rand(3)}`,
  pi: () => `PI-${ymd()}-${rand(3)}`,
  shipping: () => `SHP-${ymd()}-${rand(4)}`,
  qrRef: () => `QR-${crypto.randomUUID().slice(0, 12).toUpperCase()}`,
};

// Printer profile presets. Tuned for the most common thermal label printers
// in Indian/Gulf food manufacturing lines. Apply via Printer Management.
import type { PrinterProfile } from "@/lib/printerCommands";

export interface PrinterPreset extends PrinterProfile {
  key: string;
  label: string;
  command_lang: "TSPL" | "ZPL";
  thermalOffsetMm?: number;
  xOffsetMm?: number;
  notes?: string;
}

export const PRINTER_PRESETS: PrinterPreset[] = [
  { key: "TSC_TE244",       label: "TSC TE244 (203 dpi)",     command_lang: "TSPL", dpi: 203, darkness: 8,  speed: 4, gapMm: 3,    thermalOffsetMm: 0,    xOffsetMm: 0, notes: "Default for Oasis production lines." },
  { key: "ZEBRA_GK420",     label: "Zebra GK420 (203 dpi)",   command_lang: "ZPL",  dpi: 203, darkness: 10, speed: 4, gapMm: 3,    thermalOffsetMm: 0,    xOffsetMm: 0 },
  { key: "XPRINTER",        label: "XPrinter (Generic)",      command_lang: "TSPL", dpi: 203, darkness: 9,  speed: 4, gapMm: 2,    thermalOffsetMm: 0.3,  xOffsetMm: 0.5, notes: "Slight thermal drift on left margin." },
  { key: "GENERIC_TSPL",    label: "Generic TSPL",            command_lang: "TSPL", dpi: 203, darkness: 8,  speed: 4, gapMm: 3 },
  { key: "GENERIC_ZPL",     label: "Generic ZPL",             command_lang: "ZPL",  dpi: 203, darkness: 10, speed: 4, gapMm: 3 },
  { key: "TSC_300DPI",      label: "TSC 300 dpi",             command_lang: "TSPL", dpi: 300, darkness: 9,  speed: 3, gapMm: 3 },
];

export function presetByKey(k: string | undefined): PrinterPreset | undefined {
  return PRINTER_PRESETS.find(p => p.key === k);
}

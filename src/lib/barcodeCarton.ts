import { generateCartonOrderBarcode, supportsCentralBarcode } from "./scanContract";
import { num } from "./numbering";

export interface CartonBarcodeDisplay {
  mode: "central" | "legacy";
  centralBarcode: string | null;
  legacyBarcode: string;
  labelBarcode: string;
}

/** Resolve barcodes shown on carton UI / labels. */
export function resolveCartonBarcodeDisplay(
  orderNumber: string,
  legacyCartonNo?: string,
  metadata?: { central_barcode?: string; legacy_carton_no?: string; barcode_mode?: string },
): CartonBarcodeDisplay {
  const legacy = legacyCartonNo || metadata?.legacy_carton_no || num.carton();
  const central =
    metadata?.central_barcode ||
    (supportsCentralBarcode(orderNumber) ? generateCartonOrderBarcode(orderNumber) : null);
  const mode = central ? "central" : "legacy";
  return {
    mode,
    centralBarcode: central,
    legacyBarcode: legacy,
    labelBarcode: central ?? legacy,
  };
}

export function buildCartonMetadata(orderNumber: string, legacyCartonNo: string) {
  if (supportsCentralBarcode(orderNumber)) {
    return {
      barcode_mode: "central" as const,
      central_barcode: generateCartonOrderBarcode(orderNumber),
      legacy_carton_no: legacyCartonNo,
    };
  }
  return {
    barcode_mode: "legacy" as const,
    legacy_carton_no: legacyCartonNo,
  };
}

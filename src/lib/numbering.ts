/**
 * Human-readable Trace identifiers — delegates to barcodeIdentity (Point 94).
 * Preview fixtures remain available for non-authoritative UI only.
 */
import {
  allocateTraceIdentity,
  deriveShippingQrRef,
  PREVIEW_BARCODE_IDENTITIES,
} from "@/lib/barcodeIdentity";

export const num = {
  productionLabel: () => allocateTraceIdentity("production_label"),
  batch: () => allocateTraceIdentity("batch"),
  carton: () => allocateTraceIdentity("legacy_carton"),
  dpl: () => allocateTraceIdentity("dpl"),
  pi: () => allocateTraceIdentity("pi"),
  shipping: () => allocateTraceIdentity("shipping"),
  /** Deterministic QR from shipping_no — call after shipping_no is known. */
  qrRef: (shippingNo: string) => deriveShippingQrRef(shippingNo),
};

/** Explicit preview fixtures for templates/UI — not for production allocation. */
export const previewIds = PREVIEW_BARCODE_IDENTITIES;

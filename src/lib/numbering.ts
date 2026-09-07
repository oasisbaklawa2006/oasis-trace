/**
 * Human-readable Trace identifiers.
 * `num` — client-side preview/demo allocator (tests and unconfigured demo only).
 * `productionNum` — authoritative allocation (Core RPC when Supabase is configured).
 */
import {
  allocateTraceIdentity,
  deriveShippingQrRef,
  PREVIEW_BARCODE_IDENTITIES,
} from "@/lib/barcodeIdentity";
import { allocateProductionIdentity } from "@/lib/productionIdentity";

/** Demo/preview/tests — not for configured live production writes. */
export const num = {
  productionLabel: () => allocateTraceIdentity("production_label"),
  batch: () => allocateTraceIdentity("batch"),
  carton: () => allocateTraceIdentity("legacy_carton"),
  dpl: () => allocateTraceIdentity("dpl"),
  pi: () => allocateTraceIdentity("pi"),
  shipping: () => allocateTraceIdentity("shipping"),
  qrRef: (shippingNo: string) => deriveShippingQrRef(shippingNo),
};

/** Authoritative production allocation — fails closed when Core RPC is missing. */
export const productionNum = {
  productionLabel: () => allocateProductionIdentity("production_label"),
  batch: () => allocateProductionIdentity("batch"),
  carton: () => allocateProductionIdentity("legacy_carton"),
  dpl: () => allocateProductionIdentity("dpl"),
  pi: () => allocateProductionIdentity("pi"),
  shipping: () => allocateProductionIdentity("shipping"),
  qrRef: (shippingNo: string) => deriveShippingQrRef(shippingNo),
};

/** Explicit preview fixtures for templates/UI — not for production allocation. */
export const previewIds = PREVIEW_BARCODE_IDENTITIES;

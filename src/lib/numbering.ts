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
import { supabaseConfigured } from "@/lib/supabase";

/** Static preview placeholders — never allocated in configured live mode. */
const PREVIEW_NUMBERS = {
  productionLabel: PREVIEW_BARCODE_IDENTITIES.productionLabel,
  batch: "BAT-PREVIEW-001",
  carton: PREVIEW_BARCODE_IDENTITIES.cartonLegacy,
  dpl: "DPL-PREVIEW-001",
  pi: "PI-PREVIEW-001",
  shipping: "SHP-PREVIEW-0001",
} as const;

function previewOrAllocate(
  kind: Parameters<typeof allocateTraceIdentity>[0],
  preview: string,
): string {
  if (supabaseConfigured) return preview;
  return allocateTraceIdentity(kind);
}

/** Demo/preview/tests — not for configured live production writes. */
export const num = {
  productionLabel: () => previewOrAllocate("production_label", PREVIEW_NUMBERS.productionLabel),
  batch: () => previewOrAllocate("batch", PREVIEW_NUMBERS.batch),
  carton: () => previewOrAllocate("legacy_carton", PREVIEW_NUMBERS.carton),
  dpl: () => previewOrAllocate("dpl", PREVIEW_NUMBERS.dpl),
  pi: () => previewOrAllocate("pi", PREVIEW_NUMBERS.pi),
  shipping: () => previewOrAllocate("shipping", PREVIEW_NUMBERS.shipping),
  qrRef: (shippingNo: string) => deriveShippingQrRef(shippingNo),
};

function rejectLiveProductionPreallocation(kind: "batch" | "production_label"): never {
  throw new Error(
    `productionNum.${kind === "batch" ? "batch" : "productionLabel"} is not for live production writes. `
    + "Use createProductionWithAuthoritativeIds so trace_create_production_v1 assigns batch_no and label_no atomically.",
  );
}

/** Authoritative allocation for non-production-create identifiers — fails closed when Core RPC is missing. */
export const productionNum = {
  productionLabel: () => {
    if (supabaseConfigured) rejectLiveProductionPreallocation("production_label");
    return allocateProductionIdentity("production_label");
  },
  batch: () => {
    if (supabaseConfigured) rejectLiveProductionPreallocation("batch");
    return allocateProductionIdentity("batch");
  },
  carton: () => allocateProductionIdentity("legacy_carton"),
  dpl: () => allocateProductionIdentity("dpl"),
  pi: () => allocateProductionIdentity("pi"),
  shipping: () => allocateProductionIdentity("shipping"),
  qrRef: (shippingNo: string) => deriveShippingQrRef(shippingNo),
};

/** Explicit preview fixtures for templates/UI — not for production allocation. */
export const previewIds = PREVIEW_BARCODE_IDENTITIES;

// Pure label-payload builders for the three corrected print flows
// (Production, Cartonization, ShippingLabel) — extracted so the exact data
// that becomes the physical label content (and therefore what
// generateLabelCommand/generateTSPL turns into bytes) can be tested without
// rendering the page or mocking Supabase.
import type { LabelPayload } from "@/lib/printerCommands";

export function buildProductionLabelPayload(opts: {
  productName?: string;
  sku?: string;
  batchNo: string;
  mfgDate: string;
  shelfLifeDays: string | number;
  netWeight: string | number;
  grossWeight: string | number;
  labelNo: string;
}): LabelPayload {
  return {
    widthMm: 75, heightMm: 50,
    title: opts.productName || "Production Label",
    lines: [
      `SKU ${opts.sku || "—"}  Batch ${opts.batchNo}`,
      `MFG ${opts.mfgDate}  Shelf ${opts.shelfLifeDays}d`,
      `Net ${opts.netWeight || "—"} kg  Gross ${opts.grossWeight || opts.netWeight || "—"} kg`,
    ],
    barcode: opts.labelNo,
  };
}

export function buildCartonLabelPayload(opts: {
  customerName?: string;
  orderRef?: string;
  cartonIndex?: number | string;
  itemCount: number;
  netWeightKg: number;
  barcode: string;
}): LabelPayload {
  return {
    widthMm: 100, heightMm: 75,
    title: opts.customerName || "Customer",
    lines: [
      `Order ${opts.orderRef || "—"}`,
      `Carton ${opts.cartonIndex ?? "—"} · Items ${opts.itemCount}`,
      `Net ${opts.netWeightKg.toFixed(2)} kg`,
    ],
    barcode: opts.barcode,
  };
}

export function buildShippingLabelPayload(opts: {
  consignee?: string;
  invoiceRef?: string;
  shippingNo: string;
  qrRef: string;
}): LabelPayload {
  return {
    widthMm: 100, heightMm: 150,
    title: opts.consignee || "Customer",
    lines: [`From Oasis Baklawa LLC`, `Invoice ${opts.invoiceRef || "—"}`, opts.shippingNo],
    barcode: opts.shippingNo,
    qr: opts.qrRef,
  };
}

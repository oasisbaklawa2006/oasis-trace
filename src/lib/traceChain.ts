// Pure traceability chain resolution — extracted from Traceability.tsx so
// the FK-first / order_ref-fallback resolution algorithm can be exercised
// by a genuine integration test without rendering React.
//
// Resolution priority (most reliable first): direct FK > carton_id > dpl_id >
// pi_id > order_ref. order_ref is intentionally a last-resort fallback
// because it is not enforced by a foreign key and may collide across years.
import type { SearchDoc } from "@/lib/traceSearch";
import type {
  Carton, CartonContent, DplDocument, FinancePi, GateScanRow,
  InventoryMovement, ProductionLabel, ShippingLabelRow,
} from "@/lib/types";

export interface TraceChainData {
  labels: ProductionLabel[];
  cartons: Carton[];
  contents: CartonContent[];
  pis: FinancePi[];
  shipping: ShippingLabelRow[];
  movements: InventoryMovement[];
  dpls: DplDocument[];
  gateScans: GateScanRow[];
}

export interface TraceChainResult {
  label?: ProductionLabel;
  carton?: Carton;
  ship?: ShippingLabelRow;
  pi?: FinancePi;
  dpl?: DplDocument;
  gate?: GateScanRow;
  labelMovements: InventoryMovement[];
}

export function resolveTraceChain(chosen: SearchDoc, data: TraceChainData): TraceChainResult {
  const { labels, cartons, contents, pis, shipping, movements, dpls, gateScans } = data;

  let label: ProductionLabel | undefined, carton: Carton | undefined, ship: ShippingLabelRow | undefined,
    pi: FinancePi | undefined, dpl: DplDocument | undefined;

  if (chosen.kind === "production_label") label = chosen.raw as ProductionLabel;
  else if (chosen.kind === "carton") carton = chosen.raw as Carton;
  else if (chosen.kind === "shipping") ship = chosen.raw as ShippingLabelRow;
  else if (chosen.kind === "pi") pi = chosen.raw as FinancePi;
  else if (chosen.kind === "dpl") dpl = chosen.raw as DplDocument;
  else if (chosen.kind === "gate_scan") ship = shipping.find(s => s.id === (chosen.raw as GateScanRow).shipping_label_id); // FK
  else if (chosen.kind === "order") carton = cartons.find(c => c.order_ref === chosen.ref);     // fallback
  else if (chosen.kind === "customer") carton = cartons.find(c => c.customer_name === chosen.ref); // fallback
  else if (chosen.kind === "sku") label = labels.find(l => l.metadata?.sku === chosen.ref);
  else if (chosen.kind === "batch") label = labels.find(l => (l.batch_no || l.metadata?.batch_no) === chosen.ref);

  // 1) FK: production_label → carton via ols_carton_contents
  if (label && !carton) {
    const link = contents.find(c => c.production_label_id === label!.id);
    if (link) carton = cartons.find(c => c.id === link.carton_id);
  }
  // 2) FK: shipping.carton_id
  if (carton && !ship) ship = shipping.find(s => s.carton_id === carton!.id);
  if (ship && !carton) carton = cartons.find(c => c.id === ship!.carton_id);
  // 3) FK: shipping.pi_id, then pi.dpl_id
  if (ship && !pi && ship.pi_id) pi = pis.find(p => p.id === ship!.pi_id);
  if (pi && !dpl && pi.dpl_id) dpl = dpls.find(d => d.id === pi!.dpl_id);
  // 4) order_ref fallback only when no FK has resolved, and only when both
  // sides carry a truthy order_ref — an undefined-to-undefined match would
  // silently link unrelated records.
  if (carton?.order_ref && !pi) pi = pis.find(p => p.order_ref === carton!.order_ref);
  if (carton?.order_ref && !dpl) dpl = dpls.find(d => d.order_ref === carton!.order_ref);
  if (pi?.order_ref && !dpl) dpl = dpls.find(d => d.order_ref === pi!.order_ref);

  const labelMovements = label ? movements.filter(m => m.production_label_id === label!.id) : [];
  const gate = ship ? gateScans.find(g => g.shipping_label_id === ship!.id) : undefined;

  return { label, carton, pi, ship, dpl, gate, labelMovements };
}

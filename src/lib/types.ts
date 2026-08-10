// Shared row shapes for `ols_*` tables. These mirror db/ols_init.sql plus the
// denormalized `metadata` fields the frontend actually reads/writes — kept
// intentionally loose (most fields optional) since both the demo store and
// Supabase return partially-populated rows depending on workflow stage.

export interface Department {
  id: string;
  code: string;
  name: string;
  kind?: string;
  active?: boolean;
  created_at?: string;
}

export interface ProductCache {
  id: string;
  external_ref?: string;
  sku: string;
  name: string;
  category?: string;
  default_net_weight?: number;
  default_gross_weight?: number;
  shelf_life_days?: number;
  metadata?: Record<string, unknown>;
  created_at?: string;
}

export interface OrderCache {
  id: string;
  external_ref?: string;
  order_number: string;
  customer_code?: string;
  customer_name?: string;
  destination?: string;
  transport_mode?: string;
  status?: string;
  metadata?: Record<string, unknown>;
  created_at?: string;
}

export interface ProductionLabelMetadata {
  product_name?: string;
  sku?: string;
  department?: string;
  batch_no?: string;
}

export interface ProductionLabel {
  id: string;
  label_no: string;
  batch_id?: string;
  product_id?: string;
  department_id?: string;
  tray_serial?: string;
  net_weight?: number;
  gross_weight?: number;
  mfg_date?: string;
  best_before?: string;
  qc_status?: string;
  operator_name?: string;
  status?: string;
  batch_no?: string;
  product_name?: string;
  metadata?: ProductionLabelMetadata;
  created_by?: string;
  created_at?: string;
  updated_at?: string;
}

export interface ProductionBatch {
  id: string;
  batch_no: string;
  product_id?: string;
  department_id?: string;
  shift?: string;
  mfg_date?: string;
  shelf_life_days?: number;
  qc_status?: string;
  remarks?: string;
  created_by?: string;
  created_at?: string;
}

export interface StockUnit {
  id: string;
  production_label_id: string;
  current_location?: string;
  current_status?: string;
  updated_at?: string;
}

export interface InventoryMovement {
  id: string;
  production_label_id?: string | null;
  from_location?: string;
  to_location?: string;
  movement_type?: string;
  reference_no?: string;
  user_id?: string;
  notes?: string;
  created_at?: string;
}

export interface CartonMetadata {
  barcode_mode?: "central" | "legacy";
  central_barcode?: string;
  legacy_carton_no?: string;
}

export interface Carton {
  id: string;
  carton_no: string;
  order_ref?: string;
  customer_code?: string;
  customer_name?: string;
  carton_index?: number;
  carton_total?: number;
  packed_by?: string;
  packed_at?: string;
  gross_weight?: number;
  net_weight?: number;
  status: string;
  remarks?: string;
  metadata?: CartonMetadata;
  created_at?: string;
  updated_at?: string;
}

export interface CartonContent {
  id: string;
  carton_id: string;
  production_label_id?: string;
  manual_sku?: string;
  manual_qty?: number;
  manual_reason?: string;
  added_at?: string;
}

export interface DplDocument {
  id: string;
  dpl_no: string;
  order_ref?: string;
  customer_name?: string;
  destination?: string;
  transport_mode?: string;
  prepared_by?: string;
  prepared_at?: string;
  total_cartons?: number;
  total_gross?: number;
  total_net?: number;
  remarks?: string;
  status?: string;
  created_at?: string;
}

export interface DplCarton {
  id: string;
  dpl_id: string;
  carton_id: string;
  position?: number;
}

export interface FinancePi {
  id: string;
  pi_no: string;
  dpl_id?: string | null;
  order_ref?: string;
  customer_name?: string;
  status?: string;
  cleared_at?: string;
  invoice_ref?: string;
  tally_invoice_no?: string;
  tally_sync_status?: string;
  eway_bill_no?: string;
  eway_status?: string;
  created_by?: string;
  created_at?: string;
  updated_at?: string;
}

export interface FinancePiCarton {
  id: string;
  pi_id: string;
  carton_id: string;
}

export interface FinancePiLine {
  id: string;
  pi_id: string;
  sku?: string;
  product_name?: string;
  quantity?: number;
  net_weight?: number;
  gross_weight?: number;
}

export interface ShippingLabelRow {
  id: string;
  shipping_no: string;
  carton_id?: string;
  pi_id?: string;
  consignor?: string;
  consignee?: string;
  address?: string;
  phone?: string;
  invoice_ref?: string;
  eway_ref?: string;
  transport_ref?: string;
  route?: string;
  handling_marks?: string;
  qr_ref: string;
  status?: string;
  created_at?: string;
}

export interface GateScanRow {
  id: string;
  qr_ref?: string;
  shipping_label_id?: string | null;
  result: "green" | "red";
  reason?: string;
  scanned_by?: string;
  scanned_at?: string;
  created_at?: string;
}

export interface PrintLogMetadata {
  reason?: string | null;
  [key: string]: unknown;
}

export interface PrintLogRow {
  id: string;
  ref_type: string;
  ref_id?: string;
  printer_id?: string;
  printed_by?: string;
  is_reprint?: boolean;
  reprint_count?: number;
  reason?: string;
  success?: boolean;
  metadata?: PrintLogMetadata;
  created_at?: string;
}

export interface ScanHistoryMetadata {
  central_idempotency_key?: string;
  central_payload?: unknown;
  message_code?: string | null;
  user_message?: string | null;
  central_sync_status?: string;
  central_reference?: string;
  central_submitted_at?: string;
  central_failure_reason?: string | null;
  reason?: string | null;
  legacy_flow?: boolean;
  [key: string]: unknown;
}

export interface ScanHistoryRow {
  id: string;
  scan_value?: string;
  scan_context?: string;
  user_id?: string;
  result?: string;
  metadata?: ScanHistoryMetadata;
  created_at?: string;
}

export interface PrinterRow {
  id: string;
  name: string;
  model?: string;
  command_lang?: "TSPL" | "ZPL" | "BROWSER" | string;
  location?: string;
  status?: string;
  settings?: Record<string, unknown>;
  last_seen_at?: string;
  created_at?: string;
  updated_at?: string;
}

export interface LabelTemplateRow {
  id: string;
  name: string;
  label_type: string;
  width_mm: number;
  height_mm: number;
  barcode_type?: string;
  show_qr?: boolean;
  font_scale?: number;
  fields?: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
}

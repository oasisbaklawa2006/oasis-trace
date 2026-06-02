// Local in-memory + localStorage demo store. Used as a fallback when
// Supabase is not configured OR when the requested ols_ table is missing.
// Mirrors the shape of the Supabase migration so screens behave identically.

import { num } from "./numbering";

type Row = Record<string, any>;
type Table = Row[];
type DB = Record<string, Table>;

const KEY = "ols_demo_db_v1";

function load(): DB {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
  } catch {/* */}
  return seed();
}
function save(db: DB) { localStorage.setItem(KEY, JSON.stringify(db)); }

function seed(): DB {
  const db: DB = {
    ols_departments: [
      { id: crypto.randomUUID(), code: "ARAB", name: "Arabic Sweets", kind: "production", active: true },
      { id: crypto.randomUUID(), code: "BAKE", name: "Bakery", kind: "production", active: true },
      { id: crypto.randomUUID(), code: "CHOC", name: "Chocolate & Confectionery", kind: "production", active: true },
      { id: crypto.randomUUID(), code: "FUSI", name: "Fusion Sweets", kind: "production", active: true },
      { id: crypto.randomUUID(), code: "NUTS", name: "Savoured Nuts & Mixes", kind: "production", active: true },
      { id: crypto.randomUUID(), code: "RGS", name: "Ready Goods Store", kind: "store", active: true },
      { id: crypto.randomUUID(), code: "PACK", name: "Packing & Assembly", kind: "packing", active: true },
      { id: crypto.randomUUID(), code: "DISP", name: "Dispatch", kind: "dispatch", active: true },
      { id: crypto.randomUUID(), code: "FIN", name: "Finance", kind: "finance", active: true },
      { id: crypto.randomUUID(), code: "GATE", name: "Security Gate", kind: "gate", active: true },
    ],
    ols_products_cache: [
      { id: crypto.randomUUID(), sku: "CPB-5000", name: "Cashew Pyramid Baklawa", category: "Arabic Sweets", default_net_weight: 5, default_gross_weight: 5.25, shelf_life_days: 90 },
      { id: crypto.randomUUID(), sku: "ASB-2000", name: "Assorted Baklawa", category: "Arabic Sweets", default_net_weight: 2, default_gross_weight: 2.18, shelf_life_days: 90 },
      { id: crypto.randomUUID(), sku: "ALF-1000", name: "Almond Fingers", category: "Arabic Sweets", default_net_weight: 1, default_gross_weight: 1.12, shelf_life_days: 90 },
      { id: crypto.randomUUID(), sku: "PSB-2000", name: "Pistachio Baklawa", category: "Arabic Sweets", default_net_weight: 2, default_gross_weight: 2.18, shelf_life_days: 90 },
      { id: crypto.randomUUID(), sku: "KNB-1500", name: "Kunafa Bites", category: "Arabic Sweets", default_net_weight: 1.5, default_gross_weight: 1.65, shelf_life_days: 60 },
    ],
    ols_orders_cache: [
      { id: crypto.randomUUID(), order_number: "SO-2026-0001", customer_code: "C-1001", customer_name: "Al Manzil Trading", destination: "Dubai", transport_mode: "Truck", status: "open" },
      { id: crypto.randomUUID(), order_number: "SO-2026-0002", customer_code: "C-1042", customer_name: "Gulf Sweets LLC", destination: "Abu Dhabi", transport_mode: "Truck", status: "open" },
    ],
    ols_printers: [
      { id: crypto.randomUUID(), name: "TSC TE244 Production", model: "TSC TE244", command_lang: "TSPL", location: "Production Hall", status: "online" },
      { id: crypto.randomUUID(), name: "TSC TE244 Dispatch", model: "TSC TE244", command_lang: "TSPL", location: "Dispatch Bay", status: "online" },
      { id: crypto.randomUUID(), name: "Zebra Compatible Shipping", model: "Zebra ZD420", command_lang: "ZPL", location: "Shipping Dock", status: "online" },
    ],
    ols_label_templates: [
      { id: crypto.randomUUID(), name: "Production 50x25", label_type: "production", width_mm: 50, height_mm: 25, barcode_type: "CODE128", show_qr: false, font_scale: 1, fields: { showSku: true, showBatch: true, showWeight: true } },
      { id: crypto.randomUUID(), name: "Product 75x50", label_type: "product", width_mm: 75, height_mm: 50, barcode_type: "CODE128", show_qr: false, font_scale: 1, fields: { showSku: true, showBatch: true, showMfg: true, showBestBefore: true, showWeight: true } },
      { id: crypto.randomUUID(), name: "Carton 100x75", label_type: "carton", width_mm: 100, height_mm: 75, barcode_type: "CODE128", show_qr: false, font_scale: 1, fields: { showOrder: true, showCustomer: true, showIndex: true } },
      { id: crypto.randomUUID(), name: "Shipping 100x150", label_type: "shipping", width_mm: 100, height_mm: 150, barcode_type: "CODE128", show_qr: true, font_scale: 1, fields: { showConsignee: true, showRoute: true } },
    ],
    ols_production_batches: [],
    ols_production_labels: [],
    ols_stock_units: [],
    ols_inventory_movements: [],
    ols_cartons: [],
    ols_carton_contents: [],
    ols_dpl_documents: [],
    ols_dpl_cartons: [],
    ols_finance_pi: [],
    ols_finance_pi_cartons: [],
    ols_finance_pi_lines: [],
    ols_dispatch_document_bundles: [],
    ols_shipping_labels: [],
    ols_gate_scans: [],
    ols_print_logs: [],
    ols_scan_history: [],
    ols_central_scan_submissions: [],
    ols_reprint_requests: [],
    ols_audit_logs: [],
    ols_permissions: [],
  };
  return db;
}

let db: DB = load();

export const demo = {
  list<T = Row>(table: string): T[] {
    return ((db[table] || []) as T[]).slice().reverse();
  },
  all<T = Row>(table: string): T[] {
    return (db[table] || []) as T[];
  },
  insert<T extends Row>(table: string, row: Partial<T>): T {
    db[table] ||= [];
    const full = { id: crypto.randomUUID(), created_at: new Date().toISOString(), ...row } as unknown as T;
    db[table].push(full);
    save(db);
    return full;
  },
  update<T extends Row>(table: string, id: string, patch: Partial<T>): T | undefined {
    const arr = db[table] || [];
    const i = arr.findIndex(r => r.id === id);
    if (i === -1) return undefined;
    arr[i] = { ...arr[i], ...patch, updated_at: new Date().toISOString() };
    save(db);
    return arr[i] as T;
  },
  reset() { db = seed(); save(db); },
};

export { num };

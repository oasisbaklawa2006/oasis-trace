# Oasis Trace — Barcode & Label Authority Reality Audit

**Repo:** `oasis-trace` (Oasis Label Studio / Barcode App)  
**Date:** 2026-06-09  
**Type:** Read-only audit — no code, SQL, migrations, or Supabase changes were made.

---

## Executive Summary

Oasis Trace is a **functional local label/traceability workstation** with real on-screen barcode/QR rendering (JsBarcode + qrcode.react), a complete `ols_*` schema design, and a **partial** Central scan-submit path (CTN-SO carton identity + dispatch gate only). It is **not ready** to act as the ecosystem-wide **Barcode / Label Identity Master** today.

Primary blockers:

1. **No AI Studio catalogue sync** — products/orders come from seeded `ols_products_cache` / `ols_orders_cache` or local demo data; `external_ref` is unused.
2. **Silent demo fallback** — any Supabase read/write failure routes to `localStorage` demo store without hard-blocking operations.
3. **No physical print authority** — TSPL/ZPL is generated client-side; no print bridge, `ols_print_jobs` is unused.
4. **Dual carton identity** — legacy `CTN-YYYYMMDD-####` coexists with Central `CTN-SO-*`; production labels use independent `PL-*` numbering with no Central registry.
5. **Central consume path is narrow** — only verified scan payloads via edge function; no label/barcode master API for Central to read.

**Verdict:** Trace can demo end-to-end label flows offline or on a configured Supabase project, but **cannot safely receive approved AI Studio product data now** and **cannot be trusted as the single source of barcode/label truth** without stitching work below.

---

## Architecture Snapshot

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Oasis Trace (React/Vite)                                               │
│  Routes: /production, /cartons, /gate, /templates, /shipping, …        │
└───────────────┬─────────────────────────────────────┬───────────────────┘
                │ listTable / insertRow / updateRow    │ supabase.functions
                ▼                                      ▼
┌───────────────────────────────┐      ┌──────────────────────────────────┐
│  ols_* tables (Supabase)       │      │  Edge: submit-central-scan        │
│  OR demoStore (localStorage)   │      │  → CENTRAL_SCAN_INGEST_URL (opt)  │
└───────────────────────────────┘      └──────────────────────────────────┘
                ▲
                │ NO SYNC PATH
┌───────────────┴───────────────┐
│  AI Studio / shared catalogue  │  (not read or written by this app)
└───────────────────────────────┘
```

**Data layer:** `src/lib/data.ts` — tries Supabase first, falls back to `src/lib/demoStore.ts` on any error.  
**Auth:** `src/components/AuthGate.tsx` — bypassed when env vars missing (full demo mode).  
**Central submit flag:** `VITE_CENTRAL_SCAN_SUBMIT_ENABLED` (default `false` in `.env.example`).

---

## Module Audit (11 Scope Areas)

### 1. Product / Catalogue Data Consumption (AI Studio / Shared Supabase)

| Field | Value |
|-------|-------|
| **Route/path** | `/production`, `/cartons`, `/dpl`, `/finance` (order/product pickers) |
| **Component/file** | `src/pages/ProductionEntry.tsx`, `src/pages/Cartonization.tsx`, `src/pages/DPL.tsx`, `src/pages/FinancePI.tsx` |
| **Data layer** | `src/lib/data.ts` → `listTable("ols_products_cache")`, `listTable("ols_orders_cache")` |
| **Reads Supabase?** | **PARTIAL** — reads `ols_*` cache tables when configured; no reads from AI Studio or Central catalogue tables |
| **Writes Supabase?** | **NO** — cache tables are not written by the app (seed-only via `db/ols_init.sql`) |
| **Tables/RPCs** | `ols_products_cache`, `ols_orders_cache` (`external_ref` column exists, never populated) |
| **Mock/demo/local?** | **YES** — 5 demo SKUs + 2 orders in `demoStore.ts` and SQL seed |
| **Barcode/label real?** | N/A (consumption only) |
| **Central can consume?** | **NO** — no outbound product/label registry |
| **Missing stitching** | One-way sync job/RPC from AI Studio approved products → `ols_products_cache`; order sync; `external_ref` FK; approval/version pinning; invalidation on AI Studio retract |
| **Risk** | **HIGH** — operators may label against stale or demo catalogue; no authority chain to AI Studio |

---

### 2. Barcode Generation

| Field | Value |
|-------|-------|
| **Route/path** | All label surfaces; CTN-SO logic in carton/gate flows |
| **Component/file** | `src/components/Barcode.tsx` (JsBarcode CODE128/EAN13), `src/lib/scanContract.ts` (`generateCartonOrderBarcode`), `src/lib/barcodeCarton.ts`, `src/lib/numbering.ts` (`PL-*`, `CTN-*` legacy) |
| **Reads Supabase?** | **NO** (client-side generation) |
| **Writes Supabase?** | **NO** |
| **Tables/RPCs** | None for generation; carton metadata stored on `ols_cartons.metadata` |
| **Mock/demo?** | **PARTIAL** — preview placeholders (`PL-PREVIEW-0001`, `CTN-PREVIEW-0001`) in Templates |
| **Barcode/label real?** | **PARTIAL** — SVG CODE128 is real and density-aware (`labelGeometry.ts`); production/carton numbers are client-random (`num.*`), not server-allocated sequences |
| **Central can consume?** | **PARTIAL** — `CTN-SO-{order_number}` format is Central-contract aligned; `PL-*` and legacy `CTN-YYYYMMDD-*` are Trace-local only |
| **Missing stitching** | Server-side barcode allocation; uniqueness enforcement beyond DB unique indexes; GS1/EAN from approved product master; Central barcode registry API |
| **Risk** | **HIGH** — duplicate `PL-*` possible across devices (random 4-digit suffix); no cross-app deduplication |

---

### 3. QR / Label Code Generation

| Field | Value |
|-------|-------|
| **Route/path** | `/shipping`, `/templates`, label previews on production/carton/dispatch |
| **Component/file** | `src/components/LabelPreview.tsx` (`QRCodeSVG`), `src/lib/numbering.ts` (`qrRef()` → `QR-{uuid slice}`) |
| **Reads Supabase?** | **NO** |
| **Writes Supabase?** | **PARTIAL** — `ols_shipping_labels.qr_ref` written on generate (`ShippingLabel.tsx`) |
| **Tables/RPCs** | `ols_shipping_labels.qr_ref` (unique) |
| **Mock/demo?** | **YES** — `QR-PREVIEW-001` in Templates preview |
| **Barcode/label real?** | **PARTIAL** — QR SVG renders real codes; shipping QR is opaque local ref, not a Central-resolvable identity |
| **Central can consume?** | **NO** — gate legacy flow resolves QR locally against `ols_shipping_labels` only |
| **Missing stitching** | QR payload contract (URL/deep-link to Central trace); signed QR; mapping table Central can query |
| **Risk** | **MEDIUM** — gate security depends on local DB integrity, not ecosystem-wide identity |

---

### 4. Label Template Creation

| Field | Value |
|-------|-------|
| **Route/path** | `/templates` |
| **Component/file** | `src/pages/Templates.tsx`, `src/lib/labelSizes.ts`, `src/lib/printerCommands.ts` |
| **Reads Supabase?** | **YES** — `ols_label_templates` |
| **Writes Supabase?** | **NO** — "Save as new template" button has no handler; edits are session-local only |
| **Tables/RPCs** | `ols_label_templates` (read); `ols_printer_settings` (schema exists, unused by UI) |
| **Mock/demo?** | **YES** — hardcoded preview payload ("Cashew Pyramid Baklawa", `PL-PREVIEW-0001`) |
| **Barcode/label real?** | **PARTIAL** — TSPL/ZPL generation is real; template persistence is not |
| **Central can consume?** | **NO** |
| **Missing stitching** | CRUD for templates; link template → product category/SKU; versioned template approval; `ols_printer_settings` wiring |
| **Risk** | **MEDIUM** — operators cannot persist custom layouts; production uses fixed 75×50 preview regardless of template library |

---

### 5. Label Printing / Export Workflow

| Field | Value |
|-------|-------|
| **Route/path** | `/production`, `/cartons`, `/shipping`, `/dpl`, `/dispatch`, `/templates`, `/printers`, `/print-logs`, `/reports` |
| **Component/file** | `src/components/PrintSheet.tsx`, `src/lib/printerCommands.ts`, `src/lib/exporters.ts`, `src/pages/Printers.tsx`, `src/components/ReprintModal.tsx` |
| **Reads Supabase?** | **PARTIAL** — printers, print logs |
| **Writes Supabase?** | **YES** — `ols_print_logs`, `ols_reprint_requests`; printer profile → `ols_printers` (note: schema has separate `ols_printer_settings`, UI writes `settings` json on `ols_printers` — column may not exist in live migration) |
| **Tables/RPCs** | `ols_print_logs`, `ols_reprint_requests`, `ols_printers`; **`ols_print_jobs` unused** |
| **Mock/demo?** | **YES** — clipboard copy + `window.print()` only; no device bridge |
| **Barcode/label real?** | **PARTIAL** — screen/browser print is real; thermal command strings are real but not sent to hardware |
| **Central can consume?** | **NO** — print events are local audit rows only |
| **Missing stitching** | Print bridge (USB/network); `ols_print_jobs` queue; print-lock before reprint; Central notification of print authority issuance |
| **Risk** | **HIGH** — "Printed" toast + log row without guaranteed physical print; false audit trail |

---

### 6. Product-to-Label Mapping

| Field | Value |
|-------|-------|
| **Route/path** | `/production` |
| **Component/file** | `src/pages/ProductionEntry.tsx` |
| **Reads Supabase?** | **YES** — `ols_products_cache`, `ols_departments` |
| **Writes Supabase?** | **YES** — `ols_production_batches`, `ols_production_labels` (+ stock/movement/print log) |
| **Tables/RPCs** | `ols_production_batches`, `ols_production_labels`, `ols_stock_units`, `ols_inventory_movements`, `ols_print_logs` |
| **Mock/demo?** | **PARTIAL** — falls back to demo products |
| **Barcode/label real?** | **YES** — `label_no` = `PL-YYYYMMDD-####`; metadata embeds `sku`, `product_name` (denormalized, not FK-enforced at print time) |
| **Central can consume?** | **NO** — no API exposing label ↔ product authority |
| **Missing stitching** | Enforce `product_id` FK against synced AI Studio catalogue; block label if product not approved; expose read API for Central |
| **Risk** | **HIGH** — labels can be issued for any row in cache, including demo SKUs |

---

### 7. Batch / Pack / Carton Identity Logic

| Field | Value |
|-------|-------|
| **Route/path** | `/production`, `/cartons`, `/dpl`, `/finance` |
| **Component/file** | `src/pages/ProductionEntry.tsx`, `src/pages/Cartonization.tsx`, `src/lib/barcodeCarton.ts`, `src/lib/scanContract.ts` |
| **Reads Supabase?** | **YES** |
| **Writes Supabase?** | **YES** — batches, cartons, carton_contents, movements |
| **Tables/RPCs** | `ols_production_batches`, `ols_cartons`, `ols_carton_contents`, `ols_dpl_*`, `ols_finance_pi_*` |
| **Mock/demo?** | **PARTIAL** |
| **Barcode/label real?** | **PARTIAL** — Central mode: `CTN-SO-{order}`; legacy: `CTN-YYYYMMDD-####`; carton label barcode uses central when order matches `SO-YYYY-NNNNNN` regex |
| **Central can consume?** | **PARTIAL** — carton identity scan payload only (not full pack hierarchy) |
| **Missing stitching** | Single canonical carton ID; carton index/total enforcement; pack hierarchy export to Central; production label scans not submitted to Central |
| **Risk** | **HIGH** — dual barcode modes; legacy cartons invisible to Central CTN-SO gate path |

---

### 8. Operational Scan Record Creation

| Field | Value |
|-------|-------|
| **Route/path** | `/gate`, `/cartons` (identity verify) |
| **Component/file** | `src/lib/scanService.ts`, `src/pages/GateScan.tsx`, `src/pages/Cartonization.tsx` |
| **Reads Supabase?** | **YES** — orders, idempotency check on `ols_scan_history` |
| **Writes Supabase?** | **YES** — `ols_scan_history`, `ols_gate_scans` |
| **Tables/RPCs** | `ols_scan_history`, `ols_gate_scans`; metadata: `central_idempotency_key`, `central_payload`, `central_sync_status` |
| **Mock/demo?** | **PARTIAL** — demo fallback on write failure |
| **Barcode/label real?** | **YES** — CTN-SO verify/compare is real contract logic |
| **Central can consume?** | **PARTIAL** — payload built locally; submit is separate step |
| **Missing stitching** | Production-label scan events; shipping QR scan → Central; offline scan queue (only audit queue exists) |
| **Risk** | **MEDIUM** — idempotency scoped to local `ols_scan_history` limit 1000 rows in checks |

---

### 9. Central Integration / Read Path

| Field | Value |
|-------|-------|
| **Route/path** | `/gate`, `/cartons` (CentralPayloadPreview); edge function |
| **Component/file** | `src/lib/centralSubmit.ts`, `src/components/CentralPayloadPreview.tsx`, `supabase/functions/submit-central-scan/index.ts` |
| **Reads Supabase?** | **YES** — `ols_central_scan_submissions`, `ols_scan_history` |
| **Writes Supabase?** | **YES** — submissions table + scan_history metadata patch |
| **Tables/RPCs** | `ols_central_scan_submissions` (migration in `db/ols_central_scan_submissions.sql` — **manual apply**); edge function `submit-central-scan` |
| **Mock/demo?** | **YES** — `localStorage` key `ols_central_scan_submissions_mock`; dry-run `DRY-RUN-{timestamp}` when `CENTRAL_SCAN_INGEST_URL` unset |
| **Barcode/label real?** | N/A |
| **Central can consume?** | **PARTIAL** — POST ingest when URL + secrets configured; **disabled by default** (`VITE_CENTRAL_SCAN_SUBMIT_ENABLED=false`) |
| **Missing stitching** | Central ingest endpoint implementation; production/shipping scan types; read API for Central to query issued labels; webhook on label issuance |
| **Risk** | **HIGH** — operators may believe scans reached Central while in preview/dry-run/mock mode |

**Central payload types implemented:**

| scan_type | verification_type | scan_source |
|-----------|-------------------|-------------|
| `dispatch_gate` | `gate_check` | `barcode_app_gate_scan` |
| `carton` | `identity_match` | `barcode_app_carton_scan` |

`source_app` = `barcode_app` (constant in `scanContract.ts`).

---

### 10. Mock / Demo / Local-Only Screens

| Module | Route | File | Mock? | Notes |
|--------|-------|------|-------|-------|
| Demo data store | (all) | `src/lib/demoStore.ts` | **YES** | Full `ols_*` mirror in `localStorage` |
| Auth bypass | (all) | `src/components/AuthGate.tsx` | **YES** | No login when Supabase env missing |
| Settings permissions | `/settings` | `src/pages/Settings.tsx` | **YES** | Matrix is visual only; "Save" is toast placeholder |
| Reprint role stub | `/reprints` | `src/pages/Reprints.tsx` | **YES** | `localStorage ols_role` when no Supabase |
| Templates preview | `/templates` | `src/pages/Templates.tsx` | **YES** | Fixed demo product/barcode |
| Central submit mock | `/gate`, `/cartons` | `src/lib/centralSubmit.ts` | **YES** | `MOCK-CENTRAL-*` references |
| Demo reset | `/settings` | `Settings.tsx` | **YES** | `demo.reset()` |
| Live/demo banner | (shell) | `src/components/AppShell.tsx` | **YES** | Shows mode; does not block writes in demo |

**Risk:** **CRITICAL** — production misconfiguration (missing env, RLS denial, timeout) silently continues in demo mode with no hard stop.

---

### 11. Live Write Paths

All writes go through `insertRow` / `updateRow` in `src/lib/data.ts` (Supabase → demo fallback).

| Write surface | Tables written | Trigger |
|---------------|----------------|---------|
| Production entry | `ols_production_batches`, `ols_production_labels`, `ols_stock_units`, `ols_inventory_movements`, `ols_print_logs` | Generate labels |
| Cartonization | `ols_cartons`, `ols_carton_contents`, `ols_inventory_movements`, `ols_print_logs` | Pack flow |
| DPL | `ols_dpl_documents`, `ols_dpl_cartons` | Generate DPL |
| Finance PI | `ols_finance_pi`, `ols_finance_pi_cartons`, `ols_finance_pi_lines` | Scan/clear PI |
| Shipping | `ols_shipping_labels`, `ols_print_logs` | Generate label |
| Gate (legacy QR) | `ols_gate_scans`, `ols_scan_history`, `ols_audit_logs`, `ols_inventory_movements` | Shipping QR scan |
| Gate (CTN-SO) | `ols_gate_scans`, `ols_scan_history` | Central barcode scan |
| Gate (legacy green) | `ols_cartons`, `ols_shipping_labels` | Status → dispatched |
| Scan service | `ols_scan_history`, `ols_gate_scans` | Verified scans |
| Central submit (client) | `ols_scan_history` metadata | Submit/retry |
| Central submit (edge) | `ols_central_scan_submissions`, `ols_scan_history` | Edge function |
| Reprint modal | `ols_reprint_requests`, `ols_print_logs`, `ols_audit_logs` | Reprint flow |
| Reprint policy | `ols_reprint_requests`, `ols_audit_logs` | Approve/reject |
| Printers calibrate | `ols_printers` (`settings` field) | Save profile |
| Audit helper | `ols_audit_logs` | `audit()` + offline queue |

**No RPC calls** anywhere in `src/`. **No deletes** exposed in data layer.

**Risk:** **HIGH** — writes may land in `localStorage` demo DB without operator awareness.

---

## Supporting Modules (Pages & Libraries)

| # | Module | Route | Primary file(s) | Reads SB | Writes SB | Mock | Gen real | Central | Risk |
|---|--------|-------|-----------------|----------|-----------|------|----------|---------|------|
| 12 | Dashboard | `/` | `Dashboard.tsx` | YES | NO | PARTIAL | — | NO | LOW |
| 13 | Stock units | `/stock` | `StockUnits.tsx` | YES | NO | PARTIAL | — | NO | LOW |
| 14 | DPL documents | `/dpl` | `DPL.tsx` | YES | YES | PARTIAL | PARTIAL | NO | MEDIUM |
| 15 | Finance PI | `/finance` | `FinancePI.tsx` | YES | YES | PARTIAL | — | NO | MEDIUM |
| 16 | Dispatch bundle | `/dispatch` | `DispatchBundle.tsx` | YES | NO | PARTIAL | PARTIAL | NO | LOW |
| 17 | Traceability | `/trace` | `Traceability.tsx`, `traceSearch.ts` | YES | NO | PARTIAL | — | NO | LOW |
| 18 | Print logs | `/print-logs` | `PrintLogs.tsx` | YES | NO | PARTIAL | — | NO | LOW |
| 19 | Reprints | `/reprints` | `Reprints.tsx`, `reprintPolicy.ts` | YES | YES | YES | — | NO | MEDIUM |
| 20 | Reports | `/reports` | `Reports.tsx`, `reports.ts` | YES | NO | PARTIAL | — | NO | LOW |
| 21 | Printers | `/printers` | `Printers.tsx` | YES | YES | PARTIAL | PARTIAL | NO | MEDIUM |
| 22 | Data layer | — | `data.ts`, `supabase.ts` | PARTIAL | PARTIAL | YES | — | — | **CRITICAL** |
| 23 | Offline queue | — | `offlineQueue.ts`, `audit.ts` | — | PARTIAL | YES | — | NO | MEDIUM |
| 24 | Auth / roles | `/login` | `AuthGate.tsx`, `roles.ts` | PARTIAL | NO | YES | — | PARTIAL | HIGH |
| 25 | Edge function | — | `submit-central-scan/index.ts` | YES | YES | YES (dry-run) | — | PARTIAL | HIGH |

**Total modules audited: 25** (11 scope areas + 14 supporting modules).

---

## A. Existing Usable Barcode / Label Modules

These work today for **local/staging** operations when Supabase is configured and migrations applied:

| Capability | Status | Location |
|------------|--------|----------|
| CODE128 SVG barcode (density-aware) | Usable | `Barcode.tsx`, `labelGeometry.ts` |
| QR on shipping labels | Usable | `LabelPreview.tsx`, `ShippingLabel.tsx` |
| Production label issuance (`PL-*`) | Usable | `ProductionEntry.tsx` |
| Carton pack + content linking | Usable | `Cartonization.tsx` |
| CTN-SO Central barcode derive/verify | Usable | `scanContract.ts`, `barcodeCarton.ts` |
| TSPL/ZPL command preview | Usable | `printerCommands.ts`, `Templates.tsx` |
| Traceability chain search | Usable | `Traceability.tsx` |
| Reprint policy (2nd+ needs approval) | Usable | `reprintPolicy.ts`, `ReprintModal.tsx` |
| Central scan payload build + preview | Usable | `scanService.ts`, `CentralPayloadPreview.tsx` |
| Central submit (staging) | Usable if deployed | Edge function + env secrets |

---

## B. Mock / Demo / Local-Only Modules

| Item | Evidence |
|------|----------|
| Full offline DB | `demoStore.ts` — `ols_demo_db_v1` in localStorage |
| Catalogue data | 5 products, 2 orders — not from AI Studio |
| Auth optional | `AuthGate.tsx` — no Supabase = no login |
| Central submit mock | `centralSubmit.ts` — `MOCK-CENTRAL-*` |
| Central dry-run | Edge function without `CENTRAL_SCAN_INGEST_URL` |
| Template save | Button non-functional |
| Permissions matrix | `Settings.tsx` — placeholder save |
| Physical print | Clipboard / browser print only |
| Printer settings column | UI writes `ols_printers.settings`; migration defines `ols_printer_settings` table instead |

---

## C. Live Write Paths

See **Section 11** table above. Summary:

- **15+ distinct write surfaces** across production → gate pipeline.
- All funnel through `data.ts` with **silent demo fallback**.
- Edge function adds writes to `ols_central_scan_submissions` (requires manual SQL + deploy).
- **No writes** to non-`ols_*` tables (Central/AI Studio catalogue safe from this app).

---

## D. Missing Tables / RPCs / Functions

| Gap | Notes |
|-----|-------|
| `ols_central_scan_submissions` | SQL file exists (`db/ols_central_scan_submissions.sql`) but not in `ols_init.sql` — may be unapplied |
| `ols_print_jobs` | Defined in schema, **never used** in app |
| `ols_printer_settings` | Defined in schema, **never used** (UI uses `ols_printers.settings` instead) |
| `ols_manual_override_logs` | Schema only |
| `ols_permissions` | Schema only; UI is hardcoded checkboxes |
| `ols_settings` | Schema only |
| `ols_profiles_light` | Schema only |
| **RPC: sync products from AI Studio** | Does not exist |
| **RPC: sync orders from Central** | Does not exist |
| **RPC: allocate label/barcode sequence** | Does not exist |
| **RPC: resolve barcode authority** | Does not exist |
| **Edge: product-cache-sync** | Does not exist |
| Central read API for issued labels | Does not exist |

---

## E. Central Integration Gaps

| Gap | Impact |
|-----|--------|
| `VITE_CENTRAL_SCAN_SUBMIT_ENABLED=false` by default | Submit UI hidden/disabled |
| `CENTRAL_SCAN_INGEST_URL` likely unset | Dry-run only |
| Only 2 scan types (`dispatch_gate`, `carton`) | Production/shipping scans not in Central |
| `source_app: barcode_app` | Central must implement ingest contract |
| No label master read path | Central cannot query "what barcode did Trace issue?" |
| Legacy gate path (`shipping QR`) | Local state mutation only; no Central submit |
| Carton dual identity | Central CTN-SO vs legacy CTN date codes |
| JWT `ols_roles` required for submit | Must be provisioned in Supabase Auth metadata |
| Service role on edge function | Required for idempotency table writes |

---

## F. AI Studio Integration Gaps

| Gap | Impact |
|-----|--------|
| No sync from AI Studio approved products | Cache is manually seeded |
| `external_ref` never populated | Cannot trace label back to AI Studio product record |
| No shared-table read | App does not read AI Studio `products` / catalogue tables |
| No approval gate | Any cache row (including demo) can be labeled |
| No version/effective-date on cache | Stale SKU weights/shelf life possible |
| Orders cache same gap | `ols_orders_cache` is seed data, not live SO feed |
| No event/webhook on AI Studio publish | Trace unaware of catalogue changes |

---

## G. Recommended Safest Next PR

**Title:** Read-only AI Studio → `ols_products_cache` sync (edge function or scheduled job)

**Why safest:**

1. **Read-only toward AI Studio** — no writes to shared catalogue tables.
2. **No change to barcode issuance logic** — reduces regression risk.
3. **Uses existing cache schema** — `external_ref`, `sku`, weights, shelf life already defined.
4. **Unblocks authority path incrementally** — production can refuse labels when `external_ref` is null (follow-up PR).
5. **Does not require Central ingest endpoint** — independent of scan-submit wiring.

**Scope (single PR):**

- Edge function `sync-products-cache` (or Supabase cron) that UPSERTs approved AI Studio products into `ols_products_cache` by `external_ref` + `sku`.
- Feature flag `VITE_PRODUCT_SYNC_ENABLED`.
- Dashboard banner: "Catalogue last synced at …" / stale warning.
- **Do not** enable silent demo fallback for production catalogue reads in same PR (separate hardening PR).

**Alternative (if Central scan is higher priority):** Apply `ols_central_scan_submissions` migration + deploy edge function in staging with `CENTRAL_SCAN_INGEST_URL` unset (dry-run validation only). Lower catalogue value, higher operational risk if misconfigured.

---

## H. Can Trace Safely Receive Approved Product Data from AI Studio Now?

**No.**

| Criterion | Status |
|-----------|--------|
| Inbound sync mechanism | **Missing** |
| `external_ref` linkage | **Unused** |
| Approval enforcement at label time | **Missing** |
| Demo fallback on catalogue read failure | **Active risk** |
| Stale data detection | **Missing** |
| Audit of catalogue source | **Missing** |

Trace can **display** seeded/demo products and **issue labels** against them, but that is not "safely receiving approved product data" from AI Studio. Until a one-way, audited sync exists—and demo fallback is blocked for catalogue operations—AI Studio should remain the catalogue authority and Trace should be treated as a **downstream label workstation only**.

---

## Readiness Matrix: Barcode / Label Identity Master

| Requirement | Ready? |
|-------------|--------|
| Single source of truth for barcode allocation | **NO** |
| Catalogue tied to AI Studio approvals | **NO** |
| Physical print authority | **NO** |
| Central can verify all issued identities | **NO** |
| No silent offline/demo writes in production | **NO** |
| Template versioning & persistence | **NO** |
| End-to-end audited issuance chain | **PARTIAL** |
| CTN-SO carton contract with Central | **PARTIAL** |
| Operational traceability within Trace | **YES** (local `ols_*`) |
| On-screen barcode/QR rendering | **YES** |

**Overall readiness to act as Barcode / Label Identity Master: NOT READY (≈35% — strong UI/schema foundation, weak ecosystem stitching).**

---

## Confirmation

This audit was **read-only**:

- No application code changed (except this document).
- No SQL executed.
- No migrations applied.
- No Supabase or Oasis Central modifications.
- No Oasis AI Studio modifications.

---

*Generated by Oasis Trace Barcode & Label Authority Reality Audit — 2026-06-09.*

# Barcode App Sprint 1 — Audit & Baseline Report

**Repo:** `oasisbaklawa2006/oasis-trace` (OASIS Label Studio)  
**Date:** 2026-06-02  
**Sprint scope:** Audit, tooling baseline, Central scan contract readiness (no full integration)

---

## Executive summary

This repository is the **Oasis Label Studio** barcode/label/scan application (`oasis-trace`). It covers production labels, cartonization, DPL, finance PI, shipping labels, gate scan, traceability, and print governance. Sprint 1 adds a **typecheck script**, **CI quality gate**, **Central scan contract helpers** (`src/lib/scanContract.ts`), **barcode utility tests**, and documents gaps for Sprint 2.

---

## 1. Routes

| Path | Page | Purpose |
|------|------|---------|
| `/` | Dashboard | KPIs, recent scans/prints |
| `/production` | ProductionEntry | Batch + production label generation |
| `/stock` | StockUnits | Stock unit status |
| `/cartons` | Cartonization | Pack cartons, scan PL labels |
| `/dpl` | DPL | Dispatch packing list |
| `/finance` | FinancePI | PI assembly via carton scan |
| `/dispatch` | DispatchBundle | Dispatch document bundle |
| `/shipping` | ShippingLabel | Shipping label + QR |
| `/gate` | GateScan | Exit gate QR/shipping scan |
| `/trace` | Traceability | Cross-entity search |
| `/printers` | Printers | Printer profiles |
| `/templates` | Templates | Label templates |
| `/print-logs` | PrintLogs | Print audit |
| `/reprints` | Reprints | Reprint approval workflow |
| `/reports` | Reports | PDF/CSV reports (lazy) |
| `/settings` | Settings | Env/mode info |

Auth: `AuthGate` wraps all routes; login required when Supabase is configured.

---

## 2. DB tables used (`ols_*` prefix)

All app tables are defined in `db/ols_init.sql` and accessed via `src/lib/data.ts`:

- **Master/cache:** `ols_profiles_light`, `ols_departments`, `ols_products_cache`, `ols_orders_cache`
- **Print:** `ols_printers`, `ols_printer_settings`, `ols_label_templates`, `ols_print_jobs`, `ols_print_logs`, `ols_reprint_requests`
- **Production:** `ols_production_batches`, `ols_production_labels`, `ols_stock_units`, `ols_inventory_movements`
- **Cartons/DPL:** `ols_cartons`, `ols_carton_contents`, `ols_dpl_documents`, `ols_dpl_cartons`
- **Finance/dispatch:** `ols_finance_pi`, `ols_finance_pi_cartons`, `ols_finance_pi_lines`, `ols_dispatch_document_bundles`
- **Shipping/gate:** `ols_shipping_labels`, `ols_gate_scans`
- **Audit/scan:** `ols_scan_history`, `ols_manual_override_logs`, `ols_audit_logs`, `ols_permissions`, `ols_settings`

Central/Catalogue tables are **not** written to; only nullable `external_ref` / `order_ref` text fields link outward.

---

## 3. Storage buckets

**None.** The app uses Supabase Postgres only (no `storage.from()` calls). Label output is browser print / TSPL-ZPL download.

---

## 4. Scan model (current)

| Context | Table | Fields | Notes |
|---------|-------|--------|-------|
| Gate | `ols_gate_scans` | `qr_ref`, `shipping_label_id`, `result`, `reason` | GREEN/RED decision on shipping QR |
| Timeline | `ols_scan_history` | `scan_value`, `scan_context`, `result`, `metadata` | Generic scan log (`gate`, etc.) |
| Carton pack | `ols_carton_contents` + movements | PL `label_no` scan | Not Central-shaped |
| Finance PI | carton `carton_no` scan | Internal PI assembly | |
| UX | `useScanLoop` | dedup/cooldown/torch | Client-side duplicate suppression |

**Gap:** No `scan_type`, `verification_type`, `source_app`, or `order_id` UUID fields on scan rows today.

---

## 5. Barcode generation model

- **Library:** `jsbarcode` (CODE128) in `src/components/Barcode.tsx`
- **Human IDs:** `src/lib/numbering.ts` — `PL-`, `CTN-` (date-based), `DPL-`, `SHP-`, `QR-` refs
- **Carton barcodes today:** `CTN-YYYYMMDD-####` via `num.carton()`, **not** `CTN-SO-*`
- **Sprint 1 addition:** `scanContract.generateCartonOrderBarcode("SO-2026-000136")` → `CTN-SO-2026-000136` for Central alignment

---

## 6. Label print/export model

- Preview: `LabelPreview` + `labelGeometry` safe zones
- Printer commands: `printerCommands.ts` (TSPL/ZPL)
- Print lock / reprint policy: `printLock.ts`, `reprintPolicy.ts`
- Logs: `ols_print_logs`, `ols_reprint_requests`
- Offline queue: `offlineQueue.ts` (localStorage, flush on reconnect)
- Export: `exporters.ts`, `reports.ts` (jspdf)

---

## 7. Order/SO lookup model

- **Source:** `ols_orders_cache` (seeded in SQL; not live-synced from Central in app code)
- **Usage:** Cartonization + DPL select `order_number` as `order_ref` on cartons/DPL
- **Gap:** No API to fetch live SO from Central by UUID

---

## 8. Product/SKU lookup model

- **Source:** `ols_products_cache` (local seed + manual metadata)
- **Usage:** Production entry, PI line rollup, trace search
- **Gap:** No live Catalogue sync

---

## 9. Auth / RLS risks

| Risk | Severity | Detail |
|------|----------|--------|
| Permissive RLS (MVP) | High | `ols_init.sql` grants all authenticated users full read/write on all `ols_*` tables |
| Demo mode without auth | Medium | Missing env vars bypass `AuthGate` — OK for dev, not production |
| Client-side role bypass | High | `reprintPolicy.ts` uses `localStorage.ols_role` — not server-enforced |
| `.env` in git history | Critical | `.env` was tracked; Sprint 1 removes from index + `.gitignore` |
| No service role in frontend | OK | Only `VITE_SUPABASE_ANON_KEY` used |

Production hardening script exists: `db/ols_enable_rls_authenticated.sql` (run only at launch, per file warnings).

---

## 10. Central integration readiness

### Target contract (Sprint 2)

**Dispatch gate** — see `buildDispatchGateScanPayload()` in `src/lib/scanContract.ts`.

**Carton identity** — see `buildCartonIdentityScanPayload()`.

### Readiness checklist

| Item | Status |
|------|--------|
| Payload types + builders | Done (Sprint 1) |
| CTN-SO generate/parse/match tests | Done (Sprint 1) |
| Idempotency key helper | Done (Sprint 1) |
| GateScan emits Central payload | Not started |
| Cartonization uses CTN-SO barcodes | Not started |
| `order_id` UUID from Central | Not started |
| Webhook/API to Central | Not started |
| Align `ols_gate_scans` schema | Not started |

---

## 11. Build/test status (Sprint 1 baseline)

Run locally / CI:

```bash
npm install
npm run typecheck
npm run build
npm run test
```

CI workflow: `.github/workflows/ci.yml`

---

## 12. Dangerous issues

1. **`.env` committed** — rotate keys if repo was ever public; use `.env` locally only.
2. **Gate scan mutates state without Central proof** — dispatched status set locally only.
3. **Carton numbering mismatch** — `num.carton()` vs Central `CTN-SO-*` format.
4. **Reprint admin via localStorage** — must move to JWT claims / `ols_user_roles`.
5. **Demo fallback masks RLS failures** — operators may think data synced when in demo mode.
6. **No Vercel config in repo** — deployment settings are platform-side only.

---

## Sprint 1 files changed

- `src/lib/scanContract.ts` — Central payload builders + CTN-SO utilities
- `src/lib/scanContract.test.ts` — unit tests
- `package.json` — `typecheck` script
- `.github/workflows/ci.yml` — CI gate
- `.env.example` — documented vars
- `.gitignore` — ignore `.env`
- `docs/BARCODE_APP_SPRINT_1_AUDIT_AND_BASELINE_REPORT.md` — this report

---

## Next sprint recommendation

1. **Unify carton barcode format** — switch cartonization to `CTN-SO-{order_number}` (with index suffix if needed).
2. **Wire GateScan** — after verification, call Central connector with `buildDispatchGateScanPayload`.
3. **Extend `ols_scan_history`** — add JSONB `central_payload` or dedicated `ols_central_scan_events` table (migration with approval).
4. **Orders/products sync** — read-only pull from Central APIs into `ols_*_cache`.
5. **Server-side roles** — replace `localStorage.ols_role` with Supabase custom claims.
6. **Remove demo fallback in production builds** — fail loud when Supabase unreachable.

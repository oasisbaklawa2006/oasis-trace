# Phase 1 — Reprint Approval Workflow

Build a real pending → approved/rejected pipeline on top of the existing `ols_reprint_requests` table. No schema migration; we use columns we already write (`status`, `approver`, `reason`) plus JSONB `metadata` for `approval_remarks`, `approved_at`, `override_by`, `reprint_seq`.

- `src/lib/reprintPolicy.ts`
  - `getReprintCount(refType, refId)` — counts prior approved reprints from `ols_print_logs`.
  - `requiresApproval(count)` — true for 2nd reprint onward.
  - `canOverride(user)` — checks `localStorage` `ols_role` (`supervisor` | `admin`); architecture-ready for a future `ols_user_roles` table without enabling RLS now.
- `src/components/ReprintModal.tsx` (extend)
  - If `requiresApproval`: writes `ols_reprint_requests` with `status='pending'`, blocks the print, shows toast "Awaiting supervisor approval".
  - Supervisor override toggle (visible only when `canOverride`): flips to `status='approved'`, stamps `metadata.override_by`, allows immediate print.
  - Watermark text passes through to the printer payload as `DUPLICATE COPY` (TSPL/ZPL `watermark` already supported in `printerCommands.ts`) and `LabelPreview watermark` prop.
- `src/pages/Reprints.tsx` (extend)
  - Tabs: Pending / Approved / Rejected / All.
  - Row actions for supervisors: Approve (with remarks), Reject (with remarks). Writes back `status`, `metadata.approval_remarks`, `metadata.approved_at`, `approver`.
  - Re-fires the queued print when a pending request is approved.

# Phase 2 — Advanced Traceability Search

Single search box drives all entity types via a normalized search index built client-side from `ols_` tables.

- `src/lib/traceSearch.ts`
  - `buildIndex()` — pulls `ols_production_labels`, `ols_cartons`, `ols_dpl`, `ols_finance_pi`, `ols_shipping_labels`, `ols_gate_scans`, `ols_customers`, `ols_orders` once, normalizes to `{ kind, id, ref, label, keywords[] }`, caches in `react-query` (5 min stale).
  - Fuzzy matcher using lightweight Levenshtein + token prefix score (no new dep).
  - Entity routing: maps each result to the existing chain resolver in `Traceability.tsx`.
- `src/pages/Traceability.tsx` (extend)
  - Quick Scan toggle (autofocus loop, large input).
  - Recent searches in `localStorage` (`ols_recent_searches`, last 10).
  - Result chips by type (SKU / Batch / Label / Carton / DPL / PI / Invoice / QR / Shipping / Customer / Order).
  - One-click copy of the resolved chain JSON, CSV export of the timeline.

# Phase 3 — Audit Report Engine

New `src/pages/Reports.tsx` (already exists — rebuild content) + shared print/export module.

- `src/lib/reports.ts`
  - Six report builders, each returning `{ columns, rows, meta }`:
    - `batchTraceability(batchOrPlNo)`
    - `cartonMovement(dateRange)`
    - `dispatchVerification(dateRange)`
    - `gateClearance(dateRange)`
    - `printReprintAudit(dateRange)`
    - `financeDiscrepancy(dateRange)` — PI carton count vs attached, cartons missing DPL, etc.
  - Pure data — no UI — so they're reusable by future scheduled jobs.
- `src/lib/exporters.ts`
  - `toCSV(rows, columns)` (download via blob).
  - `toPrintableA4(report, opts)` — uses `PrintSheet.tsx` and `window.print()`.
  - `toPDF(report)` — uses `jspdf` + `jspdf-autotable` (small, already build-friendly; add as dep).
- `Reports.tsx`
  - Left rail: report selector. Center: filter form (date range, entity ref). Right: preview table. Top-right: Print A4 / Export CSV / Export PDF buttons.

# Phase 4 — Printer Stability + Profile Presets

- `src/lib/printerPresets.ts`
  - Static presets: `TSC_TE244` (203 dpi, gap 3mm, density 8, speed 4), `ZEBRA_GK420` (203 dpi, ZPL, darkness 10, speed 4), `XPRINTER_GENERIC` (203 dpi, TSPL, gap 2mm), `GENERIC_TSPL`, `GENERIC_ZPL`.
  - Each preset includes `thermalOffsetMm` (vertical compensation) and `xOffsetMm`.
- `src/lib/printerCommands.ts` (extend)
  - Apply `thermalOffsetMm` / `xOffsetMm` to first-element coords.
  - Auto module-width downscale for CODE128 if computed width > usable width (already partial — finalize).
  - Auto font scale: when `lines[i]` width estimate > usable, drop font size step until fits or 6pt floor.
  - QR fallback: if `qr.length > 180 chars` switch to error-correction `L` and increase module size for readability; warn on overflow.
- `src/components/Barcode.tsx` (extend) — surface the same overflow guard for on-screen previews so what users see matches what prints.
- `src/pages/Printers.tsx` (extend) — preset dropdown that pre-fills the calibration drawer; "Save as profile" persists merged settings to `ols_printers.settings` JSONB.

# Phase 5 — Warehouse Productivity

All client-only enhancements; reused by `GateScan.tsx`, `Cartonization.tsx`, and the future batch scan.

- `src/lib/scanFeedback.ts`
  - `playBeep(kind: 'ok' | 'error' | 'dup')` — WebAudio sine pulses (no asset).
  - `vibrate(pattern)` — `navigator.vibrate` guard for Android handhelds.
- `src/hooks/useScanLoop.ts`
  - Autofocus recovery (refocus on blur after 100ms), Enter-to-submit, debounced duplicate suppression (300ms).
  - `mode: 'single' | 'batch' | 'rapid-pack'`. Batch buffers scans and commits on Enter+Enter. Rapid-pack auto-advances cartons after N scans.
- `Cartonization.tsx` / `GateScan.tsx` (extend)
  - Mode toggle (Single / Batch / Rapid Pack), keyboard-only operation hints, OK/error sound + vibration on every scan result.

# Phase 6 — Operational Dashboard

Rebuild `src/pages/Dashboard.tsx` content (keep shell + theme).

- KPI cards (today, IST midnight rollover):
  - Labels printed, Cartons packed, Pending gate dispatch, Reprints raised, Failed scans, Dispatch clearance status.
- Printer status strip
  - Reads `ols_printers.last_seen_at` (write-through from test print); >5min = offline.
- Recent activity feed
  - Union of `ols_print_logs`, `ols_scan_history`, `ols_gate_scans` last 25, color-coded.
- All queries via `react-query` with `staleTime: 30s` and `refetchInterval: 30s`.

# Cross-cutting

- New deps: `jspdf`, `jspdf-autotable` (Phase 3 only).
- New tables: none. We piggyback on existing JSONB `metadata` / `settings` columns.
- No RLS changes. No anon policies. No Lovable Cloud. UI theme untouched.
- After each phase: smoke-test the existing seeded chain (`PL-20260511-9303 → CTN-20260511-6757 → DPL-20260511-865 → PI-20260511-205 → SHP-20260511-7665`) and verify CRUD + no regressions in production/carton/DPL/finance/shipping/gate flows.

# Technical notes

- Reprint approval state machine lives entirely in `ols_reprint_requests.status` + `metadata` to avoid migrations; a future migration can promote `metadata` keys to columns without code rewrite.
- `traceSearch` index is in-memory + react-query-cached; for >50k rows we'd swap to a Supabase RPC, but seeded volumes don't warrant it now.
- PDF export uses `jspdf-autotable` for table reports and a manual layout for batch traceability (mixed sections).
- Scan feedback is opt-in via a Settings toggle (`localStorage.ols_scan_feedback`) so silent warehouses aren't disrupted.
- Dashboard uses polling (not realtime) to stay portable across hosting (no Supabase realtime channels required).

# Out of scope

- Any DB migration, RLS toggle, anon policy, or schema rename.
- Visual redesign of cards, navigation, or color tokens.
- Backend/edge functions — everything stays Supabase-native + frontend.

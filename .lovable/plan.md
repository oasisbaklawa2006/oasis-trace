## Scope

Twelve enhancement areas across the printer/label/traceability layer of Oasis Label Studio. Keep current UI theme, RLS off, Supabase Auth gating intact, no Lovable Cloud, no anon policies. Pure frontend + Supabase-native.

I'll group the 12 priorities into 6 implementation phases that share code, so we don't rebuild the same primitives twice.

---

## Phase 1 — Print/Barcode Foundations (priorities 1, 2, 3)

New shared primitives used by every label screen:

- `src/lib/labelGeometry.ts` — mm↔px helpers at configurable DPI (203/300), safe-area insets, quiet-zone math for CODE128 / EAN13 / QR, recommended module width per DPI.
- `src/lib/printerCommands.ts` (extend) — richer TSPL/ZPL emitters for production / carton / shipping / DPL barcode payloads, with rotation (0/90/180/270), copies, gap, black-mark offset, darkness, speed.
- `src/components/LabelPreview.tsx` — single canvas-style preview component:
  - mm-to-pixel calibration (uses geometry helpers)
  - dashed safe-area border, optional 5 mm grid overlay
  - rotation prop, scale prop
  - text overflow → auto-shrink + ellipsis fallback
  - barcode centering, quiet-zone padding, overflow guard (downscale module width)
  - QR sizing rule: max 40% of shorter side, min 15 mm
- `src/components/Barcode.tsx` (extend) — pass DPI, quiet zone, target mm width; auto-pick module width so the symbol fits without clipping.

Wire `LabelPreview` into Production label cards, Carton labels, Shipping labels, and DPL header barcode.

## Phase 2 — Printer Management (priority 4)

`src/pages/Printers.tsx`:

- Test print button → emits TSPL/ZPL test pattern via `printerCommands`, copies to clipboard + opens print dialog.
- Calibration drawer: width / height / gap / black-mark offset / darkness / speed sliders bound to local state.
- "Save profile" persists to `ols_printers` row (`settings jsonb`); "Load profile" reads it back.
- Profile selector on each label preview screen so generated commands use that printer's settings.

## Phase 3 — DPL Print Layout + Shipping Bundle (priorities 5, 6)

- `src/pages/DPL.tsx`: print-only stylesheet (`@media print`) with A4 layout, carton-grouped tables, SKU rollup summary, page-break-inside avoid on carton blocks, header/footer repeat.
- `src/pages/DispatchBundle.tsx`: "Print Bundle" action renders a single printable document containing DPL + simplified packing list + PI summary + invoice ref + transport ref + gate pass + shipping label thumbnails, each section starting on a new page.
- Shared `src/components/PrintSheet.tsx` wrapper for consistent A4 margins/typography.

## Phase 4 — Traceability Timeline (priority 7)

Rework `src/pages/Traceability.tsx` results panel into a vertical timeline:

```
Production ─● Store ─● Carton ─● DPL ─● PI ─● Shipping ─● Gate ─● Dispatch
```

Each node shows ref number, timestamp, status pill, actor. Uses existing chain query — UI only.

## Phase 5 — Reprint Security + Mobile Warehouse (priorities 8, 9)

- `src/components/ReprintModal.tsx`: reason (required, enum), optional approver name, writes `ols_print_logs` with `is_reprint=true`, `reason`, `reprint_count`. All "Reprint" buttons (Production, Carton, Shipping, DPL) route through it.
- Reprinted previews render a diagonal "DUPLICATE" watermark + reprint counter badge.
- `src/pages/GateScan.tsx` and `src/pages/Cartonization.tsx`: mobile mode toggle (auto-on under 640 px) — large scan input, big GREEN/RED result, single-column layout, autofocus loop for handheld scanners ("fast scan mode"), one-hand thumb-reach button placement.

## Phase 6 — Performance + Error Handling (priorities 10, 11)

- `src/lib/queryClient.ts`: react-query keys per ols_ table; replace ad-hoc `useEffect → listTable` calls in hot pages (Cartonization, FinancePI, Traceability, Dashboard) with `useQuery` + `staleTime` for master data (printers, templates, customers).
- Optimistic updates for scan-add-to-carton and PI carton attach, with rollback on error.
- `src/lib/data.ts`: wrap insert/update with retry (2x, exponential), surface `23505` duplicate as friendly toast, 10 s timeout via `AbortController`, offline detector (`navigator.onLine`) → top banner.
- Printer failure state in test-print flow (try/catch around clipboard + print dialog).

---

## Out of scope / unchanged

- `db/ols_enable_rls_authenticated.sql` — not applied.
- No theme/visual redesign — same tokens, same shell, same colors.
- No Lovable Cloud, no anon policies, no schema migrations.

## Deliverables

New files:
- `src/lib/labelGeometry.ts`
- `src/components/LabelPreview.tsx`
- `src/components/PrintSheet.tsx`
- `src/components/ReprintModal.tsx`
- `src/lib/queryClient.ts` (keys + helpers)

Edited files:
- `src/lib/printerCommands.ts`, `src/lib/data.ts`, `src/components/Barcode.tsx`
- `src/pages/Printers.tsx`, `src/pages/Templates.tsx`
- `src/pages/ProductionEntry.tsx`, `src/pages/Cartonization.tsx`, `src/pages/ShippingLabel.tsx`
- `src/pages/DPL.tsx`, `src/pages/DispatchBundle.tsx`
- `src/pages/Traceability.tsx`, `src/pages/GateScan.tsx`
- `src/pages/Reprints.tsx`, `src/pages/PrintLogs.tsx`

After each phase I'll smoke-test in the live preview against the existing seeded chain (PL-20260511-9303 → … → SHP-20260511-7665) to confirm nothing regresses.
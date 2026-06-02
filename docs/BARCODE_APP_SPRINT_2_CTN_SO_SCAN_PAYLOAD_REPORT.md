# Barcode App Sprint 2 — CTN-SO Scan Flow & Central Payload Preview

**Repo:** `oasisbaklawa2006/oasis-trace`  
**Date:** 2026-06-02  
**Branch:** `cursor/barcode-sprint-2-ctn-so-scan-payload`

---

## Summary

Sprint 2 wires the Barcode App UI to generate, verify, and preview **Central-compatible scan payloads** for CTN-SO barcodes. Local scan history records events with idempotency keys. **No live Central submit** — preview and copy JSON only.

---

## Files changed

| File | Purpose |
|------|---------|
| `src/lib/scanContract.ts` | Legacy CTN classification, user messages, 4–6 digit SO support |
| `src/lib/scanService.ts` | Gate + carton identity flows, idempotency guard, local recording |
| `src/lib/barcodeCarton.ts` | Central vs legacy barcode display/metadata |
| `src/components/CentralPayloadPreview.tsx` | JSON preview, copy, idempotency key, readiness badge |
| `src/pages/GateScan.tsx` | CTN-SO dispatch_gate flow + legacy shipping QR |
| `src/pages/Cartonization.tsx` | CTN-SO identity verify, dual barcode display, pack guard |
| `src/lib/scanContract.test.ts` | Contract + legacy format tests |
| `src/lib/scanService.test.ts` | Service flow + duplicate guard tests |
| `src/lib/barcodeCarton.test.ts` | Metadata/display tests |

---

## Routes / pages changed

| Route | Page | Changes |
|-------|------|---------|
| `/gate` | GateScan | CTN-SO gate scan → `dispatch_gate` payload preview; shipping QR legacy path preserved |
| `/cartons` | Cartonization | CTN-SO identity scan → `carton` payload preview; central vs legacy barcode labels |

---

## CTN-SO behavior

- **Central barcode:** `CTN-SO-{order_number}` e.g. `SO-2026-0001` → `CTN-SO-2026-0001`
- **Legacy barcode:** `CTN-YYYYMMDD-####` stored in `carton_no` + `metadata.legacy_carton_no`
- **Metadata on new cartons:** `barcode_mode`, `central_barcode`, `legacy_carton_no`
- **Label preview:** prints Central barcode when order supports SO format; otherwise legacy ID
- **Gate:** scans `CTN-SO-*` → order lookup → match → payload; legacy CTN at gate shows format guidance
- **Cartonization:** Central orders must pass identity scan before pack & print

---

## Payload preview behavior

`CentralPayloadPreview` component shows:

- Exact JSON payload (`central_payload` shape)
- **Copy JSON** button
- **Idempotency key** string
- **Ready for Central sync** badge only when `verification_status === verified` and scan recorded
- Footer: “Preview only — no data is sent to Oasis Central”

Stored in `ols_scan_history.metadata`:

- `central_idempotency_key`
- `central_payload`
- `central_sync_status: "preview_only"`

---

## Duplicate guard behavior

- Before recording, `hasIdempotentScan()` checks `ols_scan_history` for matching `central_idempotency_key`
- Duplicate scan returns **“Scan already recorded”**, `ok: false`, `duplicate: true`
- **No second row** inserted — no false success toast (warning toast instead)
- Keys: `barcode_app|{scan_type}|{barcode}|{order_id}`

---

## Human messages

| Code | Message |
|------|---------|
| `gate_scan_verified` | Gate scan verified |
| `carton_identity_verified` | Carton identity verified |
| `wrong_carton_for_order` | Wrong carton for this order |
| `order_not_found` | Order not found |
| `barcode_format_invalid` | Barcode format invalid |
| `scan_already_recorded` | Scan already recorded |

---

## Tests run

```bash
npm run typecheck  # pass
npm run build      # pass
npm run test       # pass — 25 tests
```

---

## Remaining risks

1. **No live Central write** — payloads are local preview only until Sprint 3 connector.
2. **Permissive RLS** — unchanged; any authenticated user can insert scan history.
3. **Order cache stale** — `ols_orders_cache` still local/seed; unknown SO returns “Order not found”.
4. **Gate CTN-SO vs shipping QR** — two parallel flows; operators need training on which to scan.
5. **Reprint roles** — still client-side `localStorage` bypass risk.
6. **Idempotency scope** — last 1000 scan rows checked; long-running warehouses may need server-side unique index later.

---

## Next sprint recommendation (Sprint 3 — Central submit)

1. Add edge function or Central API client to POST verified payloads.
2. Mark `central_sync_status: submitted | failed` on success/error.
3. Sync `ols_orders_cache` read-only from Central before gate/carton flows.
4. Optional DB migration: unique index on `metadata->>'central_idempotency_key'` (with approval).
5. Harden RLS + JWT role claims before production submit.

---

## Ready for Sprint 3?

**Yes** — payload shapes, UI flows, idempotency, and local proof recording are in place. Sprint 3 can focus on authenticated outbound Central submit and sync status without reworking scan verification logic.

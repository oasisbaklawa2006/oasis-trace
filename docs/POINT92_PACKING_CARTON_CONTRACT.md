# Point 92 — Packing / Carton Contract Census

**ASM:** Central #459 defines Point 92 = packing / cartons canonical Trace contract.  
**Repo:** `oasisbaklawa2006/oasis-trace` (Trace authority)  
**Contract version:** `1.0` (`PACKING_CARTON_CONTRACT_VERSION`)  
**Trace main SHA (baseline):** `d61a7916e438f60e7d6dbf9b48af73b1a9e2fc5d` (post Point93 #31 merge)  
**Point92 branch head (rebased):** `188d9c0e57a4b3a7ccb71ff8c408683880c407f0`  
**Date:** 2026-09-07  
**Physical packing UAT:** Separate — `PR MERGED != Point92 cleared`

---

## Executive summary

Point 92 closes the **software contract** for Trace packing/carton composition truth. A fail-closed adapter (`src/lib/packingContract.ts`) validates create/pack/seal/reopen-governance, content totals, duplicate protection, and DPL handoff prerequisites. Trace consumes canonical backend identity (`ols_orders_cache`, `ols_production_labels`) and never invents weights, dimensions, or DPL values. Core/Central DPL authority is preserved via `ols_dpl_cartons` FK (`dplMembership.ts`).

**SOFTWARE CONTRACT / EVIDENCE ONLY** — no production mutation or physical-success claims.

---

## Census — carton/packing surfaces

| Surface | Identity / binding | Contents | Weights | Status | Scan/close | DPL | Evidence | Operator | Duplicate prevention | Dispatch visibility |
|---------|-------------------|----------|---------|--------|------------|-----|----------|----------|---------------------|---------------------|
| `ols_cartons` | `carton_no` (unique), `order_ref` → orders cache | via `ols_carton_contents` | `net_weight`/`gross_weight` at seal from labels | `draft` → `packed` → downstream | seal via `trace_finalize_carton_v1` | prerequisite: `packed` + contents | print log on label gen (Point 95) | `packed_by` (Core RPC) | `insertWithUniqueRetry` on `carton_no` | DPL, PI, shipping, gate |
| `ols_carton_contents` | `carton_id` FK, `production_label_id` | item = production label | per-label weights | immutable after seal | scan at pack | rollup into DPL | inventory movement | scan operator (UI session) | DB unique index on active label | trace chain |
| Cartonization UI | order select + CTN-SO (central) | label scan | computed at seal | draft while packing | identity verify + seal | — | Central payload preview (Point 93) | `useOlsSession` | packed Set + contract | recent cartons table |
| DPL page | order_ref filter | carton-wise rollup | from sealed carton | `packed` only | generate DPL RPC | `ols_dpl_cartons` FK (Core) | A4 print sheet | prepared_by | `validateDplHandoffBoundary` | dispatch bundle |
| Finance PI | carton barcode scan | via rollup | PI lines from labels | `packed`+ required | add to PI RPC | `validateCartonForPi` (FK) | cleared PI | session | duplicate PI link check | shipping labels |

---

## Risk findings (pre-Point-92 closure)

| Risk | Status after Point 92 |
|------|----------------------|
| Local-only carton truth without order binding | **Closed** — `validateCreateCarton` fail-closed on missing order |
| Duplicate carton IDs | **Mitigated** — DB unique + `duplicate_carton_no` contract check |
| Direct content edits after sealing | **Closed** — `content_edit_after_seal` / `carton_not_editable` |
| Quantities exceeding ordered stock | **Closed when metadata present** — `validateOrderPackTotals`; no shadow truth when absent |
| Missing order/item binding | **Closed** — order + label resolution required |
| Packing completion without evidence | **Closed** — seal requires contents + weight authority |
| Trace data competing with Core/Central DPL | **Preserved** — DPL FK via Core RPC; `dplMembership.ts` boundary unchanged |

---

## Boundary separation

| Point | Scope | Trace module | Not absorbed by Point 92 |
|-------|-------|--------------|--------------------------|
| **92** | Carton composition / packing truth | `packingContract.ts` | — |
| **93** | Central↔Trace scan transport | `centralTraceContract.ts` | CTN-SO submit envelope, offline retry transport |
| **94** | Barcode identity | `scanContract.ts`, `barcodeCarton.ts` | Barcode generation/classification |
| **95** | Print / reprint | `reprintPolicy.ts`, `labelPrintLog.ts` | Physical print execution |
| **96** | Scan retry | `scanSubmitQueue.ts` | Offline queue recovery |
| **97** | Physical custody handoff | — (separate UAT) | Gate physical dispatch |

---

## Contract adapter (Point 92 addition)

| Function | Purpose |
|----------|---------|
| `validateCreateCarton` | Order must exist in canonical cache; optional duplicate `carton_no` guard |
| `validateAddContent` | Draft-only edits; no duplicate/active-label collisions |
| `validateSealCarton` | Non-empty; CTN-SO verified for central orders; weight authority from labels |
| `computeCartonWeights` | Sum from production labels only — never invent |
| `validateOrderPackTotals` | Overpack guard when order metadata carries line quantities |
| `validateReopenGovernance` | Sealed carton reopen requires explicit approval |
| `validateDplHandoffBoundary` | Packed + proven contents + order binding before DPL RPC |
| `validatePackedCartonForDownstream` | Finance PI / downstream requires sealed carton |
| `isPermanentPackingFailure` | Integrity violations are non-retryable |

Wired into `Cartonization.tsx`, `DPL.tsx`, and `FinancePI.tsx`.

Programmatic export: `PACKING_PRODUCER_CONSUMER_MATRIX` in `src/lib/packingContract.ts`.

---

## Contract test matrix

| Scenario | Test file |
|----------|-----------|
| Create with canonical order | `packingContract.test.ts` |
| Pack / add content | `packingContract.test.ts` |
| Seal with identity gate | `packingContract.test.ts` |
| Reopen governance | `packingContract.test.ts` |
| Content totals / weights | `packingContract.test.ts` |
| Duplicate label protection | `packingContract.test.ts` |
| Overpack when metadata present | `packingContract.test.ts` |
| DPL handoff boundary | `packingContract.test.ts`, `dplMembership.test.ts` |
| Central scan identity (adjacent) | `scanService.test.ts` |
| DPL FK membership (adjacent) | `dplMembership.test.ts` |

---

## Remaining physical / ops dependencies (not closed by Point 92)

- Physical packing / mobile-scanner UAT certification
- Core RPC deployment verification (`trace_finalize_carton_v1`, `trace_create_dpl_v1`)
- Real printer / scale integration (Point 95)
- Physical custody handoff (Point 97)

`PR MERGED != Point92 cleared` until real packing/carton/mobile-scanner UAT is certified.

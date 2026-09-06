# Point 93 — Central↔Trace Contract Census

**ASM:** Central #459 defines Point 93 = Central–Trace software contract.  
**Repo:** `oasisbaklawa2006/oasis-trace` (Trace authority)  
**Contract version:** `1.0` (`CENTRAL_TRACE_CONTRACT_VERSION`)  
**Date:** 2026-09-06  
**Trace main SHA (baseline):** `a5c347311325607a0a82b1ffe6f76ffd0b44ce1f`  
**Physical scanner UAT:** Separate (#462 / original Point96 offline retry lane)

---

## Executive summary

Trace main already carries Sprints 1–3 Central scan contract helpers, CTN-SO scan flows, feature-flagged Central submit, and Point96 offline retry. Point 93 closes the **software contract** gap by adding an explicit fail-closed adapter (`src/lib/centralTraceContract.ts`) with producer/consumer matrix, typed validation, idempotency consistency checks, and contract tests. No new order/barcode truth is invented in Trace.

---

## Producer / consumer matrix

| Surface | Canonical owner (producer) | Consumer | Auth boundary | Idempotency key | Failure semantics |
|---------|---------------------------|----------|---------------|-----------------|-------------------|
| `CTN-SO-{order_number}` barcode | Trace (`scanContract`) | Central gate + carton ingest | Trace verifies locally | `barcode_app\|{scan_type}\|{barcode}\|{order_id?}` | mismatch → rejected locally |
| Legacy `CTN-YYYYMMDD-####` | Trace (`numbering`) | Trace legacy gate only | Trace-only | n/a | local RED; no Central handoff |
| `dispatch_gate` payload | Trace (`scanService`) | Central via Core edge fn | JWT `ols_roles` + HMAC | `scanIdempotencyKey(...)` | duplicate → `scan_already_recorded` |
| `carton` identity payload | Trace (`scanService`) | Central via Core edge fn | JWT `ols_roles` + HMAC | `scanIdempotencyKey(...)` | duplicate → `scan_already_recorded` |
| Submit envelope | Trace client (`centralSubmit`) | `submit-central-scan` → Central URL | Supabase session; secrets server-side | client key; DB dedup | 409 duplicate; 502 Central reject |
| Offline retry queue | Trace (`scanSubmitQueue`, Point96) | Same submit path | `ownerUserId` match on replay | unchanged across retries | transient backoff; permanent visible |
| Order truth (`order_id`, `SO-*`) | Core/Central (`ols_orders_cache`) | Trace read-only reference | Core-owned | n/a | `order_not_found` fail-closed |
| Routes `/gate`, `/cartons` | Trace (`App.tsx`) | Operator browser | `AuthGate` + roles | n/a | unauthenticated block |

Programmatic export: `CENTRAL_TRACE_PRODUCER_CONSUMER_MATRIX` in `src/lib/centralTraceContract.ts`.

---

## Merged bridge PRs (Trace)

| PR | Lane | Status |
|----|------|--------|
| #1 | Sprint 1: audit, CI, `scanContract` | Merged |
| #2 | Sprint 2: CTN-SO scan flow + payload preview | Merged |
| #3 | Sprint 3: Central submit + auth (feature-flagged) | Merged |
| #18 | Point96: offline scan retry + recovery certification | Merged |

---

## Contract adapter (Point 93 addition)

| Function | Purpose |
|----------|---------|
| `resolveCentralOrderId` | Map `ols_orders_cache.external_ref` → canonical Central UUID; null when unbound |
| `stampContractVersion` | Emit `contract_version: "1.0"` on producer payloads |
| `finalizeCentralScanHandoff` | Producer fail-closed: stamp + validate envelope before `ready_to_submit` |
| `validateCentralScanPayload` | Zod fail-closed v1.0 shape check (`.strict()`; unknown top-level fields rejected) |
| `validateIdempotencyKeyConsistency` | Key must match payload identity |
| `validateCentralSubmitEnvelope` | Full pre-submit gate in `centralSubmit` |
| `isPermanentContractFailure` | Contract rejections are non-retryable |
| `isPermanentSubmitFailureReason` | Shared permanent failure set for submit + offline queue |

**v1.0 identity binding:** `scanService` uses `external_ref` (not local cache `id`) for `order_id` and idempotency keys. Orders without a valid Central UUID binding return `central_order_unbound` with `preview_only` sync — local audit only, no Central handoff.

Wired into `scanService` (producer), `submitCentralScan` (consumer), and `scanSubmitQueue` (pre-enqueue validation). The legacy `submit-central-scan` edge function in this repo is **frozen** — server-side contract validation is a **Core prerequisite** in `oasisbaklawa2006/oasis-supabase-core` (see below).

---

## Core backend authority evidence

| Check | Result |
|-------|--------|
| Trace `check-core-backend-authority.sh` vs `main` | **Pass** — no `db/*.sql`, `supabase/migrations/*`, or `supabase/functions/*` mutations in this PR |
| Trace exact-head SHA | `5b262ea8f7ca4f7294605494396ec1377567c7ba` |
| Core production anchor SHA | `69ae885f0baba3a6bd6a1b2862ae5be669808eb4` (Point72 order intake, Core #226) |
| Core Production Migration Release | Run `34040050288` — workflow **success**; ledger/preflight **passed**; approved deployment job **skipped** |
| Trace server proxy mutation | **Reverted** — prior edge-fn edits removed to preserve Core ownership boundary |

### Point93 ↔ Core anchor reconciliation

| Assumption | Core anchor evidence | Point93 Trace adapter |
|------------|---------------------|----------------------|
| Canonical order UUID for scan `order_id` | Point72 adds `resolve_order_intake_source_identity_v1` on `public.orders` (intake attribution). **Does not** populate `ols_orders_cache.external_ref` in Trace. | `resolveCentralOrderId` reads `external_ref` when present; `central_order_unbound` → `preview_only` when absent |
| Order duplicate / intake replay | Point72 migration `20260906120000_point72_order_intake_source_attribution_closure.sql` + pgTAP contracts | Out of scope — Trace does not mint order truth |
| `submit-central-scan` server v1 validation | **Not present** at Core anchor SHA — **not verified deployed** | Client-side only: `validateCentralSubmitEnvelope` in `centralSubmit` + `scanSubmitQueue` |
| `app_metadata.ols_roles` role gate (server) | Not verified at Core anchor for scan submit | Client: `roles.ts` (`requireSubmitRole`) |
| Legacy `submit-central-scan` copy in Trace repo | Frozen historical artifact | Trace invokes but does not own or mutate |

**Core prerequisites still open (not Trace lane):** live `ols_orders_cache.external_ref` sync; `submit-central-scan` v1.0 server validation in Core (independently verifiable); migration + edge secrets applied.

## Contract test matrix

| Scenario | Test file |
|----------|-----------|
| Valid dispatch_gate handoff | `centralTraceContract.test.ts` |
| Valid carton identity handoff | `centralTraceContract.test.ts` |
| Malformed / missing identity | `centralTraceContract.test.ts`, `centralSubmit.test.ts` |
| Unauthorized role | `centralSubmit.test.ts`, `roles.test.ts` |
| Stale / duplicate / retry | `scanService.test.ts`, `centralSubmit.test.ts`, `scanSubmitQueue.test.ts` |
| Unknown version / shape | `centralTraceContract.test.ts` |
| Unrecognized strict-schema field | `centralTraceContract.test.ts` |
| Padded idempotency key duplicate | `centralSubmit.test.ts` |
| Producer (`scanService`) + `external_ref` binding | `scanService.test.ts`, `centralTraceContract.test.ts` |
| Offline enqueue contract gate | `scanSubmitQueue.test.ts` |
| Central authority reject (mock) | `centralSubmit.test.ts`, `scanSubmitQueue.test.ts` |

---

## Remaining physical / ops dependencies (not closed by Point 93)

### Software (Core/runtime — not Trace lane)

- `ols_orders_cache.external_ref` live sync from Core `public.orders.id` (Point72 anchor does not provide this)
- `submit-central-scan` v1.0 server validation in `oasis-supabase-core` — **not verified deployed** at anchor `69ae885`
- `db/ols_central_scan_submissions.sql` applied to Supabase
- Edge function deployed with `CENTRAL_SCAN_INGEST_URL` + signing secret
- `VITE_CENTRAL_SCAN_SUBMIT_ENABLED=true` only after staging pilot
- JWT `ols_roles` on all operator accounts
- RLS hardening (`ols_enable_rls_authenticated.sql`)

### Physical (separate evidence lane)

- Physical scanner UAT evidence (#462)

---

## Programme points 94–99 (software lane unblocks)

| Point | Software contract status | Still blocked by |
|-------|-------------------------|------------------|
| 93 | **This PR** — explicit typed contract closure | Collaborator review |
| 94–95 | Unblocked for contract typing; physical evidence separate | Scanner/printer UAT |
| 96 | Offline retry authority merged (#18); not re-duplicated here | — |
| 97–99 | Readiness improved by explicit contract; not stage-cleared | Mission Control gates, physical deps above |

`PR MERGED != STAGE CLEARED`. Canonical ASM: `oasisbaklawa2006/Oasis-Baklawa-Central/APPVERSE_MISSION_CONTROL.md`.

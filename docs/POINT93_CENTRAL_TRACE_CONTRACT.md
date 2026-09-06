# Point 93 — Central↔Trace Contract Census

**ASM:** Central #459 defines Point 93 = Central–Trace software contract.  
**Repo:** `oasisbaklawa2006/oasis-trace` (Trace authority)  
**Contract version:** `1.0` (`CENTRAL_TRACE_CONTRACT_VERSION`)  
**Date:** 2026-09-05  
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
| `validateCentralScanPayload` | Zod fail-closed v1.0 shape check (`.strict()`; unknown top-level fields rejected) |
| `validateIdempotencyKeyConsistency` | Key must match payload identity |
| `validateCentralSubmitEnvelope` | Full pre-submit gate in `centralSubmit` |
| `isPermanentContractFailure` | Contract rejections are non-retryable |

**v1.0 payload rules:** Both `dispatch_gate` and `carton` schemas use Zod `.strict()`. The only optional extension field is `contract_version` with literal value `"1.0"`. Any other unrecognized top-level field fails closed as `invalid_contract`.

**Idempotency key normalization:** `submitCentralScan` trims the accepted key once and uses that normalized value for validation, duplicate lookup (`hasCentralSubmission`), mock storage, and edge-function transport — padded and unpadded keys share the same submission identity.

Wired into `submitCentralScan` before network/mock submit. `invalid_contract` added to permanent failure set in `scanSubmitQueue`.

---

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
| Central authority reject (mock) | `centralSubmit.test.ts`, `scanSubmitQueue.test.ts` |

---

## Remaining physical / ops dependencies (not closed by Point 93)

- Physical scanner UAT evidence (#462)
- `db/ols_central_scan_submissions.sql` applied to Supabase
- Edge function deployed with `CENTRAL_SCAN_INGEST_URL` + signing secret
- `VITE_CENTRAL_SCAN_SUBMIT_ENABLED=true` only after staging pilot
- JWT `ols_roles` on all operator accounts
- RLS hardening (`ols_enable_rls_authenticated.sql`)

---

## Programme points 94–99 (software lane unblocks)

| Point | Software contract status | Still blocked by |
|-------|-------------------------|------------------|
| 93 | **This PR** — explicit typed contract closure | Collaborator review |
| 94–95 | Unblocked for contract typing; physical evidence separate | Scanner/printer UAT |
| 96 | Offline retry authority merged (#18); not re-duplicated here | — |
| 97–99 | Readiness improved by explicit contract; not stage-cleared | Mission Control gates, physical deps above |

`PR MERGED != STAGE CLEARED`. Canonical ASM: `oasisbaklawa2006/Oasis-Baklawa-Central/APPVERSE_MISSION_CONTROL.md`.

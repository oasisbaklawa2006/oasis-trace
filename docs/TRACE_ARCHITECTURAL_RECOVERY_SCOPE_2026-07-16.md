# Trace architectural recovery scope — 2026-07-16

**Repository:** `oasisbaklawa2006/oasis-trace`  
**Audited baseline:** `main` at `e0c214e6a08cc747c9db3b0974e168bde2dd1cce`  
**Mode:** read-only architectural and production-metadata audit  
**Production database:** `tcxvcatsqqertcnycuop` (metadata queries only)

## 1. Original intention

Trace is intended to be Oasis Baklawa's self-sufficient barcode, label, printer, handover and traceability system. It must:

1. Generate governed product, production, packaging, carton, shipping and logistics barcodes.
2. Operate TSC TE244 and approved compatible printers through a controlled local bridge.
3. Consume canonical products and sales orders from the Oasis infrastructure.
4. Track goods through production, stores, packing, finance, dispatch and security.
5. Prevent manual-entry, duplicate-scan, wrong-carton and wrong-handover errors.
6. Preserve immutable actor, device, time, state-transition and scan evidence.
7. Enforce reprint, override and supervisor-approval governance.
8. Apply approved FSSAI and Legal Metrology label rules without inventing legal declarations.
9. Support durable offline work without false success or lost evidence.
10. Feed real-time departmental and TV dashboards.

## 2. Verified current baseline

| Check | Result |
|---|---:|
| Unit tests | 33/33 pass |
| Typecheck | Pass |
| Production build | Pass |
| Ownership boundary gate | Pass |
| Full lint | **Fail: 180 errors, 9 warnings** |
| Production dependency audit | **7 high, 4 moderate** |
| Initial application bundle | **1.29 MB** |

Production metadata confirms that 29 `ols_*` tables exist and have RLS enabled. They contain small test datasets. However:

- `ols_products_cache` contains 5 records while canonical `products` contains 368.
- `ols_orders_cache` contains 2 records while canonical `orders` contains 138.
- every authenticated user currently has SELECT, INSERT and UPDATE policies across every OLS table;
- the frontend invokes `submit-central-scan`, but that Edge Function is not deployed;
- production instead contains `barcode-scan-ingest` and `operational_scan_records` already contains governed scan evidence.

## 3. Current module classification

| Module | Classification | Principal gap |
|---|---|---|
| Authentication | Partial | Authorization contract is not production-grade |
| Dashboard | Partial | OLS-only, not realtime/TV |
| Production Entry | Partial | Stale product cache |
| Stock Units | Partial | Search/list rather than complete custody workflow |
| Cartonization | Strong prototype | Canonical integration and server authority incomplete |
| DPL | Partial | Local document construction |
| Finance PI | Partial | Difference engine is a placeholder |
| Dispatch Bundle | Partial | Primarily printable aggregation |
| Shipping Labels | Partial | Local generation and state |
| Gate Scan | Partial/high-risk | Mutates local dispatch state before canonical proof |
| Traceability | Partial | OLS timeline, not complete canonical lineage |
| Printers | Partial | TSPL/ZPL generation only; no device bridge |
| Templates | Partial | No governed compliance/versioning engine |
| Print Logs | Partial | Basic history |
| Reprints | Partial | Server-side approval enforcement incomplete |
| Reports | Partial | Browser-bounded CSV/PDF output |
| Settings | Mock | Permission save button only displays a toast |
| Offline | Partial | Not a complete transactional replay system |
| Central submit | Not operational | Frontend/backend function mismatch |
| FSSAI/Legal Metrology | Not built | No governed rule engine |
| Realtime/TV | Not built | No realtime subscriptions or command display |

Evidence-weighted production readiness is approximately **30–35%**. Page breadth is high, but live integration, security, device operation and compliance are incomplete.

## 4. Release blockers

### P0

1. Production reads/writes silently fall back to demo/localStorage after live failures.
2. Central submit contract points to an undeployed function.
3. OLS RLS gives all authenticated users broad write authority.
4. `user_metadata.ols_roles` is accepted for sensitive authorization; only trusted `app_metadata` or server-side role data may authorize.
5. Gate Scan can mutate dispatch state before canonical confirmation.
6. Product/order caches are seed data rather than governed synchronization.

### P1

- Repair dependency vulnerabilities and lint debt.
- Generate and enforce typed database contracts; eliminate `any` in changed operational code.
- Add route-level authenticated E2E tests.
- Implement durable idempotent offline synchronization.
- Complete reprint authorization and immutable evidence.
- Split the initial bundle.

### P2

- Governed printer bridge and device health.
- FSSAI/Legal Metrology rule engine and template approval.
- Departmental handover state machine.
- Realtime operations/TV dashboards.
- Exception and supervisor cockpit.

## 5. Authorized build sequence

1. **T0 — Contract reconciliation:** freeze canonical tables/functions, reconcile `submit-central-scan` vs `barcode-scan-ingest`, generate types and produce the implementation ledger. No feature coding.
2. **T1 — Safety foundation:** dependencies, lint, CI, fail-closed production mode and explicit demo mode.
3. **T2 — Identity/authorization:** trusted roles and per-action server-enforced RLS in `oasis-supabase-core`.
4. **T3 — Canonical data bridge:** governed product/order synchronization with visible freshness and failures.
5. **T4 — Scan/handover state machine:** authorized prior-state transition, actor, device, timestamp, correlation, idempotency, immutable evidence and backend acknowledgement.
6. **T5 — Printer subsystem:** local bridge, TSC TE244 calibration/status, print-job lifecycle and offline evidence replay.
7. **T6 — Compliance label engine:** approved rule source, mandatory fields, versioned templates and print-blocking validation.
8. **T7 — Realtime operations:** departmental queues, ageing/blocked alerts, TV dashboards and exception cockpit.
9. **T8 — Pilot/launch:** disposable replay, role matrix, scanner/printer, network loss, duplicates, wrong-carton and batch-to-gate golden path.

## 6. Non-negotiable engineering guardrails

### Ownership

- `oasis-trace`: frontend workflows, scanner/printer client and application contracts.
- `oasis-supabase-core`: migrations, schema, RLS, triggers and Edge Functions.
- `Oasis-Baklawa-Central`: canonical orders, operations and dispatch administration.
- No new SQL, migration, RLS or Edge Function may be authored in Trace.

### Forbidden changes

A PR must fail if changed code introduces:

- frontend service-role/secret keys;
- authorization from user-editable metadata;
- direct writes to canonical Central tables;
- live-to-demo fallback in production;
- dispatch/finance/stock/handover mutation without canonical acknowledgement;
- `any` in changed operational code;
- state transition without actor, prior-state validation, correlation and idempotency;
- legal or FSSAI claims without an approved rule source;
- printing without persisted print-job evidence;
- test/lint suppressions or unrelated refactoring.

### Agent limits

- One phase, one branch, one bounded PR.
- Verify repository, branch, SHA and clean tree before work.
- Declare exact allowed files before editing.
- Stop when additional files, backend authority or product decisions are required.
- Never merge its own PR or use force/destructive commands.
- Never suppress a failing gate or weaken an invariant.
- Never modify production without separate written authorization.

### Mandatory blocking gates

`npm ci`, typecheck, full lint, unit tests, production build, ownership boundaries, dependency audit, secret scan, CodeQL, Semgrep, route E2E, changed-line coverage, generated-type contract test and forbidden-pattern scan.

## 7. Controlled agent handoff

> Work only on the explicitly authorized Oasis Trace phase. Start from current `main`. Before editing, verify repository, branch, SHA and clean working tree. Read this recovery scope and the repository ownership guardrails.
>
> Do not modify production, Supabase, migrations, RLS, Edge Functions, Vercel, Central, AI Studio or unrelated modules. Backend changes belong to `oasis-supabase-core` and require a separate task.
>
> First produce a read-only file-impact plan containing current behavior, target behavior, exact allowed files, tests, risks and stop conditions. Production must fail closed. Never fall back to demo/localStorage after a live failure. Never use user-editable metadata for authorization. Never place secrets in frontend code. Never mutate dispatch, stock, finance, print or handover state without authenticated actor, prior-state validation, idempotency and immutable audit evidence.
>
> Do not use `any` in changed operational code. Do not suppress lint/tests. Do not refactor adjacent modules. Stop immediately if a schema, backend or product decision is missing. Open a PR only after all required gates pass; do not merge it.

## 8. Next action

Authorize **T0 only**: reconcile the frontend's `submit-central-scan` expectation with production's `barcode-scan-ingest`, freeze canonical data/authorization contracts and document exact ownership. No implementation or production change belongs in T0.

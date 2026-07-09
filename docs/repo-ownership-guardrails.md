# Repo Ownership Guardrails

## Why this exists

`oasis-trace` (barcode/label/traceability) sits alongside three other repos
that have each had to draw a hard ownership line after drift: Catalogue
Product AI Studio was briefly built directly inside `Oasis-Baklawa-Central`
before being decommissioned there and rebuilt in `oasis-ai-studio`, and
`oasis-supabase-core` had to guard against absorbing frontend app code from
either of them. This document records the resulting four-repo ownership
split so `oasis-trace` does not, in turn, absorb Central's admin/operations
screens, AI-Studio's catalogue/product-intelligence workspace, or new
Supabase Core backend/schema ownership. `scripts/check-repo-boundaries.sh`
enforces it in CI.

## Ownership split

- **oasis-trace** (this repo) owns:
  - Barcode frontend
  - Label/QR/print/reprint frontend
  - Traceability frontend
  - Cartonization scan flows
  - DPL document UI
  - Finance PI bridge UI inside Trace
  - Shipping labels
  - Gate scan
  - Central scan payload preview/submit integration

- **Oasis-Baklawa-Central** owns:
  - `/admin` operations frontend
  - Product master administration
  - Orders
  - Finance admin
  - Dispatch admin
  - Warehouse
  - Inventory execution
  - Production execution
  - The approval inbox
  - The buyer catalogue
  - The operational catalogue connector/intake

- **oasis-ai-studio** owns:
  - Catalogue Product AI Studio frontend
  - Product intelligence workspace
  - Content draft studio
  - Image prompt studio
  - Packaging/variant readiness
  - Export/copy preview
  - The AI-Studio draft workflow UI

- **oasis-supabase-core** owns:
  - Supabase migrations
  - RLS policies
  - Backend schema authority
  - Edge Functions
  - Database DDL
  - Shared backend function code

### Trace's own routes are not Central's routes

Trace has legitimate routes and components that share plain English words
with Central concepts — `/finance`, `/dispatch`, `/production`, `/trace`,
`/cartons`, `/gate`, and components like `FinancePI`, `DispatchBundle`,
`ProductionEntry`. None of these are forbidden. The boundary check only
blocks Central's specific `/admin`-prefixed routes and PascalCase
compound identifiers (`AdminFinance`, `DispatchManagement`,
`FinanceGovernanceBoard`, etc.) — never Trace's own plain route/component
names, even where a word overlaps.

### Known legacy debt: pre-existing `db/` and `supabase/functions/` content

This repo already contains `db/*.sql` (e.g. `ols_init.sql`,
`ols_central_scan_submissions.sql`) and `supabase/functions/submit-central-scan`
predating this ownership split. `check-repo-boundaries.sh` reports that
pre-existing content as a **warning only** — it is not this guardrail's job
to retroactively fail CI over historical debt. The check instead hard-fails
only on **new** backend/schema ownership introduced since the base branch or
left untracked:

- any new `supabase/migrations/*.sql` file, or any new file under
  `supabase/functions/**`, fails outright by location alone;
- a new `*.sql` file anywhere under `db/` fails only if its content contains
  a DDL/RLS/backend-ownership statement (`CREATE TABLE`, `ALTER TABLE`,
  `DROP TABLE`, `CREATE POLICY`, `ALTER POLICY`, `ENABLE ROW LEVEL SECURITY`,
  `CREATE FUNCTION`, `CREATE TRIGGER`) — a stray non-schema `.sql` file isn't
  itself a boundary violation.

An edit to an already-tracked-at-base legacy file under `db/` or
`supabase/functions/` — including one containing DDL keywords — is reported
as a warning only, never a hard failure, so a routine reformat of
`ols_init.sql` never breaks CI.

## Mandatory pre-PR ownership gate

Before opening a PR against this repo, run:

```
npm run check:boundaries
```

A PR that introduces a Central admin ownership string (`/admin/orders`,
`/admin/finance`, `/admin/dispatch`, `/admin/warehouse`, `/admin/inventory`,
`/admin/production`, `AdminOrders`, `AdminFinance`, `AdminPackingDispatch`,
`DispatchManagement`, `InventoryCommandCenter`, `FinanceGovernanceBoard`,
`ApprovalInbox`, `AdminProducts`), an AI-Studio ownership string
(`/admin/catalogue-product-studio`, `Catalogue Product AI Studio`,
`Content Draft Studio`, `Media / Hero Image Prompt Studio`,
`Packaging + Variant`, `Export / Copy Bundle`, `catalogue_ai_studio_drafts`,
`catalogue_ai_studio_draft_audit_log`) in `src/`, or new backend/schema
ownership under `supabase/` or `db/` as described above, will fail this
check and must not be merged as-is. `.github/workflows/repo-boundaries.yml`
runs the same check on every push/PR to `main`.

## If you hit this guardrail

1. Central admin/operations frontend work belongs in `Oasis-Baklawa-Central`,
   not here.
2. Catalogue Product AI Studio / product intelligence work belongs in
   `oasis-ai-studio`, not here.
3. New schema/migration/RLS/Edge Function work belongs in
   `oasis-supabase-core`, not here.
4. If you believe the ownership split itself needs to change, update this
   document and the script's forbidden-pattern list together, deliberately —
   don't just delete the check.

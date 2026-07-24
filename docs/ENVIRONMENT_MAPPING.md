# Environment Mapping — Oasis Trace (2026-07-24)

## Repository Identity

**Repository Name:** oasis-trace  
**Repository Owner:** oasisbaklawa2006  
**Primary URL:** https://github.com/oasisbaklawa2006/oasis-trace  
**Application Domain:** Barcode, QR code generation, carton identity, scan verification, packing list generation, handover telemetry, logistics tracking (Trace Authority in Oasis Baklawa app-verse)  

---

## Supabase Environment Mapping

### Production Environment
- **Project Name:** oasis-baklawa-prod (or canonical production project ID)
- **Database Region:** us-east-1
- **Access Pattern:** Read-only to Central Supabase (orders, order_items, products, companies tables)
- **Write Access:** Trace-owned tables only (trace_events, trace_labels)
- **RLS Enforcement:** Enabled on all ols_* tables
- **Authentication:** Supabase Auth via anon key (public access to RPC contracts only)

### Staging Environment
- **Project Name:** oasis-baklawa-staging (or staging project ID)
- **Database Region:** us-east-1
- **Purpose:** Schema validation, migration testing, QA verification
- **Data:** Schema-only replica; no production customer data
- **Access Pattern:** Same as production; read-only to Central schema, write to ols_* tables

### Local Development Environment
- **Setup:** Docker-based Supabase local stack (`supabase start`)
- **Database:** PostgreSQL 15.x (ephemeral)
- **Purpose:** Developer machine testing only
- **Credentials:** `.env.local` (never committed; use `.env.example` as reference)

---

## Credentials and Secret Storage

### Environment Variables

**Public (can commit to `.env.example`):**
```
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
VITE_APP_MODE=production|staging|local
```

**Secret (stored in GitHub Actions Secrets only; never committed):**
```
SUPABASE_DB_PASSWORD           → used by CI for migrations
SUPABASE_SERVICE_ROLE_KEY      → used by backend RPCs only (never in client code)
```

### Enforcement Rules

1. **No `.env.production` in repository** — use GitHub Actions Secrets instead
2. **No `.env.local` in repository** — developer-specific; add to `.gitignore`
3. **No service-role credentials in application code** — only anon key in Vite config
4. **No hardcoded Supabase project IDs** — reference via environment variables
5. **GitHub Secret Scanning enabled** — blocks commits containing credential patterns

---

## Database Access Patterns

### Trace Application (This Repo)

**Allowed Direct Access:**
- Read-only: Central `public.orders`, `public.order_items`, `public.products`, `public.companies` (via RPC contracts, not direct queries)
- Write: Trace-owned tables `ols_trace_events`, `ols_trace_labels` (direct)

**Forbidden:**
- Direct `SELECT * FROM public.orders` (must use RPC contract)
- Service-role credentials in client code
- Hardcoded company IDs or order IDs
- Password or API key commits

**RPC Contracts Used by Trace:**
```
Core-governed contracts (read-only):
  - order_status_v1(order_id)          → current order state
  - order_items_v1(order_id)           → line items
  - product_details_v1(product_id)     → product info for barcode generation
  - company_info_v1()                  → authenticated user's company

Trace-provided internal contracts (call from Central):
  - barcode_validation_v1(sku, barcode) → validation for scan workflow
  - scan_event_stream_v1()              → stream of recent scans for dispatch
```

---

## CI/CD Deployment

### GitHub Actions Workflow

**Trigger:** Push to `main` or pull requests to `main`

**Secrets Used by CI:**
- None for build/test (public repo, no secrets in build)
- `SUPABASE_DB_PASSWORD` (if schema migrations are needed; Trace does not own schema)

**Deployment Targets:**
- **Staging:** Automatic deploy on merge to main (if `main` represents staging code)
- **Production:** Manual trigger or scheduled workflow (TBD per org policy)

### Local Development Workflow

```bash
# 1. Install dependencies
npm ci

# 2. Start local Supabase (if needed for schema testing)
supabase start

# 3. Copy .env.example to .env.local and fill in credentials
cp .env.example .env.local
# Edit .env.local: add local Supabase URL and anon key

# 4. Run dev server
npm run dev

# 5. Type check before committing
npm run typecheck

# 6. Run linter before committing
npm run lint

# 7. Run tests before committing
npm run test
```

---

## Verification Checklist

**Before Deploying to Production:**
- [ ] Supabase project ID is correct (matches production project)
- [ ] Anon key is for production project (not staging)
- [ ] Service-role credentials are NOT in code
- [ ] All RPC calls target published contract versions
- [ ] RLS policies are verified in staging (scan workflow, batch operations)
- [ ] Migration replay successful (if schema changes required)
- [ ] CI/CD secrets are correctly configured

---

## Rollback and Recovery

### If Wrong Database Is Configured

1. **Stop the application immediately**
2. **Verify `.env` values** (production URL and key only)
3. **Check Supabase audit log** to see what was written
4. **Restore from backup if data corruption** (contact Core team)
5. **Document incident** in security log

### If Service-Role Credential Is Exposed

1. **Rotate credential in Supabase console immediately**
2. **Remove from Git history** (`git filter-branch` or `git filter-repo`)
3. **Force-push to replace history**
4. **Update GitHub Actions Secrets** with new credential
5. **Incident post-mortem:** how did exposure happen? prevent future occurrences.

---

## Related Documentation

- **Master Architecture:** `/.ai-intent/MASTER_ARCHITECTURE.md`
- **Barcode App Sprint Documentation:** `/docs/BARCODE_APP_SPRINT_*.md`
- **Central Intent:** `/.ai-intent/APP_CENTRAL_INTENT.md` (Central Oasis app, which Trace reads from)
- **Backend Ownership:** `/BACKEND_OWNERSHIP.md`
- **Repository Boundaries:** `/docs/repo-ownership-guardrails.md`

---

## Last Updated

- **Date:** 2026-07-24
- **Updated by:** Claude Code (Forensic Audit Phase E)
- **Status:** ACTIVE — Canonical environment mapping for Trace application

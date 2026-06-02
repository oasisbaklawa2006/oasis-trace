# Barcode App Sprint 3 — Central Submit Integration & Auth/RLS Plan

**Repo:** `oasisbaklawa2006/oasis-trace`  
**Date:** 2026-06-02  
**Branch:** `cursor/barcode-sprint-3-central-submit`

---

## 1. Submit architecture

```
┌─────────────────┐     JWT (anon)      ┌──────────────────────────────┐
│  Barcode App    │ ─ invoke ──────────▶│  Supabase Edge Function       │
│  (React/Vite)   │   submit-central-   │  submit-central-scan          │
│                 │   scan              │  • Verify session             │
│  No secrets     │                     │  • Check ols_roles            │
└─────────────────┘                     │  • Idempotency (DB unique)    │
        │                               │  • HMAC sign (server secret)  │
        │ preview + copy JSON           └──────────────┬───────────────┘
        │ local ols_scan_history                         │ POST + X-Oasis-Signature
        ▼                                              ▼
┌─────────────────┐                     ┌──────────────────────────────┐
│ ols_central_    │◀── service role ────│  Oasis Central API            │
│ scan_submissions│                     │  POST …/operational_scan_records│
└─────────────────┘                     └──────────────────────────────┘
```

**Principles**

- Frontend never holds `service_role` or `CENTRAL_SCAN_SIGNING_SECRET`.
- Submit only when `verification_status === "verified"` and user has `dispatch` / `security` / `admin` in JWT `ols_roles`.
- Local preview mode remains when `VITE_CENTRAL_SCAN_SUBMIT_ENABLED` is not `true`.
- Demo/offline uses in-memory mock submissions in `localStorage` (no Central call).

---

## 2. Scan sync statuses

| Status | Meaning |
|--------|---------|
| `preview_only` | Scan logged; not eligible or not yet verified |
| `ready_to_submit` | Verified locally; submit button enabled |
| `submitted` | Central accepted (or dry-run) |
| `failed` | Central HTTP/error |
| `retry_pending` | User or system initiated retry |

Stored in `ols_scan_history.metadata.central_sync_status` and `ols_central_scan_submissions.status`.

---

## 3. Configuration

### Frontend (`.env`)

| Variable | Purpose |
|----------|---------|
| `VITE_SUPABASE_URL` | Supabase project |
| `VITE_SUPABASE_ANON_KEY` | Authenticated client only |
| `VITE_CENTRAL_SCAN_SUBMIT_ENABLED` | `true` to show Submit / Retry UI |

**Not in frontend:** `CENTRAL_SCAN_INGEST_URL`, `CENTRAL_SCAN_SIGNING_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`.

### Edge function secrets (Supabase dashboard)

| Secret | Purpose |
|--------|---------|
| `SUPABASE_SERVICE_ROLE_KEY` | Idempotency table + optional scan_history patch |
| `CENTRAL_SCAN_INGEST_URL` | Central ingest endpoint (omit for dry-run) |
| `CENTRAL_SCAN_SIGNING_SECRET` | HMAC-SHA256 of JSON body → `X-Oasis-Signature` |

Deploy:

```bash
supabase functions deploy submit-central-scan
```

---

## 4. Central endpoint required (document only — Central repo not modified)

**Method:** `POST`  
**Path (example):** `/api/operational_scan_records`  
**Full URL:** set as `CENTRAL_SCAN_INGEST_URL`

**Headers**

| Header | Value |
|--------|-------|
| `Content-Type` | `application/json` |
| `X-Idempotency-Key` | Same as Barcode App idempotency key |
| `X-Source-App` | `barcode_app` |
| `X-Oasis-Signature` | HMAC-SHA256 hex of raw body (if secret configured) |

**Body:** Sprint 2 payload (`dispatch_gate` or `carton`).

**Expected response (2xx):** JSON with at least one of `id`, `reference`, `scan_id` (used as `central_reference`).

**Duplicate (409):** Barcode App surfaces “Scan already recorded”.

---

## 5. Database migration

**Yes — additive only.** Run manually:

`db/ols_central_scan_submissions.sql`

Creates `ols_central_scan_submissions` with unique `idempotency_key` and authenticated RLS (read/insert/update). Does not alter existing Central tables.

---

## 6. Auth / RLS hardening plan (pre-production)

### Implemented in Sprint 3

- `src/lib/roles.ts` — reads `ols_roles` from JWT; `canSubmitCentralScan`, `canApproveReprint`.
- Edge function enforces roles server-side (403 if missing).
- Reprint approval UI uses JWT when Supabase configured; localStorage role stub only in demo mode.
- `localStorage.ols_role` ignored for submit when `VITE_SUPABASE_URL` is set.

### Before production launch

1. **Assign JWT claims** for all operators:
   ```json
   { "ols_roles": ["dispatch"] }
   ```
2. **Run** `db/ols_enable_rls_authenticated.sql` on Label Studio Supabase (force RLS, no anon write).
3. **Restrict edge function** deploy to production project only; rotate signing secret.
4. **Central side:** validate HMAC + idempotency; map `operational_scan_records` RLS to service account.
5. **Future:** `ols_user_roles` table + RPC `get_my_roles()` instead of raw JWT arrays.
6. **Reprint approvals:** move to edge function or RLS policy requiring `admin` role on `ols_reprint_requests` update.

### Policy summary (target)

| Action | Role |
|--------|------|
| Submit scan to Central | `dispatch`, `security`, `admin` |
| Approve reprint | `admin` |
| Gate scan / carton pack | `dispatch`, `security`, `packing` (future tighten) |

---

## 7. Files changed (Sprint 3)

| File | Purpose |
|------|---------|
| `supabase/functions/submit-central-scan/index.ts` | Secure submit proxy |
| `db/ols_central_scan_submissions.sql` | Submission audit + idempotency |
| `src/lib/centralScanStatus.ts` | Status enum + labels |
| `src/lib/centralSubmit.ts` | Client invoke + mock |
| `src/lib/roles.ts` | JWT role helpers |
| `src/hooks/useOlsSession.ts` | React hook |
| `src/components/CentralPayloadPreview.tsx` | Submit / Retry UI |
| `src/pages/GateScan.tsx` | Wire submit |
| `src/pages/Cartonization.tsx` | Wire submit |
| `src/lib/scanService.ts` | `ready_to_submit` + `scanHistoryId` |
| `src/lib/reprintPolicy.ts` | JWT-aware approve |
| `src/pages/Reprints.tsx`, `ReprintModal.tsx` | JWT approve UI |
| `src/lib/*.test.ts` | Submit + roles tests |
| `.env.example`, `src/vite-env.d.ts` | Config docs |

---

## 8. Tests

```bash
npm run typecheck
npm run build
npm run test
```

Coverage includes: submit success (mock), duplicate, failure paths, unauthenticated, forbidden role, verified-only, roles JWT parsing.

---

## 9. Production readiness verdict

| Area | Status |
|------|--------|
| Payload + preview (Sprint 2) | Ready |
| Submit plumbing + edge function | Ready for staging |
| Central endpoint live | **Required** — configure `CENTRAL_SCAN_INGEST_URL` |
| JWT roles on all users | **Required** |
| Migration `ols_central_scan_submissions` | **Required** (manual run) |
| RLS production script | **Required** before go-live |
| Pen test / no service key in bundle | Pass (by design) |

**Verdict:** **Staging-ready** after migration + edge deploy + Central endpoint. **Not production-ready** until Central ingest is live, JWT roles are assigned, and `ols_enable_rls_authenticated.sql` is applied.

---

## 10. Next steps

1. Central team implements `operational_scan_records` ingest with idempotency + signature verification.
2. Deploy edge function to Oasis Baklawa Supabase; enable `VITE_CENTRAL_SCAN_SUBMIT_ENABLED=true` in staging.
3. E2E test: gate scan → submit → verify row in Central.
4. Sprint 4: order cache sync from Central + submission status dashboard.

# Barcode App Sprint 1–3 Merge Closeout

**Repo:** `oasisbaklawa2006/oasis-trace`  
**Date:** 2026-06-02  
**Closeout performed by:** Cloud agent (merge order validation + main health check)

---

## PR merge summary

| PR | Title | CI | Merged | Merge commit |
|----|-------|-----|--------|--------------|
| [#1](https://github.com/oasisbaklawa2006/oasis-trace/pull/1) | Sprint 1: audit, tooling baseline, Central scan contract | SUCCESS | **Yes** (2026-06-02) | `b7828ba` |
| [#2](https://github.com/oasisbaklawa2006/oasis-trace/pull/2) | Sprint 2: CTN-SO scan flow + payload preview | SUCCESS | **Yes** (2026-06-02) | `6eee5ce` |
| [#3](https://github.com/oasisbaklawa2006/oasis-trace/pull/3) | Sprint 3: Central submit + auth plan | SUCCESS (post-rebase) | **Yes** (2026-06-02) | `226fec3` |

### PR #1

- Already merged before closeout (CI green at merge).
- Delivered: `scanContract`, CI workflow, typecheck, audit report, `.env` removed from git.

### PR #2

- Already merged after PR #1 (CI green at merge).
- Delivered: CTN-SO flows, `scanService`, `CentralPayloadPreview`, gate/carton wiring.

### PR #3

- Rebased onto `main` after PR #2 merge (`d6fab38`).
- Diff vs `main` confirmed **Sprint 3 only** (20 files, +1262 lines).
- Checks: no `service_role` in `src/`; migration file only `db/ols_central_scan_submissions.sql`; submit feature-flagged (`VITE_CENTRAL_SCAN_SUBMIT_ENABLED=false` in `.env.example`).
- Marked ready for review, CI passed, merged to `main`.

---

## Main HEAD (post-closeout)

```
226fec3d46aaaba710dab444b1737f50692529a2
Merge pull request #3: Barcode App Sprint 3 Central submit
```

---

## Main health check (local, after `git pull origin main`)

| Command | Result |
|---------|--------|
| `npm ci` | Pass |
| `npm run typecheck` | Pass |
| `npm run build` | Pass |
| `npm run test` | Pass (33 tests) |

---

## Migration status

| Item | Status |
|------|--------|
| `db/ols_central_scan_submissions.sql` | **Pending** — not applied to Supabase |
| Required before | Staging Central submit pilot |
| Action | Run manually in Supabase SQL editor when approved |

Other sprint SQL (`ols_init.sql`, etc.) unchanged by this closeout.

---

## Production submit enabled?

| Check | Status |
|-------|--------|
| `.env.example` default | `VITE_CENTRAL_SCAN_SUBMIT_ENABLED=false` |
| Submit UI in app | Only when env explicitly `true` |
| Production recommendation | **Keep disabled** until migration + edge deploy + Central endpoint live |

---

## Security checklist (post-merge)

- [x] No service-role key in frontend bundle (`src/` clean)
- [x] Signing secret documented for edge function only
- [x] Submit requires authenticated JWT + `ols_roles`
- [ ] JWT roles assigned on all operator accounts (ops task)
- [ ] Edge function deployed with secrets (ops task)
- [ ] `ols_enable_rls_authenticated.sql` before production (ops task)

---

## Final barcode app verdict

**Main is healthy.** Sprints 1–3 are integrated in order:

1. **Sprint 1** — audit baseline, CI, Central contract helpers  
2. **Sprint 2** — CTN-SO scan + payload preview  
3. **Sprint 3** — Central submit path (feature-flagged) + auth role plan  

**Ready for:** continued staging setup (migration, edge deploy, Central ingest URL).  
**Not ready for:** production Central submit until migration, roles, RLS hardening, and Central endpoint are live.

---

## References

- [Sprint 1 report](./BARCODE_APP_SPRINT_1_AUDIT_AND_BASELINE_REPORT.md)
- [Sprint 2 report](./BARCODE_APP_SPRINT_2_CTN_SO_SCAN_PAYLOAD_REPORT.md)
- [Sprint 3 report](./BARCODE_APP_SPRINT_3_CENTRAL_SUBMIT_AND_AUTH_PLAN.md)

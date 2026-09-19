# Task 2 — Trace Final Software Certification

**Repository:** `oasisbaklawa2006/oasis-trace`  
**Certified head:** `467fcc2e9cdade3ca8260d081a4cf8446e4fe03a` (main) + recert pin updates on branch  
**Mission:** Final build, integration, testing & software production readiness  
**Date:** 2026-09-19  

`PR MERGED != STAGE CLEARED`. This document certifies **software** readiness only. Physical device evidence remains a separate gate.

---

## Executive summary

| Gate | State |
|------|-------|
| Macro Trace foundation (#259 / release #161) | **COMPLETE_VERIFIED** |
| Core reprint approval (#300 / production head 6867b432) | **COMPLETE_VERIFIED** (schema deployed) |
| Trace recovery (#38 Point95/99 software) | **COMPLETE_VERIFIED** (merged on main) |
| Central ↔ Trace contract (Point93) | **COMPLETE_VERIFIED** |
| Offline scan retry (Point96) | **COMPLETE_VERIFIED** |
| Unit/integration/build/CI | **COMPLETE_VERIFIED** (434 tests, CI green) |
| Production RPC semantic probe | **COMPLETE_NOT_RUNTIME_VERIFIED** (requires `.env` credentials) |
| Physical scanner/printer/TV UAT (Leap13 / #462) | **PHYSICAL_CERTIFICATION_REQUIRED** |
| Oasis Display Android TV shell (Central `android-tv/`) | **SOFTWARE READY** — see TV gates below |
| Programme stage clearance | **NOT CLEARED** — physical + Mission Control gates remain |

**Final software state:** **TRACE — SOFTWARE PRODUCTION READY**  
**Remaining external gates:** production runtime semantic verification (optional credentials), physical UAT, Mission Control stage clearance.

---

## Identity inventory

| Identity | Format / source | Classification | Evidence |
|----------|-----------------|----------------|----------|
| Product barcode (EAN/GS1) | Core/Central product truth | **NOT_REQUIRED** in Trace (Core-owned) | `barcodeIdentity.ts` authority matrix |
| SKU / variant | Core product catalogue | **NOT_REQUIRED** in Trace | Production forms read cache only |
| Batch | `BAT-YYYYMMDD-###` | **COMPLETE_VERIFIED** | `barcodeIdentity.ts`, tests |
| Production label | `PL-YYYYMMDD-####` | **COMPLETE_VERIFIED** | `ProductionEntry`, `governedPrint.ts` |
| Legacy carton | `CTN-YYYYMMDD-####` | **COMPLETE_VERIFIED** | `Cartonization`, legacy gate |
| Central carton | `CTN-SO-{order}` | **COMPLETE_VERIFIED** | `scanContract.ts`, Central submit |
| DPL | `DPL-YYYYMMDD-###` | **COMPLETE_VERIFIED** | `DPL.tsx`, identity allocator |
| PI | `PI-YYYYMMDD-###` | **COMPLETE_VERIFIED** | `FinancePI.tsx` (bridge only, not finance authority) |
| Shipping | `SHP-YYYYMMDD-####` | **COMPLETE_VERIFIED** | `ShippingLabel.tsx` |
| Shipping QR | `QR-{derived}` | **COMPLETE_VERIFIED** | `deriveShippingQrRef`, legacy gate |
| Order truth | `SO-YYYY-####` | **SUPERSEDED** in Trace (Core/Central-owned) | CTN-SO derivation only |
| Processing identity | — | **NOT_REQUIRED** | No active processing-line Trace route |
| Assembly identity | — | **NOT_REQUIRED** | No active assembly Trace route |
| Packing identity | Carton + handover chain | **COMPLETE_VERIFIED** | `packingContract.ts`, Point92 |
| RGS identity | Department seed `RGS` | **PARTIAL** | DB seed only; RGS TV routes Central-owned |
| TGS / third-party goods | — | **NOT_REQUIRED** | Planned Central `/admin/3pcs-store`, not Trace |
| Dispatch identity | DPL + bundle + CTN-SO | **COMPLETE_VERIFIED** | `DispatchBundle`, `GateScan` |
| Gatekeeper identity | CTN-SO + legacy QR | **COMPLETE_VERIFIED** | `GateScan`, Central + legacy paths |

---

## Label type inventory

| Label type (requirement) | Implemented equivalent | Classification |
|--------------------------|------------------------|----------------|
| Product label | `product` template + production label | **COMPLETE_VERIFIED** |
| Batch label | `production` template / batch_no on label | **COMPLETE_VERIFIED** |
| Processing label | — | **NOT_REQUIRED** |
| Assembly label | — | **NOT_REQUIRED** |
| Packing label | `carton` template | **COMPLETE_VERIFIED** |
| RGS label | — | **NOT_REQUIRED** (Central RGS surfaces) |
| Third-party goods label | — | **NOT_REQUIRED** |
| Store-transfer label | — | **NOT_REQUIRED** |
| Allocation label | — | **NOT_REQUIRED** |
| Dispatch carton label | `carton` + CTN-SO | **COMPLETE_VERIFIED** |
| Export carton label | `carton` / shipping | **COMPLETE_VERIFIED** |
| Retail / wholesale label | `product` variants | **COMPLETE_VERIFIED** |
| Gatekeeper label | Gate scan uses CTN-SO/QR, not separate print type | **COMPLETE_VERIFIED** |
| Reprint label | Governed reprint watermark path | **COMPLETE_VERIFIED** |
| Shipping label | `shipping` template | **COMPLETE_VERIFIED** |

Template types in DB/demo: `production`, `product`, `carton`, `shipping`.

---

## Barcode identity model

Every scan/print input passes through `validateBarcodeIdentity()` (fail-closed):

- Empty → rejected (`empty`)
- Unrecognized → rejected (`malformed`)
- Preview fixtures in production → rejected (`preview_in_production`)
- CTN legacy/central ambiguity → rejected (`ambiguous`)
- Wrong expected kind → rejected (`malformed`)
- Central CTN without order resolution → rejected (`unresolvable`)

Live allocation uses Core RPC (`trace_allocate_identity_v1`, `trace_create_production_v1`); demo allocator blocked when Supabase configured.

---

## Device surfaces (Point 99)

| Surface | Scan routes | Print routes | Classification |
|---------|-------------|--------------|----------------|
| PC | Full | Full setup + print | **COMPLETE_VERIFIED** |
| Mobile | `/gate`, `/cartons` scan | Blocked (by policy) | **COMPLETE_VERIFIED** |
| Handheld | `/gate`, `/cartons` scan | Blocked (by policy) | **COMPLETE_VERIFIED** |
| TV | `/tv/gate`, `/tv/dispatch` read-only | Blocked | **COMPLETE_VERIFIED** |
| Android TV shell (Oasis Display APK) | Trace routes assignable via unified APK | Blocked | **SOFTWARE READY** — physical UAT pending |

Contract: `deviceSurfaceContract.ts` (18 routes censused, tests pass).  
TV device contract: `docs/TV_DISPLAY_DEVICE_CONTRACT.md`, `src/lib/tvDisplaySurfaces.ts`.  
Build authority: `Oasis-Baklawa-Central/android-tv/` (not Trace).

---

## Print / reprint governance (Point 95)

| Capability | Module | Classification |
|------------|--------|----------------|
| Governed first print | `governedPrint.ts` | **COMPLETE_VERIFIED** |
| Identity verification before print | `verifyPrintEquivalence` | **COMPLETE_VERIFIED** |
| Reprint from 2nd onward requires approval | `reprintPolicy.ts` | **COMPLETE_VERIFIED** |
| Core atomic reprint execution | `atomicGovernedReprint.ts` | **COMPLETE_VERIFIED** |
| Core approval RPC (#300) | `trace_approve_reprint_request_v1` | **COMPLETE_VERIFIED** (contract); **COMPLETE_NOT_RUNTIME_VERIFIED** (live probe) |
| Physical print success | print-bridge → TCP:9100 | **PHYSICAL_CERTIFICATION_REQUIRED** |

---

## Scan / offline / Central integration

| Capability | Classification |
|------------|----------------|
| CTN-SO Central gate submit | **COMPLETE_VERIFIED** |
| Legacy QR gate (green/red) | **COMPLETE_VERIFIED** |
| Carton identity scan + pack | **COMPLETE_VERIFIED** |
| Offline Central submit queue (Point96) | **COMPLETE_VERIFIED** |
| Point93 typed contract | **COMPLETE_VERIFIED** |
| Central payload fail-closed validation | **COMPLETE_VERIFIED** |

---

## Authority boundaries preserved

- Trace does **not** own finance, SO commercial truth, pricing, or dispatch commercial authorization.
- `FinancePI.tsx` is a PI bridge (DPL → PI membership), not finance authority.
- Core owns migrations and governed RPC mutations.
- Central owns operational gatekeeper admin and RGS/TGS store surfaces.

---

## Validation executed (software)

```bash
npm test                    # 434 passed
npm run typecheck           # pass
npm run lint                # pass (warnings only)
npm run build               # pass
npm run check:boundaries    # pass
bash scripts/uat/run-all.sh # automated preflight pass
bash scripts/recertify-core-trace-authority.sh  # contract suites (no .env)
```

CI on main @ `467fcc2`: CI, Repo Boundaries, Core Backend Authority, Super-Linter — all **SUCCESS**.

---

## Android TV / Oasis Display shell (Task 2 addendum)

All operational Oasis TVs use **Android / Android TV**. Browser URL entry is not an acceptable deployment model.

| Certification gate | State | Evidence |
|--------------------|-------|----------|
| **TV SHELL SOFTWARE** | **NOT CERTIFIED** (pending Central PR CI on `android-tv/` exact head) | Source + contract complete; unsigned release build in CI |
| **ANDROID TV PHYSICAL UAT** | **PENDING** | `docs/TASK2_ANDROID_TV_UAT.md` — 15 scenarios, real hardware only |

### Software contract delivered

- **One APK** hosts all governed surfaces (Central + Trace); no per-screen APK.
- **First-launch enrollment**: device ID, enrollment code, QR; admin assigns from Display Management.
- **Remote config client** polls Task 4 API when bootstrap URL configured; interim ADB `oasis_display_assignment`.
- **Security**: no staff password, service-role key, or write authority in APK; Trace read-only restrictions preserved.
- **Kiosk**: fullscreen, landscape, reconnect overlay, config refresh, diagnostics (5× BACK), boot recovery.
- **Preview surfaces** (Central assembly/dispatch) loadable but **not** production-certified.

### Trace-owned surfaces in unified catalog

| Key | Route | Trace software |
|-----|-------|----------------|
| `trace-gate` | `/tv/gate` | **CANONICAL** |
| `trace-dispatch` | `/tv/dispatch` | **CANONICAL** |

### Task 4 dependencies (Central/Core — not Trace)

- Remote assignment API persistence + display-device read-only credential
- Display Management device registry (last seen, health, remote reassignment)

Do not implement shadow backend authority in Trace.

### External gates

1. **Signing**: owner keystore per `Oasis-Baklawa-Central/android-tv/RELEASE_SIGNING.md`
2. **Physical UAT**: owner executes `TASK2_ANDROID_TV_UAT.md` on Android TV hardware
3. Browser emulation **≠** Android TV physical certification

---

## Physical certification checklist (owner-required)

Operator scripts (evidence not claimed without device proof):

1. `scripts/uat/leap13-gate-handheld.sh`
2. `scripts/uat/leap13-packing-carton.sh`
3. `scripts/uat/leap13-tv-kiosks.sh` (web kiosk — not a substitute for APK UAT)
4. `scripts/uat/leap13-offline-replay.sh`
5. `docs/TASK2_ANDROID_TV_UAT.md` — Oasis Display APK on Android TV hardware

Enable capture: `VITE_LEAP13_UAT=1 npm run dev` or `?leap13_uat=1`.

---

## Recertification pin updates (this branch)

- Extend `coreTraceAuthorityContract.ts` with Core #300 + production head pins.
- Extend `recertify-core-trace-authority.sh` for #300 RPC probe and Point95/99 test suites.
- Trace recovery PR reference: **#38** (merged).

---

## Final state

**TRACE TASK 2 — SOFTWARE PRODUCTION READY**

Blocked only by:

1. **PHYSICAL_CERTIFICATION_REQUIRED** — Leap13 handheld/printer/TV scenarios (#462).
2. **ANDROID TV PHYSICAL UAT: PENDING** — Oasis Display APK on real Android TV (`TASK2_ANDROID_TV_UAT.md`).
3. **TV SHELL SOFTWARE: NOT CERTIFIED** until Central `android-tv-ci` green + owner signing if required for deployment.
4. **Production runtime semantic verification** — optional `.env` RPC probe in controlled environment.
5. **Mission Control programme stage clearance** — Central `state.json` still lists Trace gates; update at Mission Control after physical evidence.

No production mutation performed by this certification run.

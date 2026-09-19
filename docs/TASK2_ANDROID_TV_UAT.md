# Task 2 — Android TV Physical UAT Package

**Environment:** Android / Android TV hardware (not desktop browser emulation)  
**Artifact:** Oasis Display APK v2.0.0+ (`com.oasisbaklawa.centraltv`)  
**Applies to:** Unified Oasis Display shell + assigned Central/Trace read-only surfaces  

Browser URL entry is **not** an acceptable deployment method. All scenarios assume APK installation and governed assignment.

---

## Evidence requirements

Each row requires:

- **Photo/video** of the TV screen showing the stated state
- **Diagnostics screenshot** (5× BACK) when assignment/network/state is relevant
- **Display Management screenshot** when admin assignment is relevant

Mark **PASS** only with attached evidence. Browser testing does not satisfy this package.

---

| # | Scenario | Steps | Expected behaviour | PASS criteria | Evidence |
|---|----------|-------|-------------------|---------------|----------|
| 1 | Install APK | Sideload an installable UAT APK signed with a controlled debug/CI test key on Android TV | App installs, launches, shows Oasis Display enrollment | Package signature is accepted by Android; no install/launch crash | Photo of package install/launcher + first screen |
| 2 | First launch enrollment | Launch without prior assignment | Shows device ID, enrollment code, QR; no URL prompt | Enrollment visible; no browser chrome | Photo/video |
| 3 | Admin assignment | Display Management → enter code → select surface → copy ADB command → apply | TV receives assignment, exits enrollment | Assigned surface loads full-screen | Video: enroll → assign → display |
| 4 | Assigned screen launch | Open RGS or Trace Gate surface | Correct read-only dashboard renders legibly at TV distance | Content readable; auto-refresh works | Photo at ≥2m distance |
| 5 | Readability | View for 5 minutes | No layout overflow/clipping on 1080p TV | Text/charts readable | Photo |
| 6 | Remote operation | Use Android TV remote only | No accidental exit to launcher; BACK suppressed except diagnostics | Kiosk holds; 5× BACK opens diagnostics | Video |
| 7 | Read-only enforcement | Attempt to reach blocked routes via UI if exposed | No production/reprint/finance write controls | No mutation affordances | Photo |
| 8 | Internet disconnect at startup | Boot TV offline | Branded reconnect overlay, not Android error page | Shows “Oasis Display — reconnecting” | Photo |
| 9 | Internet drop after load | Disconnect network during live dashboard | Overlay appears; stale badge if frame retained | Branded status, no crash | Video |
| 10 | Reconnect | Restore network | Automatic recovery without manual URL entry | Surface reloads successfully | Video |
| 11 | Application restart | Force-stop app, relaunch | Returns to same assigned surface | Assignment persisted | Video |
| 12 | TV reboot | Power-cycle TV | App auto-starts to assigned surface (OEM permitting) | Same assignment restored | Video |
| 13 | Route reassignment | Assign Dispatch TV then RGS TV via new command/API | Surface changes without APK reinstall | New route loads | Video + diagnostics |
| 14 | Credential revocation | Revoke display/TV session server-side | Periodic reload fails closed to auth/reconnect state | No silent stale privileged view >6h | Video + admin proof |
| 15 | APK upgrade | Install vN+1 over vN | Device ID + assignment preserved | Same surface after upgrade | Video + diagnostics |

---

## Surfaces to test (minimum matrix)

| Surface | Origin | Production-certified? | Required for Task 2 software sign-off |
|---------|--------|----------------------|---------------------------------------|
| Ready Goods `/tv/rgs` | Central | Yes | Software ready — physical UAT required |
| 3PGS `/tv/3pgs` | Central | Yes | Software ready — physical UAT required |
| Trace Gate `/tv/gate` | Trace | Yes (software) | Software ready — physical UAT required |
| Trace Dispatch `/tv/dispatch` | Trace | Yes (software) | Software ready — physical UAT required |
| Assembly `/admin/assembly-tv` | Central | **Preview only** | Do **not** certify production |
| Dispatch Central `/admin/dispatch-tv` | Central | **Preview only** | Do **not** certify production |

---

## Signing gates

The CI-generated **unsigned** release APK is a build-only artifact and is **not** sufficient for Scenario 1 because Android TV will not install an unsigned package.

Before physical UAT, produce a separate installable UAT APK signed with a controlled debug/CI test key. The UAT key must not be the owner production keystore and must not be committed to the repository. Record the signing method, APK SHA-256, package/version, and installation result as UAT evidence.

Owner-keystore signing is reserved for **production distribution** and remains a separate release gate documented in `Oasis-Baklawa-Central/android-tv/RELEASE_SIGNING.md`.

**ANDROID TV PHYSICAL UAT: PENDING** until this matrix is executed on real Android TV hardware using the installable controlled-test-signed UAT APK. Production distribution remains pending owner-keystore signing.

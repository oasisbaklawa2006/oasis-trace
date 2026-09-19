# Oasis Display Device Contract (Trace participation)

Trace owns `/tv/gate` and `/tv/dispatch` read-only kiosk routes. The unified **Oasis Display** Android TV APK is built in `Oasis-Baklawa-Central/android-tv` and loads governed web surfaces in a fullscreen WebView.

Trace does **not** own Display Management, device enrollment persistence, or display-device credentials.

## Surface catalog (Trace-owned routes)

| Key | Route | Certification | Notes |
|-----|-------|---------------|-------|
| `trace-gate` | `/tv/gate` | **CANONICAL** (Trace software) | Read-only gate scan feed |
| `trace-dispatch` | `/tv/dispatch` | **CANONICAL** (Trace software) | Read-only dispatch summary feed |

Central-owned surfaces (RGS, 3PGS, production lines, etc.) are assigned by the same APK but certified independently.

Preview Central surfaces (`assembly`, `dispatch-central`) may load in the shell but must **not** be certified as production-ready.

## Assignment payload (v1)

```json
{
  "v": 1,
  "surfaceKey": "trace-gate",
  "friendlyName": "FACTORY-GATE-TV-01",
  "location": "Security Gate",
  "configVersion": 1730000000000,
  "assignedAtEpochMs": 1730000000000
}
```

Applied on device via intent extra `oasis_display_assignment` or future remote-config API.

## Remote configuration API (Task 4 — Central-owned)

```
GET {DISPLAY_CONFIG_BOOTSTRAP_URL}/v1/devices/{deviceId}/assignment
→ 200 + assignment JSON
→ 404 while pending enrollment
```

The APK polls every 5 minutes when bootstrap URL is configured. Trace must not implement this endpoint.

## Display-device credential (Task 4 — Core/Central-owned)

Requirements:

- display-specific, read-only, revocable, scope-limited
- must not be a shared staff username/password cached in the APK
- must not expose service-role keys or unrestricted Supabase credentials

Until Task 4 ships, TV web sessions remain a known upstream gap (see Central `android-tv/DEPARTMENTS.md`).

## Security boundaries preserved

The APK and Trace TV routes must never expose:

- production-write, reprint, finance-write, or dispatch mutation controls
- Gatekeeper release mutation (Central-owned)
- service-role or employee bearer tokens in persistent storage

Trace `deviceSurfaceContract.ts` continues to enforce read-only TV access modes for generic routes; dedicated `/tv/*` kiosks remain the only TV-safe Trace surfaces.

## Build artifact

Release artifact: `Oasis-TV.apk` (unsigned in CI; owner signing per `android-tv/RELEASE_SIGNING.md`).

Build config fields:

- `CENTRAL_WEB_ORIGIN`
- `TRACE_WEB_ORIGIN`
- `DISPLAY_CONFIG_BOOTSTRAP_URL` (optional until Task 4)

## Canonical source sync

Keep route keys aligned with:

- Central: `src/lib/displayDevice/displayAssignmentContract.ts`
- Android: `android-tv/.../DisplaySurfaceRegistry.kt`
- Trace: `src/lib/tvDisplaySurfaces.ts`

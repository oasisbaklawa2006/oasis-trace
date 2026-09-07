#!/usr/bin/env bash
# Leap13 offline replay UAT — operator script (#462 evidence lane).
set -euo pipefail

cat <<'EOF'
# Offline replay UAT (Leap13 — network-loss physical evidence required)

## Preconditions
- Central submit enabled for test user
- `?leap13_uat=1` on gate or settings routes

## Steps
1. Queue a Central scan while offline — expect queued toast, no shadow success.
2. Reconnect — expect automatic retry via pending sync hook.
3. Replay same idempotency key — expect duplicate suppression, no double ingest.
4. Settings external_ref reconcile while offline — expect fail-closed error surface.

## Evidence capture
- Browser network panel HAR + `ols_leap13_evidence_v1` export.
- Physical network-loss step requires real device disconnect (Leap13).

## Software regression (no hardware)
npm test -- src/lib/scanSubmitQueue.test.ts src/lib/externalRefSync.test.ts src/hooks/usePendingCentralSubmitSync.test.ts
EOF

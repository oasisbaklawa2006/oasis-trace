#!/usr/bin/env bash
# Leap13 Gate / handheld scanner UAT — operator script (#462 evidence lane).
set -euo pipefail

cat <<'EOF'
# Gate handheld UAT (Leap13 — physical evidence required)

## Preconditions
- Trace deployed or `VITE_LEAP13_UAT=1 npm run dev`
- Security Gate role session
- Physical handheld or keyboard-wedge scanner attached

## Steps
1. Open `/gate` on handheld or mobile viewport.
2. Scan a valid Central CTN-SO-* barcode — expect green feedback + toast.
3. Scan the same code within 300ms — expect duplicate suppression (no double submit).
4. Scan an invalid/legacy CTN-YYYYMMDD barcode — expect fail-closed rejection.
5. Scan a valid legacy shipping QR — expect governed legacy gate handoff result.
6. Toggle offline (airplane mode), submit Central scan — expect queue + retry on reconnect.

## Evidence capture
- Append `?leap13_uat=1` to URL or set `VITE_LEAP13_UAT=1`.
- After each step, verify `localStorage.ols_leap13_evidence_v1` contains `gate-handheld` records.
- Attach screen recording + scanner beep audio + exported JSON to Central #462 packet.

## Software regression (no hardware)
npm test -- src/lib/scanService.test.ts src/lib/legacyGateHandoff.test.ts src/lib/scanSubmitQueue.test.ts
EOF

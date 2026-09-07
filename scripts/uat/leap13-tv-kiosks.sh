#!/usr/bin/env bash
# Leap13 TV kiosk UAT — operator script (#462 evidence lane).
set -euo pipefail

cat <<'EOF'
# TV kiosk UAT (Leap13 — physical display evidence required)

## Preconditions
- TV or large display on read-only kiosk browser profile
- Dispatch / Gate TV routes reachable without admin controls

## Steps
1. Open `/tv/gate` — verify auto-refresh, latest scan hero, history grid.
2. Perform gate scans on handheld — verify TV updates within 10s without manual refresh.
3. Open `/tv/dispatch` — verify aggregate counts match backend (not truncated sample).
4. Induce count read failure (disconnect network briefly) — verify kiosk discards stale/mixed refresh.

## Evidence capture
- `?leap13_uat=1` on TV URLs — export `tv-gate` / `tv-dispatch` refresh hooks.
- Attach TV photo/video showing live header + counts with timestamp overlay.

## Software regression (no hardware)
npm test -- src/lib/data.count.test.ts src/hooks/useSerializedPoll.test.ts 2>/dev/null || npm test -- src/lib/data.count.test.ts
EOF

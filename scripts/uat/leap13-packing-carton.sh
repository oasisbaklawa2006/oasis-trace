#!/usr/bin/env bash
# Leap13 packing / cartonization UAT — operator script (#462 evidence lane).
set -euo pipefail

cat <<'EOF'
# Packing / carton UAT (Leap13 — physical evidence required)

## Preconditions
- Packing role session
- Production labels printed (physical printer evidence separate)
- `?leap13_uat=1` enabled for hook capture

## Steps
1. Open `/cartonization`, select an open order, start carton — verify carton index increments.
2. Verify carton identity scan (Central barcode) — expect pass before pack.
3. Scan production labels into carton — verify duplicate/overpack blocked.
4. Seal carton with weights — verify handover evidence audit row + packed status.
5. Attempt DPL/PI binding on unsealed carton elsewhere — expect fail-closed rejection.

## Evidence capture
- Export `ols_leap13_evidence_v1` after seal step.
- Attach scale weight photo + label photos to #462 packet (physical).

## Software regression (no hardware)
npm test -- src/lib/packingContract.test.ts src/lib/cartonPacking.test.ts src/lib/cartonIndex.test.ts src/lib/handoverEvidence.test.ts
EOF

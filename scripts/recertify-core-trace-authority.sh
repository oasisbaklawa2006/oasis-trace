#!/usr/bin/env bash
# Recertify Trace live authority bindings against Core #259 merge SHA.
# Does NOT claim production authority until Core release #161 is SUCCESS.
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

CORE_SHA="c89c538c83eeefcd116c67f06bf86869ff63b2e3"
CORE_RELEASE=161
HEAD_SHA="$(git rev-parse HEAD)"

echo "=== Trace Core authority recertification (pre-production) ==="
echo "Trace HEAD: ${HEAD_SHA}"
echo "Core #259 merge SHA: ${CORE_SHA}"
echo "Core production release: #${CORE_RELEASE} (must be SUCCESS before live authority claim)"
echo ""

echo ">> unit + contract tests"
npm test

echo ">> typecheck"
npm run typecheck

echo ">> lint"
npm run lint

echo ">> build"
npm run build

echo ">> repo boundaries"
npm run check:boundaries

echo ">> Core backend authority (vs main)"
bash scripts/check-core-backend-authority.sh origin/main

echo ""
echo "Recertification preflight complete on Trace HEAD ${HEAD_SHA}."
echo "Production authority remains UNCLAIMED until Core release #${CORE_RELEASE} succeeds on ${CORE_SHA}."
echo "Physical scanner/printer/TV/custody evidence remains separate (Leap13 / #462)."

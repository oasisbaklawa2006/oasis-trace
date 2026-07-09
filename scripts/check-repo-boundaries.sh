#!/usr/bin/env bash
# Repo ownership boundary check for oasis-trace.
# Fails if this repo absorbs Central admin/operations screens, AI-Studio's
# catalogue/product-intelligence workspace, or new Supabase Core backend/
# schema ownership. See docs/repo-ownership-guardrails.md for the ownership
# split this enforces.
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

violations=0
warnings=0

# ---------------------------------------------------------------------------
# 1. Central admin ownership and AI-Studio ownership strings must never
#    appear in src/. Trace's own routes/components legitimately share plain
#    words with these domains (/finance, /dispatch, /production, FinancePI,
#    DispatchBundle, ProductionEntry) — every pattern below is either
#    /admin/-prefixed or a specific PascalCase compound identifier, so none
#    of them match Trace's own bare route/component names.
# ---------------------------------------------------------------------------
CENTRAL_PATTERNS=(
  "/admin/orders"
  "/admin/finance"
  "/admin/dispatch"
  "/admin/warehouse"
  "/admin/inventory"
  "/admin/production"
  "AdminOrders"
  "AdminFinance"
  "AdminPackingDispatch"
  "DispatchManagement"
  "InventoryCommandCenter"
  "FinanceGovernanceBoard"
  "ApprovalInbox"
  "AdminProducts"
)

AI_STUDIO_PATTERNS=(
  "/admin/catalogue-product-studio"
  "Catalogue Product AI Studio"
  "Content Draft Studio"
  "Media / Hero Image Prompt Studio"
  "Packaging + Variant"
  "Export / Copy Bundle"
  "catalogue_ai_studio_drafts"
  "catalogue_ai_studio_draft_audit_log"
)

if [ -d "src" ]; then
  for pattern in "${CENTRAL_PATTERNS[@]}"; do
    matches="$(grep -rIl --fixed-strings -- "$pattern" src 2>/dev/null || true)"
    if [ -n "$matches" ]; then
      echo "BOUNDARY VIOLATION: Central admin ownership pattern \"$pattern\" found in:"
      echo "$matches" | sed 's/^/  /'
      violations=$((violations + 1))
    fi
  done
  for pattern in "${AI_STUDIO_PATTERNS[@]}"; do
    matches="$(grep -rIl --fixed-strings -- "$pattern" src 2>/dev/null || true)"
    if [ -n "$matches" ]; then
      echo "BOUNDARY VIOLATION: AI-Studio ownership pattern \"$pattern\" found in:"
      echo "$matches" | sed 's/^/  /'
      violations=$((violations + 1))
    fi
  done
else
  echo "NOTE: src/ not found — skipping Central/AI-Studio ownership scan."
fi

# ---------------------------------------------------------------------------
# 2. Backend/schema ownership belongs to oasis-supabase-core, not Trace.
#    Pre-existing legacy content (db/*.sql, supabase/functions/submit-central-scan,
#    predating this ownership split) is reported as a warning only — see
#    docs/repo-ownership-guardrails.md. Ownership is enforced purely at FILE
#    IDENTITY level (new vs. already-tracked-at-base), never by diffing an
#    existing file's changed lines (a line-diff DDL grep can't distinguish a
#    genuinely new statement from a reformat of an already-legacy file):
#      a) A brand new supabase/migrations/*.sql or supabase/functions/** path
#         is always a hard failure outright — the location alone is the
#         whole schema/Edge-Function surface.
#      b) A brand new *.sql path anywhere under db/ is only a hard failure
#         if its content contains a DDL/RLS/backend-ownership statement
#         (DDL_PATTERNS below) — a non-schema .sql file isn't itself a
#         violation, and because the whole file is new this is a plain
#         content grep, not a diff, so no reformat/line-ending false
#         positive is possible.
#    "New" covers untracked, staged, or committed-since-base alike.
# ---------------------------------------------------------------------------
DDL_PATTERNS=(
  "CREATE TABLE"
  "ALTER TABLE"
  "DROP TABLE"
  "CREATE POLICY"
  "ALTER POLICY"
  "ENABLE ROW LEVEL SECURITY"
  "CREATE FUNCTION"
  "CREATE TRIGGER"
)

# True if the given (currently-existing-on-disk) file contains any DDL/RLS/
# backend-ownership statement. Only ever called on a file that is entirely
# NEW — never on an existing file's diff.
file_has_ddl() {
  local f="$1" p
  [ -f "$f" ] || return 1
  for p in "${DDL_PATTERNS[@]}"; do
    if grep -F -q -- "$p" "$f" 2>/dev/null; then
      return 0
    fi
  done
  return 1
}

# BOUNDARY_BASE_REF, when set to a real sha/ref (e.g. by CI — see
# .github/workflows/repo-boundaries.yml), is the correct diff base for this
# run (the PR base sha, or the pre-push sha) and is expected to resolve: if
# it doesn't, that's a checkout/history problem, not "no base available", so
# we fail loudly rather than silently falling through to a same-commit
# origin/main diff that would report zero new violations no matter what
# changed.
#
# Three distinct cases, handled separately (do not collapse the all-zero
# case into the "unset" case — they must NOT behave the same):
#   - BOUNDARY_BASE_REF unset/empty — local/dev run, or a CI trigger with no
#     natural base (e.g. workflow_dispatch). Falls back to origin/main if
#     resolvable; warns and skips tracked-diff checks if not.
#   - BOUNDARY_BASE_REF is the all-zero sha. GitHub sets github.event.before
#     to this on a push event with no prior commit to point at (creating a
#     branch, or main's very first push) — there is genuinely no "before"
#     commit to diff against. This means "no reliable tracked base exists",
#     NOT "no base was specified" — falling back to origin/main here would
#     silently diff against an unrelated/same-commit base and either miss
#     real violations or report phantom ones. HAVE_BASE stays 0 and BASE_REF
#     is never set to origin/main for this run; only base-independent checks
#     (the untracked-file scan above) apply.
#   - BOUNDARY_BASE_REF is non-empty, non-zero, and doesn't resolve — a real
#     checkout/history problem. Fails loudly (exit 1).
# Either way, the untracked-file checks above already ran regardless of any
# of this — they need no base at all.
ALL_ZERO_SHA_RE='^0+$'
HAVE_BASE=0
ZERO_BASE=0
BASE_REF=""
if [ -n "${BOUNDARY_BASE_REF:-}" ]; then
  if [[ "${BOUNDARY_BASE_REF}" =~ $ALL_ZERO_SHA_RE ]]; then
    echo "WARNING: Boundary base ref is all-zero; tracked diff checks are skipped for this run."
    ZERO_BASE=1
  else
    BASE_REF="$BOUNDARY_BASE_REF"
    if git rev-parse --verify --quiet "${BASE_REF}^{commit}" >/dev/null 2>&1; then
      HAVE_BASE=1
    else
      echo "ERROR: BOUNDARY_BASE_REF=\"${BASE_REF}\" was provided but could not be resolved to a commit."
      echo "This usually means the checkout did not fetch enough history (actions/checkout needs fetch-depth: 0) or the base sha is invalid."
      echo "Failing loudly instead of silently skipping the diff-based boundary checks — see docs/repo-ownership-guardrails.md."
      exit 1
    fi
  fi
else
  BASE_REF="origin/main"
  if git rev-parse --verify --quiet "${BASE_REF}^{commit}" >/dev/null 2>&1; then
    HAVE_BASE=1
  fi
fi

if [ -d "db" ]; then
  existing_db_sql="$(find db -type f -name '*.sql' 2>/dev/null | sort)"
  if [ -n "$existing_db_sql" ]; then
    count="$(echo "$existing_db_sql" | wc -l | tr -d ' ')"
    echo "NOTE: db/ contains $count pre-existing .sql file(s) — legacy content predating the ownership split, not enforced by this check. See docs/repo-ownership-guardrails.md."
    warnings=$((warnings + 1))
  fi
fi

if [ -d "supabase/functions" ]; then
  existing_functions="$(find supabase/functions -mindepth 1 -maxdepth 1 -type d 2>/dev/null | sort)"
  if [ -n "$existing_functions" ]; then
    count="$(echo "$existing_functions" | wc -l | tr -d ' ')"
    echo "NOTE: supabase/functions contains $count pre-existing Edge Function(s) — legacy content predating the ownership split, not enforced by this check. See docs/repo-ownership-guardrails.md."
    warnings=$((warnings + 1))
  fi
fi

# Untracked new files — this check needs no base ref at all (an untracked
# file has no history to diff against) and must always run, so a missing/
# unresolvable base ref can never let a new schema/function file slip
# through the local pre-PR gate.
untracked_migrations="$(git ls-files --others --exclude-standard -- supabase/migrations 2>/dev/null | grep -E '\.sql$' || true)"
if [ -n "$untracked_migrations" ]; then
  echo "BOUNDARY VIOLATION: untracked Supabase migration file(s) — schema ownership belongs to oasis-supabase-core:"
  echo "$untracked_migrations" | sed 's/^/  /'
  violations=$((violations + 1))
fi

untracked_functions="$(git ls-files --others --exclude-standard -- supabase/functions 2>/dev/null || true)"
if [ -n "$untracked_functions" ]; then
  echo "BOUNDARY VIOLATION: untracked Supabase Edge Function file(s) — Edge Function ownership belongs to oasis-supabase-core:"
  echo "$untracked_functions" | sed 's/^/  /'
  violations=$((violations + 1))
fi

untracked_db_sql="$(git ls-files --others --exclude-standard -- db 2>/dev/null | grep -E '\.sql$' || true)"
if [ -n "$untracked_db_sql" ]; then
  while IFS= read -r f; do
    [ -z "$f" ] && continue
    if file_has_ddl "$f"; then
      echo "BOUNDARY VIOLATION: untracked db/ SQL file contains DDL — schema authority belongs to oasis-supabase-core: $f"
      violations=$((violations + 1))
    fi
  done <<< "$untracked_db_sql"
fi

if [ "$HAVE_BASE" -eq 1 ]; then
  # New backend paths committed or staged since the base branch.
  #
  # `--diff-filter=A` (added) alone is NOT enough: `git mv some/other/file.sql
  # supabase/migrations/x.sql`, or copying a tracked file into supabase/ or
  # db/, is reported by git as status R (renamed) or C (copied), never A — so
  # an A-only filter lets a file walk straight into forbidden backend-
  # ownership territory without ever showing up as "added". We scan the FULL
  # repo diff (no pathspec — restricting up front can suppress rename
  # pairing against a source path outside it) with rename/copy detection on,
  # then classify every row ourselves:
  #   - A/T rows have one path column: that path IS the new/changed file —
  #     always treated as newly introduced, hard-fail policy applies.
  #   - R/C rows have two path columns (old, new). The DESTINATION is what
  #     ownership check applies (a rename is checked against where the file
  #     ends up, not where it used to live) — BUT a rename/copy of a file
  #     that was ALREADY a tracked legacy backend file at the base is not
  #     "new" ownership, just the same pre-existing legacy content moving —
  #     so it must stay warning-only, exactly like editing it in place would.
  #     Moving a NON-backend source (src/foo.ts, docs/example.sql, ...) into
  #     a backend location IS new ownership and still hard-fails. This is
  #     checked with `git cat-file -e "${BASE_REF}:${source}"` — does that
  #     exact path exist as a blob in the base commit? — not just "was this
  #     row classified as a rename", since that alone doesn't tell us the
  #     source was itself already backend content.
  #     supabase/migrations/*.sql is held to a stricter version of this rule
  #     (source must have ALSO already been under supabase/migrations/*.sql,
  #     not just any legacy backend area) since this repo has no pre-existing
  #     migrations at all — any migration is new schema ownership unless it
  #     is unambiguously a rename of another already-tracked migration.
  source_existed_in_base() {
    git cat-file -e "${BASE_REF}:${1}" 2>/dev/null
  }
  is_legacy_backend_source() {
    case "$1" in
      db/*.sql|supabase/functions/*) source_existed_in_base "$1" ;;
      *) return 1 ;;
    esac
  }
  is_legacy_migration_source() {
    case "$1" in
      supabase/migrations/*.sql) source_existed_in_base "$1" ;;
      *) return 1 ;;
    esac
  }

  new_migrations=""
  new_functions=""
  new_db_sql=""
  legacy_moves=""
  while IFS=$'\t' read -r status path1 path2; do
    [ -z "$status" ] && continue
    case "$status" in
      A*|T*)
        dest="$path1"
        case "$dest" in
          supabase/migrations/*.sql) new_migrations="${new_migrations}${dest}"$'\n' ;;
          supabase/functions/*) new_functions="${new_functions}${dest}"$'\n' ;;
          db/*.sql) file_has_ddl "$dest" && new_db_sql="${new_db_sql}${dest}"$'\n' ;;
        esac
        ;;
      R*|C*)
        src="$path1"
        dest="$path2"
        case "$dest" in
          supabase/migrations/*.sql)
            if is_legacy_migration_source "$src"; then
              legacy_moves="${legacy_moves}${src} -> ${dest}"$'\n'
            else
              new_migrations="${new_migrations}${dest}"$'\n'
            fi
            ;;
          supabase/functions/*)
            if is_legacy_backend_source "$src"; then
              legacy_moves="${legacy_moves}${src} -> ${dest}"$'\n'
            else
              new_functions="${new_functions}${dest}"$'\n'
            fi
            ;;
          db/*.sql)
            # Legacy-source visibility must not depend on the destination's
            # DDL content — a rename/copy of an already-legacy db/ file is
            # worth noting regardless of what it contains, so it is reported
            # unconditionally here. A NON-legacy source landing in db/ is
            # only a hard failure if it actually contains DDL (a stray
            # non-schema .sql file dropped into db/ isn't itself a
            # violation, matching the untracked/A-row db/ handling above).
            if is_legacy_backend_source "$src"; then
              legacy_moves="${legacy_moves}${src} -> ${dest}"$'\n'
            elif file_has_ddl "$dest"; then
              new_db_sql="${new_db_sql}${dest}"$'\n'
            fi
            ;;
        esac
        ;;
      *) continue ;;
    esac
  done < <(git diff --name-status -M -C --diff-filter=ACRT "${BASE_REF}" 2>/dev/null)
  new_migrations="$(printf '%s' "$new_migrations" | grep -v '^$' | sort -u || true)"
  new_functions="$(printf '%s' "$new_functions" | grep -v '^$' | sort -u || true)"
  new_db_sql="$(printf '%s' "$new_db_sql" | grep -v '^$' | sort -u || true)"
  legacy_moves="$(printf '%s' "$legacy_moves" | grep -v '^$' | sort -u || true)"

  if [ -n "$new_migrations" ]; then
    echo "BOUNDARY VIOLATION: new Supabase migration path(s) introduced (added, or renamed/copied in from a non-migration source) — schema ownership belongs to oasis-supabase-core:"
    echo "$new_migrations" | sed 's/^/  /'
    violations=$((violations + 1))
  fi
  if [ -n "$new_functions" ]; then
    echo "BOUNDARY VIOLATION: new Supabase Edge Function path(s) introduced (added, or renamed/copied in from a non-backend source) — Edge Function ownership belongs to oasis-supabase-core:"
    echo "$new_functions" | sed 's/^/  /'
    violations=$((violations + 1))
  fi
  if [ -n "$new_db_sql" ]; then
    echo "BOUNDARY VIOLATION: new db/ SQL path(s) contain DDL (added, or renamed/copied in from a non-backend source) — schema authority belongs to oasis-supabase-core:"
    echo "$new_db_sql" | sed 's/^/  /'
    violations=$((violations + 1))
  fi
  if [ -n "$legacy_moves" ]; then
    count="$(echo "$legacy_moves" | wc -l | tr -d ' ')"
    echo "NOTE: $count legacy backend file(s) renamed/copied within backend ownership areas — warning only, not a hard failure (see docs/repo-ownership-guardrails.md):"
    echo "$legacy_moves" | sed 's/^/  /'
    warnings=$((warnings + 1))
  fi

  # Edits to EXISTING legacy db/ or supabase/functions files (same path in
  # base and HEAD, i.e. genuinely status M — rename detection above doesn't
  # reclassify same-path changes) — warning only, never a hard failure, no
  # matter what content (including DDL keywords) the edit touches. This is
  # what makes a routine legacy-file reformat pass instead of false-
  # positiving.
  modified_db_sql="$(git diff --name-only -M -C --diff-filter=M "${BASE_REF}" -- db 2>/dev/null | grep -E '\.sql$' || true)"
  if [ -n "$modified_db_sql" ]; then
    count="$(echo "$modified_db_sql" | wc -l | tr -d ' ')"
    echo "NOTE: $count existing legacy db/ file(s) modified — warning only, not a hard failure (see docs/repo-ownership-guardrails.md):"
    echo "$modified_db_sql" | sed 's/^/  /'
    warnings=$((warnings + 1))
  fi

  modified_functions="$(git diff --name-only -M -C --diff-filter=M "${BASE_REF}" -- supabase/functions 2>/dev/null || true)"
  if [ -n "$modified_functions" ]; then
    count="$(echo "$modified_functions" | wc -l | tr -d ' ')"
    echo "NOTE: $count existing legacy supabase/functions file(s) modified — warning only, not a hard failure (see docs/repo-ownership-guardrails.md):"
    echo "$modified_functions" | sed 's/^/  /'
    warnings=$((warnings + 1))
  fi
elif [ "$ZERO_BASE" -eq 0 ]; then
  echo "NOTE: base ref \"${BASE_REF}\" not available — skipping tracked-file diff checks (nothing to compare against). Untracked-file checks above still ran."
fi
# (When ZERO_BASE=1, the WARNING already printed above explains why tracked-
# diff checks are skipped this run — no need to repeat it here.)

# ---------------------------------------------------------------------------
if [ "$violations" -gt 0 ]; then
  echo ""
  echo "Repo ownership boundary check FAILED ($violations violation(s), $warnings pre-existing warning(s))."
  echo "See docs/repo-ownership-guardrails.md."
  exit 1
fi

echo ""
echo "Repo ownership boundary check passed ($warnings pre-existing legacy warning(s), 0 new violations)."

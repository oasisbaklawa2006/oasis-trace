#!/usr/bin/env bash
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"
base_ref="${1:-}"

fail() {
  echo "CORE BACKEND AUTHORITY VIOLATION: $*" >&2
  exit 1
}

[[ -n "$base_ref" ]] || fail "comparison base is required"
[[ ! "$base_ref" =~ ^0+$ ]] || fail "all-zero comparison base is not auditable"
git rev-parse --verify "${base_ref}^{commit}" >/dev/null 2>&1 || fail "comparison base does not resolve: $base_ref"

is_core_owned_path() {
  case "$1" in
    supabase/migrations/*.sql|supabase/functions/*|db/*.sql) return 0 ;;
    *) return 1 ;;
  esac
}

violations=()
while IFS=$'\t' read -r status path1 path2; do
  [[ -n "$status" ]] || continue
  case "$status" in
    R*|C*)
      if is_core_owned_path "$path1" || is_core_owned_path "$path2"; then
        violations+=("$status $path1 -> $path2")
      fi
      ;;
    *)
      if is_core_owned_path "$path1"; then
        violations+=("$status $path1")
      fi
      ;;
  esac
done < <(git diff --name-status -M -C "$base_ref" HEAD)

while IFS= read -r path; do
  [[ -n "$path" ]] || continue
  if is_core_owned_path "$path"; then
    violations+=("untracked $path")
  fi
done < <(git ls-files --others --exclude-standard)

if ((${#violations[@]})); then
  echo "CORE BACKEND AUTHORITY VIOLATION: Trace may consume Core contracts but may not mutate historical DB SQL, Supabase migrations, or Edge Functions." >&2
  printf '  %s\n' "${violations[@]}" >&2
  echo "Move backend/schema changes to oasisbaklawa2006/oasis-supabase-core." >&2
  exit 1
fi

echo "Core backend authority guard passed: historical Trace backend artifacts are frozen and no Core-owned backend surface changed."

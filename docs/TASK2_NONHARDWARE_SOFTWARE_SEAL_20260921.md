# Task 2 — Trace non-hardware software seal

Date: 2026-09-21  
Trace baseline: `381c48658e339c581248b6959482d7977d7b42ab`

## Read-only production census

The prior certification script listed eleven Core RPCs. A direct read-only
production pg_proc census found four of those live client surfaces absent:

- `trace_add_carton_content_v1`
- `trace_allocate_carton_index_v1`
- `trace_reconcile_external_refs_v1`
- `trace_legacy_gate_clear_v1`

The live gate-scan UI path also attempted browser-side INSERTs into RLS-protected
`ols_gate_scans` / `ols_scan_history`, so a fifth governed surface,
`trace_record_gate_scan_v1`, is required.

This means the earlier phrase "software production ready" was too broad. This
seal corrects the evidence rather than preserving a false-green claim.

## Source closure

Core PR #342 supplies the five missing governed RPCs, server-side idempotency,
carton membership/index uniqueness, Finance-gated legacy dispatch and server
gate-scan recording.

This Trace change:

- routes live gate scan evidence through `trace_record_gate_scan_v1`;
- removes the redundant browser-side external-ref UPDATE after the Core RPC;
- adds gate-scan authority to the canonical Trace/Core contract;
- extends production RPC presence recertification.

## Remaining boundaries

- Core PR #342 must merge after exact-head CI/review.
- Production application of its migration is held by the canonical Task 5
  `T5-WA-001` release gate.
- scanner, printer, TV and custody-device evidence remains physical UAT.
- no physical PASS is inferred from software tests.

Once #342 is merged and its migration is later released under the production
safety gate, the recertification script must be rerun against that exact
production head before `production_runtime_verified` can be claimed.

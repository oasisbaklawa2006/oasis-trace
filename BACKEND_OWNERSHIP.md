# Backend Ownership Boundary

This repository is the Oasis Trace / labelling / barcode / printer application repository.

It is not the canonical Supabase backend authority.

Canonical backend repository: oasis-supabase-core

Trace may contain label UI, barcode workflows, printer flows, product traceability screens, and application-layer logic.

Trace must not casually own or deploy supabase/functions, supabase/migrations, supabase/config.toml, production schema changes, RLS policies, or storage policies.

High-risk rule: do not deploy whatsapp-webhook from this repository.

Backend infrastructure changes must be routed through oasis-supabase-core.

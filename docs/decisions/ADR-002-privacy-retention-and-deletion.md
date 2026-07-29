# ADR-002: privacy requests, retention and anonymisation

**Status:** accepted for technical implementation; legal periods pending review
**Date:** 2026-07-29

## Context

Data export, deletion, legal hold and retention require a coherent workflow.
The repository does not contain approved legal retention periods, and Codex may
not invent them.

## Decision

- Privacy requests are tenant-scoped, idempotent, status-driven and audited.
- Export workers assemble only subject- and tenant-filtered records, write to a
  private bucket and issue a one-minute signed download URL. Export objects
  expire operationally and have no public storage policy.
- Deletion first checks an explicit legal hold. Direct student identifiers are
  anonymised while financial and audit relationships remain intact. Auth account
  deletion happens only for an approved account-deletion request.
- Retention policies are immutable version records with per-category ISO-8601
  periods, action, legal-basis reference and approval status.
- Unknown periods are `null`; their dry-run decision is always `REVIEW`.
- A dry-run writes an audit record and never mutates subject data.
- Only service-role application workflows may mutate privacy tables. RLS allows
  subject or authorized tenant reads without enabling direct client writes.

## Consequences

The workflow is technically executable without a legal fiction. Production
execution of retention rules remains gated until a named owner/legal reviewer
sets periods and approves a content hash.

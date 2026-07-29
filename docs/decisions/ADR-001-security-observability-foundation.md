# ADR-001: vendor-neutral security and observability foundation

**Status:** accepted
**Date:** 2026-07-29

## Context

The application had partial proxy security headers, no application CSP,
correlation IDs or portable telemetry export. Selecting a paid monitoring vendor
is an external commercial decision.

## Decision

- Every dynamic application response receives a request nonce, correlation ID,
  CSP, Permissions Policy and the shared browser security policy in middleware.
- CSP uses a nonce and `strict-dynamic`; permanent `unsafe-eval` is forbidden.
  Inline styles remain temporarily allowed because the current React/Next
  rendering stack and component system require them.
- HSTS is emitted by the application only in production and remains present at
  the production proxy.
- Logs are structured JSON with sensitive-key redaction and safe error
  serialization.
- W3C-sized trace/span identifiers and optional OTLP/HTTP export are supported
  through environment configuration. Structured stdout remains the fallback.
- Rate limits use an atomic PostgreSQL bucket RPC. Process memory is not a
  release-grade store.
- Public diagnostics are split into live, ready and version routes. Readiness
  returns generic failure descriptions and never database or secret values.

## Consequences

No paid provider blocks the pilot. A collector can later be selected by setting
`OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_EXPORTER_OTLP_HEADERS` and
`OTEL_SERVICE_NAME`. CSP violations and external browser origins must be
validated in staging before production enforcement changes.

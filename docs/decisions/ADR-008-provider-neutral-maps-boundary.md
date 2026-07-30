# ADR-008 — Provider-neutrale Maps-grens

- Status: accepted
- Date: 2026-07-30

## Context

Directe providercalls vanuit pagina's zouden authenticatie, limieten, caching, privacy en kostentoerekening omzeilen.

## Decision

Alle Places-, validation-, geocoding-, matrix- en optimalisatiecalls lopen server-side via `domains/maps`. De gateway voert featuregating, responsevalidatie, deduplicatie, metering, caching, timeouts, circuitbreaking en expliciete fallback uit.

## Consequences

Surfaces gebruiken NXTDrive-contracten in plaats van Google-types. Nieuwe providers kunnen achter dezelfde contracten worden toegevoegd.

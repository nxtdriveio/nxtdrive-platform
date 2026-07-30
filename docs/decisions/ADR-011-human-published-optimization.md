# ADR-011 — Menselijke publicatiegrens voor optimalisatie

- Status: accepted
- Date: 2026-07-30

## Context

Een optimalisatieprovider kent niet alle menselijke, didactische en operationele omstandigheden.

## Decision

Provideruitvoer wordt een immutable conceptscenario. Een bevoegde planner vergelijkt, selecteert en publiceert mutaties expliciet. Automatische publicatie is verboden; iedere toepassing en rollback is geaudit.

## Consequences

Optimalisatie kan veilig worden voorbereid en gemeten zonder het rooster zelfstandig te wijzigen.

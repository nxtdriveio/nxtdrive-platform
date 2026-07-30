# ADR-005 — Versioned location entity

- Status: accepted
- Date: 2026-07-30

## Context

Adressen stonden verspreid over leads, leerlingprofielen, afspraken en de bestaande operationele tabel `locations`. Stil hergebruik zou historische betekenis veranderen en gepubliceerde lessen laten meebewegen met profielwijzigingen.

## Decision

`location_records` is de stabiele tenantgebonden identiteit; `location_versions` bevat immutable adresinhoud, coördinaten, kwaliteit en provenance. Typed relaties koppelen een versie aan een eigenaar of doel. De bestaande `locations` blijft bestaan totdat cohortmigratie en parity aantoonbaar zijn.

## Consequences

Adreswijzigingen maken een versie. Lezingen moeten expliciet kiezen tussen huidig record en historisch snapshot. Migratie is additief en terugschakelbaar.


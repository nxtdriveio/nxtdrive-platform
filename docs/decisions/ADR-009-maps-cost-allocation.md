# ADR-009 — Kostenallocatie voor Maps

- Status: accepted
- Date: 2026-07-30

## Context

Catalogusprijzen, interne tenantallocatie en de werkelijke Google-factuur zijn verschillende grootheden.

## Decision

Het usage-ledger bewaart providerproduct, eenheden, prijsversie en gewogen kostenunits zonder adresdata. Rapportage onderscheidt bruto gebruikswaarde, toegerekende tenantkosten en gereconcilieerde accountkosten. Correcties zijn append-only.

## Consequences

Bedragen blijven verklaarbaar bij prijswijzigingen. Reconciliatieverschillen worden zichtbaar in plaats van stil over tenants verdeeld.

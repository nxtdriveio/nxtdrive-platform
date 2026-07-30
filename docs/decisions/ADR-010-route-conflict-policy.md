# ADR-010 — Reistijdconflicten als beleid

- Status: accepted
- Date: 2026-07-30

## Context

Reistijd is onzeker en tenantprocessen verschillen. Een enkel gemiddeld getal mag een planning niet stil blokkeren of goedkeuren.

## Decision

De preview geeft `ok`, `warning`, `blocked` of `unknown` met reistijd, buffer, dekking, bron en reden. Tenantbeleid bepaalt buffers en hard/soft gedrag. Een geautoriseerde override vereist reden, actor en tijdstip en blijft naast de blokkade zichtbaar.

## Consequences

Preview en commit moeten dezelfde beleidsversie gebruiken. Provideruitval levert `unknown`, geen verzonnen zekerheid.


# ADR-007 — Geïsoleerde map-origin en CSP

- Status: accepted, activation pending
- Date: 2026-07-30

## Context

De hoofdapp gebruikt een strikte nonce-CSP. Google Maps kan aanvullende script- en connectorigins vereisen; globaal versoepelen zou ieder portaal raken.

## Decision

Interactieve kaarten worden alleen geactiveerd op `https://maps.nxtdrive.io` en ingebed via een nauw begrensd framecontract. De hoofdapp houdt `strict-dynamic`, blokkeert `unsafe-eval` en gebruikt een lijstweergave zolang origin, headers en deployment niet zijn gevalideerd.

## Consequences

Een aparte deployment- en DNS-actie is nodig. Kernplanning blijft zonder kaart bruikbaar.


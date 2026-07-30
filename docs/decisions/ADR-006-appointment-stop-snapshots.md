# ADR-006 — Immutable afspraakstops

- Status: accepted
- Date: 2026-07-30

## Context

Een les moet later verklaarbaar blijven, ook als de leerling een thuis- of ophaaladres wijzigt.

## Decision

Bij publicatie krijgt ieder relevant afspraakmoment een `appointment_stop` met genormaliseerde tekst, coördinaten, versieherkomst en snapshotmetadata. Een profielwijziging herschrijft dit record nooit.

## Consequences

Historie en privacy-export zijn betrouwbaar. Een planner moet een gepubliceerde stop via een nieuwe, geaudite wijziging vervangen.

---
name: CBR machtiging 3-state + derived exam status
description: Durable design decisions for Module 13 CBR Fase 1 — machtiging state model and how exam outcomes are surfaced.
---

# Machtiging: 3-state enum keeps the legacy boolean as a mirror

Machtiging is a 3-state enum (nog_nodig / aangevraagd / ontvangen). The older boolean
(machtiging_geregeld) is kept and written in lockstep as a derived mirror: ontvangen ⇒ true.

**Why:** several earlier modules (dossier status bar, readiness, parent portal) already read the
boolean. Keeping it as a mirror avoids touching every reader while introducing the richer state.

**How to apply:** any new write path must set both columns consistently or filtered reads on the
boolean go stale. The backfill invariant (geregeld=true ⇒ ontvangen) is asserted in the CBR RLS test.

# Derived exam status must never hide the last outcome

The headline exam status is forward-looking: a failed exam with a re-exam scheduled shows
"examen gepland", not "gezakt". But the last completed exam's result + advice must stay surfaced
independently of the headline (canon: "na afloop — de uitslag met vervolgadvies").

**Why:** an early version only showed the gezakt advice when the headline equalled gezakt, so
rescheduling a re-exam silently hid the previous failure + advice from the student. A code review
caught this as a core-requirement gap.

**How to apply:** keep last-result fields (result + date + note) on the derived status and render
them on their own, gated on "a completed exam with a result exists", not on the headline status.
Canon status vocabulary for exams is examen_gepland / geslaagd / gezakt — match those names.

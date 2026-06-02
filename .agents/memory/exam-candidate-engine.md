---
name: Exam-candidate (CBR) suggestion engine
description: How the exam-moment student-ranking engine gates eligibility and which signals it weighs, distinct from the lesson-slot engine.
---

# Exam-candidate ranking (CBR-aware)

A second slot→student engine, parallel to the lesson-slot engine, for ranking
existing students against an available exam / interim-test moment in the agenda.

**Why a separate engine, not route-aware:** an exam happens at a fixed CBR test
centre, so pickup/travel-route reasoning does NOT apply. Daypart availability is
still a soft preference. The lesson-slot engine's route layer is deliberately
omitted here.

**Three-way eligibility verdict** (pure function):
- `excluded` (never shown): busy over the slot, already `geslaagd`, or already
  has a future planned moment of the *same* slot type. These aren't meaningful
  suggestions, so they're dropped silently — not surfaced as "blocked".
- `blocked` (shown WITH NL reasons): a fixable hard CBR precondition is unmet —
  theorie not behaald, machtiging != `ontvangen` (3-state enum), gezondheids-
  verklaring required-but-not-geregeld, or balance < slot duration. All unmet
  reasons are collected. Blocked list is sorted closest-to-ready (fewest
  blockers first) so the planner sees who's almost there.
- `eligible`: passes every gate → scored + ranked.

**Why "blocked" is shown, not dropped:** the canon wants hard-unsuitable students
visible with a reason so the planner knows who to chase, distinct from the truly
irrelevant `excluded` set.

**Scoring signals** (all tenant-tunable via the existing `lesson_planning_policy`
key — no new policy key/UI; weights clamp -50..50):
readiness advice (examenwaardig / bijna / niet), failed-before urgency
(herexamen), "ready but no exam planned" waiting urgency, preferred-daypart
availability, and a critical-aandachtspunten penalty (critical safety skills
still below threshold). Readiness is the central signal and is loaded ONLY for
the eligible pool (already small after the CBR gates), via `loadStudentReadiness`
with failures swallowed (degrade to no-readiness, still eligible).

**How to apply:** reuse `loadTenantCbrOverview` for batched preconditions +
derived status (its `nextExamAt`/`nextToetsAt` give the per-slot-type
"hasUpcomingExam"); read-only/advisory — nothing is booked or invited (that's a
separate downstream task). Surfaced on the exam/interim_test appointment detail
page only while `planned` and result-less.

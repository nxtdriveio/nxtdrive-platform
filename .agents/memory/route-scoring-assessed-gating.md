---
name: Route-scoring anyAssessed gating
description: The non-obvious invariant shared by both planner route engines (trial + lesson-planning) — fits/reject/confirm must hinge on anyAssessed.
---

# Route scoring: gate everything on `anyAssessed`

Both route engines — `lib/trial-lessons/suggestions.ts` (`applyRouteScoring`) and
`lib/lesson-planning/candidates.ts` (`applyRouteToCandidate`) — share one
invariant that is easy to miss when mirroring one from the other:

A travel **leg counts as "assessed" only when BOTH its travel time AND its
neighbour gap exist.** Track this with an `anyAssessed` flag and gate ALL of:
- `route_fits` factor — award only when `anyAssessed && allFit`
- hard `reject` — only when `allowReject && anyAssessed && !allFit && !anyEstimated`
- `status` — `!anyAssessed ? "unavailable" : anyEstimated ? "estimated" : "computed"`
- `needs_manual_confirm` — `anyAssessed && (estimated || !allFit)`

**Why:** Without the `anyAssessed` gate, a candidate with a travel time but no
neighbour gap (or vice-versa) silently gets `allFit === true` left over from its
initialiser, so it is awarded a spurious "fits" bonus and reported as
`computed`/confirmed when nothing was actually checked. A code review caught this
in the lesson-planning engine when it had only an `allFit` check.

**How to apply:** Any future inverse/variant of these planners (or edits to the
buffer/near/detour logic) must preserve the `anyAssessed` gate. Estimates
(Haversine) never hard-reject — they keep the candidate and flag
`needs_manual_confirm`; only real Google-computed non-fitting gaps reject.

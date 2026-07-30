# ADR-003 — Evidence-driven readiness and versioned assessments

- Status: accepted for technical implementation
- Date: 2026-07-29
- Expert status: awaiting real curriculum and policy validation

## Context

The previous leskaart helper treated an unassessed value as a numeric level,
averaged levels across unrelated skills and exposed an exam-readiness
percentage. RIS steps 1–8 are instructional stages, not uniform quality
scores. A `readyForModuleTest` boolean could also bypass blockers.

Those behaviours cannot support an auditable pilot decision. They hide missing
coverage, allow unrelated skills to compensate critical safety evidence and
cannot explain a result back to its source observations.

## Decision

NXTDRIVE uses exactly these training methods:

- `STANDARD`;
- `RIS_2_0`;
- `RIS_1_0_LEGACY`.

The product language keeps five concepts separate:

| Concept | Meaning | May be used as formal exam advice? |
| --- | --- | --- |
| RIS instructional stage | The didactic phase in which an exercise is taught | No |
| Mastery | Demonstrated performance, support and safety evidence | No, not by itself |
| Coverage | The share of required evidence that was actually assessed | No |
| NXTDRIVE readiness recommendation | An explainable, policy-versioned staff signal with visible blockers | Only as internal decision support |
| Formal CBR/exam recommendation | A professional decision outside this engine | Never generated or claimed by NXTDRIVE |

`RIS_1_0_LEGACY` is import-only, historical and immutable. The database rejects
new lessons and assessments for it. Historical comparison is allowed only in
shadow mode.

The canonical readiness implementation is the framework-independent engine in
`@workspace/leskaart`. Method-specific adapters normalize STANDARD, RIS 2.0 and
legacy-import evidence. RIS 2.0 persists these dimensions separately:

- instructional stage;
- performance;
- support;
- safety;
- context.

The engine never computes an exam probability or aggregate readiness
percentage. It evaluates coverage, mastery, independence, critical blockers,
prerequisites, stability, regression and assessment state independently. Every
reason and blocker refers to stable reason and evidence IDs.

Each evaluation creates immutable input and result snapshots. Active mode is
possible only with a published policy whose exact content hash has been
approved by a real expert. Otherwise the same deterministic evaluation runs in
shadow mode and cannot support a production claim.

Assessment definitions and attempts are versioned. The lifecycle is:

`DRAFT → PLANNED → IN_PROGRESS → AWAITING_REVIEW → COMPLETED → PUBLISHED`

Any open attempt can become `VOIDED` with a reason. Learners can read only
`PUBLISHED` records. Retests create a new linked attempt and never overwrite
history.

Readiness overrides require the current evaluation, a reason code, note, actor,
time and the exact blocker snapshot. Tenant policy can require a second,
independent approval. Open safety blockers are non-overridable by default.

Curricula, readiness policies and assessment definitions become immutable on
publication. Publication guards verify audit fields, completeness, uniqueness,
assessment configuration and a matching approved expert-validation hash. The
existing RIS catalog and the technical STANDARD foundation enter
`AWAITING_EXPERT_VALIDATION`; this migration does not infer approval.

## Compatibility

Existing pre-canon display consumers can continue reading their old projection
while they are migrated. They are not a persistence or decision boundary. New
readiness evaluations, assessment planning and publication use only the
canonical engine and database domain introduced by this decision.

The historical `ready_for_test` and `ready_for_module_test` columns remain
readable for compatibility, but new writes force the assessment-level boolean
off and canonical guards never consult either value.

## Consequences

- Missing `N` observations reduce coverage and are never coerced to a level.
- A high RIS instruction stage cannot create mastery.
- Critical and safety blockers cannot disappear in an average.
- Evaluations and overrides can be reproduced from immutable evidence.
- Pilot operation can collect shadow comparisons before expert activation.
- Real expert review is an explicit external action; code and migrations do not
  impersonate that approval.

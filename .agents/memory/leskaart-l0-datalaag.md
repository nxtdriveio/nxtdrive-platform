---
name: Leskaart L0 datalaag (skill taxonomy + score model)
description: Durable design decisions for the leskaart skill-taxonomy/score data layer; read before L1–L6 leskaart work.
---

# Leskaart datalaag — decisions

- **Legacy flat CBR tables kept, not migrated into scores.** The old flat
  achieved/not-achieved CBR progress is left intact; the new hierarchical
  taxonomy + 1–10 score model lives alongside it.
  **Why:** the live instructor/student checklist UI still reads the flat tables,
  and a boolean "achieved" cannot honestly become a 1–10 grade — converting it
  would fabricate grades no instructor gave. "Migratiepad zonder dataverlies" =
  keep old data intact, migrate the UI onto the score model in L2/L3, then
  deprecate the flat tables.
  **How to apply:** when L2/L3 switch the UI over, plan the flat-table
  deprecation as its own step with an explicit per-surface authoritative model;
  never auto-seed scores from old boolean progress.

- **Grading happens only at the taxonomy leaf.** Categories/subcategories are
  structure, not gradable. Averages/readiness roll UP from leaves (that's L1).

- **A student's "current" grade for a skill = the grade on their most recent
  lesson for that skill** (by lesson start time, then write time). Editing an
  older lesson must never clobber a newer grade. This rule drives the rollup.

- **Taxonomy codes are dotted hierarchical paths** so they stay unique per
  tenant even when leaf labels repeat across subcategories. Uniqueness depends
  on this convention.

- **Provisioning intent:** canon seed is idempotent and actor-free at its core;
  a separate actor-gated + audited wrapper exists for explicit reseeds; new
  tenants are provisioned on insert and existing ones were backfilled. All score
  / taxonomy mutations are service_role-only.

- **Defense-in-depth gap (deferred):** score rows reference `lesson_id` but
  tenant-consistency for that lesson is enforced only in the RPC, not by a
  composite `(lesson_id, tenant_id)` FK (lessons lacks a unique(id,tenant_id)).
  Adding it is good hardening if a future task touches the lessons table.

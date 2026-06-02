---
name: Intake-analyse label/score mapping
description: Non-obvious mapping decisions in the deterministic Fase 1B intake analysis engine
---

# Intake-analyse (Fase 1B) mapping decisions

Engine: `artifacts/nxtdrive/lib/leads/intake-analysis.ts` (pure, deterministic, no AI). Result persisted in `lead_intake_analysis` via service-role RPC `upsert_lead_intake_analysis` (idempotent upsert, one row per lead).

- **`failed_exam_before` is derived from `has_done_exam === true`**, NOT a real pass/fail field — the intake wizard never captures exam outcome. Anyone who already did an exam and is signing up at a (new) school is treated as re-exam focus (+3 herexamen). Worded "eerder gezakt / herexamenfocus" deliberately.
  **Why:** brief's scoring lists "eerder gezakt +3" but no such field exists; this is the agreed proxy.
- **`recommended_step` is always `plan_trial_lesson` for new leads** (canon: lead → proefles first). Open theory/admin actions are surfaced as attention points + in the summary, not as the primary step.
- **Availability class:** `preferred_days.length >= 4` → flexible; `<= 2` (and >0) → limited (+2 planningsrisico); 0 days = unknown (no label).
- **Backfill-on-read:** lead-detail page recomputes + upserts analysis if the row is missing (leads created before the feature), so the block always shows; safe because the upsert is idempotent.

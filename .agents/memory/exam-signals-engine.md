---
name: Exam signals (Examenflow B)
description: How school-signals around a planned exam/TTT are derived and converted to tasks.
---

Signals around a planned exam/TTT (theory_missing, not_ready, schedule_prep_lessons,
insufficient_credit) come from a single pure engine `deriveExamSignals(facts, policy, now)`
in `lib/exam/signals.ts`. The UI must NEVER trust client-sent signals: the convert action
re-derives them server-side from DB facts before creating tasks.

**Why:** mirrors the intake attention-point pattern; keeps the displayed signal and the
created task identical and tamper-proof.

**How to apply:** fact gathering lives in `loadExamSignals` (lib/exam/data.ts) — pass the
service client (caller is already staff-authorized + tenant-bounded). It returns null unless
the appointment is a planned, future exam/interim_test with a linked student. Conversion is
idempotent via `ensure_exam_signal_task` RPC keyed on dedupe_key `exam:{appointmentId}:{code}`;
a 23505 unique-violation is counted as "existing", never a duplicate. Policy thresholds
(minPrepLessons, minCreditBalance, warning/critical day windows) are tenant-configurable via
tenant_settings with defaults in signals.ts.

-- 0045_trial_lesson_notifications.sql
--
-- Task #61 — "proefles bevestiging" automatic messages (canon Module 12).
--
-- Adds two notification types to the existing email foundation:
--   * trial_lesson_received  — the prospect picked a preferred trial-lesson
--     moment (stored provisional); we acknowledge receipt.
--   * trial_lesson_confirmed — the backoffice confirmed the trial lesson.
--
-- Both are sent server-side via the existing dispatch pipeline (white-label
-- aware, idempotent per trial-lesson id, degrading gracefully when SendGrid is
-- not yet connected). This migration only widens the CHECK constraints that
-- gate the notification type/key columns; no new tables or RPCs are needed.
--
-- Same robust drop-then-readd pattern as 0029: the original CHECKs are
-- auto-named, so we find them by definition and replace them with named ones.

do $$
declare r record;
begin
  for r in
    select conname, conrelid::regclass::text as tbl
      from pg_constraint
     where contype = 'c'
       and conrelid in (
         'public.notification_log'::regclass,
         'public.notification_templates'::regclass
       )
       and pg_get_constraintdef(oid) ilike '%payment_confirmation%'
  loop
    execute format('alter table %s drop constraint %I', r.tbl, r.conname);
  end loop;
end $$;

alter table public.notification_log
  add constraint notification_log_type_check
  check (type in (
    'payment_confirmation',
    'lesson_reminder',
    'task_assigned',
    'trial_lesson_received',
    'trial_lesson_confirmed'
  ));

alter table public.notification_templates
  add constraint notification_templates_key_check
  check (key in (
    'payment_confirmation',
    'lesson_reminder',
    'task_assigned',
    'trial_lesson_received',
    'trial_lesson_confirmed'
  ));

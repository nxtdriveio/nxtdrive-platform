-- 0062_payment_reminder_notification.sql
-- Module 6 (vervolg) — Betaalherinneringen.
--
-- Adds an 8th notification type 'payment_reminder' to the notification_log and
-- notification_templates CHECK constraints. Same drop-by-definition pattern as
-- 0050: the constraints are named (notification_log_type_check /
-- notification_templates_key_check) after that migration, but we find them by
-- definition to stay robust, then re-add the full list including the new type.

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
       and pg_get_constraintdef(oid) ilike '%lesson_refill_confirmed%'
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
    'trial_lesson_confirmed',
    'lesson_refill_invitation',
    'lesson_refill_confirmed',
    'payment_reminder'
  ));

alter table public.notification_templates
  add constraint notification_templates_key_check
  check (key in (
    'payment_confirmation',
    'lesson_reminder',
    'task_assigned',
    'trial_lesson_received',
    'trial_lesson_confirmed',
    'lesson_refill_invitation',
    'lesson_refill_confirmed',
    'payment_reminder'
  ));

-- ===========================================================================
-- 0086 — Task #181: meld een verzette geplande rijles.
--
-- Een leerling/voogd kan sinds 0085 (student_reschedule_lesson) een eigen
-- geplande, toekomstige les naar een nieuw moment verplaatsen, maar niemand
-- werd op de hoogte gebracht. We voegen twee notificatietypes toe op de
-- bestaande, beproefde e-mail-/in-app-fundering (geen nieuwe providerkoppeling,
-- geen nieuwe tabellen of RPC's):
--
--   * lesson_rescheduled            — bevestiging aan de leerling/voogd die de
--                                     les heeft verzet (oude + nieuwe tijd).
--   * lesson_rescheduled_instructor — de toegewezen instructeur weet dat zijn
--                                     agenda is gewijzigd (oude + nieuwe tijd).
--
-- Beide lopen via de bestaande dispatch-laag (white-label-bewust, idempotent
-- per stabiele dedupe key die de nieuwe starttijd bevat, zodat elke verzetting
-- precies één keer meldt). Deze migratie verbreedt uitsluitend de CHECK-
-- constraints die de type/key-kolommen bewaken.
--
-- Zelfde robuuste drop-then-readd patroon als 0072/0081: vind de bestaande
-- CHECKs op definitie en vervang ze door named ones met de uitgebreide lijst.
-- ===========================================================================

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
    'trial_lesson_confirmed',
    'lesson_refill_invitation',
    'lesson_refill_confirmed',
    'payment_reminder',
    'exam_invitation',
    'exam_confirmed',
    'exam_planned',
    'exam_passed',
    'exam_failed',
    'intake_received',
    'lesson_cancelled',
    'invoice_created',
    'cbr_authorization_needed',
    'credit_low',
    'installment_due',
    'exam_day_reminder',
    'review_request',
    'parent_invoice_ready',
    'parent_lesson_scheduled',
    'lesson_rescheduled',
    'lesson_rescheduled_instructor'
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
    'payment_reminder',
    'exam_invitation',
    'exam_confirmed',
    'exam_planned',
    'exam_passed',
    'exam_failed',
    'intake_received',
    'lesson_cancelled',
    'invoice_created',
    'cbr_authorization_needed',
    'credit_low',
    'installment_due',
    'exam_day_reminder',
    'review_request',
    'parent_invoice_ready',
    'parent_lesson_scheduled',
    'lesson_rescheduled',
    'lesson_rescheduled_instructor'
  ));

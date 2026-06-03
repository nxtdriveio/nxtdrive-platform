-- ===========================================================================
-- 0081 — Task #131: ouder-notificaties (nieuwe factuur / ingeplande les)
--
-- Ouders hebben een eigen portaal (/ouder) maar moeten dat handmatig checken.
-- Deze migratie verbreedt de bestaande, beproefde notificatie-fundering met
-- twee ouder-gerichte types zodat de dispatch-laag (white-label-bewust,
-- idempotent per stabiele dedupe key, degradeert naar 'skipped' zonder e-mail)
-- gekoppelde voogden (student_guardians) kan mailen + in-app melden zodra een
-- kind een nieuwe factuur of een ingeplande rijles krijgt:
--
--   * parent_invoice_ready     — er staat een nieuwe factuur klaar voor het kind
--   * parent_lesson_scheduled  — er is een rijles ingepland voor het kind
--
-- Geen nieuwe tabellen of RPC's: ouder-meldingen lopen via dezelfde
-- notification_log (e-mail) + app_notifications (in-app) als alle andere types.
-- De per-school zichtbaarheid van portaalsecties (tenant_settings key
-- parent_portal_visibility) wordt in de app-laag gerespecteerd: een tenant die
-- 'facturen' of 'planning' heeft uitgezet, krijgt geen bijbehorende ouder-mail.
--
-- Zelfde robuuste drop-then-readd patroon als 0071/0072/0076: de originele
-- CHECKs zijn auto-named, dus we vinden ze op definitie en vervangen ze door
-- named ones. Forward-only (de runner volgt op bestandsnaam).
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
    'parent_lesson_scheduled'
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
    'parent_lesson_scheduled'
  ));

-- ===========================================================================
-- 0087 — meld de ouder/voogd dat de factuur van hun kind is betaald.
--
-- Sinds 0081 krijgen gekoppelde voogden (student_guardians) een melding wanneer
-- er een nieuwe factuur klaarstaat (parent_invoice_ready). De betaling zelf —
-- die ook door een ouder online kan zijn gedaan — werd echter alleen aan de
-- leerling bevestigd (payment_confirmation). We voegen één ouder-gericht type
-- toe op de bestaande, beproefde e-mail-/in-app-fundering (geen nieuwe
-- providerkoppeling, geen nieuwe tabellen of RPC's):
--
--   * parent_invoice_paid — de factuur van het kind is voldaan (bevestiging).
--
-- Loopt via de bestaande dispatch-laag (white-label-bewust, idempotent per
-- stabiele dedupe key per (factuur, voogd), degradeert naar 'skipped' zonder
-- e-mail). De per-school zichtbaarheid van portaalsecties (tenant_settings key
-- parent_portal_visibility, sectie 'betalingen') wordt in de app-laag
-- gerespecteerd. Deze migratie verbreedt uitsluitend de CHECK-constraints die de
-- type/key-kolommen bewaken.
--
-- Zelfde robuuste drop-then-readd patroon als 0081/0086: vind de bestaande
-- CHECKs op definitie en vervang ze door named ones met de uitgebreide lijst.
-- Forward-only (de runner volgt op bestandsnaam).
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
    'lesson_rescheduled_instructor',
    'parent_invoice_paid'
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
    'lesson_rescheduled_instructor',
    'parent_invoice_paid'
  ));

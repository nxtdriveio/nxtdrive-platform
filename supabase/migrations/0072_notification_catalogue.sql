-- ===========================================================================
-- 0072 — Task #107: uitbreiding van de automatische e-mailcatalogus
--
-- Voegt zeven nieuwe notificatietypes toe aan de bestaande, beproefde e-mail-
-- fundering (geen nieuwe providerkoppeling, geen nieuwe tabellen of RPC's):
--
--   * intake_received          — bevestig ontvangst van een intake-aanvraag
--   * lesson_cancelled         — les geannuleerd (incl. wel/geen tegoedrestitutie)
--   * invoice_created          — nieuwe (geopende) factuur staat klaar
--   * cbr_authorization_needed — leerling moet de CBR-machtiging regelen
--   * credit_low               — lestegoed onder de drempel (tijdgestuurd, cron)
--   * installment_due          — termijnfactuur vervalt binnenkort (cron)
--   * exam_day_reminder        — herinnering kort voor het examen/TTT (cron)
--
-- Alle types lopen via de bestaande dispatch-laag (white-label-bewust,
-- idempotent per stabiele dedupe key, degradeert naar 'skipped' wanneer e-mail
-- nog niet is gekoppeld). Deze migratie verbreedt uitsluitend de CHECK-
-- constraints die de type/key-kolommen bewaken.
--
-- Zelfde robuuste drop-then-readd patroon als 0071: de originele CHECKs zijn
-- auto-named, dus we vinden ze op definitie en vervangen ze door named ones.
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
    'exam_day_reminder'
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
    'exam_day_reminder'
  ));

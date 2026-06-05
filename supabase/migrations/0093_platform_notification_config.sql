-- ============================================================================
-- 0093_platform_notification_config.sql
--
-- Centraal notificatiebeheer voor platform admin:
--
--   1. Breidt check-constraints op notification_log + notification_templates
--      uit met chat_message en student_welcome (drop-then-readd, zelfde patroon
--      als 0086/0087). Breidt ook notification_templates.channel uit naar alle
--      kanalen (email/inapp/push) zodat white-label tenants alle kanalen kunnen
--      aanpassen.
--
--   2. Voegt tenant_enabled (bool, nullable) toe aan notification_templates:
--        null  = volgt de globale platforminstelling
--        true  = geforceerd aan voor deze tenant
--        false = geforceerd uit voor deze tenant
--
--   3. Maakt platform_notification_config aan: één rij per (event_key, channel)
--      met globally_enabled-vlag, label_nl, description en optionele
--      platform-standaard templateinhoud (subject/body_html/body_text voor
--      email; push_title/push_body voor push; inapp_title/inapp_body voor in-app).
--      Seeded met alle bekende trigger × kanaal-combinaties.
--
-- Forward-only (geen rollback op DB-niveau). De runner volgt op bestandsnaam.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Verbreed check-constraints notification_log + notification_templates
-- ---------------------------------------------------------------------------

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
       and (
         -- Verwijder type/key checks (uitgebreid met nieuwe typen)
         pg_get_constraintdef(oid) ilike '%payment_confirmation%'
         -- Verwijder ALLE channel-checks zodat de verruimde check ('email','inapp','push')
         -- ongehinderd kan worden toegevoegd. De originele check in 0026 is unnamed en
         -- beperkt channel tot 'email' — zonder dit te droppen blijven beide checks actief.
         or (
           pg_get_constraintdef(oid) ilike '%channel%'
           and pg_get_constraintdef(oid) ilike '%email%'
         )
       )
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
    'chat_message',
    'parent_invoice_ready',
    'parent_lesson_scheduled',
    'lesson_rescheduled',
    'lesson_rescheduled_instructor',
    'parent_invoice_paid',
    'student_welcome'
  ));

alter table public.notification_log
  add constraint notification_log_channel_check
  check (channel in ('email', 'inapp', 'push'));

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
    'chat_message',
    'parent_invoice_ready',
    'parent_lesson_scheduled',
    'lesson_rescheduled',
    'lesson_rescheduled_instructor',
    'parent_invoice_paid',
    'student_welcome'
  ));

alter table public.notification_templates
  add constraint notification_templates_channel_check
  check (channel in ('email', 'inapp', 'push'));

-- ---------------------------------------------------------------------------
-- 2. Voeg tenant_enabled toe aan notification_templates
-- ---------------------------------------------------------------------------

alter table public.notification_templates
  add column if not exists tenant_enabled boolean;

comment on column public.notification_templates.tenant_enabled is
  'Null = volgt globale platforminstelling; true = geforceerd aan; false = geforceerd uit voor deze tenant.';

-- Verbreed body_html/body_text en voeg push/inapp velden toe
alter table public.notification_templates
  add column if not exists push_title text,
  add column if not exists push_body  text,
  add column if not exists inapp_title text,
  add column if not exists inapp_body  text;

-- ---------------------------------------------------------------------------
-- 3. platform_notification_config tabel
-- ---------------------------------------------------------------------------

create table if not exists public.platform_notification_config (
  event_key        text        not null,
  channel          text        not null,
  globally_enabled boolean     not null default true,
  label_nl         text        not null default '',
  description      text        not null default '',
  -- email channel
  subject          text,
  body_html        text,
  body_text        text,
  -- push channel
  push_title       text,
  push_body        text,
  -- in-app channel
  inapp_title      text,
  inapp_body       text,
  updated_at       timestamptz not null default now(),
  primary key (event_key, channel),
  check (channel in ('email', 'inapp', 'push'))
);

drop trigger if exists platform_notification_config_set_updated_at
  on public.platform_notification_config;
create trigger platform_notification_config_set_updated_at
  before update on public.platform_notification_config
  for each row execute function public.set_updated_at();

alter table public.platform_notification_config enable row level security;

-- Alleen service_role mag dit lezen en schrijven; nooit directe authenticated reads
drop policy if exists platform_notification_config_deny_authenticated
  on public.platform_notification_config;
create policy platform_notification_config_deny_authenticated
  on public.platform_notification_config for all to authenticated
  using (false) with check (false);

comment on table public.platform_notification_config is
  'Platform-niveau configuratie per (event_key, channel): globally_enabled vlag + platform-standaard templateinhoud.';

-- ---------------------------------------------------------------------------
-- 4. Seed: alle bekende trigger × kanaal-combinaties
-- ---------------------------------------------------------------------------

insert into public.platform_notification_config
  (event_key, channel, globally_enabled, label_nl, description)
values
  -- payment_confirmation
  ('payment_confirmation', 'email',  true, 'Betaling ontvangen',           'Bevestiging van een ontvangen betaling aan de leerling.'),
  ('payment_confirmation', 'inapp',  true, 'Betaling ontvangen',           'In-app melding bij ontvangen betaling.'),

  -- lesson_reminder
  ('lesson_reminder',      'email',  true, 'Lesherinnering',               'Herinnering aan aankomende rijles.'),
  ('lesson_reminder',      'inapp',  true, 'Lesherinnering',               'In-app lesherinnering.'),
  ('lesson_reminder',      'push',   true, 'Lesherinnering (push)',        'Push-notificatie voor aankomende les.'),

  -- task_assigned
  ('task_assigned',        'email',  true, 'Taak toegewezen',              'E-mail bij toewijzing van een taak.'),
  ('task_assigned',        'inapp',  true, 'Taak toegewezen',              'In-app melding bij taakaanwijzing.'),

  -- trial_lesson_received
  ('trial_lesson_received','email',  true, 'Proefles aanvraag ontvangen',  'Bevestiging dat de proefleskeuze is ontvangen.'),
  ('trial_lesson_received','inapp',  true, 'Proefles aanvraag ontvangen',  'In-app bevestiging ontvangen keuze.'),

  -- trial_lesson_confirmed
  ('trial_lesson_confirmed','email', true, 'Proefles bevestigd',           'Bevestiging dat de proefles definitief is ingepland.'),
  ('trial_lesson_confirmed','inapp', true, 'Proefles bevestigd',           'In-app bevestiging proefles ingepland.'),
  ('trial_lesson_confirmed','push',  true, 'Proefles bevestigd (push)',    'Push-notificatie proefles bevestigd.'),

  -- lesson_refill_invitation
  ('lesson_refill_invitation','email', true, 'Lesmoment vrijgekomen',       'Uitnodiging voor een vrijgekomen lesmoment.'),
  ('lesson_refill_invitation','inapp', true, 'Lesmoment vrijgekomen',       'In-app uitnodiging vrijgekomen moment.'),
  ('lesson_refill_invitation','push',  true, 'Lesmoment vrijgekomen (push)','Push-notificatie vrijgekomen lesmoment.'),

  -- lesson_refill_confirmed
  ('lesson_refill_confirmed','email', true, 'Extra les ingepland',          'Bevestiging ophalen vrijgekomen lesmoment.'),
  ('lesson_refill_confirmed','inapp', true, 'Extra les ingepland',          'In-app bevestiging extra les ingepland.'),

  -- payment_reminder
  ('payment_reminder',     'email',  true, 'Betalingsherinnering',         'Herinnering voor een openstaande factuur.'),
  ('payment_reminder',     'inapp',  true, 'Betalingsherinnering',         'In-app herinnering openstaande factuur.'),

  -- exam_invitation
  ('exam_invitation',      'email',  true, 'Examenmoment aangeboden',      'Uitnodiging voor een beschikbaar examenstip.'),
  ('exam_invitation',      'inapp',  true, 'Examenmoment aangeboden',      'In-app uitnodiging examenmoment.'),
  ('exam_invitation',      'push',   true, 'Examenmoment aangeboden (push)','Push-notificatie examenmoment beschikbaar.'),

  -- exam_confirmed
  ('exam_confirmed',       'email',  true, 'Examen bevestigd',             'Bevestiging van definitief ingepland examen.'),
  ('exam_confirmed',       'inapp',  true, 'Examen bevestigd',             'In-app bevestiging examen ingepland.'),
  ('exam_confirmed',       'push',   true, 'Examen bevestigd (push)',      'Push-notificatie examen bevestigd.'),

  -- exam_planned
  ('exam_planned',         'email',  true, 'Examen ingepland',             'Melding dat een examen is ingepland.'),
  ('exam_planned',         'inapp',  true, 'Examen ingepland',             'In-app melding examen ingepland.'),

  -- exam_passed
  ('exam_passed',          'email',  true, 'Geslaagd!',                    'Felicitatie bij een geslaagd examen.'),
  ('exam_passed',          'inapp',  true, 'Geslaagd!',                    'In-app felicitatie geslaagd examen.'),
  ('exam_passed',          'push',   true, 'Geslaagd! (push)',             'Push-notificatie geslaagd examen.'),

  -- exam_failed
  ('exam_failed',          'email',  true, 'Examen niet gehaald',          'Empathisch bericht na gezakt examen.'),
  ('exam_failed',          'inapp',  true, 'Examen niet gehaald',          'In-app melding gezakt examen.'),

  -- intake_received
  ('intake_received',      'email',  true, 'Aanvraag ontvangen',           'Bevestiging van een inkomende intake-aanvraag.'),

  -- lesson_cancelled
  ('lesson_cancelled',     'email',  true, 'Les geannuleerd',              'Melding dat een rijles is geannuleerd.'),
  ('lesson_cancelled',     'inapp',  true, 'Les geannuleerd',              'In-app melding lesannulering.'),

  -- invoice_created
  ('invoice_created',      'email',  true, 'Nieuwe factuur',               'Melding dat er een nieuwe factuur klaarstaat.'),
  ('invoice_created',      'inapp',  true, 'Nieuwe factuur',               'In-app melding nieuwe factuur.'),

  -- cbr_authorization_needed
  ('cbr_authorization_needed','email', true, 'CBR-machtiging nodig',       'Herinnering om de CBR-machtiging te regelen.'),
  ('cbr_authorization_needed','inapp', true, 'CBR-machtiging nodig',       'In-app herinnering CBR-machtiging.'),

  -- credit_low
  ('credit_low',           'email',  true, 'Lestegoed bijna op',           'Waarschuwing dat het lestegoed bijna op is.'),
  ('credit_low',           'inapp',  true, 'Lestegoed bijna op',           'In-app waarschuwing laag lestegoed.'),

  -- installment_due
  ('installment_due',      'email',  true, 'Termijn bijna vervallen',      'Herinnering voor aankomende termijnbetaling.'),
  ('installment_due',      'inapp',  true, 'Termijn bijna vervallen',      'In-app herinnering termijnbetaling.'),

  -- exam_day_reminder
  ('exam_day_reminder',    'email',  true, 'Examendagherinnering',         'Herinnering op de dag van het examen.'),
  ('exam_day_reminder',    'inapp',  true, 'Examendagherinnering',         'In-app examendagherinnering.'),
  ('exam_day_reminder',    'push',   true, 'Examendagherinnering (push)',  'Push-notificatie examendagherinnering.'),

  -- review_request
  ('review_request',       'email',  true, 'Reviewverzoek',                'Verzoek om een review achter te laten.'),
  ('review_request',       'inapp',  true, 'Reviewverzoek',                'In-app reviewverzoek.'),

  -- chat_message
  ('chat_message',         'inapp',  true, 'Chatbericht',                  'In-app melding bij nieuw chatbericht.'),
  ('chat_message',         'push',   true, 'Chatbericht (push)',           'Push-notificatie bij nieuw chatbericht.'),

  -- parent_invoice_ready
  ('parent_invoice_ready', 'email',  true, 'Factuur klaar (ouder)',        'Melding aan ouder/voogd over nieuwe factuur.'),
  ('parent_invoice_ready', 'inapp',  true, 'Factuur klaar (ouder)',        'In-app melding factuur klaar voor ouder.'),

  -- parent_invoice_paid
  ('parent_invoice_paid',  'email',  true, 'Factuur betaald (ouder)',      'Bevestiging aan ouder/voogd factuur betaald.'),
  ('parent_invoice_paid',  'inapp',  true, 'Factuur betaald (ouder)',      'In-app bevestiging betaling voor ouder.'),

  -- parent_lesson_scheduled
  ('parent_lesson_scheduled','email',true, 'Les ingepland (ouder)',        'Melding aan ouder/voogd over nieuwe ingeplande les.'),
  ('parent_lesson_scheduled','inapp',true, 'Les ingepland (ouder)',        'In-app melding les ingepland voor ouder.'),

  -- lesson_rescheduled
  ('lesson_rescheduled',   'email',  true, 'Les verzet',                   'Bevestiging aan leerling dat een les is verzet.'),
  ('lesson_rescheduled',   'inapp',  true, 'Les verzet',                   'In-app bevestiging les verzet.'),

  -- lesson_rescheduled_instructor
  ('lesson_rescheduled_instructor','email', true, 'Les verzet (instructeur)', 'Melding aan instructeur dat een les is verzet.'),
  ('lesson_rescheduled_instructor','inapp', true, 'Les verzet (instructeur)', 'In-app melding les verzet voor instructeur.'),

  -- student_welcome
  ('student_welcome',      'email',  true, 'Welkomstmail leerling',        'Welkomstmail bij activering nieuw leerlingaccount.'),
  ('student_welcome',      'inapp',  true, 'Welkomstmelding leerling',     'In-app welkomstbericht bij eerste login.')

on conflict (event_key, channel) do nothing;

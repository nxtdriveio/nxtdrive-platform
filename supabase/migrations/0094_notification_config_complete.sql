-- ============================================================================
-- 0094_notification_config_complete.sql
--
-- Vult platform_notification_config aan:
--   1. Voegt ontbrekende push-kanaalrijen toe voor alle bekende triggers
--      zodat de admin-matrix volledig is (elke trigger heeft een rij per
--      ondersteund kanaal — geen "blinde vlek" meer).
--   2. Seeded standaard subject-waarden voor e-mailrijen en standaard
--      push_title/push_body voor pushrijen die nog leeg zijn.
--      Lege waarden worden NIET overschreven zodra de admin ze heeft
--      ingevuld (update only where subject IS NULL / push_title IS NULL).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Voeg ontbrekende push-kanaalrijen toe
-- ---------------------------------------------------------------------------

insert into public.platform_notification_config
  (event_key, channel, globally_enabled, label_nl, description)
values
  ('payment_confirmation',         'push', true, 'Betaling ontvangen (push)',           'Push-notificatie bij ontvangen betaling.'),
  ('task_assigned',                'push', true, 'Taak toegewezen (push)',              'Push-notificatie bij taakaanwijzing.'),
  ('trial_lesson_received',        'push', true, 'Proefles aanvraag ontvangen (push)',  'Push-notificatie ontvangen proefleskeuze.'),
  ('lesson_refill_confirmed',      'push', true, 'Extra les ingepland (push)',          'Push-notificatie extra les ingepland.'),
  ('payment_reminder',             'push', true, 'Betalingsherinnering (push)',         'Push-notificatie openstaande betaling.'),
  ('exam_planned',                 'push', true, 'Examen ingepland (push)',             'Push-notificatie examen ingepland.'),
  ('exam_failed',                  'push', true, 'Examen niet gehaald (push)',          'Push-notificatie gezakt examen.'),
  ('lesson_cancelled',             'push', true, 'Les geannuleerd (push)',              'Push-notificatie lesannulering.'),
  ('invoice_created',              'push', true, 'Nieuwe factuur (push)',               'Push-notificatie nieuwe factuur.'),
  ('cbr_authorization_needed',     'push', true, 'CBR-machtiging nodig (push)',         'Push-notificatie CBR-machtiging.'),
  ('credit_low',                   'push', true, 'Lestegoed bijna op (push)',           'Push-notificatie laag lestegoed.'),
  ('installment_due',              'push', true, 'Termijn bijna vervallen (push)',      'Push-notificatie aankomende termijn.'),
  ('review_request',               'push', true, 'Reviewverzoek (push)',                'Push-notificatie reviewverzoek.'),
  ('parent_invoice_ready',         'push', true, 'Factuur klaar (ouder, push)',         'Push-notificatie factuur klaar voor voogd.'),
  ('parent_invoice_paid',          'push', true, 'Factuur betaald (ouder, push)',       'Push-notificatie betaling voor voogd.'),
  ('parent_lesson_scheduled',      'push', true, 'Les ingepland (ouder, push)',         'Push-notificatie les ingepland voor voogd.'),
  ('lesson_rescheduled',           'push', true, 'Les verzet (push)',                   'Push-notificatie les verzet.'),
  ('lesson_rescheduled_instructor','push', true, 'Les verzet (instructeur, push)',      'Push-notificatie les verzet voor instructeur.'),
  ('student_welcome',              'push', true, 'Welkomstmelding (push)',              'Push-notificatie welkom nieuw leerlingaccount.')
on conflict (event_key, channel) do nothing;

-- ---------------------------------------------------------------------------
-- 2. Seed standaard subject-waarden voor e-mailrijen (alleen waar leeg)
-- ---------------------------------------------------------------------------

update public.platform_notification_config set subject = 'Betaling ontvangen — factuur #{{invoice_no}}'
  where event_key = 'payment_confirmation'         and channel = 'email' and subject is null;
update public.platform_notification_config set subject = 'Herinnering: je rijles staat op het programma'
  where event_key = 'lesson_reminder'              and channel = 'email' and subject is null;
update public.platform_notification_config set subject = 'Nieuwe taak toegewezen'
  where event_key = 'task_assigned'                and channel = 'email' and subject is null;
update public.platform_notification_config set subject = 'Aanvraag ontvangen — we nemen contact op'
  where event_key = 'trial_lesson_received'        and channel = 'email' and subject is null;
update public.platform_notification_config set subject = 'Je proefles is bevestigd'
  where event_key = 'trial_lesson_confirmed'       and channel = 'email' and subject is null;
update public.platform_notification_config set subject = 'Lesmoment vrijgekomen — reageer snel'
  where event_key = 'lesson_refill_invitation'     and channel = 'email' and subject is null;
update public.platform_notification_config set subject = 'Je extra les is ingepland'
  where event_key = 'lesson_refill_confirmed'      and channel = 'email' and subject is null;
update public.platform_notification_config set subject = 'Herinnering: openstaande betaling'
  where event_key = 'payment_reminder'             and channel = 'email' and subject is null;
update public.platform_notification_config set subject = 'Examenstip beschikbaar — reageer snel'
  where event_key = 'exam_invitation'              and channel = 'email' and subject is null;
update public.platform_notification_config set subject = 'Je examen is bevestigd'
  where event_key = 'exam_confirmed'               and channel = 'email' and subject is null;
update public.platform_notification_config set subject = 'Je examen staat ingepland'
  where event_key = 'exam_planned'                 and channel = 'email' and subject is null;
update public.platform_notification_config set subject = 'Gefeliciteerd, je bent geslaagd!'
  where event_key = 'exam_passed'                  and channel = 'email' and subject is null;
update public.platform_notification_config set subject = 'Examenuitslag'
  where event_key = 'exam_failed'                  and channel = 'email' and subject is null;
update public.platform_notification_config set subject = 'We hebben je aanvraag ontvangen'
  where event_key = 'intake_received'              and channel = 'email' and subject is null;
update public.platform_notification_config set subject = 'Je rijles is geannuleerd'
  where event_key = 'lesson_cancelled'             and channel = 'email' and subject is null;
update public.platform_notification_config set subject = 'Nieuwe factuur van {{tenant_name}}'
  where event_key = 'invoice_created'              and channel = 'email' and subject is null;
update public.platform_notification_config set subject = 'Actie vereist: CBR-machtiging'
  where event_key = 'cbr_authorization_needed'     and channel = 'email' and subject is null;
update public.platform_notification_config set subject = 'Je lestegoed is bijna op'
  where event_key = 'credit_low'                   and channel = 'email' and subject is null;
update public.platform_notification_config set subject = 'Herinnering: termijn bijna vervallen'
  where event_key = 'installment_due'              and channel = 'email' and subject is null;
update public.platform_notification_config set subject = 'Succes vandaag — rijexamen herinnering'
  where event_key = 'exam_day_reminder'            and channel = 'email' and subject is null;
update public.platform_notification_config set subject = 'Hoe was je rijervaring?'
  where event_key = 'review_request'               and channel = 'email' and subject is null;
update public.platform_notification_config set subject = 'Factuur klaar voor {{student_name}}'
  where event_key = 'parent_invoice_ready'         and channel = 'email' and subject is null;
update public.platform_notification_config set subject = 'Factuur betaald voor {{student_name}}'
  where event_key = 'parent_invoice_paid'          and channel = 'email' and subject is null;
update public.platform_notification_config set subject = 'Les ingepland voor {{student_name}}'
  where event_key = 'parent_lesson_scheduled'      and channel = 'email' and subject is null;
update public.platform_notification_config set subject = 'Je rijles is verzet'
  where event_key = 'lesson_rescheduled'           and channel = 'email' and subject is null;
update public.platform_notification_config set subject = 'Les verzet — je agenda is bijgewerkt'
  where event_key = 'lesson_rescheduled_instructor' and channel = 'email' and subject is null;
update public.platform_notification_config set subject = 'Welkom bij {{tenant_name}}'
  where event_key = 'student_welcome'              and channel = 'email' and subject is null;

-- ---------------------------------------------------------------------------
-- 3. Seed standaard push_title / push_body voor pushrijen (alleen waar leeg)
-- ---------------------------------------------------------------------------

update public.platform_notification_config set
  push_title = 'Betaling ontvangen',
  push_body  = 'Je betaling van factuur #{{invoice_no}} is ontvangen.'
  where event_key = 'payment_confirmation'         and channel = 'push' and push_title is null;

update public.platform_notification_config set
  push_title = 'Lesherinnering',
  push_body  = 'Je rijles staat gepland op {{lesson_time}}.'
  where event_key = 'lesson_reminder'              and channel = 'push' and push_title is null;

update public.platform_notification_config set
  push_title = 'Taak toegewezen',
  push_body  = 'Er is een nieuwe taak aan jou toegewezen: {{task_title}}.'
  where event_key = 'task_assigned'                and channel = 'push' and push_title is null;

update public.platform_notification_config set
  push_title = 'Proefles aanvraag ontvangen',
  push_body  = 'Je keuze is ontvangen. We nemen spoedig contact op.'
  where event_key = 'trial_lesson_received'        and channel = 'push' and push_title is null;

update public.platform_notification_config set
  push_title = 'Proefles bevestigd',
  push_body  = 'Je proefles op {{lesson_time}} is definitief.'
  where event_key = 'trial_lesson_confirmed'       and channel = 'push' and push_title is null;

update public.platform_notification_config set
  push_title = 'Lesmoment vrijgekomen',
  push_body  = 'Er is een rijlesmoment vrijgekomen. Reageer snel!'
  where event_key = 'lesson_refill_invitation'     and channel = 'push' and push_title is null;

update public.platform_notification_config set
  push_title = 'Extra les ingepland',
  push_body  = 'Je extra rijles op {{lesson_time}} is bevestigd.'
  where event_key = 'lesson_refill_confirmed'      and channel = 'push' and push_title is null;

update public.platform_notification_config set
  push_title = 'Betalingsherinnering',
  push_body  = 'Er staat nog een openstaande betaling op je naam.'
  where event_key = 'payment_reminder'             and channel = 'push' and push_title is null;

update public.platform_notification_config set
  push_title = 'Examenstip beschikbaar',
  push_body  = 'Er is een examenmoment beschikbaar. Reageer snel!'
  where event_key = 'exam_invitation'              and channel = 'push' and push_title is null;

update public.platform_notification_config set
  push_title = 'Examen bevestigd',
  push_body  = 'Je examen op {{exam_time}} is definitief ingepland.'
  where event_key = 'exam_confirmed'               and channel = 'push' and push_title is null;

update public.platform_notification_config set
  push_title = 'Examen ingepland',
  push_body  = 'Je examen staat ingepland op {{exam_time}}.'
  where event_key = 'exam_planned'                 and channel = 'push' and push_title is null;

update public.platform_notification_config set
  push_title = 'Geslaagd!',
  push_body  = 'Gefeliciteerd, je bent geslaagd voor je rijexamen!'
  where event_key = 'exam_passed'                  and channel = 'push' and push_title is null;

update public.platform_notification_config set
  push_title = 'Examen niet gehaald',
  push_body  = 'Je hebt het rijexamen helaas niet gehaald. Je instructeur helpt je verder.'
  where event_key = 'exam_failed'                  and channel = 'push' and push_title is null;

update public.platform_notification_config set
  push_title = 'Les geannuleerd',
  push_body  = 'Je rijles van {{lesson_time}} is geannuleerd.'
  where event_key = 'lesson_cancelled'             and channel = 'push' and push_title is null;

update public.platform_notification_config set
  push_title = 'Nieuwe factuur',
  push_body  = 'Er staat een nieuwe factuur klaar van {{tenant_name}}.'
  where event_key = 'invoice_created'              and channel = 'push' and push_title is null;

update public.platform_notification_config set
  push_title = 'CBR-machtiging nodig',
  push_body  = 'Regel je CBR-machtiging zodat je examen ingepland kan worden.'
  where event_key = 'cbr_authorization_needed'     and channel = 'push' and push_title is null;

update public.platform_notification_config set
  push_title = 'Lestegoed bijna op',
  push_body  = 'Je lestegoed is bijna op. Bestel op tijd bij.'
  where event_key = 'credit_low'                   and channel = 'push' and push_title is null;

update public.platform_notification_config set
  push_title = 'Termijn bijna vervallen',
  push_body  = 'Je volgende betaaltermijn vervalt binnenkort.'
  where event_key = 'installment_due'              and channel = 'push' and push_title is null;

update public.platform_notification_config set
  push_title = 'Examendagherinnering',
  push_body  = 'Vandaag is het zover — succes met je rijexamen!'
  where event_key = 'exam_day_reminder'            and channel = 'push' and push_title is null;

update public.platform_notification_config set
  push_title = 'Hoe was je rijervaring?',
  push_body  = 'Laat een review achter en help anderen.'
  where event_key = 'review_request'               and channel = 'push' and push_title is null;

update public.platform_notification_config set
  push_title = 'Nieuw chatbericht',
  push_body  = 'Je hebt een nieuw bericht ontvangen.'
  where event_key = 'chat_message'                 and channel = 'push' and push_title is null;

update public.platform_notification_config set
  push_title = 'Factuur klaar',
  push_body  = 'Er staat een nieuwe factuur klaar voor {{student_name}}.'
  where event_key = 'parent_invoice_ready'         and channel = 'push' and push_title is null;

update public.platform_notification_config set
  push_title = 'Factuur betaald',
  push_body  = 'De factuur voor {{student_name}} is betaald.'
  where event_key = 'parent_invoice_paid'          and channel = 'push' and push_title is null;

update public.platform_notification_config set
  push_title = 'Les ingepland',
  push_body  = 'Er is een rijles ingepland voor {{student_name}} op {{lesson_time}}.'
  where event_key = 'parent_lesson_scheduled'      and channel = 'push' and push_title is null;

update public.platform_notification_config set
  push_title = 'Les verzet',
  push_body  = 'Je rijles is verzet naar {{new_lesson_time}}.'
  where event_key = 'lesson_rescheduled'           and channel = 'push' and push_title is null;

update public.platform_notification_config set
  push_title = 'Les verzet',
  push_body  = 'Een rijles in je agenda is verzet naar {{new_lesson_time}}.'
  where event_key = 'lesson_rescheduled_instructor' and channel = 'push' and push_title is null;

update public.platform_notification_config set
  push_title = 'Welkom!',
  push_body  = 'Je account bij {{tenant_name}} is aangemaakt. Welkom!'
  where event_key = 'student_welcome'              and channel = 'push' and push_title is null;

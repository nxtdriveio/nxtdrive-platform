-- ============================================================================
-- 0095_notification_template_defaults.sql
--
-- Vult platform_notification_config.body_html (e-mail) en
-- inapp_title/inapp_body (in-app) voor alle bekende triggers met
-- Nederlandse standaard-inhoud zodat de DB de canonieke bron is.
--
-- Seeding-strategie:
--   UPDATE … WHERE body_html IS NULL / inapp_title IS NULL
--   → bestaande admin-edits worden nooit overschreven.
--
-- body_html is de "inner" HTML die TipTap bewerkt. De volledige e-mail
-- wordt samengesteld door layout() in templates.ts dat header/footer toevoegt.
-- body_text wordt afgeleid als de admin opslaat via de editor; hier
-- vullen we alleen de veldwaarden in die anders leeg zouden zijn.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- E-mail body_html standaard-inhoud (inner template, zonder layout-wrapper)
-- ---------------------------------------------------------------------------

update public.platform_notification_config set body_html =
'<p>Beste {{student_name}},</p><p>We hebben je betaling van <strong>{{amount}}</strong> ontvangen voor factuur #{{invoice_no}}. Bedankt!</p><p>Heb je vragen? Neem dan gerust contact op met <strong>{{tenant_name}}</strong>.</p>'
where event_key = 'payment_confirmation' and channel = 'email' and body_html is null;

update public.platform_notification_config set body_html =
'<p>Beste {{student_name}},</p><p>Dit is een herinnering dat je rijles gepland staat op <strong>{{lesson_time}}</strong>.</p><p>Zorg dat je op tijd klaar staat. Veel succes!</p>'
where event_key = 'lesson_reminder' and channel = 'email' and body_html is null;

update public.platform_notification_config set body_html =
'<p>Beste {{assignee_name}},</p><p>Er is een nieuwe taak aan je toegewezen: <strong>{{task_title}}</strong>.</p><p>Log in om de details te bekijken en de taak op te pakken.</p>'
where event_key = 'task_assigned' and channel = 'email' and body_html is null;

update public.platform_notification_config set body_html =
'<p>Beste {{lead_name}},</p><p>We hebben je aanvraag voor een proefles ontvangen. We nemen zo snel mogelijk contact met je op om de afspraak te bevestigen.</p><p>Tot snel!</p>'
where event_key = 'trial_lesson_received' and channel = 'email' and body_html is null;

update public.platform_notification_config set body_html =
'<p>Beste {{lead_name}},</p><p>Goed nieuws! Je proefles is definitief bevestigd op <strong>{{lesson_time}}</strong>.</p><p>Zorg dat je op tijd aanwezig bent. We kijken ernaar uit!</p>'
where event_key = 'trial_lesson_confirmed' and channel = 'email' and body_html is null;

update public.platform_notification_config set body_html =
'<p>Beste {{student_name}},</p><p>Er is een rijlesmoment vrijgekomen. Wil je dit moment inplannen? Log in en reageer snel — vol is vol!</p>'
where event_key = 'lesson_refill_invitation' and channel = 'email' and body_html is null;

update public.platform_notification_config set body_html =
'<p>Beste {{student_name}},</p><p>Je extra rijles is bevestigd op <strong>{{lesson_time}}</strong>. Goed bezig!</p>'
where event_key = 'lesson_refill_confirmed' and channel = 'email' and body_html is null;

update public.platform_notification_config set body_html =
'<p>Beste {{student_name}},</p><p>We wilden je er even aan herinneren dat er nog een openstaande betaling is. Log in om je factuur te bekijken en te betalen.</p>'
where event_key = 'payment_reminder' and channel = 'email' and body_html is null;

update public.platform_notification_config set body_html =
'<p>Beste {{student_name}},</p><p>Er is een examenmoment beschikbaar. Wil je dit moment reserveren? Log in en reageer snel — plaatsen zijn beperkt!</p>'
where event_key = 'exam_invitation' and channel = 'email' and body_html is null;

update public.platform_notification_config set body_html =
'<p>Beste {{student_name}},</p><p>Je examen is definitief bevestigd op <strong>{{exam_time}}</strong>. Succes met de voorbereiding!</p>'
where event_key = 'exam_confirmed' and channel = 'email' and body_html is null;

update public.platform_notification_config set body_html =
'<p>Beste {{student_name}},</p><p>Je examen staat ingepland op <strong>{{exam_time}}</strong>. Je instructeur houdt je op de hoogte van de voortgang.</p>'
where event_key = 'exam_planned' and channel = 'email' and body_html is null;

update public.platform_notification_config set body_html =
'<p>Beste {{student_name}},</p><p>Gefeliciteerd! Je bent geslaagd voor je rijexamen. Wat een geweldig nieuws!</p><p>Heel veel rijplezier gewenst namens het team van <strong>{{tenant_name}}</strong>.</p>'
where event_key = 'exam_passed' and channel = 'email' and body_html is null;

update public.platform_notification_config set body_html =
'<p>Beste {{student_name}},</p><p>Helaas is het examen deze keer niet gelukt. Niet getreurd — dit overkomt velen en je instructeur helpt je om je voor te bereiden op een volgende poging.</p><p>Neem contact op om samen een plan te maken.</p>'
where event_key = 'exam_failed' and channel = 'email' and body_html is null;

update public.platform_notification_config set body_html =
'<p>Beste,</p><p>We hebben je aanvraag ontvangen. We nemen zo snel mogelijk contact met je op om een proefles in te plannen.</p><p>Tot snel!</p>'
where event_key = 'intake_received' and channel = 'email' and body_html is null;

update public.platform_notification_config set body_html =
'<p>Beste {{student_name}},</p><p>Je rijles van <strong>{{lesson_time}}</strong> is geannuleerd. Neem contact op met je rijschool als je vragen hebt of een nieuwe les wilt inplannen.</p>'
where event_key = 'lesson_cancelled' and channel = 'email' and body_html is null;

update public.platform_notification_config set body_html =
'<p>Beste {{student_name}},</p><p>Er staat een nieuwe factuur van <strong>{{tenant_name}}</strong> voor je klaar. Log in om de factuur te bekijken en te betalen.</p>'
where event_key = 'invoice_created' and channel = 'email' and body_html is null;

update public.platform_notification_config set body_html =
'<p>Beste {{student_name}},</p><p>Om je examen in te kunnen plannen is een CBR-machtiging nodig. Regel dit zo snel mogelijk zodat er geen vertraging ontstaat.</p><p>Neem contact op met je rijschool als je hier hulp bij nodig hebt.</p>'
where event_key = 'cbr_authorization_needed' and channel = 'email' and body_html is null;

update public.platform_notification_config set body_html =
'<p>Beste {{student_name}},</p><p>Je lestegoed is bijna op. Bestel op tijd een nieuw pakket zodat je zonder onderbreking door kunt rijden.</p>'
where event_key = 'credit_low' and channel = 'email' and body_html is null;

update public.platform_notification_config set body_html =
'<p>Beste {{student_name}},</p><p>Een herinnering: je volgende betaaltermijn vervalt binnenkort. Log in om je factuur te bekijken en tijdig te betalen.</p>'
where event_key = 'installment_due' and channel = 'email' and body_html is null;

update public.platform_notification_config set body_html =
'<p>Beste {{student_name}},</p><p>Vandaag is het zover — je rijexamen staat gepland! Succes gewenst vanuit het hele team van <strong>{{tenant_name}}</strong>. Je kunt het!</p>'
where event_key = 'exam_day_reminder' and channel = 'email' and body_html is null;

update public.platform_notification_config set body_html =
'<p>Beste {{student_name}},</p><p>We hopen dat je rijervaring geweldig was! We zouden het fijn vinden als je een korte review achter wilt laten. Dit helpt ons en toekomstige leerlingen enorm.</p>'
where event_key = 'review_request' and channel = 'email' and body_html is null;

update public.platform_notification_config set body_html =
'<p>Beste,</p><p>Er staat een nieuwe factuur klaar voor <strong>{{student_name}}</strong>. Log in om de factuur te bekijken.</p>'
where event_key = 'parent_invoice_ready' and channel = 'email' and body_html is null;

update public.platform_notification_config set body_html =
'<p>Beste,</p><p>De factuur voor <strong>{{student_name}}</strong> is betaald. Bedankt!</p>'
where event_key = 'parent_invoice_paid' and channel = 'email' and body_html is null;

update public.platform_notification_config set body_html =
'<p>Beste,</p><p>Er is een rijles ingepland voor <strong>{{student_name}}</strong> op <strong>{{lesson_time}}</strong>.</p>'
where event_key = 'parent_lesson_scheduled' and channel = 'email' and body_html is null;

update public.platform_notification_config set body_html =
'<p>Beste {{student_name}},</p><p>Je rijles is verzet. De nieuwe afspraak staat op <strong>{{new_lesson_time}}</strong>. We hopen dat dit je uitkomt.</p>'
where event_key = 'lesson_rescheduled' and channel = 'email' and body_html is null;

update public.platform_notification_config set body_html =
'<p>Beste,</p><p>Er is een rijles in je agenda verzet. De nieuwe afspraak staat op <strong>{{new_lesson_time}}</strong>. Controleer je agenda.</p>'
where event_key = 'lesson_rescheduled_instructor' and channel = 'email' and body_html is null;

update public.platform_notification_config set body_html =
'<p>Beste {{student_name}},</p><p>Welkom bij <strong>{{tenant_name}}</strong>! Je account is aangemaakt. Log in om aan de slag te gaan met je rijlessen.</p>'
where event_key = 'student_welcome' and channel = 'email' and body_html is null;

-- ---------------------------------------------------------------------------
-- In-app standaard inapp_title / inapp_body (alleen waar nog leeg)
-- ---------------------------------------------------------------------------

update public.platform_notification_config set
  inapp_title = 'Betaling ontvangen',
  inapp_body  = 'Je betaling van factuur #{{invoice_no}} is ontvangen. Bedankt!'
where event_key = 'payment_confirmation' and channel = 'inapp' and inapp_title is null;

update public.platform_notification_config set
  inapp_title = 'Lesherinnering',
  inapp_body  = 'Je rijles staat gepland op {{lesson_time}}. Vergeet het niet!'
where event_key = 'lesson_reminder' and channel = 'inapp' and inapp_title is null;

update public.platform_notification_config set
  inapp_title = 'Taak toegewezen',
  inapp_body  = 'Er is een nieuwe taak aan je toegewezen: {{task_title}}.'
where event_key = 'task_assigned' and channel = 'inapp' and inapp_title is null;

update public.platform_notification_config set
  inapp_title = 'Proefles aanvraag ontvangen',
  inapp_body  = 'We hebben je keuze ontvangen. We nemen snel contact op.'
where event_key = 'trial_lesson_received' and channel = 'inapp' and inapp_title is null;

update public.platform_notification_config set
  inapp_title = 'Proefles bevestigd',
  inapp_body  = 'Je proefles op {{lesson_time}} is definitief ingepland.'
where event_key = 'trial_lesson_confirmed' and channel = 'inapp' and inapp_title is null;

update public.platform_notification_config set
  inapp_title = 'Lesmoment vrijgekomen',
  inapp_body  = 'Er is een rijlesmoment vrijgekomen. Reageer snel!'
where event_key = 'lesson_refill_invitation' and channel = 'inapp' and inapp_title is null;

update public.platform_notification_config set
  inapp_title = 'Extra les ingepland',
  inapp_body  = 'Je extra rijles op {{lesson_time}} is bevestigd.'
where event_key = 'lesson_refill_confirmed' and channel = 'inapp' and inapp_title is null;

update public.platform_notification_config set
  inapp_title = 'Betaling herinnering',
  inapp_body  = 'Er staat een openstaande betaling op je naam.'
where event_key = 'payment_reminder' and channel = 'inapp' and inapp_title is null;

update public.platform_notification_config set
  inapp_title = 'Examenmoment beschikbaar',
  inapp_body  = 'Er is een examenmoment beschikbaar. Reageer snel!'
where event_key = 'exam_invitation' and channel = 'inapp' and inapp_title is null;

update public.platform_notification_config set
  inapp_title = 'Examen bevestigd',
  inapp_body  = 'Je examen op {{exam_time}} is definitief ingepland.'
where event_key = 'exam_confirmed' and channel = 'inapp' and inapp_title is null;

update public.platform_notification_config set
  inapp_title = 'Examen ingepland',
  inapp_body  = 'Je examen staat ingepland op {{exam_time}}.'
where event_key = 'exam_planned' and channel = 'inapp' and inapp_title is null;

update public.platform_notification_config set
  inapp_title = 'Geslaagd!',
  inapp_body  = 'Gefeliciteerd — je bent geslaagd voor je rijexamen!'
where event_key = 'exam_passed' and channel = 'inapp' and inapp_title is null;

update public.platform_notification_config set
  inapp_title = 'Examen niet gehaald',
  inapp_body  = 'Helaas, het examen is niet gehaald. Je instructeur helpt je verder.'
where event_key = 'exam_failed' and channel = 'inapp' and inapp_title is null;

update public.platform_notification_config set
  inapp_title = 'Les geannuleerd',
  inapp_body  = 'Je rijles van {{lesson_time}} is geannuleerd.'
where event_key = 'lesson_cancelled' and channel = 'inapp' and inapp_title is null;

update public.platform_notification_config set
  inapp_title = 'Nieuwe factuur',
  inapp_body  = 'Er staat een nieuwe factuur voor je klaar van {{tenant_name}}.'
where event_key = 'invoice_created' and channel = 'inapp' and inapp_title is null;

update public.platform_notification_config set
  inapp_title = 'CBR-machtiging nodig',
  inapp_body  = 'Regel je CBR-machtiging zodat je examen ingepland kan worden.'
where event_key = 'cbr_authorization_needed' and channel = 'inapp' and inapp_title is null;

update public.platform_notification_config set
  inapp_title = 'Lestegoed bijna op',
  inapp_body  = 'Je lestegoed is bijna op. Bestel op tijd bij.'
where event_key = 'credit_low' and channel = 'inapp' and inapp_title is null;

update public.platform_notification_config set
  inapp_title = 'Termijn bijna vervallen',
  inapp_body  = 'Je volgende betaaltermijn vervalt binnenkort.'
where event_key = 'installment_due' and channel = 'inapp' and inapp_title is null;

update public.platform_notification_config set
  inapp_title = 'Examendagherinnering',
  inapp_body  = 'Vandaag is het zover! Succes met je rijexamen.'
where event_key = 'exam_day_reminder' and channel = 'inapp' and inapp_title is null;

update public.platform_notification_config set
  inapp_title = 'Hoe was je rijervaring?',
  inapp_body  = 'Laat een review achter en help toekomstige leerlingen.'
where event_key = 'review_request' and channel = 'inapp' and inapp_title is null;

update public.platform_notification_config set
  inapp_title = 'Nieuw chatbericht',
  inapp_body  = 'Je hebt een nieuw bericht ontvangen.'
where event_key = 'chat_message' and channel = 'inapp' and inapp_title is null;

update public.platform_notification_config set
  inapp_title = 'Factuur klaar',
  inapp_body  = 'Er staat een nieuwe factuur klaar voor {{student_name}}.'
where event_key = 'parent_invoice_ready' and channel = 'inapp' and inapp_title is null;

update public.platform_notification_config set
  inapp_title = 'Factuur betaald',
  inapp_body  = 'De factuur voor {{student_name}} is betaald.'
where event_key = 'parent_invoice_paid' and channel = 'inapp' and inapp_title is null;

update public.platform_notification_config set
  inapp_title = 'Les ingepland',
  inapp_body  = 'Er is een rijles ingepland voor {{student_name}} op {{lesson_time}}.'
where event_key = 'parent_lesson_scheduled' and channel = 'inapp' and inapp_title is null;

update public.platform_notification_config set
  inapp_title = 'Les verzet',
  inapp_body  = 'Je rijles is verzet naar {{new_lesson_time}}.'
where event_key = 'lesson_rescheduled' and channel = 'inapp' and inapp_title is null;

update public.platform_notification_config set
  inapp_title = 'Les verzet',
  inapp_body  = 'Een rijles in je agenda is verzet naar {{new_lesson_time}}.'
where event_key = 'lesson_rescheduled_instructor' and channel = 'inapp' and inapp_title is null;

update public.platform_notification_config set
  inapp_title = 'Welkom!',
  inapp_body  = 'Je account bij {{tenant_name}} is aangemaakt. Welkom!'
where event_key = 'student_welcome' and channel = 'inapp' and inapp_title is null;

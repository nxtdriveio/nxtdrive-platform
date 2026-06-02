# NXTDRIVE — Faseplan

> **Lees altijd eerst `docs/NXTDRIVE_CANON.md` (productcanon) en daarna dit faseplan**
> voordat je aan een taak begint. De canon is de bron van waarheid voor _wat_ NXTDRIVE
> wordt; dit faseplan is de bron van waarheid voor _in welke volgorde_ we het bouwen en
> _wat al af is_.

Laatst bijgewerkt: 2026-06-01

---

## Hoe dit document te gebruiken

1. Lees de canon (`docs/NXTDRIVE_CANON.md`) — de 18 modules + Security/Monitoring/AVG canon.
2. Lees de relevante skills voor de taak (zie `replit.md` → Pointers).
3. Kijk in dit faseplan waar de taak in past en wat de status is.
4. Houd de architectuurregels uit `replit.md` aan (multi-tenant, RLS, ledger + audit, server-side mutaties).
5. Werk per fase. Werk niet aan een latere fase voordat de fundering van de vorige stabiel en getest is.

---

## Statuslegenda

- ✅ **Klaar** — gebouwd en (eerder) getest
- 🟡 **In uitvoering / deels** — bestaat maar nog niet compleet of geblokkeerd
- ⬜ **Niet gestart**

---

## Huidige staat (analyse 2026-06-01)

Op basis van de migraties (`supabase/migrations/0001`–`0026`) en de Next.js-app
(`artifacts/nxtdrive/app` + `lib`).

| Onderdeel (canon) | Status | Bewijs in code |
|---|---|---|
| SaaS-fundering: Auth, Tenants, Rollen, RLS | ✅ | `0001`–`0006`, `lib/auth/*`, `middleware.ts`, security-definer RPC-patroon |
| Platform admin (basis) | 🟡 | `app/admin/page.tsx` — tenants lijst + plan/white-label status; nog geen feature flags/abonnementsbeheer |
| Tenant backoffice + navigatie | ✅ | `app/backoffice/layout.tsx`, dashboard, instellingen |
| White-label branding | ✅ (Elite-feature, gating later) | `tenant_branding`, `components/brand-provider.tsx`, `instellingen/actions.ts` |
| Module 1 — CRM & Leads + Intake | ✅ (intake = 5-staps wizard + Fase 1B intake-analyse) | `0007`–`0009`, `0035_lead_intake_details` (getypte intake-velden + `create_lead_with_intake` RPC), `0036_lead_intake_analysis` (regelgebaseerde labels/score/aandachtspunten/samenvatting/vervolgstap + `upsert_lead_intake_analysis` RPC), `lib/leads/intake-analysis.ts` (deterministische engine), `app/intake/[slug]` (wizard, berekent + bewaart analyse bij inzending), `app/backoffice/leads` (intake-kaart + intake-analyseblok op lead-detail, idempotente backfill-on-read), `convert_lead_to_student`. **Aandachtspunten → taken** (`0044_lead_intake_tasks`, RPC `ensure_lead_intake_task`, service_role-only): vanuit het intake-analyseblok zet de instructeur per aandachtspunt (of allemaal) met één klik een backoffice-taak klaar — vooringevuld (titel/omschrijving/prioriteit per code, fallback op label), aan de lead gekoppeld, gerouteerd via de bestaande taak-toewijzingsregels (`resolve_task_assignment` → afdelingsbord, anders eerste bord), en idempotent via `dedupe_key` `lead:{id}:intake:{code}` (twee keer klikken = no-op). `task_type='manual'` zodat de automation-sweep ze nooit archiveert. Serveractie `createTasksFromIntakePoints` herleidt de aandachtspunten server-side (bron van waarheid), client-component `intake-task-buttons.tsx`. De pure scoring/advies-engine is verplaatst naar shared lib `@workspace/leads-analysis` (`analyzeIntake` + intake-enums); `lib/leads/intake-analysis.ts` re-exporteert die en houdt alleen de TaskPriority-afhankelijke taaktemplates. `db:test-intake-analysis` groen (27 asserties: labels/score/aandachtspunten/vervolgstap voor representatieve profielen + beschikbaarheidsgrenzen, unknown-statussen, structurele invarianten). |
| Module 1b — Leaddashboard + Taken + Slimme Opvolging | ✅ datamodel + automation + UI + tests | `0040_lead_dashboard` **toegepast**: `lead_status` uitgebreid tot 15 waarden (funnel `new`→`dropped`, voorwaarts), nieuwe enums `lead_action_status` (none/awaiting_us/awaiting_lead/scheduled/closed) + `task_type`; `leads` gedenormaliseerd (`action_status`, `priority`, `lead_score`+`lead_score_reason`, `next_action_at`, `last_activity_at`, `lost_at`/`lost_reason`, intake-snapshot) + indexes; `tasks.task_type`+`dedupe_key` (partiële unieke index waar `archived_at is null`) voor idempotente auto-taken; `lead_events.metadata` + nieuwe event-types. RPC's (SECURITY DEFINER, anon/authenticated revoked, alleen service_role): `sync_lead_from_intake`, `set_lead_automation_fields`, `ensure_lead_task`, `complete_lead_task`, `mark_lead_lost`, `schedule_lead_follow_up`, `create_lead_manual`. `lib/leads/lead-score.ts` (pure scoremodel + band), `lib/leads/automation.ts` (voorwaartse status uit feiten + idempotente taak-reconcile via `dedupe_key`), `lib/leads/lead-service.ts` (dashboard-reads/KPI's/tabs), `lib/leads/timeline.ts`. Hooks: intake-submit + proefles-keuze/bevestig/afwijs/verzet → `reconcileLeadSafe`; backoffice-acties lost/follow-up/handmatige lead/taak-afronden. `0041_convert_lead_terminal_state` **toegepast**: `convert_lead_to_student` zet bij eerste conversie ook de terminale operationele staat (`action_status='closed'`, `next_action_at=null`, `converted_to_student_at`), revoket anon/authenticated, en backfilt bestaande converted-leads — nodig omdat de automation-engine terminale statussen preserve't en ze dus bij conversie correct gezet moeten worden. Sweep `app/api/jobs/lead-followups/route.ts` (CRON_SECRET): (1) due-reconcile, (2) beoordeling-overdue >4u in `assessment_pending` → high-prio `assessment`-taak, (3) heractivatie-cadans op 2/7/14 dagen inactiviteit — alle idempotent via stabiele `dedupe_key` (taak-bestaat-check vóór actie/flip/event, dus precies één keer per stap). UI: `/backoffice/leads` actiegericht dashboard (Vandaag leidend, KPI-strip, 7 funnel-tabs Vandaag/Nieuwe aanvragen/Proeflessen/Pakketadvies/Opvolgen/Gewonnen/Afgehaakt, nieuwe-lead-form) + "Volgende beste acties"-ordening (overdue → urgent → hoge leadscore → due_at → gewenste startdatum, JS-sort) + kolom-gedekte filters (status, prioriteit, bron, plaats, wijk, schakel/automaat, min. leadscore, gewenste-startdatum-range, alleen-te-laat) + lead-detail "Slimme opvolging"-paneel (score/signalen/acties). **Bewust uitgesteld** (join-zwaar, geen kolom op `leads`): proefles-status-filter en route-score-filter — route-data leeft per-proefles op `trial_lessons` (`route_travel_to_min`), niet op `leads`; vereist een join/aggregatie die in een volgende iteratie hoort. `db:test-rls-lead-dashboard` groen (23 asserties: RLS, automation, idempotency, grant-lockdown, convert-terminal-state + geen-heropenen). **Fase 1B (auto-score & prioriteren):** leadscore-gewichten én warm/hot-banden zijn nu tenant-instelbaar via `tenant_settings` key `lead_score_policy` (`0042_lead_score_policy` seedt de platform-default voor elke tenant, idempotent; nooit per school hardcoded). `lib/leads/lead-score.ts` kreeg `LeadScorePolicy`/`DEFAULT_LEAD_SCORE_POLICY` + optionele policy-param op `scoreLead`/`leadScoreBand` (backwards-compatible). `lib/leads/lead-score-policy.ts` laadt + saneert de override (onbekende codes weg, gewichten 0–50, banden 0–100, warm≤hot, valt terug op defaults). `automation.ts` scoort met de tenant-policy; `getLeadKpis` Hot-telling gebruikt `bands.hot` i.p.v. hardcoded 60. UI: lead-lijst en lead-detail tonen de score met tenant-banden + een korte "volgende beste actie"-hint per funnelstatus (`LEAD_NEXT_ACTION_HINT` in `lib/leads/types.ts`); KPI-label "Hot (≥N)" volgt de tenant-drempel. |
| Module 2 — Leerlingenbeheer (+ouders) | ✅ | `0011`, `0019_student_guardians`, `app/backoffice/leerlingen` |
| Module 3 — Planning / lessen | ✅ | `0014`–`0016`, `app/backoffice/agenda`, `schedule/cancel/complete_lesson` RPC |
| Module 3e — Agenda: alle afspraaktypes | ✅ datamodel + RPC's + UI + tests | `0049_agenda_appointments` **toegepast**: de agenda ondersteunt nu **alle** afspraaktypes naast lessen/proeflessen. Nieuwe enums `agenda_appointment_type` (leerlinggekoppeld: `exam`/`interim_test`/`theory_guidance`; tijdvullende blokken: `free_block`/`break`/`private_block`/`maintenance`/`admin`/`vacation`) + `agenda_appointment_status` (planned/cancelled). Tabel `agenda_appointments` (tenant-scoped, `instructor_id`, **nullable** `student_id` met tenant-consistente FK, `starts_at`/`ends_at`, `type`, `status`, `title`, `location`, `notes`, `created_by`), indexes, select-only RLS, gist no-overlap exclusion op `status='planned'`. Blokken bezetten tijd: helper `_appointment_overlaps` + `_agenda_slot_is_free` (lessen + proeflessen + afspraken, sluit self uit); `_trial_slot_is_free` en `schedule_lesson` (12-arg sig) herwerkt zodat **niets** over een gepland blok/examen/toets geboekt kan worden. SECURITY DEFINER RPC's `create_/update_/delete_agenda_appointment` (staff-auth via `_lesson_actor_authorized`, blok-types forceren `student_id=null`, type onveranderlijk bij update), execute revoked van anon/authenticated, granted aan service_role. `lib/agenda/types.ts` (NL-labels + kleurvarianten + leerlinggekoppelde set), `lib/agenda/appointments.ts` (`loadAgendaAppointments`, RLS-scoped, leerlingnamen verrijkt), `lib/agenda/actions.ts` (create/update/delete serveracties; non-admin gepind op eigen `instructor_id`). UI: `components/agenda/appointment-card.tsx` (per type gekleurd) + `AppointmentForm.tsx` (gedeeld; type vergrendeld in edit, leerlingveld alleen bij leerlinggekoppelde types); pagina's `app/backoffice/agenda/afspraak/{nieuw,[id]}` + `app/instructor/afspraak/{nieuw,[id]}`; "Afspraak"-knop op backoffice-agenda + instructeur-week; afspraken geïnterleaved + gesorteerd in backoffice-agenda, instructeur-week, DayList en dag-cockpit. `db:test-rls-agenda` groen (12 asserties: anon-leesblok, create planned exam, blok forceert null student, overlap blokkeert afspraak+les+proefles, update/delete, cross-tenant + ongeautoriseerde actor geweigerd, anon execute revoked). |
| Module 3b — Slimme Proeflesplanner (Fase 2) | ✅ datamodel + scoremodel + flow | `0037_trial_lessons` **toegepast**: `trial_lessons` (gekoppeld aan LEAD, nooit aan student; raakt `credit_ledger` nooit), no-overlap exclusion voor provisional/confirmed, select-only RLS, vergrendelde RPC's (`book_/confirm_/reschedule_/reject_trial_lesson`, hergebruikt `_lesson_actor_authorized`). Scoremodel `lib/trial-lessons/suggestions.ts` (voorkeursdag +20, voorkeurstijd +20, binnen gewenste startperiode +15, angstig+geen haast +15, snel traject+vroeg +10), tenant-instelbaar beleid via `tenant_settings` key `trial_lesson_policy`. Publieke bedank-pagina toont tot 3 voorstellen → leerlingkeuze wordt `provisional` (server action, service-role, slot her-gevalideerd, nooit direct bevestigd); backoffice lead-detail bevestigt/verzet/wijst af. `db:test-rls-trial-lessons` groen (10 asserties). **Agenda-integratie:** actieve proeflessen (provisional/confirmed) verschijnen nu op de backoffice-agenda en de instructeur-PWA (dag/week/cockpit) naast reguliere lessen — visueel onderscheiden (gestreepte info-rand + "Proefles"-label + statusbadge), gesorteerd op starttijd, klik linkt naar lead-detail. Gedeelde loader `lib/trial-lessons/agenda.ts` (RLS-scoped, lead-namen verrijkt) + kaart `components/agenda/trial-lesson-card.tsx`. |
| Module 3c — Route-intelligentie (Fase 3) | ✅ datamodel + scoremodel + flow + UI | `0039_route_intelligence` **toegepast**: ophaalcoördinaten op `lead_intake_details`/`trial_lessons` + locatiecoördinaten op `lessons` (alle nullable, checks + partial indexes), route-resultaat persistent op `trial_lessons` (`route_status` computed/estimated/unavailable, `route_travel_to_min`/`route_travel_from_min`, `route_needs_confirm`); RPC's `create_lead_with_intake`/`book_trial_lesson`/`schedule_lesson` herwerkt met coord-/route-params (DEFAULT null, revoke/grant herbevestigd). `lib/trial-lessons/route.ts`: Haversine + `estimateMinutesFromKm` + Google Routes API `computeRouteMatrix` (multi-origin/-destination, leest `GOOGLE_ROUTES_API_KEY`, 6s timeout, ≤625 elementen, null bij fout/onconfigured/te grote batch, gooit nooit). Scoremodel uitgebreid: dichtbij vorige/volgende +15/+15, reistijd past +25, lange omweg −20; Haversine-prefilter, één gerichte gebatchte Google-call per request (richting telt: heenleg = **vorige→pickup**, terugleg = **pickup→volgende**). Vereiste marge = max(basis 15 / angstig 30 / drukke-regio 20 op dichte dagen, ≥ `route_busy_region_min_appts` afspraken). Harde afwijzing alleen bij echte (computed) niet-passende gap — bij schatting nooit afwijzen maar `route_needs_confirm`. Afgekeurde slots worden nergens (ook niet in de fallback) alsnog aangeboden; `validateChosenSlot` weigert (null) een gekozen slot dat met echte reistijd niet past, zodat zo'n slot nooit geboekt wordt. Pickup via Google Places (`components/places-autocomplete.tsx`, graceful → platte input zonder `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`) in intake-wizard + agenda-locatieveld. **Woonplaats**-veld in de intake-wizard gebruikt nu dezelfde autocomplete (`types=["(cities)"]`) en bewaart gestructureerde city-data (`city_lat`/`city_lng`/`city_place_id`) op `lead_intake_details` via `0043_intake_city_structured` (RPC `create_lead_with_intake` met 3 extra default-null params; graceful zonder Places-key). Backoffice toont reistijd-inzicht + "Route controleren". Proefles blijft `provisional` tot instructeur bevestigt. `db:test-rls-trial-lessons` groen (11 asserties). Secrets: `GOOGLE_ROUTES_API_KEY` (server), `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` (browser) — optioneel; zonder deze draait de degraded Haversine-modus. |
| Module 3d — Beschikbaarheid (instructeur) | ✅ datamodel + RPC's + UI + agenda-achtergrond | `0048_instructor_availability` **toegepast**: expliciet beschikbaarheidsmodel = `instructor_availability` (terugkerend weekschema: `weekday` 0–6 JS `getUTCDay`, `start_min`/`end_min` minuten) + `instructor_availability_exception` (enum `availability_exception_kind` available\|blocked, nullable tijdbereik = hele dag) — beide tenant-scoped, select-only RLS, indexes, gist no-overlap exclusion (`int4range`) op het weekschema. Tijden voorlopig in **UTC**. Vergrendelde SECURITY DEFINER RPC's (`set_instructor_weekly_availability` replace-semantiek, `upsert_/delete_availability_exception`, `set_student_daypart_preference`), execute revoked van anon/authenticated, granted aan service_role; helper `_availability_actor_authorized` (self of tenant_admin). `students.preferred_dayparts text[]` toegevoegd. Pure berekening `lib/availability/compute.ts` (`mergeIntervals`/`subtractIntervals`/`computeFreeIntervals`/`computeDayFreeSpace` → vrije ruimte per dag, unie over instructeurs); loaders `lib/availability/service.ts`; serveracties `lib/availability/actions.ts` (non-admin forceert eigen instructor_id, admin mag elke instructeur). UI: `app/instructor/beschikbaarheid` (eigen) + `app/backoffice/beschikbaarheid` (per-instructeur picker), `components/availability/WeeklyEditor.tsx` + `ExceptionsManager.tsx`; navlinks in backoffice-sidebar + instructeur-TopBar. **Agenda-achtergrond:** vrije ruimte als "Beschikbaar"-band op backoffice-agenda (unie alle instructeurs) en instructeur-week (eigen, of unie voor admin) via `components/agenda/availability-banner.tsx`. Optionele leerling-dagdeelvoorkeur op leerlingdossier. `db:test-rls-availability` groen (15 asserties: anon-leesblok beide tabellen, replace-semantiek, gist-overlap geweigerd, exception upsert/delete, ongeautoriseerde actor + cross-tenant geweigerd, dagdeelvoorkeur, anon execute revoked op alle 4 RPC's). |
| Module 3f — Slimme planningslogica (stel leerling voor) | ✅ engine + reads + UI + tests | **Reads-only, adviserend** — wanneer een agenda-slot/blok vrijkomt adviseert het systeem de best passende **bestaande leerlingen** voor dat moment; nooit auto-geboekt. Inverse van de proeflesplanner (daar slots-voor-één-lead, hier leerlingen-voor-één-slot); route-/reistijdsemantiek 1:1 hergebruikt uit `lib/trial-lessons/route.ts`. **Geen migratie** — leest bestaande tabellen via RLS-serverclient. Tenant-instelbaar beleid via `tenant_settings` key `lesson_planning_policy` (`lib/lesson-planning/policy.ts`: `DEFAULT_LESSON_PLAN_POLICY` + sanitiserende `mergeLessonPlanPolicy` met per-key clamps + `loadLessonPlanPolicy`; geen UI, DB-only zoals trial/lead-beleid). Pure engine `lib/lesson-planning/candidates.ts`: `scoreCandidateBase` (voorkeursdagdeel +20, examen in zicht ≤21d +25, bijna-examenrijp +15, recent uitgevallen les +15, tegoed-zonder-geplande-les +15, veel tegoed ≥600 min +10) + `applyRouteToCandidate` (pure, neemt reeds-opgeloste reistijd: dichtbij vorige/volgende +15, past +25, lange omweg −20). Harde eligibility: voldoende tegoed (saldo ≥ lesduur, in minuten), niet al overlappend geboekt, optioneel `require_daypart_match`; computed route-onhaalbaar → afgewezen, schatting wijst nooit af maar vlagt `needs_manual_confirm`. Regio-proxy = meest recente leslocatie (`lessons.location_lat/lng`); ontbreekt → route degradeert naar `unavailable`, leerling blijft eligible. Readiness + Google-call begrensd tot top `route_max_candidates` (12) na basisscore; één gerichte gebatchte matrix (heenleg vorige→leerling, terugleg leerling→volgende). Orchestratie `suggestStudentsForSlot(client, …)` — leest instructeur-bezetting (lessen/proeflessen/afspraken) voor buren + dagdichtheid, actieve leerlingen + saldi, batched signalen (examens, annuleringen, laatste/komende les, regio-coord), sluit het vrije blok zelf uit. UI: async servercomponent `components/agenda/slot-student-suggestions.tsx` op de afspraak-detailpagina bij `type='free_block'` — gerangschikte kandidaten met score, reden, reistijd-inzicht en **"Plan in"**-knop die de bestaande `app/backoffice/agenda/nieuw`-flow voorvult (uitgebreid met `instructor_id`/`date`/`time`/`duration_min` query-params, gevalideerd). Tests `scripts/src/test-lesson-planning.ts` (`test-lesson-planning`, non-db, pure cross-pkg import met namespace-normalisatie): 28 asserties groen — dagdeel-matching, eligibility-gates, alle basisscorefactoren + som, route computed-near+past/estimated-nooit-afwijzen/computed-reject/allowReject=false-behouden/unavailable/lange-omweg. |
| Module 4 — Pakketten | ✅ | `0010`, `app/backoffice/packages`, `grant_package` |
| Module 5 — Tegoed in uren (ledger) | ✅ | `0012`–`0013` + `0046_tegoed_uren` **toegepast**: tegoed wordt nu in **minuten** opgeslagen (exact; getoond als uren via `Intl` nl-NL) i.p.v. abstracte credits. `0046` zet bestaande data idempotent om (×60: `credit_ledger.delta`, `packages.credits_total`, `lessons.credits_cost`/`refunded_credits`), houdt tabel-/kolomnamen stabiel (geherinterpreteerd als minuten), default `credits_cost`=60. `schedule_lesson` herwerkt: kost = **lesduur in minuten** (param `p_credits_cost` genegeerd), ledger+audit per mutatie, annulering stort minuten terug volgens tenant-annuleringsbeleid; revoke/grant-lockdown (alleen service_role) herbevestigd. Formatters `formatHours`/`formatTegoed`/`formatTegoedDelta`/`hoursToMinutes` in `lib/students/types.ts`; alle UI-teksten "credits" → "tegoed (uren)" in leerling-PWA, instructeur-PWA en backoffice (pakketten, leerlingdossier, agenda, facturen, leads). Pakketten/handmatige correcties voeren uren in (×60 server-side). `db:test-rls-credits` + `db:test-rls-lessons` groen met minuten-semantiek. |
| Module 6 — Facturatie | ✅ (basis) | `0019`–`0021`, `app/backoffice/facturen` |
| Module 7 — Betalingen (Mollie, Fase 2) | ✅ | `0024`–`0025`, `app/api/webhooks/mollie/[tenantId]`, `confirm_mollie_payment` |
| Module 9 — Instructeur PWA | ✅ | `app/instructor/*`, `components/instructor/*` |
| Module 10 — Leerling PWA + ouderportaal | ✅ | `app/student/*`, `select-child`, `lib/students/active-child.ts` |
| Module 13 — CBR (Fase 1, handmatig) | ✅ | `0022_cbr_checklist`, `components/cbr/*` |
| Module 12 — Communicatiecentrum (email) | ✅ fundering (SendGrid-koppeling open) | `0026_notifications` **toegepast**, `lib/notifications/*`, `app/api/jobs/lesson-reminders`; migratie + RLS/idempotentie-tests groen (16 asserties). Degradeert netjes tot SendGrid gekoppeld is. **Proefles bevestiging** (`0045_trial_lesson_notifications` **toegepast**): twee nieuwe typen `trial_lesson_received` (leerling kiest provisional moment → ontvangstbevestiging) + `trial_lesson_confirmed` (backoffice bevestigt → bevestigingsmail), white-label-bewust + idempotent per `trial_lesson`-id, degradeert netjes. Gebonden in `chooseTrialLesson` (intake) en `confirmTrialLesson` (backoffice); best-effort zodat e-mailfout nooit de boeking/bevestiging laat falen |
| Module 14 — Rapportages | 🟡 tenant-rapportage uitgebreid (Leskaart L5) | `app/backoffice/rapportages`: activiteit (periode) + **examenrijpheid & kwaliteit** (actuele stand). `lib/reports/quality-overview.ts` aggregeert tenant-breed via dezelfde L1-engine (`computeReadiness`) zodat cijfers gelijk zijn aan instructeur/leerling: fase-bands, advies-bands, per-leerling readiness, per-instructeur voortgang (voltooide lessen, leerlingen, gem. lescijfer), KPI's (gem. examenrijpheid, examenrijp/bijna, kritieke aandachtspunten, theorie behaald, lesvoltooiing). Strikt tenant-scoped via RLS (admin+instructor lezen tenant-breed; instructeurslijst uit lessen, niet uit memberships); fail-loud loaders. Buiten scope: platformrapportage (MRR/ARR — Module 14 platform), visuele grafieken (aparte follow-up), AI (L6) |
| Module 8 — Theorie Platform | ⬜ | geen routes/migraties |
| Module 11 — Taken & Workflow (Kanban) | ✅ datamodel + beveiliging + bord-UI + auto-toewijzing + notificaties | `0027_tasks` + `0028_tasks_hardening` + `0029_task_assignment_rules` **toegepast**: afdelingen/borden/kolommen/taken/koppelingen, RLS, vergrendelde RPC's, backfill + seed; `db:test-rls-tasks` groen (30 asserties). Bord-UI `/backoffice/taken` live: bordkiezer, kolommen + kaarten, drag/drop herordenen + kolomwissel (move_task), aanmaken/bewerken/archiveren-dialog (titel, omschrijving, prioriteit, einddatum, toewijzing). Auto-toewijzing: tenant-instelbare regels (`task_assignment_rules`) bepalen bij aanmaak de afdeling (standaardregel CBR-machtiging → Administratie), met terugval op de afdeling van het bord; beheer-UI op `/backoffice/instellingen` (afdelingen tonen + regels toevoegen/(de)activeren/verwijderen). Notificatie `task_assigned` (NL, witlabel-bewust, idempotent, degradeert als e-mail niet is geconfigureerd) wordt best-effort verstuurd bij toewijzing in create/update. Buiten scope: push/WhatsApp/SMS, AI |
| Module 15 — AI Platform | 🟡 adviserende AI in leskaartflow (Leskaart L6) | Instructeur-cockpit `app/instructor/[lessonId]`: (1) **AI-lesverslag** — korte notities → net NL concept-verslag, bewerkbaar, alleen opgeslagen als de instructeur het bewust als lesnotitie bewaart; (2) **Zwakke onderdelen & slagingskans** — detecteert zwakke/kritieke onderdelen uit de leskaartcijfers + L1-readiness en geeft een kwalitatieve slagingskans-indicatie (Laag/Gemiddeld/Hoog met onderbouwing); (3) **Planningssuggesties** — niet-bindende focus voor komende lessen. On-demand (knop, geen kosten bij laden), strikt tenant-scoped via dezelfde auth/RLS + les-eigenaarschap; ruwe AI-output wordt nooit automatisch bewaard. OpenAI via Replit AI Integrations (`lib/ai/client.ts`, `lib/ai/leskaart-advisor.ts`, `app/instructor/ai-actions.ts`). Geen nieuwe tabellen/migraties. Buiten scope: autonome planning/auto-examenadvies, visuele grafieken, platform-AI |
| Module 15 — AI Platform (overig) | ⬜ | — |
| Module 16 — Multi-vestiging | ⬜ | enum-niveau niet aanwezig |
| Module 17 — Franchise Platform | ⬜ | — |
| Module 18 — White-label (volledig: eigen domein/login/emails) | 🟡 | branding-kern aanwezig; eigen domein/login/emails nog niet |
| Marketing platform (`rijschool.nxtdrive`) | ⬜ | losse marketingsite nog niet als artifact |
| Security canon: audit logs, tenant isolation, rollen | ✅ kern | `audit_log` insert-only, RLS helpers |
| Security canon: MFA | ⬜ (later, conform canon) | — |
| Monitoring canon: Sentry, Better Stack, Supabase/VPS monitoring | ⬜ | — |
| AVG/Compliance: docs + data export/verwijdering | ⬜ | — |
| Abonnementstiers (Start/Pro/Elite) enforcement | 🟡 | enums in `0002`; nog geen gating-logica |

### Eerdere blocker (opgelost 2026-06-01)

- Staging Supabase was tijdelijk gepauzeerd (DNS resolvete niet, pooler meldde
  `tenant/user not found`). Na unpause hersteld; migratie `0026` toegepast en tests groen.
  Let op: gratis Supabase-projecten pauzeren bij inactiviteit — zelfde symptoom kan terugkeren.

---

## Faseplan vooruit

De canon-sprintvolgorde (Sprint 0–10) wordt hier vertaald naar de werkelijke reststand.
Fundering (Sprint 0–4) is grotendeels klaar; we vervolgen vanaf de communicatielaag.

### Fase A — Communicatie afmaken (Module 12) 🟡 NU
**Doel:** notificatiefundering live + twee flows (lesherinnering, betaling ontvangen).
- ✅ `0026_notifications` toegepast; `db:test-notifications` groen (14 asserties).
- ✅ Fundering: templates + log + idempotente RPC's, server-side, white-label-aware, degradeert netjes.
- ⬜ E-mailprovider **SendGrid** koppelen (connector `not_setup`) en echte verzending bedraden.
- ⬜ Cron-schema + `CRON_SECRET` zetten zodat lesherinnering-job draait.
- ✅ **Proefles bevestiging** (`0045`): ontvangstbevestiging bij keuze (provisional)
  + bevestigingsmail bij backoffice-bevestiging — white-label-bewust, idempotent,
  degradeert netjes zonder SendGrid.
- ⬜ Resterende automatische berichten uit canon (examen ingepland,
  theorie herinnering, reviewverzoek) als volgende iteratie.

### Fase B — Rapportages verdiepen (Module 14)
- ✅ Tenant-niveau (Leskaart L5): examenrijpheid-overzicht over alle leerlingen
  (fase-bands, bijna-examenrijp, examenwaardig), voortgang per instructeur en per
  leerling, kwaliteits-/slagingsindicatoren — op `/backoffice/rapportages`,
  herbruikt de L1-engine (`computeReadiness`) zodat cijfers consistent zijn met
  instructeur/leerling, strikt tenant-scoped via bestaande RLS.
- ⬜ Visuele grafieken op de rapportagepagina (aparte follow-up).
- ⬜ Platform-niveau: tenants, MRR/ARR, groei, churn, actieve gebruikers.

### Fase C — Theorie Platform (Module 8, canon Sprint 5)
- Datamodel: hoofdstukken, toetsen, scores, huiswerk/deadlines (tenant-scoped + RLS).
- Theorie-dashboard (leerling) + huiswerk toewijzen (instructeur).
- AI-analyse expliciet **later** (Fase G).

### Fase D — Taken & Workflow / Kanban (Module 11, canon Sprint 6) — ✅ afgerond
- Borden per afdeling, kaarten koppelbaar aan leerling/factuur/examen/les/lead/instructeur. ✅
- Automatische toewijzing aan afdeling (voorbeeld: CBR-machtiging → Administratie). ✅ tenant-instelbaar via `task_assignment_rules` + beheer-UI op `/backoffice/instellingen`, met terugval op de afdeling van het bord; notificatie `task_assigned` bij toewijzing.

### Fase E — Abonnementen & feature-gating + platform admin uitbreiden
- Enforcement van Start/Pro/Elite (white-label = Elite), feature flags, abonnementsbeheer.

### Fase F — Multi-vestiging & Franchise (Modules 16–17, Sprint 8–9)
- Vestigingen onder tenant; rechten per vestiging; franchise-dashboard + templates.

### Fase G — AI Platform (Module 15, Sprint 7)
- ✅ Leskaart L6: AI-lesverslag, zwakke onderdelen & adviserende slagingskans, planningssuggesties — adviserend, bewerkbaar/negeerbaar, on-demand, op de stabiele L0–L4 + L1-readiningsfundering. Ruwe AI-output nooit auto-bewaard.
- Toekomst: bredere platform-AI bovenop deze fundering.

### Fase H — White-label volledig (Module 18, Sprint 10)
- Eigen domein, eigen loginpagina, eigen e-mailbranding bovenop bestaande kern.

### Doorlopend — Security, Monitoring, AVG (canon-verplicht)
- Sentry + Better Stack + Supabase/VPS monitoring + alerts.
- AVG: data-export, verwijderverzoeken, bewaartermijnen, toestemmingen, audit trail.
- MFA (later, conform canon).

---

## Bekende canon ↔ project afwijkingen (besloten)

Deze afwijkingen wijken bewust af van de canon en zijn door de gebruiker bevestigd:

1. **Domein:** `nxtdrive.io` (canon noemde `nxtdrive.nl`). Besloten: **`nxtdrive.io`**.
2. **E-mailprovider:** **SendGrid** (canon noemde Amazon SES). Besloten: **SendGrid**.

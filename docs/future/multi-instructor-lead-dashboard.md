# Future — Leaddashboard voor meerdere instructeurs

Status: **toekomst** (niet gebouwd). Het huidige leaddashboard (Module 1b) is
gebouwd voor de solo-instructeur-eigenaar van één tenant. Dit document beschrijft
wat er nodig is om hetzelfde dashboard te laten werken voor een rijschool met
meerdere instructeurs binnen dezelfde tenant, zonder de bestaande fundering te
breken.

## Wat er nu al klopt (geen herbouw nodig)

- Multi-tenancy is al overal afgedwongen op `tenant_id` + RLS. Meerdere
  instructeurs in één tenant zien elkaars leads al via de bestaande
  membership-RLS — dat is gewenst gedrag binnen één rijschool.
- `leads.assigned_owner_id` bestaat al en wordt bij `create_lead_manual` gevuld
  met de actor. De datalaag ondersteunt eigenaarschap dus al.
- Auto-taken (`tasks` + `task_type` + `dedupe_key`) en de Kanban-borden
  ondersteunen al toewijzing per lid (`assignee_user_id`) en per afdeling.
- `_lesson_actor_authorized` valideert al dat de actor lid is van de tenant.

## Wat ontbreekt voor multi-instructeur

1. **Eigenaar-toewijzing als eerste klas burger.**
   - `assigned_owner_id` wordt nu alleen gezet bij handmatige aanmaak. Voeg een
     `assign_lead_owner(p_lead_id, p_tenant_id, p_actor, p_owner_user_id)` RPC toe
     (service-role, actor + owner beide tenant-geverifieerd, event + audit).
   - Automatische ronde-verdeling (round-robin / op basis van regio/agenda) is
     optioneel en hoort in `lib/leads/automation.ts` als een aparte, pure functie.

2. **Dashboardfilters per eigenaar.**
   - `getLeadsForTab` / `getLeadKpis` krijgen een optionele `ownerId`-filter.
   - UI: een "Mijn leads / Alle leads"-schakelaar bovenaan het dashboard. Default
     voor een instructeur = "Mijn leads"; tenant_admin = "Alle leads".

3. **Auto-taak-toewijzing volgt de lead-eigenaar.**
   - `ensure_lead_task` zet `assignee_user_id = lead.assigned_owner_id` wanneer
     die bekend is, zodat de juiste instructeur de taak op zijn bord ziet.
   - Bij heroverdracht van de lead moeten openstaande auto-taken mee verhuizen
     (her-assign in plaats van dupliceren — `dedupe_key` blijft leidend).

4. **KPI's per instructeur.**
   - Vandaag/Te laat/Hot per eigenaar, plus een tenant-totaal voor de admin.

5. **Notificaties.**
   - Hergebruik het bestaande `task_assigned`-notificatiekanaal wanneer een lead
     (en dus de auto-taak) aan een andere instructeur wordt toegewezen.

## Niet doen

- Geen aparte lead-tabellen per instructeur. Eigenaarschap is een kolom, geen
  nieuwe tabel.
- RLS niet verzwakken: instructeurs binnen één tenant mogen elkaars leads blijven
  zien (operationele back-up). Verberg "andermans" leads alleen in de UI-filter,
  niet in de RLS.
- Geen client-side mutaties; alle eigenaarwijzigingen via service-role RPC met
  audit + event, net als nu.

## Testuitbreiding

- Voeg aan `scripts/src/test-rls-lead-dashboard.ts` (of een nieuw script) toe:
  eigenaar-toewijzing schrijft event + audit; cross-tenant owner wordt geweigerd;
  auto-taak volgt de eigenaar; her-toewijzing dupliceert geen taken.

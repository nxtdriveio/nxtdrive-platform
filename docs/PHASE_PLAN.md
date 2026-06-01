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
| Module 1 — CRM & Leads + Intake | ✅ | `0007`–`0009`, `app/intake/[slug]`, `app/backoffice/leads`, `convert_lead_to_student` |
| Module 2 — Leerlingenbeheer (+ouders) | ✅ | `0011`, `0019_student_guardians`, `app/backoffice/leerlingen` |
| Module 3 — Planning / lessen | ✅ | `0014`–`0016`, `app/backoffice/agenda`, `schedule/cancel/complete_lesson` RPC |
| Module 4 — Pakketten | ✅ | `0010`, `app/backoffice/packages`, `grant_package` |
| Module 5 — Creditsysteem (ledger) | ✅ | `0012`–`0013`, `credit_ledger`, `adjust_credits` |
| Module 6 — Facturatie | ✅ (basis) | `0019`–`0021`, `app/backoffice/facturen` |
| Module 7 — Betalingen (Mollie, Fase 2) | ✅ | `0024`–`0025`, `app/api/webhooks/mollie/[tenantId]`, `confirm_mollie_payment` |
| Module 9 — Instructeur PWA | ✅ | `app/instructor/*`, `components/instructor/*` |
| Module 10 — Leerling PWA + ouderportaal | ✅ | `app/student/*`, `select-child`, `lib/students/active-child.ts` |
| Module 13 — CBR (Fase 1, handmatig) | ✅ | `0022_cbr_checklist`, `components/cbr/*` |
| Module 12 — Communicatiecentrum (email) | ✅ fundering (SendGrid-koppeling open) | `0026_notifications` **toegepast**, `lib/notifications/*`, `app/api/jobs/lesson-reminders`; migratie + 14 RLS/idempotentie-tests groen. Degradeert netjes tot SendGrid gekoppeld is |
| Module 14 — Rapportages | 🟡 minimaal | `app/backoffice/rapportages` bestaat, beperkte diepte |
| Module 8 — Theorie Platform | ⬜ | geen routes/migraties |
| Module 11 — Taken & Workflow (Kanban) | 🟡 datamodel + beveiliging + bord-UI | `0027_tasks` + `0028_tasks_hardening` **toegepast**: afdelingen/borden/kolommen/taken/koppelingen, RLS, vergrendelde RPC's, backfill + seed; `db:test-rls-tasks` groen (23 asserties). Bord-UI `/backoffice/taken` live: bordkiezer, kolommen + kaarten, drag/drop herordenen + kolomwissel (move_task), aanmaken/bewerken/archiveren-dialog (titel, omschrijving, prioriteit, einddatum, toewijzing). Nog open: entiteitkoppelingen (#33), auto-toewijzing + notificaties (#34) |
| Module 15 — AI Platform | ⬜ | — |
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
- ⬜ Resterende automatische berichten uit canon (proefles bevestiging, examen ingepland,
  theorie herinnering, reviewverzoek) als volgende iteratie.

### Fase B — Rapportages verdiepen (Module 14)
- Tenant-niveau: omzet, leerlingen, lessen, conversies, annuleringen, slagingspercentages.
- Platform-niveau: tenants, MRR/ARR, groei, churn, actieve gebruikers.

### Fase C — Theorie Platform (Module 8, canon Sprint 5)
- Datamodel: hoofdstukken, toetsen, scores, huiswerk/deadlines (tenant-scoped + RLS).
- Theorie-dashboard (leerling) + huiswerk toewijzen (instructeur).
- AI-analyse expliciet **later** (Fase G).

### Fase D — Taken & Workflow / Kanban (Module 11, canon Sprint 6)
- Borden per afdeling, kaarten koppelbaar aan leerling/factuur/examen/les/lead/instructeur.
- Automatische toewijzing aan afdeling (voorbeeld: CBR-machtiging → Administratie).

### Fase E — Abonnementen & feature-gating + platform admin uitbreiden
- Enforcement van Start/Pro/Elite (white-label = Elite), feature flags, abonnementsbeheer.

### Fase F — Multi-vestiging & Franchise (Modules 16–17, Sprint 8–9)
- Vestigingen onder tenant; rechten per vestiging; franchise-dashboard + templates.

### Fase G — AI Platform (Module 15, Sprint 7)
- AI-lesverslagen, voortgangsanalyse, planningssuggesties. Pas ná stabiele fundering.

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

# NXTDRIVE Canon Blueprint v1.0

## Product Definitie

NXTDRIVE is een SaaS-platform voor rijscholen dat alle operationele, administratieve, commerciële en educatieve processen centraliseert in één ecosysteem.

NXTDRIVE bestaat uit:

- NXTDRIVE Marketing Platform
- Rijschool Backoffice
- Instructeur PWA
- Leerling PWA
- Ouderportaal
- Theorie Platform
- Financieel Platform
- Planning Platform
- Taken & Workflow Platform
- Franchise Platform
- White-label Platform

NXTDRIVE is SaaS-first, multi-tenant en mobile-first.

---

# Kernvisie

De meeste rijscholen werken met:

- WhatsApp
- Excel
- papieren leskaarten
- losse agenda's
- losse theorieplatformen
- losse facturatie
- losse administratie

NXTDRIVE vervangt dit door één centraal platform.

## Doel

> Van lead tot rijbewijs. Alles in één systeem.

---

# Architectuur Principes

## SaaS First

NXTDRIVE wordt vanaf dag één gebouwd als SaaS.

Niet:

```text
Van Dijk Rijschool software
```

Maar:

```text
NXTDRIVE Platform
```

Van Dijk wordt slechts tenant 1.

---

## Multi Tenant

Iedere rijschool beschikt over:

- eigen data
- eigen leerlingen
- eigen instructeurs
- eigen planning
- eigen pakketten
- eigen facturen
- eigen instellingen

Technisch:

```text
tenant_id
```

op alle tenant-data.

---

## Default Branding

Iedereen gebruikt standaard:

```text
NXTDRIVE
```

branding.

White-label is optioneel.

---

# Domeinstructuur

## Marketing

```text
rijschool.nxtdrive.nl
```

NXTDRIVE marketing website.

---

## Centrale Login

```text
app.nxtdrive.nl
```

Iedere gebruiker logt hier in.

---

## Tenant Backoffice

Na login:

```text
tenant_admin
→ backoffice

instructor
→ instructeur app

student
→ leerling app

platform_admin
→ platform dashboard
```

---

# Gebruikersrollen

## Platform Admin

Kan:

- tenants beheren
- abonnementen beheren
- white-label beheren
- feature flags beheren
- platform instellingen beheren

---

## Tenant Admin

Kan:

- leerlingen beheren
- instructeurs beheren
- planning beheren
- facturen beheren
- pakketten beheren
- theorie beheren

Alleen eigen tenant.

---

## Administratie

Kan:

- betalingen
- facturen
- documenten
- CBR administratie

---

## Planner

Kan:

- lessen
- examens
- agenda

---

## Instructeur

Kan:

- lessen uitvoeren
- voortgang registreren
- taken aanmaken
- leerlingen beheren

---

## Leerling

Kan:

- lessen bekijken
- voortgang bekijken
- theorie maken
- betalen
- documenten bekijken

---

## Ouder

Kan:

- gekoppelde leerling bekijken
- facturen bekijken
- voortgang bekijken

---

# Module 1: CRM & Leads

## Intake

- proefles aanvragen
- contactaanvraag
- online inschrijving

---

## Leads

Statussen:

- nieuw
- contact opnemen
- proefles gepland
- proefles afgerond
- pakket gestuurd
- klant geworden
- afgehaakt

---

# Module 2: Leerlingenbeheer

## Leerlingdossier

- persoonsgegevens
- ouders
- documenten
- theorie
- voortgang
- lessen
- betalingen
- CBR status

---

# Module 3: Planning

## Lesplanning

- proeflessen
- reguliere lessen
- examens
- TTT

---

## Slimme planning (later)

- beschikbaarheid
- reistijd
- regio
- urgentie
- AI aanbevelingen

---

# Module 4: Pakketten

Voorbeelden:

- proefles
- 10 lessen
- 20 lessen
- 30 lessen
- spoedpakket
- opfriscursus

---

# Module 5: Creditsysteem

Bijhouden:

- gekocht
- ingepland
- gebruikt
- beschikbaar
- verlopen
- geannuleerd

---

# Module 6: Facturatie

- facturen
- termijnbetalingen
- creditfacturen
- openstaande posten
- herinneringen

---

# Module 7: Betalingen

## Fase 1

- handmatige verwerking

## Fase 2

- Mollie
- iDEAL
- Bancontact
- Apple Pay
- automatische reconciliatie

---

# Module 8: Theorie Platform

## Theorie Dashboard

- voortgang
- examens
- huiswerk
- scores
- aanbevelingen

---

## Theorie Huiswerk

Instructeur kan:

- hoofdstukken toewijzen
- toetsen toewijzen
- deadlines geven

---

## Theorie Analyse

Later:

- AI analyse
- zwakke onderwerpen
- slagingskans
- theorie gereedheid

---

# Module 9: Instructeur PWA

## Functies

- dagplanning
- weekplanning
- leerling openen
- les afronden
- voortgang registreren
- taak aanmaken
- notities toevoegen
- examenadvies geven

---

# Module 10: Leerling PWA

## Functies

- lessen bekijken
- theorie volgen
- voortgang bekijken
- betalingen bekijken
- documenten bekijken
- berichten ontvangen
- les annuleren
- les aanvragen

---

# Module 11: Taken & Workflow Platform

## Kanban Borden

- administratie
- planning
- theorie
- finance
- examens
- support
- marketing

---

## Kaarten

Kunnen gekoppeld worden aan:

- leerling
- factuur
- examen
- les
- lead
- instructeur

---

## Afdelingen

- administratie
- planning
- finance
- marketing
- theorie
- support
- examenbeheer

---

## Voorbeeld

Instructeur maakt taak:

> Controleer CBR-machtiging leerling.

Taak wordt automatisch toegewezen aan Administratie.

---

# Module 12: Communicatiecentrum

## Kanalen

- email
- push notificaties
- WhatsApp (later)
- SMS (later)

---

## Automatische berichten

- lesherinnering
- proefles bevestiging
- factuur melding
- betaling ontvangen
- examen ingepland
- theorie herinnering
- reviewverzoek

---

# Module 13: CBR Platform

## Fase 1

Handmatig beheer.

Statussen:

- machtiging nodig
- machtiging ontvangen
- theorie gehaald
- gezondheidsverklaring
- examen gepland
- geslaagd
- gezakt

---

## Fase 2

Onderzoek naar:

- CBR TOP
- Opleidersportaal
- synchronisatie

---

# Module 14: Rapportages

## Tenant Niveau

- omzet
- leerlingen
- lessen
- theorie
- conversies
- annuleringen
- slagingspercentages

---

## Platform Niveau

- tenants
- MRR
- ARR
- groei
- churn
- actieve gebruikers

---

# Module 15: AI Platform

## AI Lesverslagen

Korte notities → volledige samenvatting.

---

## AI Voortgangsanalyse

Analyse van:

- examenrijpheid
- risico's
- zwakke onderdelen
- verbeterpunten

---

## AI Planning

Suggesties voor:

- planning
- lesmomenten
- examenmomenten
- efficiëntie

---

# Module 16: Multi Vestiging

## Structuur

Voorbeeld:

```text
Van Dijk Rijschool

├─ Den Haag
├─ Scheveningen
├─ Westland
└─ Rotterdam
```

---

## Per Vestiging

- planning
- instructeurs
- leerlingen
- rapportages
- voertuigen

---

## Rechten

Medewerkers kunnen beperkt worden tot:

- specifieke vestiging
- meerdere vestigingen
- alle vestigingen

---

# Module 17: Franchise Platform

## Structuur

```text
Franchisegever
    ↓
Vestigingen
    ↓
Instructeurs
```

---

## Franchise Dashboard

- alle locaties
- prestaties
- omzet
- leerlingen
- instructeurs
- rankings

---

## Franchise Templates

- pakketten
- prijzen
- workflows
- e-mails
- communicatie

---

## Franchise Rapportages

- omzet per vestiging
- slagingspercentages
- conversies
- groei
- prestaties

---

# Module 18: White Label Platform

## Premium Functionaliteit

Mogelijkheden:

- eigen logo
- eigen kleuren
- eigen app branding
- eigen e-mails
- eigen domein
- eigen loginpagina

---

# Security Canon

## Verplicht

- Supabase Auth
- RLS
- Audit Logs
- Tenant Isolation
- Role Permissions
- MFA (later)

---

## Data Security

- encryptie in transit
- veilige opslag
- logging
- exportfunctionaliteit
- verwijderverzoeken
- AVG ondersteuning

---

# Monitoring Canon

## Verplicht

- Better Stack
- Sentry
- VPS Monitoring
- Supabase Monitoring

---

## Alerts

- downtime
- hoge CPU
- hoge RAM
- database issues
- foutmeldingen

---

# AVG & Compliance

## Documenten

- Privacyverklaring
- Algemene Voorwaarden
- Verwerkersovereenkomst
- Cookieverklaring
- Datalekprocedure

---

## Functionaliteiten

- data export
- data verwijdering
- bewaartermijnen
- toestemmingen
- audit trail

---

# Technische Stack

## Frontend

- Next.js
- TypeScript
- Tailwind CSS
- shadcn/ui
- Framer Motion

---

## Backend

- Supabase Auth
- Supabase Postgres
- Supabase Storage
- Supabase Realtime

---

## Infrastructuur

- VPS
- Cloudflare
- GitHub
- GitHub Actions
- Amazon SES

---

# Build Volgorde

## Sprint 0

- VPS
- GitHub
- Cloudflare
- Supabase
- CI/CD

---

## Sprint 1

- SaaS Foundation
- Auth
- Tenants
- Rollen
- RLS

---

## Sprint 2

- CRM
- Leads
- Leerlingen

---

## Sprint 3

- Planning
- Instructeur PWA

---

## Sprint 4

- Credits
- Facturen
- Betalingen

---

## Sprint 5

- Theorie Platform

---

## Sprint 6

- Takenbord
- Kanban

---

## Sprint 7

- AI Platform

---

## Sprint 8

- Multi Vestiging

---

## Sprint 9

- Franchise Platform

---

## Sprint 10

- White Label Platform

---

# Einddoel

NXTDRIVE wordt:

> De complete operationele cockpit voor moderne rijscholen.

Van lead tot rijbewijs.

Van leerling tot franchiseorganisatie.

Alles in één schaalbaar SaaS-platform.
# NXTDRIVE functieoverzicht

Laatste update: 17 juni 2026

Dit document beschrijft de belangrijkste functies van de NXTDRIVE leerlingapp,
instructeursapp, tenant backoffice en franchise/admin dashboards. Het doel is
een gedeeld productbeeld: wat kan elke gebruiker doen, waar hoort het thuis en
welke modules vormen samen het operationele platform.

## Productlagen

NXTDRIVE bestaat uit vier primaire productlagen:

1. Leerlingapp: mobile-first PWA voor leerlingen en, waar relevant, ouders.
2. Instructeursapp: tablet-first cockpit voor instructeurs, met mobiele fallback.
3. Tenant backoffice: beheeromgeving voor rijschoolhouders, planners en admins.
4. Franchise/admin dashboards: governance, vergelijking en centrale sturing over
   meerdere vestigingen of franchise-eenheden.

De vaste architectuurregel blijft: alle data hoort bij een tenant/organisatie en
kan optioneel verder worden gescoped naar vestiging, team, instructeur, leerling
of franchise-netwerk.

## Leerlingapp

De leerlingapp is bedoeld als persoonlijke rijbewijsomgeving. De leerling ziet
alleen eigen gegevens en krijgt informatie in coachende taal.

### Toegang en sessie

- Inloggen via de centrale NXTDRIVE login.
- Automatische rolroutering naar `/student`.
- PWA-installatie op mobiel.
- Mobile-first portrait layout met veilige ruimte rond sticky header en bottomnav.
- Sessies worden via Supabase-auth en app-cookies beheerd.

### Home dashboard

- Persoonlijke begroeting.
- Rijbewijsreis met modulevoortgang.
- Volgende les of planningstatus.
- Examenstatus en verwachte gereedheid.
- AI Coach-kaart met leerlingvriendelijk advies.
- Quick actions voor planning, voortgang, betalingen, examens, theorie en berichten.
- Notificatie- en berichteniconen in de app-header.

### Lessen en agenda

- Overzicht van geplande en eerdere lessen.
- Lesdetailpagina met tijd, locatie, voertuig, instructeur en context.
- Lesreflectie na publicatie door instructeur.
- Leerdoelen, feedback en samenvattingen in leerlingvriendelijke taal.
- Mogelijkheid om naar planning/contactmomenten door te klikken waar toegestaan.

### Voortgang

- Rijbewijsreis op hoofdlijnen.
- Voortgang per onderdeel of RIS-module wanneer RIS actief is.
- Historie van lesbeoordelingen en ontwikkelpunten.
- Examen- en praktijkgereedheidsinformatie.
- Coachende labels in plaats van interne technische scoring.

### RIS-leskaart

- Leerling ziet alleen gepubliceerde RIS-informatie.
- Conceptscores en interne notities blijven verborgen voor de leerling.
- RIS-stappen worden vertaald naar begrijpelijke voortgangsteksten.
- Begeleide reflectie en volgende focus worden zichtbaar na publicatie.

### Theorie

- Theorie-overzicht met voortgang.
- Theorieonderdelen, huiswerk en toetsen.
- Koppeling met leerdoelen en praktijkontwikkeling.
- Statussen voor afgerond, actief of nog te doen.

### Betalingen en tegoed

- Inzicht in lesuren/tegoed.
- Facturen bekijken.
- Betaalstatussen bekijken.
- Mollie-betaalflow waar beschikbaar.
- Signalering wanneer tegoed laag of op is.

### CBR en examens

- CBR-statusoverzicht voor machtiging, theorie, gezondheidsverklaring en examens.
- Examenstatus en aandachtspunten.
- Weergave van geplande examens of toetsen zodra die beschikbaar zijn.

### Berichten en notificaties

- Berichtenoverzicht voor communicatie met rijschool/instructeur.
- Notificatie-tray voor recente updates.
- Ongelezen indicatoren.
- "Alles gelezen" workflow waar ondersteund.

### Account en documenten

- Profielinformatie.
- Documenten waar beschikbaar.
- Instellingen en contactgegevens.
- Parent/child-selectie waar ouderaccounts worden gebruikt.

## Instructeursapp

De instructeursapp is een tablet-first cockpit. De instructeur moet snel kunnen
zien wat vandaag belangrijk is en direct vanuit de app lessen, leerlingen,
berichten en planning afhandelen.

### Toegang en shell

- Inloggen via centrale NXTDRIVE login.
- Automatische rolroutering naar `/instructor`.
- Tablet-first landscape layout met mobiele fallback.
- Header met logo, zoekfunctie, berichten, notificaties, thema en acties.
- Sidebar met instructeurprofiel en dagagenda.
- Acties-menu voor snelle routes zoals instellingen en uitloggen.

### Cockpit home

- Compacte daghero met KPI's voor lessen, proeflessen, examens en taken.
- Volgende-leskaart met leerling, tijd, locatie, voertuig en leerdoelen.
- Op-de-radar blok met aandachtspunten.
- Openstaande taken.
- Berichtenpreview.
- Quick links naar leerlingen, agenda, lesevaluaties en voertuigen.

### Sidebar dagagenda

- Huidige dag met zichtbare tijdsrange.
- Afspraken zoals rijles, proefles, TTT, examen, administratie en theorie.
- Kleurcodering per afspraaktype.
- Compacte items met tijd, leerling/afspraak, duur, locatie en badge.
- Link naar volledige agenda.

### Agenda en planning

- Instructeuragenda voor lessen, examens, priveblokken en interne afspraken.
- Dag/week/maand-achtige agendaweergave als basis voor planning.
- Tijdsloten vanuit ingestelde zichtbare uren.
- Afspraakdetail met context en acties.
- Nieuwe afspraakroute binnen instructeursapp, zonder backoffice-shell.
- Instelbare zichtbare agenda-uren op instructeurinstellingen.

### Leerlingen

- Lijst met gekoppelde leerlingen.
- Leerlingdetailpagina binnen de instructeursapp.
- Contact- en planningscontext per leerling.
- Directe acties zoals bericht sturen, les plannen of dossier openen.
- Instructeur ziet standaard eigen leerlingen, tenzij rechten ruimer zijn.

### Les starten en afronden

- Lesdetail/startflow.
- Lescontext en behandelde onderdelen.
- RIS-scriptbeoordeling of legacy-leskaart afhankelijk van tenantmodus.
- Eindscore, observatie en reflectie.
- AI-assisted voorstel voor samenvatting/focus, altijd met instructeurbevestiging.
- Publicatie naar leerling nadat de instructeur definitief afrondt.

### RIS-instructeurmodus

- RIS-native N/1-8 scoring per script.
- Filters voor focus, aandacht en modules.
- Conceptscores blijven intern.
- Publicatie schrijft definitieve voortgang naar leerlingweergave.
- Begeleide reflectie, moduletoetsen en CBR/RIS-momenten.

### Beschikbaarheid

- Weekbeschikbaarheid beheren.
- Uitzonderingen en blokkades beheren.
- Zichtbare agenda-tijdsrange instellen.
- Koppeling met planning-core zodat afspraken buiten beschikbaarheid worden
  geblokkeerd of gewaarschuwd volgens instellingen.

### Berichten

- Inbox met gesprekken.
- Preview van recente berichten.
- Berichten sturen naar leerlingen of medewerkers waar toegestaan.
- Ongelezen indicatoren.

### Taken

- Takenoverzicht voor toegewezen acties.
- Takenstatussen en prioriteit.
- Link naar relevante leerling, planning of opvolging.

### Voertuigen

- Instructeur kan voertuigcontext bekijken.
- Koppeling met planning en lescontext.
- Toekomstige uitbreiding: schade, onderhoud en kilometerregistratie vanuit app.

### Instellingen

- Profielgegevens.
- Agenda-uren.
- App- en notificatievoorkeuren.
- Dark/light mode waar beschikbaar.

## Tenant backoffice

De tenant backoffice is de beheeromgeving voor de rijschoolorganisatie. Hier
komen planning, leerlingen, instructeurs, voertuigen, financieel beheer,
instellingen, rechten en rapportage samen.

### Admin shell

- Sidebar met domeingroepen: overzicht, planning, relaties, resources,
  leskaart, financieel en beheer.
- Centrale zoekbalk.
- Theme-aware styling via tenant branding.
- Light/dark/white-label basis.
- Responsive layout voor desktop en tablet.
- Infobubble-tooltips voor uitleg, zodat pagina's minder tekst nodig hebben.

### Dashboard

- Operationele cockpit met KPI's, alerts en snelle routes.
- Klikbare namen, taken en acties naar detailpagina's.
- Overzicht van planning, leerlingen, leads, open acties en risico's.
- Basis voor compacte grid/list layout in plaats van losse hero-containers.

### Agenda

- Weekoverzicht van afspraken.
- Filters voor vestigingen en zichtbare scope.
- Afspraken zoals lessen, examens, proeflessen en blokken.
- Link naar nieuwe afspraak en afspraakdetail.
- Branch-aware zichtbaarheid.

### Planboard

- Operationeel resource planbord.
- Horizontale tijdlijn en verticale resource/instructeur-rijen.
- Planning queue met planbare items.
- Preview-validatie via planning-core.
- Validatie op rechten, beschikbaarheid, overlap, rayon, voertuig en
  capabilities.
- Compacte queue-kaarten en transparante drag-state.
- Filters voor datum, vestiging, instructeur, status en type.

### Planning queue en herbezetten

- Openstaande planbare items.
- Herbezetten/verplaatsen van afspraken.
- Queue-statussen zoals open, suggested, scheduled en cancelled.
- Koppeling met centrale planning-service.

### Leerlingen

- Leerlingenlijst.
- Leerlingdetail/dossier.
- Contactgegevens, saldo/tegoed, volgende les en eerste les.
- Branchscope en instructeurkoppeling.
- Documenten, CBR-context, voortgang en planning.
- Nieuwe leerling toevoegen.

### Leads en referrals

- Leadlijst en leaddetail.
- Intake en opvolging.
- Proeflesplanning.
- Conversie naar leerling.
- Referrals en beloningsinstellingen.

### Instructeurs en medewerkers

- Instructeurslijst.
- Instructeurdetail met profiel, scope, leerlingen, planning en capabilities.
- Medewerkers uitnodigen met tijdelijk wachtwoord.
- Rollen, vestigingen en teams beheren.
- Toegang en permissies per medewerker aanpassen.

### Organisatie, vestigingen en teams

- Organisatieprofiel.
- Vestigingen beheren.
- Teams beheren.
- Branch dashboards.
- Multi-vestiging scope voor planning, rapportage en rechten.

### Rollen en permissies

- Rollenoverzicht.
- Beheerbare permissies per rol.
- Scope-based rechten per organisatie, vestiging of team.
- Guards aan serverzijde voor gevoelige acties.

### Voertuigen

- Voertuigenlijst en voertuigbeheer.
- Kenteken, type, transmissie, status, vestiging en instructeurkoppeling.
- APK/onderhoud/schade als planningconstraints.
- Koppeling met planning-core.

### Beschikbaarheid

- Beschikbaarheid per instructeur beheren.
- Weekregels en uitzonderingen.
- Vestigingsfilters.
- Input voor planning-validatie.

### Rayons en servicegebieden

- Servicegebieden en zones beheren.
- Instructeurs koppelen aan rayons.
- Travel matrix en reistijdbuffers.
- Rayon mismatch als waarschuwing of blokkade volgens instellingen.

### Eigenschappen en capabilities

- Dynamische eigenschappen voor instructeur, voertuig, leerling en afspraak.
- Vereiste of gewenste eigenschappen voor planning.
- Voorbeelden: automaat, schakel, faalangst, taal, RIS, examenbegeleiding.
- Planning-core gebruikt required capabilities als harde constraint.

### Pakketten en abonnementen

- Lespakketten beheren.
- Entitlements en feature-gating.
- Downgrade/read-only gedrag voor tenants boven limiet.
- Abonnementsoverzicht en commerciele status.

### RIS-leskaart

- RIS-overzicht voor tenant admin.
- Preflight/migratie-inzicht.
- Clean-start activatie voor mock/seeddata.
- Moduletoetsen, niet-gepubliceerde leskaarten en aandachtspunten.
- RIS default voor nieuwe tenants, legacy fallback waar nodig.

### CBR-status

- CBR-context per leerling.
- Machtiging, theorie, gezondheidsverklaring en examenstatus.
- Blokkades en herplanning.
- Overzicht voor directe opvolging.

### Financieel

- Boekhoudingsoverzicht.
- Facturenlijst en factuurdetail.
- Nieuwe factuur en termijnfacturen.
- Mollie-betaalacties.
- Export van facturen, betalingen en klanten.
- Tegoed, saldo en betalingsopvolging.

### Taken

- Takenbord.
- Taakdialogen en acties.
- Categorieen zoals planning, administratie, finance, marketing, theorie,
  support en examenbeheer.
- Toewijzing en statusbeheer.

### Rapportages

- Rapportagepagina en exports.
- KPI-routes voor dashboards.
- Basis voor omzet, capaciteit, conversie en voortgang.

### Instellingen

- Tenant instellingen.
- Branding en white-label domeinen.
- Notificatietemplates.
- Contacttelefoon.
- Annuleringsbeleid.
- Refill/payment reminder policies.
- Reviewmomenten.
- Assignment rules.
- Parent portal.
- Lead-score en installment-credit policies.

## Franchise/admin dashboards

De franchise-laag is bedoeld voor netwerkbreed inzicht en governance. De
franchisegever krijgt overzicht, standaarden en vergelijkingen, maar mutaties in
franchisee-data blijven afhankelijk van expliciete delegatie/rechten.

### Franchise cockpit

- Netwerkoverzicht.
- Franchisee/vestiging status.
- Aandachtspunten en operationele signalen.
- Read-only governance als veilige standaard.

### Franchise planning

- Centrale planningweergave.
- Capaciteit en drukte per franchisee/vestiging.
- Basis voor toekomstige gedelegeerde planning.
- Scope checks voorkomen dat franchisegever zomaar tenantdata muteert.

### Franchise prestaties

- Vergelijking van prestaties.
- KPI's per vestiging/franchisee.
- Basis voor rankings, capaciteit, leadconversie en bezettingsgraad.

### Franchise aandacht

- Signalen die netwerkbreed aandacht vragen.
- Leerlingen, planning, CBR, financieel of operations-risico's.
- Prioritering voor franchisegever of centrale ondersteuning.

### Franchise templates en playbook

- Standaarden, playbooks en templates.
- Voorbereiding op netwerkbrede capabilities, rayons, workflows en kwaliteitsregels.
- Publicatie naar franchisees kan later onder governance worden gebracht.

### Delegatie en governance

- Franchisegever kan standaard kijken, vergelijken en signaleren.
- Muteren kan alleen met expliciete delegatie of platformconfiguratie.
- Centrale mutaties horen in audit/history.

## Platformbrede functies

### Multi-tenant isolatie

- Data is gescheiden per tenant/organisatie.
- Branch en team scope waar relevant.
- RLS, server-side autorisatie en tenant checks beschermen data.

### Planning-core

- Centrale planningkernel voor alle afspraakflows.
- Valideert rechten, beschikbaarheid, overlap, reistijd, rayon, capabilities,
  voertuigstatus, APK en schade.
- Geeft blocking reasons en warnings terug.
- Wordt gebruikt als basis voor planboard, agenda en toekomstige slimme planning.

### Theming en white-label

- Tenant branding met logo, kleuren en domeinen.
- Theme tokens als basis voor light/dark en tenant-specifieke presets.
- White-label domeinen en wildcard tenant subdomains voorbereid.

### Entitlements

- Feature-gating per abonnement.
- Limieten voor functies, resources en white-label usage.
- Downgrade/read-only gedrag voor overschrijdingen.

### Audit en veiligheid

- Auditlog voor centrale planning en gevoelige mutaties.
- RLS-tests en guardrails.
- Server actions controleren tenant, rol en scope.

### AI

- AI-assisted samenvattingen, focusvoorstellen en rapportagesignalen.
- AI publiceert nooit zelfstandig.
- Instructeur of admin blijft eigenaar van definitieve publicatie.

## Belangrijkste open productlijnen

Deze functies zijn aanwezig of voorbereid, maar blijven logisch doorontwikkelen:

- Verdere vereenvoudiging van backoffice-pagina's naar consistente lijsten,
  grids, tabs en compacte filters.
- Planboard verder verfijnen richting professionele veldplanner/resource planner.
- Performance en route-level loading optimaliseren.
- Volledige handleiding per rol: leerling, instructeur, tenant admin,
  franchisegever en platform admin.
- Verdere livegang-hardening: E2E-smoke flows, monitoring, rollback en runbook.

# NXTDRIVE Delivery Roadmap 2026

Status: voorgestelde uitvoeringsroadmap
Versie: 1.0
Datum: 2026-07-20
Horizon: 14 sprints van twee weken
Bronnen: NXTDRIVE_CANON, NXTDRIVE_PWA_CANON en NXTDRIVE_LESKAART_CANON

## 1. Doel van dit document

Dit document vertaalt de actuele repoanalyse naar een uitvoerbare sprintplanning.
Het is bedoeld als gedeelde bron voor product, engineering, design, QA en
operations.

De roadmap heeft vier doelen:

1. Eerst aantoonbare productiezekerheid creëren.
2. Daarna technische en visuele consistentie verhogen.
3. Vervolgens de grootste canon-gaten sluiten.
4. Pas daarna verder differentiëren met intelligente workflows, AI en
   platformfeatures.

De sprintstatussen in dit document zijn bij aanvang allemaal Voorgesteld. Een
sprint wordt pas Gepland wanneer capaciteit, eigenaar en acceptatiecriteria door
het team zijn bevestigd.

## 2. Uitgangspunten

### 2.1 Sprintcadans

- Eén sprint duurt twee weken.
- Iedere sprint heeft één primair productresultaat.
- Maximaal 65 procent van de capaciteit wordt vooraf met featurewerk gevuld.
- Minimaal 20 procent blijft beschikbaar voor hardening, refactoring en tests.
- Tien procent wordt gereserveerd voor regressies en productiebevindingen.
- Vijf procent wordt gebruikt voor discovery van de volgende sprint.
- Een actief P0-productieprobleem wacht niet op een sprintgrens.

### 2.2 Aangenomen team

Deze planning gaat uit van ongeveer:

- één product owner;
- één productdesigner, minimaal halftijds;
- twee tot vier full-stack engineers;
- één engineer met expliciete platform/operationsverantwoordelijkheid;
- QA-capaciteit, al dan niet als gedeelde teamrol;
- inhoudelijke ondersteuning van een rijopleidings- of RIS-deskundige.

Bij minder capaciteit moet een sprint inhoudelijk worden gesplitst. De volgorde
blijft dan gelijk.

### 2.3 Bronhiërarchie

Bij conflicten geldt:

1. De primaire NXTDRIVE-canons.
2. Expliciet goedgekeurde productbesluiten en architecture decision records.
3. Deze delivery-roadmap.
4. Oudere fase-, sprint- en memorydocumenten.

Een afwijking van een canon wordt niet stilzwijgend geïmplementeerd. Het team
legt de afwijking vast, inclusief reden, eigenaar en datum van herbeoordeling.

## 3. Definition of Ready

Een ticket mag pas naar In uitvoering wanneer:

- het gebruikersprobleem en de doelgroep duidelijk zijn;
- de relevante canonsectie is gekoppeld;
- tenant-, branch- en rolgrenzen zijn beschreven;
- privacy- en securityimpact zijn beoordeeld;
- meetbare acceptatiecriteria bestaan;
- afhankelijkheden en migratieimpact bekend zijn;
- UX-states voor laden, leeg, fout, succes en geen toegang zijn benoemd;
- teststrategie en observability zijn opgenomen;
- bij AI-functionaliteit menselijke controle en dataminimalisatie zijn
  beschreven.

## 4. Definition of Done

Een ticket is pas Klaar wanneer:

- de functionele acceptatiecriteria groen zijn;
- typecheck, lint, relevante unit- en integratietests groen zijn;
- tenantisolatie en autorisatie aantoonbaar zijn getest;
- migraties backwards compatible en herhaalbaar zijn;
- relevante audit-events, logs en metrics bestaan;
- keyboard- en screenreaderbasis is gecontroleerd;
- mobiel, tablet en desktop zijn gecontroleerd waar relevant;
- fout-, lege-, loading- en success-states zijn afgewerkt;
- documentatie en runbook zijn bijgewerkt;
- er geen onverklaarde consolefouten of stille failures zijn;
- een rollback-, retry- of herstelpad bestaat voor operationele mutaties;
- product owner en QA het resultaat op staging hebben geaccepteerd.

## 5. Overzicht

| Sprint | Thema | Primair resultaat | Gate |
|---|---|---|---|
| S0 | Operationele integriteit | Kritieke live-risico's gesloten | Veilige beperkte productie |
| S1 | Security en observability | Incidenten detecteerbaar en publieke flows beschermd | Operational readiness |
| S2 | CI, releases en herstel | Elke release heeft afdwingbare kwaliteitsgates | Release confidence |
| S3 | Privacy en datagovernance | AVG-processen uitvoerbaar door de klant | Compliance foundation |
| S4 | Architectuur en types | Veilige, getypeerde applicatiegrenzen | Maintainability gate |
| S5 | Design system | Toegankelijke shadcn/Radix-basis | UX foundation |
| S6 | PWA en rolflows | Student en instructeur werken snel op echte apparaten | Device-quality gate |
| S7 | Leskaartcorrectheid | Canonconforme en uitlegbare readiness | Didactic correctness |
| S8 | Theorie fundament | Beheerbaar theoriecontent- en toewijzingsmodel | Theory alpha |
| S9 | Theorie leerervaring | Werkende leerlingflow met toetsen en voortgang | Theory MVP |
| S10 | Dagelijkse cockpits | Iedere rol ziet en uitvoert de volgende beste actie | Adoption gate |
| S11 | Planning en operations intelligence | Verklaarbare planning, finance en rapportdrill-down | Operational leverage |
| S12 | AI en franchise intelligence | Beheerst AI-gebruik en exception-first franchisesturing | Intelligence gate |
| S13 | Schaal, integraties en publicatie | Robuust platform voor groei en externe distributie | Scale gate |

## 6. S0 — Operationele integriteit

### Sprintdoel

De bekende risico's oplossen die bestaande functionaliteit kunnen blokkeren,
stil kunnen laten falen of ongetest naar productie kunnen brengen.

### Gebruikersresultaat

Publieke intake werkt aantoonbaar op externe websites, geplande processen
draaien aantoonbaar en financiële statussen zijn deterministisch.

### Must-have backlog

#### S0-01 — Externe intakewidget herstellen

- Maak een routespecifiek headerbeleid voor de widget.
- Verwijder X-Frame-Options uitsluitend waar externe embedding bedoeld is.
- Voeg een gerichte Content-Security-Policy frame-ancestors-strategie toe.
- Kies en documenteer of ieder HTTPS-domein of alleen geregistreerde
  tenantdomeinen mag embedden.
- Vervang de oude app.nxtdrive.nl-fallback door app.nxtdrive.io.
- Voeg een testfixture toe die de widget vanaf een tweede origin laadt.

Acceptatie:

- De widget rendert vanaf minimaal twee externe testorigins.
- Login-, backoffice-, student- en instructeurroutes blijven niet framebaar.
- Onbekende of niet-toegestane tenant-slugs worden veilig afgewezen.
- De widgettest draait automatisch in CI.

#### S0-02 — Croninventaris en runtime-secrets

- Maak één register van alle jobroutes, schema's, eigenaar en kriticiteit.
- Voeg ontbrekende schedules toe voor credit expiry, lead follow-ups,
  package thresholds en payment reminders.
- Borg CRON_SECRET in staging- en productie-runtimeconfiguratie.
- Verifieer ook SendGrid- en VAPID-runtimeconfiguratie.
- Voeg per job started_at, finished_at, status, processed_count en error_summary
  toe.
- Voorkom gelijktijdige dubbele runs met een database- of advisory lock.

Acceptatie:

- Iedere job heeft een eigenaar, schema en verwachte maximale stilstand.
- Iedere job kan veilig opnieuw worden gestart.
- Een gemiste of mislukte job veroorzaakt een alert.
- Staging toont minimaal drie succesvolle opeenvolgende runs per job.

#### S0-03 — Factuurdatum deterministisch maken

- Laat alle statusberekeningen dezelfde geïnjecteerde klok of todayYmd gebruiken.
- Voeg tests toe voor tijdzonegrenzen, schrikkeldagen en exact op de vervaldatum.
- Controleer payment reminders op hetzelfde patroon.

Acceptatie:

- Alle 159 bestaande unit tests zijn groen.
- Tests geven dezelfde uitkomst ongeacht systeemdatum en tijdzone.

#### S0-04 — Minimale CI-gate

- Voeg een pull-requestworkflow toe.
- Draai install, typecheck, lint of een gekozen code-qualitycheck, unit tests en
  productiebuild.
- Maak de workflow verplicht voor merge naar main.
- Laat productie niet starten wanneer een gate faalt.

Acceptatie:

- Een bewust falende unit test blokkeert merge en deploy.
- De huidige volledige unit suite draait in CI.
- De gemiddelde feedbacktijd blijft bij voorkeur onder tien minuten.

#### S0-05 — Werkende commerciële entree

- Vervang de dode Plan een demo-link.
- Kies een echte route: intakeformulier, kalender of contactflow.
- Meet start en voltooiing van de demoflow.

### Should-have

- Eén operationeel dashboard voor jobs, webhooks en notificaties.
- Handmatige retryactie voor een mislukte job.
- Releasechecklist in de pull request template.

### Sprintmetrics

- Job success rate minimaal 99 procent.
- Geen job langer stil dan zijn afgesproken freshness-SLA.
- Widget embed success rate op testorigins 100 procent.
- Unit suite 100 procent groen.
- Geen deployment met falende verplichte check.

### Afhankelijkheden en risico's

- Headerwijzigingen moeten met Caddy én Next middleware worden getest.
- Secrets worden nooit in logs, fixtures of repositorybestanden gezet.
- Databasejoblocks moeten tenantoverstijgende dubbele verwerking voorkomen.

## 7. S1 — Security en observability

### Sprintdoel

Publieke misbruikscenario's beperken en productieproblemen binnen minuten
zichtbaar maken.

### Must-have backlog

#### S1-01 — Publieke rate limiting

- Rate limit intake, widget, publieke planningkeuzes, login en TLS ask.
- Limiteer per IP, tenant en gevoelig endpoint.
- Definieer nette 429-responses met retry-informatie.
- Zorg dat reverse proxies en X-Forwarded-For veilig worden geïnterpreteerd.

#### S1-02 — Bot- en spamprotectie

- Voeg Turnstile of een equivalent toe na risicosignalen of drempeloverschrijding.
- Behoud een honeypot als goedkope eerste laag.
- Voorkom enumeration van tenant, student, betaling en tijdslot.
- Gebruik korte, opaque capabilitytokens voor publieke boekingsacties.

#### S1-03 — Centrale foutmonitoring

- Integreer Sentry of een gelijkwaardig platform voor client, server en jobs.
- Voeg release- en environmenttags toe.
- Filter secrets en gevoelige persoonsgegevens.
- Koppel tenant-ID, request-ID en actor-ID alleen waar privacytechnisch passend.

#### S1-04 — Structured logging

- Vervang losse console.error-patronen stapsgewijs door een centrale logger.
- Definieer loglevels en een fouttaxonomie.
- Voeg correlation-ID's toe aan HTTP, jobs, webhooks en notificaties.
- Voorkom logging van notities, betaalgegevens, tokens en volledige requestbody's.

#### S1-05 — Securityheaders en error boundaries

- Voeg CSP en Permissions-Policy toe.
- Maak framebeleid routespecifiek.
- Voeg global-error, not-found en surface-specifieke error states toe.
- Toon de gebruiker een herstelactie en intern een trace-ID.

### Acceptatiecriteria

- Een gesimuleerde serverfout verschijnt met release en trace-ID in monitoring.
- Een jobfailure alarmeert binnen vijf minuten.
- Een brute-force- of spamtest wordt begrensd zonder normale intake te blokkeren.
- Securityheaders zijn automatisch getest op alle publieke surfaces.
- Foutpagina's lekken geen stacktrace of technische secretinformatie.

### Sprintmetrics

- Mean time to detect onder vijf minuten.
- 100 procent van P0/P1-serverfouten voorzien van correlation-ID.
- Rate-limit false-positivepercentage onder één procent in staging/loadtest.

## 8. S2 — CI, releases en herstel

### Sprintdoel

Een release mag alleen doorstromen wanneer businesskritieke flows, database-
veiligheid en herstelbaarheid aantoonbaar zijn.

### Must-have backlog

#### S2-01 — Testpiramide formaliseren

- Classificeer tests als unit, component, contract, database/RLS, integratie,
  E2E en visual.
- Verplaats source-presencechecks naar lint- of architecturetests waar passend.
- Laat het standaard testcommando alle echte unit tests ontdekken.
- Stel coverage-doelen vast voor financiële, auth-, planning- en creditlogica.

#### S2-02 — Database- en RLS-gates

- Start een tijdelijke Supabase/Postgresomgeving in CI.
- Pas alle migraties vanaf nul toe.
- Draai kritieke RLS- en RPC-tests.
- Test upgrade vanaf een productieachtige snapshot of representatieve baseline.
- Controleer duplicate migratienummers en custom runner-conventies.

#### S2-03 — Authenticated E2E

- Test lead naar proefles naar leerling.
- Test les plannen, afronden en tegoedmutatie.
- Test factuur, Mollie-entrypoint en webhookreconciliatie.
- Test student-instructeurchat.
- Test branch- en tenantisolatie.
- Test white-label hostresolutie en externe widget.

#### S2-04 — Releasepromotie

- Deploy automatisch naar staging.
- Vereis een staging smoke/E2E-gate.
- Maak productiepromotie expliciet en traceerbaar.
- Voeg release notes, migratiesamenvatting en bekende risico's toe.

#### S2-05 — Migratie- en herstelstrategie

- Hanteer expand/contract voor schemawijzigingen.
- Maak duidelijk welke releases backwards compatible zijn.
- Test backup restore in een geïsoleerde omgeving.
- Documenteer forward-fix voor niet-terugdraaibare migraties.
- Oefen één gesimuleerd incident.

#### S2-06 — Visual regression volwassen maken

- Installeer browsers reproduceerbaar in CI.
- Gebruik pixel-diff met tolerantie en masks in plaats van alleen exacte hashes.
- Voeg authenticated cases toe voor de zwaarste kernschermen.
- Leg goedgekeurde baselines versieerbaar vast.

### Acceptatiecriteria

- Een cross-tenant regressie blokkeert een release.
- Een niet-toepasbare migratie blokkeert staging.
- Herstel uit backup is uitgevoerd en getimed.
- Minimaal tien kernroutes hebben stabiele visual baselines.
- Productiepromotie bevat een identificeerbare stagingrelease.

## 9. S3 — Privacy en datagovernance

### Sprintdoel

AVG-verplichtingen veranderen van technische mogelijkheid naar uitvoerbaar
klantproces.

### Must-have backlog

#### S3-01 — Dataclassificatie

- Inventariseer persoonsgegevens, bijzondere vrije tekst en technische metadata.
- Benoem doel, grondslag, eigenaar en retentie per categorie.
- Markeer data die naar Mollie, SendGrid, OpenAI en pushproviders gaat.

#### S3-02 — Retentiebeleid

- Definieer retentie voor leads, trackingdata, IP-adressen, auditlogs,
  notificatielogs en inactieve accounts.
- Implementeer tenantinstellingen binnen wettelijke platformgrenzen.
- Voeg veilige purge- of pseudonimisatiejobs toe.
- Log iedere geautomatiseerde verwijdering geaggregeerd.

#### S3-03 — Data subject request

- Exporteer een compleet, leesbaar leerling- of gebruikersdossier.
- Ondersteun correctie, beperking en verwijdering/pseudonimisering.
- Respecteer financiële en wettelijke bewaarplichten.
- Voeg een review- en goedkeuringsstap toe.

#### S3-04 — Consent en privacycenter

- Centraliseer review-, marketing-, push- en relevante AI-toestemmingen.
- Leg bewijs, tijdstip, versie en intrekking vast.
- Toon aan leerling en beheerder wat actief is.

#### S3-05 — AI-privacybaseline

- Minimaliseer namen en vrije notities voordat een model wordt aangeroepen.
- Documenteer provider, regio, bewaarbeleid en verwerkersafspraken.
- Maak AI per tenant uitschakelbaar.

### Acceptatiecriteria

- Een tenantbeheerder kan een DSAR starten en volgen.
- Export, correctie en pseudonimisering zijn tenant- en rolveilig getest.
- Retentiejobs zijn idempotent en hebben dry-runmodus.
- Geen raw IP/referrer blijft langer bestaan dan het vastgestelde beleid.
- AI kan per tenant aantoonbaar worden uitgezet.

## 10. S4 — Architectuur, types en applicatiegrenzen

### Sprintdoel

Nieuwe functionaliteit kan worden gebouwd zonder verdere verspreiding van
service-rolelogica, ongetypeerde queries en grote multifunctionele bestanden.

### Must-have backlog

#### S4-01 — Architectuurbesluit

- Leg vast dat de korte-termijndoelarchitectuur een modulaire monoliet is.
- Bepaal de toekomst van api-server, api-client-react, api-zod en db.
- Verwijder ongebruikte scaffolding of geef deze een concrete roadmap.

#### S4-02 — Gegenereerde databasetypes

- Genereer Supabase Database-types in CI.
- Detecteer drift tussen schema en gegenereerde types.
- Migreer eerst finance, auth en planning.
- Verminder as unknown as-casts gericht.

#### S4-03 — Zod aan applicatiegrenzen

- Valideer server actions, route bodies, queryparameters, webhooks en AI-output.
- Definieer herbruikbare domeinschema's.
- Geef consistente veldfouten terug.

#### S4-04 — Authorized application context

- Introduceer een getypeerde actor/tenant/branch-context.
- Centraliseer rol- en entitlementchecks.
- Beperk service-roleclientgebruik tot repositories/use cases.
- Leg auditinformatie automatisch vast vanuit dezelfde context.

#### S4-05 — Modulair maken van hotspots

- Splits de grootste notificatie-, franchise-, admin-, planning- en AI-bestanden.
- Scheid pure beslislogica van IO en React.
- Voeg architecturetests toe tegen verboden imports.

#### S4-06 — Querydiscipline

- Vervang select-star op kritieke paden door expliciete velden.
- Voeg querytiming toe op zware routes.
- Verminder onnodige force-dynamic-routes.
- Documenteer caching en revalidation per surface.

### Acceptatiecriteria

- Nieuwe servermutaties gebruiken de authorized context.
- Finance, auth en planning gebruiken gegenereerde DB-types.
- Externe inputs zijn schema-gevalideerd.
- De vijf grootste bestanden zijn verkleind of hebben een goedgekeurd splitplan.
- Geen nieuwe directe service-roletoegang vanuit UI-componenten.

## 11. S5 — Design system met shadcn en Radix

### Sprintdoel

Eén toegankelijke, consistente en merkbare UI-basis voor backoffice, student,
instructeur, franchise en platformadmin.

### Must-have backlog

#### S5-01 — Design foundations

- Leg kleur-, spacing-, radius-, typography-, elevation- en motiontokens vast.
- Scheid semantische statustokens van tenantbranding.
- Definieer compact, comfortable en touch density.
- Definieer reduced-motiongedrag.

#### S5-02 — Productie-shadcnconfiguratie

- Voeg een components.json toe voor de productieapp.
- Kies een vaste variantstrategie.
- Leg vast welke componenten gekopieerd en lokaal beheerd worden.
- Houd Tailwind 4 en bestaande brandprovider leidend.

#### S5-03 — Radixprimitives

- Vervang eerst Dialog en AlertDialog.
- Daarna Tabs, Select, Switch, Checkbox, RadioGroup en Label.
- Voeg Tooltip, Popover, Sheet/Drawer, ScrollArea en Toast/Sonner toe.
- Voeg Command als basis voor globale zoekinteractie toe.

#### S5-04 — Productcomposites

- PageHeader en ActionBar.
- KPI- en statuskaarten.
- DataTable en FilterBar.
- EntityDrawer en Timeline.
- FormField, EmptyState, ErrorState en PermissionState.
- Consistente confirmatie voor destructieve acties.

#### S5-05 — Accessibility

- Focus trap en focus restoration.
- Volledige toetsenbordbediening.
- Zichtbare focus.
- Correcte namen, descriptions en live regions.
- Kleurcontrast minimaal WCAG AA.
- Verwijder maximumScale 1.

#### S5-06 — Componentcatalogus

- Voeg Storybook of Ladle toe.
- Documenteer states, density en do/don't.
- Voeg axe- en keyboardtests toe.
- Maak visuele baselines voor primitives en kerncomposites.

### Acceptatiecriteria

- Dialog, tabs, select en switch slagen voor keyboard- en axe-tests.
- Nieuwe schermen gebruiken geen lokale kopieën van basisprimitives.
- Student- en instructeurcomponenten voldoen aan touch-targetrichtlijnen.
- Backoffice heeft een aantoonbaar compact datapatroon.
- Branding blijft per tenant correct.

## 12. S6 — PWA en rolgerichte kernflows

### Sprintdoel

De leerling- en instructeursapp voelen op echte apparaten betrouwbaar,
snel en taakgericht.

### Must-have backlog

#### S6-01 — Real-device matrix

- Test recente iPhone/Safari.
- Test recente Android/Chrome.
- Test instructeur op tablet landscape.
- Test kleine mobiele fallback.
- Controleer safe areas, toetsenbord, orientation en installatie.

#### S6-02 — Instructeurles in zestig seconden

- Meet de huidige tijd en het aantal interacties.
- Voeg autosave en conceptstatus toe.
- Maak scorewijzigingen snel en foutbestendig.
- Toon alleen noodzakelijke velden in de primaire flow.
- Laat aanvullende notities en AI optioneel.

#### S6-03 — Offline draft en reconnect

- Bewaar een minimale versleutelde lesdraft lokaal.
- Synchroniseer expliciet bij herstel.
- Toon conflicten en laat de instructeur kiezen.
- Cache geen onnodige volledige dossiers.

#### S6-04 — Student next action

- Maak eerstvolgende les, open betaling, CBR-actie en oefendoel prioriteerbaar.
- Toon één primaire actie met uitlegbare reden.
- Vermijd concurrerende banners en meldingen.

#### S6-05 — Push- en installatiewerking

- Meet subscribe, delivery, click en failure.
- Maak updatebeschikbaarheid zichtbaar.
- Valideer iconen, splashscreens en manifests per white-labelhost.

### Acceptatiecriteria

- Minimaal 90 procent van testlessen kan binnen zestig seconden worden afgerond.
- Geen verlies van draft bij offline/onlineovergang.
- Geen pinch-zoomblokkade.
- Kernflows slagen op alle apparaten in de afgesproken matrix.
- Pushdeliveryfouten zijn zichtbaar en dode subscriptions worden opgeschoond.

## 13. S7 — Leskaartcorrectheid en didactische borging

### Sprintdoel

De leskaart en examenrijpheid zijn aantoonbaar in lijn met de primaire canon en
uitlegbaar aan leerling, instructeur en rijschool.

### Must-have backlog

#### S7-01 — Productbesluit N versus niveau 1

- Bevestig met product- en RIS-deskundige dat N geen score is.
- Introduceer mastery over beoordeelde onderdelen.
- Introduceer coverage over alle actieve onderdelen.
- Laat onbeoordeelde kritieke onderdelen positief advies blokkeren.
- Leg de beslissing vast in een ADR en testmatrix.

#### S7-02 — Readinessregels

- Maak drempels canonconform.
- Test kritieke vaardigheden, stabiliteit en preconditions.
- Toon per advies de exacte blockers.
- Scheid technische score, fase en formeel advies.

#### S7-03 — Taxonomie en RIS-review

- Laat categorieën, scripts en niveauomschrijvingen inhoudelijk reviewen.
- Controleer mapping tussen legacy skills en RIS-native structuur.
- Leg versie, bron en eventuele licentievoorwaarden vast.

#### S7-04 — Historische data en migratie

- Beslis hoe bestaande null-naar-1-readiness wordt herberekend.
- Toon impactanalyse vóór backfill.
- Bewaar relevante historische adviezen of versies.

#### S7-05 — UX en uitleg

- Toon mastery en coverage als twee verschillende indicatoren.
- Leg N, 1–8, kritisch en stabiel begrijpelijk uit.
- Geef instructeur een lijst met nog te beoordelen kritieke onderdelen.

#### S7-06 — Documentatiedrift

- Corrigeer oude 1–10-memorydocumenten.
- Markeer oude analyses als historisch.
- Voeg automatische links van implementatie naar canonsectie toe.

### Acceptatiecriteria

- N verlaagt het masterygemiddelde niet.
- Onvoldoende coverage kan geen positief examenadvies opleveren.
- Alle readinessconsumenten gebruiken dezelfde engine en versie.
- Een RIS-deskundige heeft de regels inhoudelijk geaccepteerd.
- Rapportage, student en instructeur tonen dezelfde uitkomst.

## 14. S8 — Theorie fundament

### Sprintdoel

Een beheerbaar, tenantveilig theoriecontentmodel dat meerdere
contentstrategieën ondersteunt.

### Discoverybesluit aan het begin

Kies expliciet een van drie modellen:

1. Eigen content en toetsen.
2. Integratie met een contentleverancier.
3. Hybride: NXTDRIVE orkestreert leerpaden en importeert content.

Zonder dit besluit start geen grootschalige contentproductie.

### Must-have backlog

- Datamodel voor cursus, module, onderwerp, les, contentblok en versie.
- Publicatiestatus draft, review, published en archived.
- Vraagbank met vraagtype, antwoord, uitleg, moeilijkheid en onderwerp.
- Toetsdefinitie, poging, antwoord en score.
- Huiswerktoewijzing met deadline en doelgroep.
- Tenant- en platformcontent met expliciete overerving.
- RLS, audit en contentversies.
- Koppeling tussen theorieonderwerp en RIS-vaardigheid.
- Backofficebeheer voor minimale content- en toetsflow.

### Acceptatiecriteria

- Een redacteur kan content maken, reviewen en publiceren.
- Een tenant kan platformcontent gebruiken zonder die globaal te wijzigen.
- Gepubliceerde pogingen blijven gekoppeld aan de gebruikte contentversie.
- Cross-tenant contenttoegang is getest.
- Minimaal één representatief hoofdstuk is end-to-end ingevoerd.

## 15. S9 — Theorie leerervaring

### Sprintdoel

Een leerling kan theorie leren, oefenen en afronden; de instructeur kan de
voortgang gebruiken in begeleiding.

### Must-have backlog

- Leerlingdashboard met voortgang en volgende module.
- Contentreader met hervatten waar je gebleven bent.
- Oefenmodus met directe uitleg.
- Toetsmodus met uitslag na afronding.
- Zwakke onderwerpen en herhaalvoorstel.
- Huiswerkdeadline en herinnering.
- Instructeursoverzicht per leerling.
- Koppeling naar lesfocus en RIS-vaardigheden.
- Toegankelijke bediening en mobiel ontwerp.
- Analytics op start, afronding, score en drop-off.

### Should-have

- Spaced repetition op fout beantwoorde onderwerpen.
- Contentfeedback melden.
- Downloadbare beperkte offline leesset wanneer privacy en licentie dit toestaan.

### Acceptatiecriteria

- Een leerling doorloopt module, oefening en toets end-to-end.
- Pogingen zijn idempotent en hervatbaar.
- Instructeur ziet actuele maar niet misleidende voortgang.
- De placeholderpagina is volledig vervangen.
- Productmetrics zijn beschikbaar per module en cohort.

## 16. S10 — Dagelijkse cockpits en interactie

### Sprintdoel

NXTDRIVE stuurt iedere rol naar de belangrijkste actie van vandaag in plaats
van alleen informatie te tonen.

### Must-have backlog

#### Tenantbeheerder

- Vandaag: uitval, betalingen, capaciteit, leads en open taken.
- Uitzonderingen boven algemene KPI's.
- Iedere KPI klikt door naar een gefilterde werklijst.

#### Planner

- Ongevulde capaciteit, conflicten, wachtlijst en vrijgekomen slots.
- Saved views en bulkacties.
- Contextdrawer zonder agenda te verlaten.

#### Instructeur

- Volgende les, onafgeronde draft, kritieke beoordelingspunten en berichten.
- Eén primaire actie per kaart.

#### Leerling

- Eerstvolgende les, betaling, theorie, CBR en persoonlijk oefendoel.
- Rustige prioritering zonder banneroverload.

#### Franchise

- Exception inbox voor afwijkende conversie, capaciteit, kwaliteit en finance.
- Drill-down naar tenant met behoud van context.

#### Gedeelde interactie

- Globale zoekfunctie en command palette.
- Inline editing waar veilig.
- Optimistic updates met undo.
- Saved filters.
- Consistente toasts en mutationstatus.
- Keyboard shortcuts voor frequente backofficeacties.

### Acceptatiecriteria

- De top drie dagelijkse taken per rol zijn binnen één navigatiestap bereikbaar.
- Iedere KPI heeft definitie, tijdvenster en drill-down.
- Mutaties tonen onmiddellijk status en veilig herstel.
- Cockpits werken met lege, beperkte en foutieve datasets.
- Gebruik van kernacties is meetbaar.

## 17. S11 — Planning, finance en rapportage-intelligence

### Sprintdoel

Operationele teams kunnen vooruitkijken, scenario's vergelijken en direct
handelen op afwijkingen.

### Must-have backlog

#### Planning

- Capaciteitsheatmap per vestiging, voertuig en instructeur.
- Scenario- of shadow planning zonder directe publicatie.
- Verklaarbare conflictsignalen.
- Route-, bevoegdheid-, voorkeur- en continuïteitsredenen tonen.
- Publiceren met impactsummary en audit.

#### Finance

- Reconciliationdashboard voor Mollie, payments, facturen en credits.
- Uitzonderingen: betaald maar niet verwerkt, dubbel, verlopen en gedeeltelijk.
- Veilige retry en handmatige correctie met audit.
- Dagafsluiting en exportstatus.

#### Rapportage

- Interactieve grafieken met vaste metricdefinities.
- Drill-down naar cohort en werklijst.
- Periode-, vestiging-, pakket- en instructeurfilters.
- Cross-tenant/RLS-test voor alle rapportqueries.

#### Performance

- Materialized views of vooraggregatie voor zware metrics.
- Querybudgetten en explainanalyse voor topqueries.
- Geen ongemeten client-side aggregatie van grote datasets.

### Acceptatiecriteria

- Een planner kan een scenario vergelijken zonder live data te wijzigen.
- Iedere aanbeveling toont de gebruikte redenen en beperkingen.
- Finance kan iedere reconciliation-uitzondering afhandelen en auditen.
- Rapportcijfers zijn herleidbaar tot een metricdefinitie.
- Zware dashboards blijven binnen afgesproken responstijdbudget.

## 18. S12 — AI en franchise intelligence

### Sprintdoel

AI wordt een beheerst adviserend hulpmiddel met aantoonbare kwaliteit; franchise
wordt exception-first in plaats van dashboard-first.

### Must-have backlog

#### AI-governance

- Tenantopt-in en featurebeleid.
- Prompt-, model- en policyversie per resultaat.
- Dataminimalisatie en pseudonimisering.
- Kostenbudgetten per tenant en use case.
- Timeout, retry en veilige fallback.
- Audit van generate, accept, edit, reject en execute.

#### Evaluatie

- Golden datasets voor lesverslag, pakketadvies en planningssuggestie.
- Rubrics voor feitelijkheid, veiligheid, bruikbaarheid en toon.
- Regressietest bij prompt- of modelwijziging.
- Handmatige steekproef en incidentprocedure.

#### Feedbackloop

- Nuttig, aangepast, afgewezen en uitgevoerd meten.
- Toon bronfeiten en confidence waar betekenisvol.
- Nooit automatische publicatie of high-impactactie zonder bevestiging.

#### Franchise

- Benchmark alleen vergelijkbare cohorten.
- Signaleer afwijkingen met minimale samplegrootte.
- Maak playbooks direct uitvoerbaar als taken.
- Meet opvolging en resultaat per exception.

### Acceptatiecriteria

- Geen AI-resultaat veroorzaakt zelfstandig planning, betaling of examenadvies.
- Iedere AI-call heeft use case, tenant, modelversie, kosten en uitkomststatus.
- PII-minimalisatie is getest.
- Een model- of promptwijziging kan niet zonder evaluatierapport doorstromen.
- Franchisebenchmarks tonen definitie, cohort en onzekerheid.

## 19. S13 — Schaal, integraties en publicatie

### Sprintdoel

Het platform kan groeien in tenants, transacties en distributie zonder dat
operationele betrouwbaarheid of tenantisolatie verslechtert.

### Must-have backlog

#### Events en jobs

- Introduceer een transactional outbox voor kritieke side effects.
- Gebruik een duurzame queue met retries en dead-letterafhandeling.
- Maak notificaties, exports en zware recalculaties asynchroon waar passend.
- Bewaak queue age en failure rate.

#### Analyticsfundament

- Definieer eventnamen, eigenschappen en eigenaarschap.
- Scheid productanalytics van operationele logging.
- Bouw zo nodig een warehouse- of reportinglaag.
- Pseudonimiseer gebruikersidentiteiten.

#### Integratiestrategie

- Beslis welke publieke API werkelijk wordt ondersteund.
- Versieer contracten en scopes.
- Voeg webhook signing, idempotency en replaybescherming toe.
- Prioriteer boekhouding, kalender en communicatie op klantwaarde.

#### PWA/TWA-publicatie

- Vervang placeholder screenshots en signing fingerprints.
- Voltooi assetlinks en package-identiteit.
- Draai store policy- en devicechecks.
- Publiceer pas na security-, privacy- en supportreadiness.

#### Schaaltests

- Loadtest planningreads, intake, jobs en webhookpieken.
- Test tenant met grote leerling- en lesvolumes.
- Meet databaseconnecties, cache hit rate en queue latency.
- Stel harde performancebudgetten vast.

### Acceptatiecriteria

- Kritieke side effects gaan niet verloren bij procesuitval.
- Dead-letteritems zijn zichtbaar en veilig opnieuw te verwerken.
- API- en webhookcontracten zijn gedocumenteerd en getest.
- TWA-assets bevatten geen placeholders.
- De afgesproken schaaltest blijft binnen SLO's.

## 20. Fasegates

### Gate A — Veilige beperkte productie, na S0

- Widget werkt extern.
- Alle jobs draaien en worden gemonitord.
- Unit suite is groen en verplicht.
- Geen bekende P0-regressie.

### Gate B — Operational readiness, na S2

- Monitoring en alerting actief.
- Publieke abuseprotectie actief.
- Authenticated E2E en RLS-gates actief.
- Backup restore succesvol geoefend.
- Stagingpromotie is verplicht.

### Gate C — Product quality, na S7

- Privacyprocessen uitvoerbaar.
- Kritieke domeinen getypeerd en gevalideerd.
- Design system en PWA-devicegate actief.
- Leskaart is canonconform en inhoudelijk goedgekeurd.

### Gate D — Canon breadth, na S9

- Theorie-MVP is bruikbaar.
- Student en instructeur gebruiken dezelfde voortgangsfeiten.
- Theorie- en RIS-data zijn verbonden zonder automatische high-impactbesluiten.

### Gate E — Differentiatie, na S12

- Cockpits sturen dagelijkse actie.
- Planning en rapportage zijn uitlegbaar en interactief.
- AI heeft governance, evaluaties en feedback.
- Franchise werkt exception-first.

### Gate F — Schaal, na S13

- Queue/outbox en schaalmonitoring zijn operationeel.
- Integratiecontracten zijn beheerst.
- TWA/publicatie is technisch en organisatorisch gereed.

## 21. Overkoepelende KPI's

### Reliability

- Beschikbaarheid per kernsurface.
- Deploy success rate.
- Change failure rate.
- Mean time to detect en mean time to recover.
- Job freshness en job success rate.
- Webhook success en reconciliation lag.

### Product en operatie

- Lead responstijd en conversie.
- Proefles naar pakketconversie.
- Capaciteitsbenutting en ongevulde slots.
- Annulerings- en refillpercentage.
- Tijd om een les af te ronden.
- Payment completion en overduepercentage.

### Leerervaring

- Leskaartcoverage en mastery.
- Kritieke skills onder drempel.
- Theorie start, afronding en toetsverbetering.
- Tijd tussen lessen en leercontinuïteit.

### UX

- Taaksucces per kernflow.
- Tijd en aantal interacties per kernactie.
- Accessibility violations.
- Frontend error rate.
- PWA install, push delivery en offline draft recovery.

### AI

- Acceptatie-, wijzigings- en afwijzingspercentage.
- Kosten per geaccepteerde uitkomst.
- Evaluatiescore per use case.
- Incidenten met onjuiste of gevoelige output.

## 22. Nice-to-have backlog na de kernroadmap

Deze onderwerpen mogen alleen eerder worden ingepland wanneer ze een gemeten
probleem oplossen en de fasegate niet vertragen:

- voice-to-lesson-summary met expliciete bevestiging;
- ouder/verzorgerportaal met voortgang en betalingen;
- persoonlijke oefendoelen en rustige milestones;
- uitgebreidere routeoptimalisatie;
- externe kalenderkoppelingen;
- dark mode voor instructeur en backoffice;
- white-label e-mailpreview per device;
- in-product release notes;
- sandboxtenant met begeleide tour;
- contextuele help en onboardingchecklists;
- statuspagina voor payments, mail, push, jobs en providers;
- WhatsApp of SMS na kanaalstrategie en consentmodel;
- officiële CBR-integratie na technische en juridische haalbaarheidsstudie;
- integrations marketplace na stabiele API- en entitlementstrategie.

## 23. Expliciet niet doen

- Geen brede microservicesrewrite vóór de modulaire monoliet op orde is.
- Geen AI-autopilot voor planning, betalingen of examenadvies.
- Geen bulkvervanging van UI zonder migratievolgorde en regressietests.
- Geen nieuwe dashboardtegels zonder doorklikbare actie.
- Geen nieuwe cronroute zonder schedule, eigenaar, idempotentie en monitoring.
- Geen publieke endpoint zonder abuseanalyse.
- Geen migratie die oude en nieuwe applicatieversie niet tijdelijk ondersteunt.
- Geen TWA-publicatie met placeholderassets of ongeteste supportflow.

## 24. Sprintreviewtemplate

Iedere review beantwoordt:

1. Welk gebruikersresultaat is aantoonbaar bereikt?
2. Welke acceptatiecriteria zijn groen en welke niet?
3. Welke productie- of stagingmetrics veranderden?
4. Welke canonsectie is geraakt?
5. Welke security-, privacy- en tenanttests zijn uitgevoerd?
6. Wat is uit scope gebleven?
7. Welke nieuwe schuld of risico's zijn geïntroduceerd?
8. Is de volgende fasegate dichterbij, bereikt of geblokkeerd?

## 25. Traceability van analyse naar sprint

| Bevinding | Verwerkt in |
|---|---|
| Widget geblokkeerd door frameheaders | S0 |
| Oude app.nxtdrive.nl-widgetfallback | S0 |
| Ontbrekende schedules en runtime-secretborging | S0 |
| Datumafhankelijke factuurtest | S0 |
| Tests niet in deploygate | S0 en S2 |
| Publieke intake zonder rate limiting | S1 |
| Geen centrale foutmonitoring | S1 |
| Geen CSP/Permissions-Policy en error boundaries | S1 |
| Zwakke E2E-, RLS- en visual gates | S2 |
| Migraties vóór release en forward-only rollback | S2 |
| Ontbrekende AVG-export, retentie en anonimisering | S3 |
| AI verwerkt potentieel identificerende data | S3 en S12 |
| Geen DB-types en weinig boundaryvalidatie | S4 |
| Verspreid service-rolegebruik | S4 |
| Grote multifunctionele bestanden | S4 |
| Alleen Dropdown Menu gebruikt echte Radixprimitive | S5 |
| Custom dialog/tabs hebben accessibilitygaten | S5 |
| maximumScale blokkeert zoom | S5 en S6 |
| PWA mist real-device- en offline-draftzekerheid | S6 |
| Leskaartcanon zegt N telt niet, engine gebruikt N als 1 | S7 |
| Oude memorydocumenten gebruiken 1–10 | S7 |
| Theoriepagina is een placeholder | S8 en S9 |
| Dashboards zijn nog onvoldoende actiegericht | S10 |
| Planning mist scenario- en uitlegmodus | S11 |
| Finance mist volledige reconciliationoperations | S11 |
| Rapportages missen consequente drill-down | S11 |
| AI mist governance, evaluatie en feedback | S12 |
| Franchise kan sterker exception-first | S10 en S12 |
| Queue/outbox, warehouse en integratiestrategie ontbreken | S13 |
| TWA-assets/publicatie niet gereed | S13 |

## 26. Eerstvolgende planningsactie

Plan een roadmapkick-off van maximaal negentig minuten met product, engineering,
design, QA/operations en een RIS-deskundige. Bevestig daar:

1. De S0-eigenaren en live verificaties.
2. De beschikbare teamcapaciteit.
3. De fasegates die commerciële uitrol blokkeren.
4. De keuze om deze roadmap als actuele uitvoeringsbron te gebruiken.
5. De datum waarop S0 start en de eerste productiereview plaatsvindt.

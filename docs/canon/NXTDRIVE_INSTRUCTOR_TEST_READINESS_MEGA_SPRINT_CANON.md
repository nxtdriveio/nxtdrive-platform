# NXTDRIVE — Instructor Test Readiness Mega-Sprint Canon

**Documentstatus:** normatief en uitvoeringsbindend
**Versie:** 1.0
**Primaire applicatie:** NXTDRIVE Instructeur
**Primair domein:** `nxtdrive.io`
**Android appnaam:** `NXTDRIVE Instructeur`
**Voorgestelde Android package-ID:** `io.nxtdrive.instructeur`
**Sprinttype:** autonome convergentie-, kwaliteits- en pilotrelease-sprint
**Doelgroep:** Codex en eventuele sub-agents
**Oplevermodel:** één doorlopende sprint; geen losse adviesfase
**Productstatus na oplevering:** aantoonbaar pilotgereed en technisch Google Play-gereed
**Broncanon:** dit document plus het bestaande RIS/readiness-canon
**Prioriteit:** instructeursapp eerst; gedeelde platformfundering en noodzakelijke leerling-/backofficewijzigingen inbegrepen

---

# 1. Missie

Codex moet NXTDRIVE in één grote autonome sprint gereedmaken voor de werkelijke testfase.

De sprint richt zich primair op de instructeursapp, maar omvat ook alle gedeelde platformonderdelen die nodig zijn om de instructeursreis betrouwbaar, veilig en volledig testbaar te maken.

De sprint moet resulteren in:

1. een perfecte tablet-first instructeursapp;
2. een uitstekende mobiele portrait-ervaring;
3. een aantoonbaar betrouwbare releaseketen;
4. opgeloste dependency- en securityproblemen;
5. één canonieke route- en begrippenstructuur;
6. opgesplitste en beter testbare domeinbestanden;
7. een inhoudelijk juiste RIS 2.0-implementatie;
8. RIS 1.0 als immutable, read-only legacyvariant;
9. een gewone niet-RIS-opleidingsvariant;
10. één centrale readiness-engine voor alle actieve en historische methodieken;
11. een volledig moduletoetssysteem;
12. een snel lesafrondingsproces;
13. een echte end-to-end instructeur-tot-leerlingreis;
14. echte visuele baselines;
15. offline lesconcepten met gecontroleerde synchronisatie;
16. een ondertekende Android App Bundle;
17. een workflow voor upload naar Google Play;
18. een complete release-evidencebundel.

Codex mag deze opdracht niet reduceren tot alleen een analyse, rapport, ontwerp of backlog.

Codex moet de repository daadwerkelijk wijzigen, migraties schrijven, tests toevoegen, gebruikersflows implementeren, workflows creëren, documentatie corrigeren en releaseartefacten produceren.

---

# 2. Normatieve taal

In dit canon betekenen:

* **MOET:** verplicht voor oplevering;
* **MAG:** toegestaan wanneer passend;
* **MAG NIET:** verboden;
* **SHOULD:** sterke voorkeur, alleen afwijken met gedocumenteerde reden;
* **EXTERNE BLOKKADE:** iets dat aantoonbaar niet door code of repositorywerk kan worden opgelost;
* **INVLOEDRIJKE BESLISSING:** een permanente of moeilijk omkeerbare keuze met brede gevolgen voor data, infrastructuur, package-identiteit, rechten, officiële RIS-inhoud of commerciële werking.

Een taak geldt niet als afgerond omdat de code compileert. Zij geldt pas als afgerond wanneer de relevante test, gebruikersflow en bewijsoutput aanwezig zijn.

---

# 3. Autonome werkwijze

## 3.1 Geen onnodige vragen

Codex moet zelfstandig beslissingen nemen op basis van:

1. dit canon;
2. bestaande repositoryconventies;
3. bestaande architectuur;
4. veiligste omkeerbare optie;
5. minste nieuwe complexiteit;
6. beste testbaarheid;
7. beste gebruikerservaring;
8. behoud van backwards compatibility waar nodig.

Codex mag niet pauzeren om toestemming te vragen voor:

* UI/UX-verbeteringen;
* routeconsolidatie;
* componentrefactors;
* toevoegen van tests;
* dependencyupdates;
* securityheaders;
* toegankelijkheidsreparaties;
* observability;
* verwijderen van hardcoded tellers;
* aanpassen van responsive layouts;
* toevoegen van uitleg bij systeemadviezen;
* toevoegen van featureflags;
* opsplitsen van grote bestanden;
* interne naamconventies;
* implementeren van de in dit canon voorgeschreven domeinmodellen.

Deze wijzigingen zijn vooraf goedgekeurd, mits de kwaliteit minimaal premium SaaS-niveau haalt.

## 3.2 Beslissingen die Codex zelf moet nemen

Codex moet zelf onderbouwd beslissen over:

* componentgrenzen;
* bestandsstructuur;
* welke bestaande abstraheringen behouden worden;
* welke bibliotheek binnen de bestaande stack het beste past;
* exacte responsive breakpoints;
* loading-, empty- en errorstates;
* migratiestrategie zonder dataverlies;
* implementatiedetails van de centrale readiness-engine;
* testfixtures;
* queue- of outboximplementatie;
* toegankelijke dialogen en formulieren;
* caching;
* conflictvrije offline synchronisatie;
* CI-jobverdeling;
* release-artifactstructuur;
* routealiases en redirects;
* monitoringinstrumentatie.

## 3.3 Beslissingen die pas aan het einde geparkeerd mogen worden

Alleen onderstaande categorieën mogen naar de definitieve besliswachtrij:

* ontbrekende rechten op officiële RIS- of theoriecontent;
* ontbrekende goedkeuring door een echte RIS-deskundige;
* ontbrekende juridische goedkeuring van bewaartermijnen;
* ontbrekende Google Play Console-toegang;
* ontbrekende GitHub-secretrechten;
* een reeds gepubliceerd Android-package-ID dat conflicteert met `io.nxtdrive.instructeur`;
* keuze voor een betaalde externe observabilityprovider wanneer geen bestaande provider aanwezig is;
* productieactivering van readiness vóór inhoudelijke expertvalidatie;
* een onomkeerbare datamigratie waarvoor geen veilige automatische mapping mogelijk is.

Codex moet zulke taken:

1. niet vroegtijdig gebruiken om ander werk te blokkeren;
2. isoleren achter een adapter, configuratie of featureflag;
3. alle technisch voorbereidende werkzaamheden afronden;
4. concrete opties met gevolgen documenteren;
5. pas in het eindrapport opnemen;
6. nooit stilzwijgend invullen of fingeren.

---

# 4. Inzet van sub-agents

Codex moet, waar de omgeving dit ondersteunt, sub-agents inzetten voor parallelle werkstromen.

Aanbevolen verdeling:

## Agent A — Release en dependency reliability

Verantwoordelijk voor:

* CI;
* dependencyupdates;
* auditkwetsbaarheden;
* build;
* migratiesmoke;
* release-evidence;
* documentatieclaims;
* factuurdatumtest;
* tenanttijdzones.

## Agent B — RIS, readiness en moduletoetsen

Verantwoordelijk voor:

* opleidingsmodi;
* RIS 2.0;
* RIS 1.0 legacy;
* catalogi;
* readiness-core;
* dekking;
* kritieke competenties;
* moduletoetsen;
* overrides;
* publicatieguards;
* auditsnapshots.

## Agent C — Instructeursapp en UX

Verantwoordelijk voor:

* tablet-first shell;
* mobiele portraitweergave;
* instructeursdashboard;
* vijfdelige flow;
* quick-close;
* leerling toevoegen zonder e-mail;
* volgende lesvoorstel;
* dekkingskaart;
* overdrachtsbriefing.

## Agent D — Security, privacy en observability

Verantwoordelijk voor:

* CSP;
* Permissions Policy;
* rate limiting;
* centrale foutregistratie;
* tracing;
* monitoring;
* AVG-export;
* anonimisering;
* bewaarbeleid;
* privacy- en deletionroutes.

## Agent E — Routes, architectuur en grote bestanden

Verantwoordelijk voor:

* routecanon;
* redirects;
* navigatie;
* terminologie;
* opsplitsen grote domeinbestanden;
* karakterisatietests;
* verwijderen dubbele implementaties.

## Agent F — QA, PWA en Android

Verantwoordelijk voor:

* Playwright;
* visuele regressie;
* screenshots;
* offlinegedrag;
* Android-wrapper;
* signing;
* AAB;
* Google Play-workflows;
* store listing package.

Eén integrerende hoofd-agent blijft verantwoordelijk voor:

* conflictoplossing;
* gedeelde types;
* databasecompatibiliteit;
* volledige testsuite;
* uiteindelijke Definition of Done.

Sub-agents mogen geen geïsoleerde architectuur invoeren die strijdig is met andere werkstromen.

---

# 5. Verplichte beginfase: repositorybewijs vastleggen

Codex moet vóór wijzigingen een reproduceerbare baseline vastleggen.

Maak:

```text
docs/audit/mega-sprint-baseline.md
artifacts/baseline/
```

De baseline bevat minimaal:

* huidige branch en commit;
* Node- en package-manager-versie;
* lockfile-status;
* huidige scripts;
* workspace-opbouw;
* actieve apps en packages;
* huidige database- en migratiestructuur;
* huidige Android/PWA-structuur;
* lijst van routes;
* lijst van dubbele routealiases;
* bestanden boven 800 regels;
* dependency-audit;
* lintresultaat;
* typecheckresultaat;
* unittests;
* integratietests;
* buildstatus;
* migratiesmoke;
* bestaande E2E-tests;
* bestaande screenshots;
* bestaande visuele baselines;
* bestaande securityheaders;
* bestaande logging;
* bestaande releaseworkflows.

Bestaande fouten worden vastgelegd met:

* exacte opdracht;
* exitcode;
* relevante foutmelding;
* betrokken bestand;
* verwachte herstelactie.

Na de baseline start Codex direct met implementatie.

---

# 6. Eén publieke taal en één intern domeinmodel

## 6.1 Publieke taal

De publieke gebruikersinterface van de Nederlandse NXTDRIVE-app gebruikt Nederlands.

Canonieke instructeursroutes:

```text
/instructeur
/instructeur/agenda
/instructeur/lessen/[lessonId]
/instructeur/leerlingen
/instructeur/leerlingen/[studentId]
/instructeur/berichten
/instructeur/taken
/instructeur/beschikbaarheid
/instructeur/theorie
/instructeur/instellingen
/instructeur/help
/instructeur/release-notes
```

Canonieke leerlingroutes:

```text
/leerling
/leerling/voortgang
/leerling/lessen
/leerling/reflectie
/leerling/berichten
/leerling/examens
/leerling/instellingen
```

Canonieke beheerroutes gebruiken eveneens Nederlands, tenzij een bestaande gepubliceerde externe API hierdoor zou breken.

## 6.2 Interne domeinnamen

Interne TypeScript-, database- en servicebegrippen gebruiken consequent Engels:

* `student`;
* `lesson`;
* `message`;
* `task`;
* `availability`;
* `theory`;
* `assessment`;
* `readiness`;
* `reflection`;
* `instructor`;
* `enrollment`.

Er mogen intern niet afwisselend `student`, `leerling`, `pupil` en `candidate` voor hetzelfde domeinobject worden gebruikt.

## 6.3 Redirects

Oude routes blijven alleen bestaan als redirects.

Minimale mappings:

```text
/instructeur/theory          → /instructeur/theorie
/instructeur/lessons         → /instructeur/agenda
/instructeur/messages        → /instructeur/berichten
/instructeur/students        → /instructeur/leerlingen
/instructeur/tasks           → /instructeur/taken
/instructeur/availability    → /instructeur/beschikbaarheid
```

Eisen:

* gebruik permanente 308-redirects;
* behoud queryparameters;
* behoud relevante fragmenten;
* geen redirectketens;
* oude routepagina’s bevatten geen aparte businesslogica;
* analytics registreren alleen de canonieke route;
* sitemaps, manifests en navigatie wijzen alleen naar canonieke routes;
* tests bewijzen elke redirect.

## 6.4 Centraal routemanifest

Maak één centraal routemanifest:

```ts
type RouteDefinition = {
  id: string;
  canonicalPath: string;
  aliases: string[];
  navLabel: string;
  analyticsKey: string;
  allowedRoles: Role[];
  requiredEntitlements: string[];
  featureFlag?: string;
  visibility: "navigation" | "contextual" | "hidden";
};
```

Navigatie, breadcrumbs, toegang, analytics en redirects moeten hiervan afgeleid worden.

---

# 7. Architectuur en opsplitsen van grote bestanden

## 7.1 Doel

Bestanden van 1.200 tot 2.500 regels moeten langs domein- en use-casegrenzen worden opgesplitst.

Niet opsplitsen in tientallen betekenisloze componentbestanden.

Wel opsplitsen in:

* command handlers;
* query handlers;
* policies;
* repositories;
* selectors;
* pure domain functions;
* UI-secties met eigen verantwoordelijkheid;
* schema’s;
* mappers;
* presenters;
* adapters.

## 7.2 Refactorregels

Voor iedere grote refactor:

1. schrijf of verbeter karakterisatietests;
2. leg bestaand gedrag vast;
3. identificeer publieke contracten;
4. splits één domeingrens tegelijk;
5. behoud database- en API-compatibiliteit;
6. draai gerichte tests;
7. draai de volledige suite;
8. verwijder pas daarna oude code.

Doelwaarden:

* geen handgeschreven productiefile boven 800 regels zonder gedocumenteerde uitzondering;
* streefwaarde onder 500 regels;
* React-pagina’s bevatten geen zware businesslogica;
* server actions zijn dun;
* databasequeries leven niet verspreid door UI-componenten;
* readinesslogica bestaat uitsluitend in het centrale readinessdomein;
* notificatiekanalen worden via adapters aangestuurd;
* planninglogica wordt gescheiden van workspacepresentatie.

## 7.3 Verwachte domeinstructuur

```text
src/
  domains/
    students/
    lessons/
    planning/
    availability/
    messaging/
    notifications/
    billing/
    ris/
    readiness/
    assessments/
    privacy/
    monitoring/
  app/
  components/
  infrastructure/
  shared/
```

Binnen een domein:

```text
domain/
application/
infrastructure/
ui/
tests/
```

Codex mag de bestaande monorepo-indeling behouden wanneer die reeds sterker is, maar de use-casegrenzen blijven verplicht.

---

# 8. Releasebetrouwbaarheid

## 8.1 Verplichte GitHub Actions-workflows

Maak minimaal:

```text
.github/workflows/ci.yml
.github/workflows/e2e.yml
.github/workflows/visual-regression.yml
.github/workflows/security.yml
.github/workflows/deploy-staging.yml
.github/workflows/deploy-production.yml
.github/workflows/android-internal.yml
.github/workflows/android-production.yml
```

## 8.2 CI-poort

Iedere pull request en relevante push draait:

1. checkout;
2. toolchaininstallatie;
3. frozen lockfile-installatie;
4. formatcheck;
5. lint;
6. typecheck;
7. unittests;
8. integratietests;
9. build;
10. migratievalidatie;
11. Supabase- of PostgreSQL-migratiesmoke;
12. securityaudit;
13. secretscan;
14. E2E-smoke voor kritieke routes;
15. artifactupload bij fouten.

Geen productiebuild bij rood resultaat.

## 8.3 Betrouwbare installaties

* package-manager en versie vastzetten;
* Node-versie vastzetten;
* `--frozen-lockfile`;
* geen stille lockfilemutaties in CI;
* cache keys afhankelijk maken van lockfile;
* geen `latest` tags in Dockerfiles of actions;
* GitHub Actions bij voorkeur op immutable commit-SHA pinnen;
* builds moeten reproduceerbaar zijn.

## 8.4 Migratiepoort

Iedere migratie moet:

* op een lege database slagen;
* op een representatieve bestaande schemafixture slagen;
* binnen een transactie draaien waar mogelijk;
* tenantisolatie behouden;
* RLS-valideren;
* geen stil dataverlies veroorzaken;
* een expliciete rollback- of forward-fixstrategie hebben;
* een checksum of migratiestatus achterlaten.

Voeg een migratiesmoke toe die:

1. testdatabase start;
2. alle migraties toepast;
3. belangrijke constraints controleert;
4. een minimale tenantfixture laadt;
5. kernqueries uitvoert;
6. database opnieuw opbouwt om reproduceerbaarheid te bewijzen.

## 8.5 Release-evidence

Iedere release produceert:

```text
release-evidence/
  release-manifest.json
  git-metadata.json
  dependency-audit.json
  sbom/
  test-results/
  e2e-results/
  visual-results/
  migration-results/
  build-checksums/
  android/
  screenshots/
  known-external-blockers.md
```

`release-manifest.json` bevat:

* commit-SHA;
* branch;
* buildtijd;
* Node-versie;
* package-managerversie;
* appversie;
* database-migratieversie;
* readiness-engineversie;
* curriculumversies;
* dependencyauditstatus;
* testsamenvatting;
* AAB-checksum;
* signingcertificaatfingerprint;
* deploymentstatus.

## 8.6 Documentatie mag bewijs niet overdrijven

Codex moet alle claims zoals:

* complete;
* production-ready;
* volledig getest;
* Play Store-ready;
* veilig;
* RIS-gevalideerd;

controleren.

Een claim mag alleen blijven staan wanneer er aantoonbaar bewijs voor bestaat.

Gebruik anders:

* implemented;
* technically complete;
* awaiting expert validation;
* pilot-ready;
* external account action required.

---

# 9. Bekende testfouten

## 9.1 Factuurdatum

Introduceer een centrale klokabstractie.

```ts
interface Clock {
  now(): Date;
}
```

Productie gebruikt `SystemClock`.

Tests gebruiken `FixedClock`.

Geen factuur-, begroetings-, planning- of readinesscode mag rechtstreeks afhankelijk zijn van verspreide `new Date()`-aanroepen wanneer determinisme nodig is.

## 9.2 Tenanttijdzone

Iedere tenant heeft een canonieke IANA-tijdzone.

Voor Nederlandse tenants is de vermoedelijke waarde `Europe/Amsterdam`, maar de databasewaarde is leidend.

Gebruik de tenanttijdzone voor:

* begroetingen;
* “vandaag”;
* factuurdatum;
* lesdatums;
* dashboardgroepen;
* notificaties;
* vervaldatums;
* dagelijkse samenvattingen.

Sla operationele tijdstippen op als UTC en render in tenanttijd.

Tests omvatten:

* zomer- en wintertijd;
* middernacht;
* DST-overgangen;
* vaste testklok.

## 9.3 RIS-publicatieguards

Herstel de twee falende guards.

Publicatie moet blokkeren bij:

* onvolledige catalogus;
* ontbrekende auditvelden;
* ongeldige curriculumstatus;
* onbevoegde actor;
* onvolledige readiness-policy;
* kritieke competentie als compenseerbare aggregate;
* ontbrekende expertvalidatiestatus waar vereist;
* dubbele actieve versies;
* ongeldige moduletoetsconfiguratie.

## 9.4 Tekstzoektests

Tests die alleen broncode op tekstfragmenten controleren, gelden niet als voldoende gedragsbewijs.

Codex moet deze:

* vervangen door domeinunittests;
* vervangen door service-integratietests;
* vervangen door componenttests;
* vervangen door echte Playwrightflows;

of expliciet degraderen tot aanvullende statische guard.

---

# 10. Dependency- en securityherstel

## 10.1 Auditdoel

De gemelde kwetsbaarheden in onder andere Next.js, Sharp/libvips en PostCSS moeten worden opgelost via veilige, compatibele upgrades.

Oplevereis:

* nul bekende kritieke productiekwetsbaarheden;
* nul bekende hoge productiekwetsbaarheden;
* middelhoge kwetsbaarheden alleen met aantoonbare niet-blootstelling, mitigerende maatregel, eigenaar en vervaldatum;
* geen ongebruikte kwetsbare dependency;
* lockfile volledig vernieuwd waar nodig;
* tests na iedere relevante upgrade.

Voer minimaal uit:

* dependency tree-inspectie;
* production audit;
* development audit;
* OSV- of vergelijkbare scan;
* transitive dependencycontrole;
* containerimage-audit;
* licentie-inventarisatie;
* package deduplication;
* verwijdering van dode packages.

## 10.2 Geen blinde upgrades

Bij major upgrades:

1. lees migratie-impact;
2. wijzig in kleine cohorten;
3. voer gerichte tests uit;
4. controleer server/clientgrenzen;
5. controleer middleware;
6. controleer imageverwerking;
7. controleer PostCSS/Tailwind;
8. controleer Android-wrapper en service worker.

## 10.3 Securityheaders

Implementeer minimaal:

* Content Security Policy;
* Permissions Policy;
* Referrer Policy;
* `X-Content-Type-Options: nosniff`;
* clickjackingbescherming via `frame-ancestors`;
* HSTS op productie;
* veilige cacheheaders;
* veilige cross-origininstellingen waar passend.

CSP-eisen:

* begin niet met permanent brede `unsafe-eval`;
* gebruik nonce- of hashgebaseerde scripts waar haalbaar;
* beperk externe origins;
* rapporteer overtredingen;
* valideer in staging;
* zet daarna afdwingend aan;
* documenteer iedere uitzondering.

## 10.4 Permissions Policy

Standaard worden niet benodigde mogelijkheden geweigerd.

Alleen expliciet benodigde capabilities mogen worden toegestaan, bijvoorbeeld camera wanneer een concrete scan- of fotoflow dat vereist.

Microfoon, locatie, sensoren en andere gevoelige capabilities mogen niet generiek worden geopend.

## 10.5 Rate limiting

Voeg structurele rate limiting toe voor:

* login;
* OTP;
* wachtwoordherstel;
* uitnodigingen;
* leerling aanmaken;
* e-mail wijzigen;
* publieke formulieren;
* uploadendpoints;
* exports;
* moduletoetspublicatie;
* readiness-herberekening;
* notificatieacties.

Eisen:

* niet uitsluitend process-memory wanneer meerdere instanties mogelijk zijn;
* limieten per IP, gebruiker, tenant en operationeel doel;
* correcte `429`;
* retry-informatie;
* audit voor gevoelige blokkades;
* geen mogelijkheid om tenant-ID uit de requestbody te misbruiken;
* coarse-grained bescherming op reverse-proxylaag waar beschikbaar;
* fijnmazige bescherming in applicatielaag.

## 10.6 Overige beveiliging

* service-role credentials nooit naar client;
* uploads met type-, omvang- en malwarebeleid;
* invoer valideren met schema’s;
* vrije tekst veilig renderen;
* geen gevoelige data in logs;
* secretscan;
* dependencybot instellen;
* RLS-tests;
* IDOR-tests;
* CSRF-bescherming voor relevante sessieflows;
* sessie- en cookie-instellingen controleren;
* cleartext Android-netwerkverkeer blokkeren.

---

# 11. Foutregistratie, tracing en monitoring

## 11.1 Vendorneutrale basis

Implementeer OpenTelemetry of een vergelijkbare vendorneutrale observabilitylaag.

Wanneer reeds een centrale provider bestaat, integreer die.

Wanneer geen provider bestaat:

* implementeer structured logging;
* correlation IDs;
* tracecontext;
* server- en browsererror boundaries;
* exporteerbare OTLP-configuratie;
* lokale en staging-validatie;
* adapter voor latere provider.

De afwezigheid van een betaald account mag niet voorkomen dat instrumentatie wordt voltooid.

## 11.2 Correlation ID

Elke request krijgt een correlation ID.

Deze loopt mee door:

* webrequest;
* server action;
* databasecall;
* readiness-evaluatie;
* notificatie;
* background job;
* Android-logcontext.

Toon een veilige referentiecode in foutschermen.

## 11.3 Monitoring

Maak minimaal:

```text
/health/live
/health/ready
/health/version
```

Readinesscontrole omvat:

* appconfiguratie;
* databaseverbinding;
* migratiecompatibiliteit;
* noodzakelijke secrets;
* queue/outboxstatus;
* storagebereikbaarheid.

Metrics:

* requestlatency;
* errorrate;
* readiness-evaluaties;
* lesfinalisaties;
* synchronisatiefouten;
* publicatiefouten;
* overridefrequentie;
* moduletoetsstatussen;
* Android API-errors;
* loginfailures;
* notificatiefailures.

---

# 12. AVG, bewaarbeleid en selfservice

Codex moet een technisch aantoonbaar privacyproces implementeren.

## 12.1 Data-export

Een bevoegde gebruiker kan een export aanvragen.

De export bevat de gegevens waarvoor de betrokkene rechtmatig toegang heeft en gebruikt een achtergrondjob of veilige asynchrone applicatiejob.

Statussen:

* requested;
* validating;
* processing;
* ready;
* downloaded;
* expired;
* rejected.

Exportbestanden:

* zijn tijdelijk;
* hebben een vervaldatum;
* gebruiken signed URLs;
* worden geaudit;
* bevatten geen gegevens van andere tenants.

## 12.2 Verwijdering en anonimisering

Ondersteun:

* accountverwijderingsverzoek;
* leerlingverwijderingsverzoek;
* controle op wettelijke of contractuele bewaarplicht;
* anonimisering wanneer directe verwijdering niet mag;
* legal hold;
* audit;
* bevestiging;
* voltooiingsrapport.

Relaties mogen niet via cascading deletes ongemerkt audit- of financiële verplichtingen breken.

## 12.3 Bewaarbeleid

Maak een versieerbaar bewaarbeleid per datacategorie:

```ts
type RetentionRule = {
  dataCategory: string;
  retentionPeriod: string | null;
  action: "DELETE" | "ANONYMIZE" | "REVIEW";
  legalBasisReference?: string;
  approvalStatus: "DRAFT" | "LEGAL_REVIEW" | "APPROVED";
};
```

Codex mag onbekende wettelijke termijnen niet verzinnen.

Techniek, scheduler, preview, dry-run, audit en configuratie moeten wel volledig worden gebouwd.

## 12.4 Publieke routes

Gebruik `nxtdrive.io` voor:

```text
https://nxtdrive.io/privacy
https://nxtdrive.io/voorwaarden
https://nxtdrive.io/account-verwijderen
https://nxtdrive.io/beveiliging
```

Verwijder of corrigeer verouderde productiedomeinen in:

* metadata;
* e-mails;
* manifests;
* deep links;
* documentatie;
* Android-configuratie;
* privacyverwijzingen;
* store listing.

Historische migratiedocumenten mogen oude domeinen alleen met expliciet label behouden.

---

# 13. AI tijdelijk deactiveren

## 13.1 Scope

AI wordt voor de pilot standaard gedeactiveerd voor instructeurs.

Ook misleidende AI-labels in andere portalen moeten worden verwijderd wanneer de achterliggende functie niet werkelijk door AI wordt uitgevoerd.

Featureflags:

```text
ai.instructor.enabled = false
ai.student.enabled = false
ai.admin.enabled = false
```

Alle flags staan standaard uit in test, staging en productie totdat ze later expliciet worden goedgekeurd.

## 13.2 Technisch gedrag

Wanneer uitgeschakeld:

* geen AI-knop;
* geen AI-route;
* geen AI-badge;
* geen AI-copy;
* geen background call;
* geen promptopslag;
* geen leerlinggegevens naar een AI-provider;
* geen ongebruikte providerinitialisatie;
* geen kosten;
* geen misleidende fallback die “AI” heet.

## 13.3 Verklaarbare alternatieven

Vervang “AI Coach” door:

* `Volgende focus`;
* `Persoonlijk advies`;
* `Aanbevolen vervolgstap`.

Iedere aanbeveling toont:

* reden;
* gebruikte gegevens;
* ontbrekend bewijs;
* datum;
* mogelijkheid voor instructeur om te bevestigen of negeren.

De tekst “over ongeveer X lessen” wordt verwijderd tenzij:

* er een gevalideerd model bestaat;
* aannames zichtbaar zijn;
* onzekerheid zichtbaar is.

Een eenvoudige formule mag niet als intelligente voorspelling worden gepresenteerd.

---

# 14. Leerlingen toevoegen zonder verplicht e-mailadres

## 14.1 Scheid profiel en loginaccount

Een leerlingprofiel mag bestaan zonder auth-account.

Minimaal model:

```ts
type StudentProfile = {
  id: string;
  tenantId: string;
  displayName: string;
  firstName?: string;
  lastName?: string;
  email?: string | null;
  authUserId?: string | null;
  portalStatus:
    | "NO_ACCOUNT"
    | "INVITATION_AVAILABLE"
    | "INVITED"
    | "ACTIVE"
    | "SUSPENDED";
};
```

E-mail is tijdens de testfase optioneel.

## 14.2 Snelle invoer

Een instructeur moet een leerling vanuit de app snel kunnen toevoegen met minimaal:

* voornaam of weergavenaam;
* opleidingstype;
* eventueel startdatum;
* privacybevestiging volgens tenantproces.

Optioneel:

* achternaam;
* e-mail;
* telefoon;
* geboortedatum;
* notitie;
* gewenste instructeur;
* lespakket.

## 14.3 Geen fictieve e-mailadressen

Codex mag geen placeholder-e-mail zoals:

```text
unknown@example.com
student+123@nxtdrive.io
```

opslaan om een databaseconstraint te omzeilen.

Maak e-mail nullable en pas constraints correct aan.

## 14.4 Later activeren

Wanneer later een e-mailadres wordt toegevoegd:

1. valideer uniciteit binnen het relevante authmodel;
2. toon mogelijke duplicaten;
3. maak of koppel het auth-account;
4. verstuur uitnodiging;
5. behoud bestaand leerlingdossier;
6. audit de koppeling.

Een leerling zonder e-mail:

* kan gewoon lessen krijgen;
* kan gewoon RIS-beoordelingen krijgen;
* kan geen e-mailuitnodiging ontvangen;
* heeft geen leerlingportaal totdat een geschikte authenticatiemethode is geactiveerd.

## 14.5 Duplicaatpreventie

Waarschuw op mogelijke duplicaten op basis van beschikbare velden.

Automatisch samenvoegen is verboden.

Samenvoegen vereist:

* preview;
* gekozen masterrecord;
* datamapping;
* audit;
* herstelmogelijkheid.

---

# 15. Opleidingsmethoden

NXTDRIVE ondersteunt drie methodologische modi.

```ts
type TrainingMethod =
  | "STANDARD"
  | "RIS_2_0"
  | "RIS_1_0_LEGACY";
```

## 15.1 `STANDARD`

Actief voor nieuwe leerlingen.

Bevat:

* normale lesonderwerpen;
* voortgang;
* reflectie;
* plankaart;
* competentiebeoordeling;
* optionele algemene readiness;
* geen officiële RIS-claim.

## 15.2 `RIS_2_0`

De enige actieve RIS-methode voor nieuwe RIS-inschrijvingen.

Vanaf 1 januari 2023 geldt officieel alleen RIS 2.0. De methode is gericht op coachen en het vergroten van zelfstandigheid.

Bevat:

* vier modules;
* versieerbare scripts;
* plankaarten;
* instructie- en leerlingkaarten;
* instructeursreflectie;
* leerlingreflectie;
* moduletoetsen;
* concept/publicatie;
* audittrail;
* coaching;
* instructiefasen;
* contextvariatie;
* readiness;
* CBR-momenten.

## 15.3 `RIS_1_0_LEGACY`

Uitsluitend:

* import;
* historie;
* raadplegen;
* export;
* audit;
* migratievoorbereiding.

Verboden:

* nieuwe leerling starten;
* nieuwe lesbeoordelingen toevoegen;
* nieuwe moduletoets uitvoeren;
* nieuwe catalogus publiceren;
* nieuwe readinessbeslissing als actuele RIS 1.0-beslissing nemen.

De UI toont:

> Historische RIS-versie — alleen-lezen

Historische correcties mogen alleen via een expliciete administratieve correctielaag die de oorspronkelijke bron intact houdt.

---

# 16. RIS 2.0: instructiestap is geen kwaliteitsscore

## 16.1 Kerncorrectie

RIS-stappen 1 tot en met 8 beschrijven een didactische opbouw en mate van ondersteuning/zelfstandigheid.

De officiële stappen omvatten onder andere:

1. huiswerk;
2. motivatie en demonstratie;
3. doe mee met mij;
4. doe op aanwijzing;
5. doe op minder aanwijzing;
6. doe zonder aanwijzing;
7. gewijzigde omstandigheden;
8. wisselende situaties.

Daarom geldt:

* stap 8 is niet automatisch een rapportcijfer 8;
* stap 8 betekent niet automatisch examenrijp;
* het gemiddelde van RIS-stappen is geen betrouwbare readinessscore;
* een hogere instructiestap mag een veiligheidsprobleem niet compenseren;
* `N` betekent niet beoordeeld.

## 16.2 Gescheiden dimensies

Per RIS-script moeten minimaal deze dimensies gescheiden zijn:

```ts
type RisScriptObservation = {
  instructionStage: null | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

  performanceOutcome:
    | "NOT_OBSERVED"
    | "ATTENTION_REQUIRED"
    | "DEVELOPING"
    | "SUFFICIENT"
    | "STABLE";

  supportLevel:
    | "DIRECT_INSTRUCTION"
    | "PROMPTING"
    | "COACHING"
    | "OBSERVATION_ONLY";

  safetyStatus:
    | "NOT_ASSESSED"
    | "NO_BLOCKER"
    | "ATTENTION"
    | "BLOCKER";

  contextTags: string[];
  note?: string;
};
```

De bestaande plus- en minknoppen blijven voor de RIS-instructiestap:

```text
N → 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8
```

De UI noemt dit:

> RIS-stap

Niet:

> score
> cijfer
> kwaliteitsscore

## 16.3 Snelheid

De instructeur hoeft niet alle dimensies voor ieder script handmatig in te vullen.

Vooraf geselecteerde focusscripts krijgen compacte bediening.

Niet behandelde scripts blijven `N`.

Codex mag geen impliciete `SUFFICIENT` opslaan alleen omdat een stap is verhoogd.

---

# 17. Eén centrale readiness-engine

## 17.1 Eén engine, meerdere adapters

Gebruik één centrale engine met methodespecifieke evidence-adapters.

```text
STANDARD evidence ───────┐
                         ├── Normalized evidence ── Readiness engine
RIS 2.0 evidence ────────┤
                         │
RIS 1.0 legacy evidence ─┘
```

Adapters:

```ts
interface ReadinessEvidenceAdapter<TSource> {
  normalize(input: TSource): NormalizedCompetencyEvidence[];
}
```

## 17.2 Genormaliseerd bewijs

```ts
type NormalizedCompetencyEvidence = {
  competencyId: string;
  observedAt: string;
  sourceType:
    | "STANDARD_LESSON"
    | "RIS_SCRIPT"
    | "MODULE_TEST"
    | "CBR_RESULT"
    | "LEGACY_IMPORT";

  observed: boolean;

  competenceBand:
    | "UNKNOWN"
    | "ATTENTION_REQUIRED"
    | "DEVELOPING"
    | "SUFFICIENT"
    | "STABLE";

  independenceBand:
    | "UNKNOWN"
    | "INSTRUCTED"
    | "SUPPORTED"
    | "COACHED"
    | "INDEPENDENT"
    | "TRANSFERABLE";

  safetyStatus:
    | "UNKNOWN"
    | "CLEAR"
    | "ATTENTION"
    | "BLOCKER";

  contextTags: string[];
  instructorId?: string;
  lessonId?: string;
  sourceEvidenceId: string;
  legacyConfidence?: "LOW" | "MEDIUM" | "HIGH";
};
```

RIS-stappen mogen de `independenceBand` ondersteunen, maar niet zelfstandig `competenceBand = STABLE` veroorzaken.

## 17.3 Readinessdimensies

Iedere readiness-evaluatie houdt apart bij:

1. instructiestap of independence;
2. beheersing;
3. dekking;
4. kritieke blokkades;
5. randvoorwaarden;
6. stabiliteit;
7. regressie;
8. moduletoetsstatus;
9. formele menselijke beslissing.

## 17.4 Randvoorwaarden

Configureerbaar per gate:

* theorie behaald;
* gezondheidsverklaring;
* machtiging;
* minimumleeftijd;
* vereiste lessen of assessments;
* moduletoets;
* CBR-status;
* administratieve volledigheid.

Randvoorwaarden worden niet verstopt in een percentage.

## 17.5 `N`

`N` of `null` betekent:

> Niet beoordeeld.

Regels:

* telt niet mee als niveau;
* wordt niet als 0 of 1 behandeld;
* verlaagt de dekking;
* mag een kritieke competentie blokkeren wanneer bewijs verplicht is;
* wordt zichtbaar op de dekkingskaart.

## 17.6 Uitkomststatussen

```ts
type ReadinessStatus =
  | "CONFIGURATION_INCOMPLETE"
  | "INSUFFICIENT_EVIDENCE"
  | "BLOCKED"
  | "DEVELOPING"
  | "NEARLY_REVIEWABLE"
  | "REVIEW_ELIGIBLE";
```

Niet gebruiken:

* `EXAM_READY`;
* `WILL_PASS`;
* `85_PERCENT_EXAM_READY`;
* `GUARANTEED_READY`.

## 17.7 Kritieke competenties

Kritieke competenties zijn expliciet gekoppeld aan een gate.

Een kritieke competentie kan nooit door gemiddelden of andere competenties worden gecompenseerd.

Per kritieke competentie toont de engine:

* vereiste status;
* actuele status;
* bewijs;
* laatste observaties;
* contextdekking;
* stabiliteit;
* blockerreden;
* eerstvolgende bewijsactie.

## 17.8 Readiness-beslisnotitie

Maak een versieerbare beslisnotitie-entiteit met:

* curriculumversie;
* policyversie;
* engineversie;
* kritieke competenties;
* dekkingsregels;
* stabiliteitsregels;
* randvoorwaarden;
* moduletoetsregels;
* overrides;
* expertbeoordelaars;
* goedkeuringsstatus;
* bekende beperkingen.

Zonder geldige expertgoedkeuring:

* engine draait in shadow mode;
* uitkomsten mogen intern worden vergeleken;
* geen definitieve productieclaim;
* geen leerlingtekst “klaar voor examen”.

## 17.9 Expertvalidatie

Codex kan expertvalidatie technisch faciliteren, maar niet zelf uitvoeren.

Bouw:

* validatiescenario-import;
* expertbeoordelingsscherm;
* verschillenrapport;
* digitaal goedkeuringsrecord;
* contenthash;
* policypublicatieguard;
* exporteerbaar validatiepakket.

De 46 scripts, benamingen, stapteksten, moduletoetslogica en gebruiksrechten moeten als `AWAITING_EXPERT_VALIDATION` blijven staan totdat een echte bevoegde deskundige ze bevestigt.

---

# 18. Moduletoetssysteem

## 18.1 Toetstypen

Ondersteun minimaal:

```ts
type AssessmentType =
  | "RIS_MODULE_1"
  | "RIS_MODULE_2"
  | "RIS_CBR_TEST"
  | "RIS_CBR_EXAM"
  | "INTERNAL_MOCK_EXAM"
  | "STANDARD_PROGRESS_ASSESSMENT";
```

Toetsdefinities zijn versieerbaar en gekoppeld aan curriculum en policy.

## 18.2 Lifecycle

```ts
type AssessmentStatus =
  | "DRAFT"
  | "PLANNED"
  | "IN_PROGRESS"
  | "AWAITING_REVIEW"
  | "COMPLETED"
  | "PUBLISHED"
  | "VOIDED";
```

De leerling ziet alleen `PUBLISHED`.

## 18.3 Toetsrecord

```ts
type AssessmentRecord = {
  id: string;
  tenantId: string;
  enrollmentId: string;
  assessmentType: AssessmentType;
  curriculumVersionId: string;
  policyVersionId: string;
  readinessEvaluationId?: string;
  status: AssessmentStatus;
  scheduledAt?: string;
  startedAt?: string;
  completedAt?: string;
  assessorId?: string;
  result?: "PASSED" | "NOT_PASSED" | "NO_DECISION";
  criterionResults: AssessmentCriterionResult[];
  feedback?: string;
  learnerFeedback?: string;
  publication?: PublicationMetadata;
};
```

## 18.4 Readiness vóór plannen

Bij het plannen toont het systeem:

* engineadvies;
* blockers;
* ontbrekend bewijs;
* open veiligheidsincidenten;
* randvoorwaarden;
* policyversie.

De planning mag niet stilzwijgend een blocker wissen.

## 18.5 Geen `readyForModuleTest` als overruleboolean

Een los booleanveld dat alle blockers overschrijft is verboden.

Vervang door:

```ts
type ReadinessDecision = {
  decision:
    | "APPROVED"
    | "DEFERRED"
    | "OVERRIDE_APPROVED"
    | "OVERRIDE_DEFERRED";

  evaluationId: string;
  reasonCode: string;
  note: string;
  decidedBy: string;
  decidedAt: string;
  blockerSnapshot: ReadinessBlocker[];
  secondApproval?: {
    approvedBy: string;
    approvedAt: string;
  };
};
```

## 18.6 Override

Een override:

* vereist reden;
* vereist actor;
* vereist tijdstip;
* bewaart alle blockers;
* is zichtbaar in audit;
* toont waarschuwing;
* kan vier-ogencontrole vereisen;
* kan door tenantbeleid worden verboden;
* mag een open veiligheidsincident standaard niet overrulen;
* wordt opgenomen in kwaliteitsrapportage.

## 18.7 Hertoets

Een hertoets:

* maakt een nieuw toetsrecord;
* overschrijft het oude record niet;
* verwijst naar de vorige poging;
* gebruikt actuele policy of expliciet vastgelegde historische policy;
* houdt pogingnummer bij;
* toont trend zonder oude uitslagen te verwijderen.

---

# 19. De vijfdelige instructeursflow

## 19.1 Logische fasen blijven bestaan

De inhoudelijke flow blijft:

1. voorbereiden;
2. les uitvoeren;
3. beoordelen;
4. reflecteren;
5. afronden en vervolg plannen.

De instructeur hoeft hiervoor niet door vijf zware afzonderlijke pagina’s.

## 19.2 Eén Lesson Cockpit

Maak één centrale lesson cockpit:

```text
/instructeur/lessen/[lessonId]
```

Tablet:

* links leerling en lescontext;
* midden actieve scripts en bediening;
* rechts samenvatting, notities en volgende actie.

Mobiel:

* één kolom;
* sticky primaire actie;
* compacte progress indicator;
* secties als drawers of sheets;
* geen horizontale overflow;
* geen kleine tapdoelen.

## 19.3 Vooraf geselecteerde focusscripts

Voor iedere les stelt het systeem 2–4 scripts voor op basis van:

* vorige observaties;
* onvoldoende dekking;
* kritieke aandacht;
* moduleafhankelijkheden;
* leerlingwens;
* vorige lesplanning;
* continuïteit;
* geplande oefensituatie.

De instructeur kan:

* bevestigen;
* verwijderen;
* toevoegen;
* volgorde wijzigen.

Het voorstel is uitlegbaar en geen AI.

## 19.4 Snel afronden

Maak een `Snel afronden`-paneel waarin de vijf logische fasen in één compacte handeling samenkomen.

Volgorde:

### A. Beoordelingen

Toon alleen:

* focusscripts;
* tijdens de les gewijzigde scripts;
* kritieke aandachtspunten.

Bediening:

* N/1–8 RIS-stap met `–` en `+`;
* performance outcome;
* safety attention;
* korte notitie alleen wanneer nodig.

### B. Leerlingreflectie

Mogelijkheden:

* leerling vult op instructeurstablet in;
* leerling vult later in eigen app in;
* instructeur markeert “later invullen”;
* leerling geeft opmerking en leerwens.

### C. Instructeursreflectie

Compact:

* wat ging goed;
* belangrijkste aandachtspunt;
* interventie of ondersteuning;
* relevante veiligheidsnotitie.

### D. Volgende les

Systeem stelt 2–4 scripts voor.

Instructeur bevestigt of wijzigt.

### E. Afronden

Primaire acties:

* `Opslaan als concept`;
* `Afronden`;
* `Afronden en publiceren`, wanneer bevoegd en volledig.

Voor publicatie verschijnt een compacte samenvatting.

## 19.5 Zestig-secondencriterium

Een normale les moet na de rit binnen maximaal 60 seconden afgerond kunnen worden, gemeten vanaf het openen van `Snel afronden` tot succesvolle finalisatie.

Meet:

* mediane afrondtijd;
* p90;
* aantal taps;
* fouten;
* terugnavigatie;
* annuleringen.

Doel voor een normale vooraf voorbereide les:

* maximaal 12 primaire taps;
* geen verplicht typen;
* geen volledige scriptlijst doorlopen;
* niet-beoordeelde scripts blijven N;
* autosave;
* directe foutfeedback.

De volledige flow blijft beschikbaar voor complexe lessen.

---

# 20. Tablet-first instructeursapp

## 20.1 Layoutprincipes

De app is primair ontworpen voor tablets, maar werkt perfect op mobiele portraitschermen.

Gebruik responsieve vensterbreedte, niet alleen device detection.

Indicatieve modi:

* compact: telefoonportrait;
* medium: kleine tablet/foldable;
* expanded: tabletlandscape en desktop.

## 20.2 Tablet

Tabletweergave biedt:

* duidelijke sidebar of navigation rail;
* sticky header;
* multi-pane waar dat snelheid toevoegt;
* ruime maar niet verspillende witruimte;
* zichtbare primaire workflow;
* toetsenbordondersteuning;
* pointer- en touchondersteuning;
* geen telefoonlayout uitgerekt over volledige breedte.

## 20.3 Mobiel portrait

Mobiel biedt:

* compacte sticky header;
* maximaal 4–5 primaire bottom-navitems;
* overige functies via `Meer`;
* safe-areaondersteuning;
* minimaal 44 × 44 CSS-pixels voor acties;
* geen afgesneden tabs;
* geen horizontale formulieren;
* modals als toegankelijke sheets waar passend;
* primaire actie binnen duimbereik.

## 20.4 Geen oriëntatieblokkade

De Android-app mag telefoonportrait optimaliseren, maar oriëntatie of browserzoom niet hard blokkeren.

Tablet moet portrait en landscape ondersteunen.

Ook multi-window en resizing mogen de UI niet breken.

Android adviseert adaptieve layouts voor schermen van verschillende afmetingen in plaats van alleen een telefoonportraitlayout.

---

# 21. Premium instructeursdashboard

## 21.1 Eerstvolgende actie

Boven de vouw staat één duidelijke `Volgende actie`.

Voorbeelden:

* les van 10:00 voorbereiden;
* openstaande les afronden;
* leerlingreactie bekijken;
* moduletoetsbesluit vastleggen;
* kritieke blokkade beoordelen;
* roosterconflict oplossen.

Toon:

* actie;
* reden;
* urgentie;
* leerling;
* tijd;
* directe knop.

## 21.2 Geen hardcoded badges

Alle bericht-, taak- en notificatiebadges komen uit live data.

Geen:

* hardcoded `3`;
* demo-aantallen;
* afwijkende telling per component;
* lokale fallback die een ander aantal toont.

Gebruik één server-side count service en gedeelde querykeys.

## 21.3 Dashboardhiërarchie

Volgorde:

1. volgende actie;
2. huidige of eerstvolgende les;
3. openstaande afrondingen;
4. kritieke aandacht;
5. leerlingreacties;
6. planning;
7. secundaire statistieken.

## 21.4 Logo en navigatie

* logo heeft voldoende contrast;
* labels breken niet onrustig;
* actieve toestand is duidelijk;
* navitems worden op rol en entitlement gefilterd;
* geen dode demo-CTA;
* geen functies tonen waar gebruiker geen toegang toe heeft;
* badges en counts zijn onderling consistent.

---

# 22. Verklaarbare slimme functies

Alle functies hieronder zijn deterministic en uitlegbaar zolang AI uitstaat.

## 22.1 Next Best Action

Bereken één prioriteitsactie uit:

* les binnen korte tijd;
* onafgeronde les;
* veiligheidsblocker;
* wachtende reflectie;
* moduletoets;
* roosterconflict;
* openstaande overdracht;
* verlopen leerlingcontact;
* synchronisatiefout.

Iedere actie bevat reason codes.

## 22.2 RIS-lesvoorstel

Stel 2–4 scripts voor op basis van expliciete regels.

Nooit automatisch definitief toevoegen zonder bevestiging.

## 22.3 Dekkingskaart

Toon apart:

* nooit beoordeeld;
* onvoldoende aantal observaties;
* te oud;
* onvoldoende contextvariatie;
* stabiel gedekt;
* regressie.

## 22.4 Kritieke-aandachtsrij

Veiligheidskritieke aandacht verschijnt boven gemiddelde voortgang.

## 22.5 Continuïteitsbewaking

Signaleer:

* te lange lesgaten;
* herhaald afzeggen;
* terugval na onderbreking;
* ontbrekende herstelplanning.

Toon een voorstel, geen automatische medische of gedragsconclusie.

## 22.6 Planningsuitleg

Bij voorgestelde instructeur, auto of tijd:

* toon beschikbaarheid;
* continuïteit;
* locatie;
* bevoegdheid;
* conflicten;
* voorkeuren.

## 22.7 Instructeursoverdracht

Bij wisseling genereert het systeem een compacte briefing uit gestructureerde gegevens:

* laatste focusscripts;
* actuele RIS-stappen;
* kritieke aandacht;
* leerlingwens;
* openstaande moduletoets;
* laatste lesdatum;
* afgesproken vervolgstap.

Vrije gevoelige notities worden niet automatisch breder gedeeld dan toegestaan.

---

# 23. Offline lesconcepten

## 23.1 Scope

De instructeur moet een actieve les en conceptbeoordelingen tijdelijk offline kunnen gebruiken.

Offline beschikbaar:

* minimale leerlingidentificatie;
* lesgegevens;
* geselecteerde focusscripts;
* cataloguslabels;
* conceptobservaties;
* reflectieconcept;
* volgende lesnotitie.

Niet standaard volledig offline cachen:

* volledige tenantadministratie;
* alle leerlingen;
* financiële gegevens;
* uitgebreide dossiers;
* gevoelige exports.

## 23.2 Synchronisatie

Gebruik:

* lokale concept-ID;
* idempotency key;
* lokale revisie;
* serverrevisie;
* syncstatus;
* conflictstatus;
* retry;
* zichtbare foutmelding.

Statussen:

```text
LOCAL_ONLY
SYNC_PENDING
SYNCING
SYNCED
CONFLICT
FAILED
```

## 23.3 Conflicten

Geen last-write-wins voor klinisch of veiligheidsrelevant bewijs.

Bij conflict:

* toon beide versies;
* laat bevoegde instructeur kiezen of samenvoegen;
* audit het besluit;
* behoud oorspronkelijke snapshots.

## 23.4 Lokale beveiliging

In de Android-app:

* gebruik Keystore-backed geheim voor lokale versleuteling waar persoonsgegevens worden gecachet;
* verwijder lokale data na succesvolle sync en ingestelde termijn;
* wis data bij uitloggen;
* geen secrets in webstorage;
* geen volledige service-role of permanente tokens lokaal.

---

# 24. Leerlingportaal

## 24.1 Alleen gepubliceerde beoordelingen

De leerling ziet nooit:

* conceptobservaties;
* interne veiligheidsnotities;
* concept-readiness;
* ongepubliceerde moduletoetsen;
* override-interne redenen;
* andere leerlinggegevens.

## 24.2 Rustiger homepage

Boven de vouw:

1. eerstvolgende les;
2. eerstvolgende actie;
3. actuele focus;
4. eventueel tegoed of relevant financieel gegeven.

Voorkom dat voortgang, focus, activiteit, coach en examen dezelfde boodschap herhalen.

## 24.3 Persoonlijk advies

Toon:

* wat de volgende focus is;
* waarom;
* uit welke gepubliceerde observatie dit volgt;
* wanneer bijgewerkt.

Geen AI-label.

## 24.4 Reflectie

Na publicatie kan de leerling:

* kaart bekijken;
* reageren;
* aangeven wat goed ging;
* aangeven wat lastig was;
* opmerking toevoegen;
* leerwens toevoegen.

Reacties veranderen de instructeursbeoordeling niet.

---

# 25. Backoffice exception-first

Het backofficedashboard wordt geen muur van KPI’s.

Bovenaan:

1. wat vereist vandaag aandacht;
2. wat is financieel of operationeel geblokkeerd;
3. wat is de eerstvolgende actie.

Daarna pas:

* planning;
* trends;
* KPI’s;
* bredere statistieken.

Regels:

* maximaal 3–4 primaire exceptioncards boven de vouw;
* KPI’s groeperen;
* geen dubbele waarschuwingen;
* tenanttijdzone;
* live counts;
* rol- en vestigingsfilter;
* entitlementgedreven navigatie;
* duidelijke lege toestand wanneer geen problemen bestaan.

---

# 26. Theorie als productonderdeel

Codex moet theorie technisch als echt domeinonderdeel behandelen.

Minimaal:

* versieerbare contentcatalogus;
* categorieën;
* lessen;
* oefenvragen;
* publicatiestatus;
* bron- en licentievelden;
* voortgang;
* koppeling aan leerling;
* koppeling aan readiness-randvoorwaarden;
* beheerworkflow;
* audit.

Codex mag geen auteursrechtelijk beschermde theorie-inhoud zonder rechten kopiëren.

Wanneer echte contentrechten ontbreken:

* bouw het volledige systeem;
* verwijder misleidende demo-claims;
* lever rechteninventarisatie;
* plaats inhoud in `AWAITING_CONTENT_LICENSE`;
* gebruik alleen duidelijk gemarkeerde eigen testfixtures buiten productie.

---

# 27. Toegankelijkheid

Verplicht:

* WCAG-conforme semantiek;
* duidelijke labels;
* foutmeldingen gekoppeld aan velden;
* focus trap in dialogs;
* focusherstel na sluiten;
* Escape-ondersteuning;
* toetsenbordbediening;
* screenreaderstatussen;
* toegankelijke tabs;
* toegankelijke selects;
* geen browserzoomblokkade;
* contrast;
* reduced motion;
* voldoende tapdoelen;
* zichtbare focus;
* geen informatie uitsluitend via kleur.

Voeg geautomatiseerde accessibilitytests toe aan kritieke flows.

---

# 28. Echte end-to-end RIS-reis

Maak minimaal één realistisch gevuld RIS-demotraject met:

* tenant;
* bevoegde RIS-instructeur;
* leerling;
* RIS 2.0-inschrijving;
* module;
* focusscripts;
* eerdere observaties;
* dekkingsgaten;
* kritieke competentie;
* plankaart;
* moduletoets;
* leerlingaccount;
* leerlingreflectie.

Verplichte E2E-reis:

1. instructeur logt in;
2. dashboard toont juiste volgende actie;
3. instructeur opent leerling;
4. instructeur start les;
5. voorgestelde scripts worden getoond;
6. instructeur past RIS-stappen aan;
7. `N` blijft niet-beoordeeld;
8. instructeur voegt veiligheidsaandacht toe;
9. leerling vult reflectie in;
10. les wordt eerst concept;
11. instructeur bekijkt samenvatting;
12. instructeur publiceert;
13. readiness wordt centraal herberekend;
14. blockers blijven zichtbaar;
15. volgende lesvoorstel ontstaat;
16. leerling logt in;
17. leerling ziet alleen gepubliceerde kaart;
18. leerling ziet begrijpelijke focus;
19. leerling reageert;
20. instructeur ziet reactie bij volgende lesvoorbereiding.

Test ook:

* offline concept;
* synchronisatie;
* conflict;
* moduletoetsoverride;
* leerling zonder e-mail;
* later toevoegen van e-mail;
* legacy RIS 1.0 read-only;
* oude route redirect;
* mobiel portrait;
* tabletlandscape.

---

# 29. Visuele regressie en screenshots

## 29.1 Baselines

Maak echte baselines voor:

* instructeur tablet light;
* instructeur tablet dark, indien dark mode bestaat;
* instructeur mobiel portrait;
* leerling mobiel;
* backoffice desktop;
* RIS-lesson cockpit;
* snel afronden;
* dekkingskaart;
* moduletoets;
* offline status;
* foutstatus;
* lege toestand.

Geen blanco placeholders.

## 29.2 Viewports

Minimaal:

* 390 × 844;
* 412 × 915;
* 768 × 1024;
* 834 × 1194;
* 1280 × 800;
* 1440 × 900.

## 29.3 Stabiliteit

Masker alleen werkelijk dynamische data.

Niet het halve scherm maskeren om regressies te verbergen.

Gebruik vaste seeddata, vaste klok en vaste tenanttijdzone.

---

# 30. Android- en Google Play-canon

## 30.1 Architectuur

Codex inspecteert eerst of een Android-shell bestaat.

Beslisvolgorde:

1. bestaande werkende native/Capacitor-shell behouden;
2. bestaande TWA behouden wanneer alle vereisten, offlineflow en integraties aantoonbaar werken;
3. wanneer geen shell bestaat: implementeer Capacitor als standaard Android-container voor de instructeursapp.

Reden voor de standaardkeuze:

* betrouwbare appidentiteit;
* signing;
* native secure storage;
* offline lesconcepten;
* deep links;
* gecontroleerde netwerkstatus;
* toekomstige notificaties;
* tablet- en mobiele distributie.

Geen tweede losstaande UI bouwen.

De Android-app gebruikt dezelfde domeinlogica en design system.

## 30.2 Identiteit

```text
App name: NXTDRIVE Instructeur
Package ID: io.nxtdrive.instructeur
Primary domain: nxtdrive.io
```

Wanneer een reeds gepubliceerd package-ID bestaat, blijft dat behouden en wordt het conflict in de besliswachtrij opgenomen.

## 30.3 SDK

Stel direct in:

```text
compileSdk = 36
targetSdk = 36
```

Kies `minSdk` op basis van:

* bestaande gebruikersbasis;
* gebruikte dependencies;
* securityondersteuning;
* testmatrix.

Documenteer de keuze.

Vanaf 31 augustus 2026 moeten nieuwe apps en updates voor mobiele Android-apps API 36 targeten.

## 30.4 App Bundle en signing

Productierelease gebruikt een AAB.

Android App Bundles moeten vóór upload met een upload key worden ondertekend; Play App Signing beheert daarna de distributiesigning.

Vereiste secrets:

```text
ANDROID_UPLOAD_KEYSTORE_BASE64
ANDROID_UPLOAD_KEYSTORE_PASSWORD
ANDROID_UPLOAD_KEY_ALIAS
ANDROID_UPLOAD_KEY_PASSWORD
GOOGLE_PLAY_SERVICE_ACCOUNT_JSON
```

Regels:

* nooit committen;
* nooit loggen;
* nooit in releaseartifact opnemen;
* workflow schrijft tijdelijk keystorebestand;
* bestand na build veilig verwijderen;
* checksum en publieke fingerprint wel bewaren;
* upload key gescheiden houden van app signing key;
* beveiligde offline back-up documenteren.

## 30.5 Buildvarianten

Minimaal:

```text
debug
staging
production
```

Staging:

* eigen appnaamaccent;
* eigen backend;
* niet verwisselbaar met productie.

Production:

* alleen `nxtdrive.io`;
* geen debugmenu;
* geen testdata;
* geen onbeveiligde logging;
* minification waar veilig;
* sourcemap-/mappingbeheer.

## 30.6 Versies

* `versionName`: semantic version;
* `versionCode`: altijd stijgend;
* versie afgeleid uit release-tag en gecontroleerde CI-counter;
* buildmetadata zichtbaar in instellingen;
* commit-SHA zichtbaar in diagnostiek, niet prominent voor normale gebruiker.

## 30.7 Deep links

Configureer verified app links voor:

```text
https://nxtdrive.io/instructeur/*
```

Lever correcte `assetlinks.json`.

Test:

* geïnstalleerde app;
* niet-geïnstalleerde app;
* ingelogd;
* uitgelogd;
* verlopen sessie;
* directe leslink;
* leerlinglink zonder rechten.

## 30.8 Androidkwaliteit

Test minimaal:

* portraittelefoon;
* kleine telefoon;
* 7-inch tablet;
* 10-inch tablet;
* tabletlandscape;
* multi-window;
* offline;
* slechte verbinding;
* achtergrond/voorgrond;
* process recreation;
* biometrische of sessieherauthenticatie waar aanwezig;
* donkere systeemmodus;
* font scaling;
* toetsenbord;
* schermrotatie.

## 30.9 Store listing

Maak een complete map:

```text
android/play-store/
  nl-NL/
    title.txt
    short-description.txt
    full-description.txt
    release-notes/
  graphics/
    icon/
    feature-graphic/
    phone/
    tablet-7/
    tablet-10/
  privacy/
    data-safety-inventory.md
    permissions-inventory.md
    privacy-policy-checklist.md
    account-deletion-checklist.md
  review/
    reviewer-instructions.md
    test-account-template.md
```

Screenshots moeten echte appfunctionaliteit tonen en mogen niet uit blanco placeholders bestaan.

## 30.10 Data Safety

Inventariseer:

* persoonsgegevens;
* accountgegevens;
* appactiviteit;
* foto’s;
* berichten;
* diagnostische data;
* crashdata;
* identifiers;
* derde-partij-SDK’s;
* versleuteling;
* verwijderingsproces;
* delen met verwerkers.

Google Play vereist voor gepubliceerde apps een accurate Data Safety-declaratie die ook het gedrag van third-party libraries en WebViews omvat. Een privacy policy is eveneens vereist.

Codex vult een voorbereidende inventaris in, maar mag geen onjuiste juridische verklaring namens de eigenaar indienen.

## 30.11 Play Developer API

Maak workflows voor:

* signed bundle build;
* artifactverificatie;
* internal track upload;
* closed track;
* productie met GitHub Environment approval;
* staged rollout;
* release notes;
* rollback/haltprocedure.

De Publishing API kan appversies uploaden, aan tracks koppelen en store listings beheren. Voor server-to-servertoegang wordt een service account met passende Play Console-rechten gebruikt.

## 30.12 Geen automatische productiepublicatie

Interne testupload mag automatisch na een groene releaseworkflow.

Productie vereist:

* alle gates groen;
* GitHub production environment approval;
* geldige signing;
* geldige Play credentials;
* privacycheck;
* Data Safety-check;
* store assets;
* staged rolloutconfiguratie;
* menselijke releasegoedkeuring.

---

# 31. Google Play-workflows

## 31.1 Internal release

Trigger:

* handmatig;
* release candidate-tag;
* expliciet geselecteerde branch.

Stappen:

1. volledige CI;
2. webproductiebuild;
3. Android sync;
4. Gradle tests;
5. lint;
6. signed AAB;
7. bundle-analyse;
8. signatureverificatie;
9. checksum;
10. upload internal track;
11. release notes;
12. release-evidence upload.

## 31.2 Production release

Trigger:

```text
instructor-vMAJOR.MINOR.PATCH
```

Vereist:

* beschermde tag of branch;
* productieomgevingapproval;
* dezelfde commit als geteste release candidate;
* geen rebuild met andere dependencies;
* ondertekend AAB;
* staged rollout, standaard niet direct 100%;
* release notes;
* monitoringcheck;
* rollbackplan.

## 31.3 Externe credentials ontbreken

Wanneer Play- of GitHub-secrets ontbreken:

* workflow blijft volledig valide;
* dry-runbuild slaagt;
* signed local testbundle wordt gemaakt met niet-productiesleutel;
* productie-signingstap meldt exact ontbrekende secret;
* geen secret wordt verzonnen;
* `docs/release/google-play-external-actions.md` bevat exacte handmatige stappen.

---

# 32. Producttour, release notes en kalenderintegratie

## 32.1 Producttour

Maak een korte, wegklikbare instructeurstour voor:

* dashboard;
* les starten;
* RIS-stappen;
* snel afronden;
* offline concept;
* publiceren;
* moduletoets;
* leerling toevoegen.

De tour is opnieuw te openen vanuit Help.

## 32.2 Release notes

Toon versieerbare release notes:

* alleen relevante veranderingen;
* rolgericht;
* één keer automatisch;
* later terug te lezen;
* geen marketingclaims zonder bewijs.

## 32.3 Kalenderintegratie

Bouw een adaptergedreven kalenderintegratie.

Minimaal:

* exporteerbare ICS;
* persoonlijke kalenderfeed of veilige link;
* duidelijke tijdzone;
* wijzigingen;
* annuleringen.

Wanneer bestaande Google/Microsoftintegraties aanwezig zijn, behoud en verbeter ze.

Nieuwe OAuth-providerintegratie mag achter featureflag wanneer externe credentials ontbreken.

---

# 33. Exporteerbaar RIS-portfolio

Maak een exporteerbaar RIS-portfolio met:

* leerlingidentificatie volgens rechten;
* curriculumversie;
* moduleoverzicht;
* scriptvoortgang;
* gepubliceerde beoordelingen;
* reflecties;
* moduletoetsen;
* readinessbesluiten;
* gebruikte policyversies;
* auditmetadata;
* disclaimer dat NXTDRIVE geen CBR-examenbesluit vervangt.

Ondersteun minimaal:

* veilige PDF- of printweergave;
* machineleesbare JSON-export;
* exportaudit;
* tenantbranding;
* privacyfiltering.

Concepten en interne notities worden alleen opgenomen wanneer de bevoegde exporteur daar expliciet recht op heeft.

---

# 34. Teststrategie

## 34.1 Unit

Minimaal:

* RIS-stap niet als gemiddelde kwaliteit;
* N niet als score;
* evidence-adapters;
* dekking;
* stabiliteit;
* regressie;
* kritieke blockers;
* moduletoetsguards;
* overrides;
* tenanttijd;
* Clock;
* Next Best Action;
* routecanon;
* offline merge;
* dataretentiepreview.

## 34.2 Integratie

Minimaal:

* les afronden;
* publicatie;
* student zonder e-mail;
* later account koppelen;
* readiness-recalculatie;
* moduletoets;
* override;
* audit;
* RLS;
* AVG-export;
* anonimisering;
* notificatiecounts;
* routealiases;
* outbox/retry.

## 34.3 E2E

Minimaal:

* volledige RIS-reis;
* gewone opleidingsreis;
* legacy read-only;
* leerling zonder e-mail;
* mobile portrait;
* tablet;
* offline concept;
* publicatiegrens;
* moduletoets;
* account deletion request;
* backoffice-exceptionflow.

## 34.4 Android

Minimaal:

* Gradle unit tests;
* Android lint;
* build debug;
* build staging;
* signed production AAB;
* installatietest;
* deep link;
* offline/online;
* process recreation;
* schermrotatie;
* app update over vorige build;
* package- en versiecontrole.

---

# 35. Acceptatiecriteria

## Release en repository

* CI bestaat en is groen;
* typecheck groen;
* lint groen;
* unit groen;
* integration groen;
* E2E groen;
* build groen;
* migratiesmoke groen;
* securityaudit voldoet aan policy;
* release-evidence aanwezig;
* documentatieclaims kloppen.

## Routes

* één publieke Nederlandse route per functie;
* één interne Engelse domeinnaam;
* aliases zijn 308-redirects;
* geen dubbele businesslogica;
* navigatie komt uit centraal manifest.

## Instructeursapp

* tablet-first;
* mobiel portrait perfect;
* live badges;
* geen hardcoded aantallen;
* logo voldoende contrast;
* volgende actie boven de vouw;
* snel afronden binnen testdoel;
* geen dode CTA;
* e-mail leerling optioneel;
* autosave;
* offline concept;
* toegankelijke bediening.

## RIS

* `STANDARD`, `RIS_2_0`, `RIS_1_0_LEGACY`;
* RIS 1.0 read-only;
* RIS-stap niet als kwaliteitsscore;
* N niet als cijfer;
* één readiness-engine;
* kritieke competenties expliciet;
* dekking expliciet;
* blockers niet weggemiddeld;
* overrides auditbaar;
* moduletoetsen versieerbaar;
* leerling ziet alleen gepubliceerd;
* expertvalidatieguard actief.

## Security en privacy

* dependencyproblemen opgelost;
* CSP;
* Permissions Policy;
* rate limiting;
* RLS;
* centrale foutregistratie;
* tracing;
* monitoring;
* AVG-export;
* deletion/anonimiseringsproces;
* `nxtdrive.io` overal canoniek.

## Android

* app heet NXTDRIVE Instructeur;
* package-ID gecontroleerd;
* target/compile API 36;
* tablet en mobiel;
* signed AAB;
* signingworkflow;
* internal-trackworkflow;
* productionworkflow met approval;
* echte screenshots;
* Play listing package;
* Data Safety-inventaris;
* privacy- en deletionlinks.

---

# 36. Verboden shortcuts

Codex mag niet:

* tests verwijderen om groen te krijgen;
* asserts afzwakken zonder reden;
* broncodezoektests als E2E presenteren;
* kwetsbaarheden onderdrukken zonder analyse;
* `N` naar 0 of 1 converteren;
* RIS-stappen middelen als kwaliteit;
* blockers verbergen;
* `readyForModuleTest = true` als stille override behouden;
* concepten aan leerlingen tonen;
* RIS 1.0 actief maken voor nieuwe leerlingen;
* expertgoedkeuring verzinnen;
* copyrighted RIS- of theoriecontent kopiëren;
* hardcoded badges laten staan;
* tijdelijke demo-aantallen als live data tonen;
* browserzoom blokkeren;
* oriëntatie hard locken;
* productie-secrets committen;
* een debugkey als production upload key presenteren;
* een blanco screenshot als store asset gebruiken;
* productie automatisch op 100% uitrollen;
* “Play Store-ready” schrijven wanneer signing of build niet aantoonbaar werkt;
* documentatie “complete” noemen zonder bewijs.

---

# 37. Verplichte eindrapportage

Maak:

```text
docs/releases/instructor-mega-sprint-final-report.md
```

Structuur:

1. executive summary;
2. baseline;
3. wijzigingen per domein;
4. routes vóór en na;
5. RIS/readinessimplementatie;
6. moduletoetsen;
7. instructeursflow;
8. security;
9. dependencyresultaten;
10. privacy;
11. observability;
12. Android;
13. Play Store;
14. testresultaten;
15. performance;
16. toegankelijkheid;
17. screenshots;
18. release-evidence;
19. migraties;
20. resterende externe acties;
21. invloedrijke beslissingen;
22. exacte commando’s om opnieuw te valideren;
23. relevante commit-SHA’s.

Voor iedere niet-afgeronde taak:

* reden;
* technisch al afgerond deel;
* externe afhankelijkheid;
* concrete volgende actie;
* eigenaar;
* risico;
* blocking of non-blocking.

Er mag geen generieke restpost “later” bestaan.

---

# 38. Definition of Done

De mega-sprint is alleen volledig afgerond wanneer:

* alle codewijzigingen geïmplementeerd zijn;
* alle relevante migraties bestaan;
* alle automatische tests groen zijn;
* echte E2E-flows groen zijn;
* visuele baselines bestaan;
* dependency- en securitybeleid wordt gehaald;
* pilotdata veilig kan worden gebruikt;
* de instructeursapp aantoonbaar tablet- en mobielwaardig is;
* RIS inhoudelijk correct gescheiden is in instructiestap, beheersing, dekking en readiness;
* RIS 1.0 immutable read-only is;
* moduletoetsen en overrides correct werken;
* de leerling alleen gepubliceerde data ziet;
* AI uitstaat;
* leerling zonder e-mail kan worden toegevoegd;
* signed Android AAB aantoonbaar kan worden gebouwd;
* Google Play-workflows aanwezig en getest zijn;
* externe blokkades eerlijk zijn gedocumenteerd;
* geen bekende kritieke releasefout openstaat.

Werkelijke externe expertgoedkeuring en handelingen waarvoor uitsluitend de eigenaar van het Google Play-account bevoegd is, mogen als externe actie openstaan. Codex moet wel alle techniek, formulieren, workflows, controles en instructies daarvoor volledig opleveren.

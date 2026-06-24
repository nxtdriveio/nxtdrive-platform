# NXTDRIVE canon-analyse

Deze analyse vergelijkt de huidige NXTDRIVE codebase met de productcanon en de aanvullende canon voor Smart Intake, Booking, Rescheduling en Slot Recovery. De analyse is bedoeld als intern productoverzicht: wat is aanwezig, wat is gedeeltelijk aanwezig, wat ontbreekt nog en waar liggen de beste verbeterkansen.

## Samenvatting

NXTDRIVE staat inmiddels stevig als SaaS-platform voor rijscholen. De kernlijnen uit de canon zijn herkenbaar aanwezig: multi-tenant organisatiebeheer, rollen en rechten, leerlingen en dossiers, planning, instructeursapp, leerlingapp, RIS-leskaarten, pakketten, tegoed, facturen, taken, notificaties, franchisebeheer, white-label styling en smart booking. De applicatie is daarmee duidelijk veel verder dan een MVP-shell.

De grootste resterende gaten zitten niet meer in losse schermen, maar in afronding, consistentie en producthardheid. Vooral volledige productieflows rond CBR-koppeling, theoriecontent, offline sync, pushnotificaties, embeddable intake, visuele regressietests, AVG tooling en end-to-end testdekking verdienen nog aandacht. Ook zijn enkele onderdelen al aanwezig in basisvorm, maar nog niet volledig "canon-volwassen", zoals AI operations, franchise planning als echte sturingslaag en de laatste polish van finance/student payment routes.

## Canon-bronnen

De analyse is gebaseerd op:

- `NXTDRIVE Productomschrijving & Canon v1.pdf`
- `NXTDRIVE Smart Intake, Booking, Rescheduling & Slot Recovery Engine`
- De huidige codebase in `artifacts/nxtdrive`, `supabase/migrations` en de route- en componentstructuur.

## Hoofdcanon

### Aanwezig

De hoofdcanon positioneert NXTDRIVE als Driving School Operating System: CRM, planning, LMS, ERP, finance, PWA, workflow, franchise software en AI operations in een SaaS-first platform. De huidige codebase volgt die richting duidelijk.

Aanwezige fundamenten:

- Multi-tenant basis met tenants, organisaties, memberships, rollen, branch-scope en settings.
- Backoffice shell met dashboard, planning, leerlingen, leads, instructeurs, voertuigen, pakketten, taken, finance, rapportages, CBR, RIS en instellingen.
- Leerling-PWA met home, agenda, lessen, tegoed, facturen, documenten, theorie, CBR, voortgang, berichten, profiel, notificaties en offline-gerelateerde schermen.
- Instructeursapp met cockpit, agenda, leerlingen, les-evaluaties, berichten, taken, voertuigen, beschikbaarheid, rapportages en profiel.
- Franchiseomgeving met dashboard, planning, templates, delegaties, benchmarks, signalen, acties, audit en governance.
- White-label theming met tenantbranding, logo, kleuren, presets en reset naar NXTDRIVE standaard.
- Notificatie-infrastructuur met templates, jobs en voorkeuren.
- Finance- en creditflows met pakketten, tegoed, facturen, betaalstatussen, reminders, PDF en Mollie-webhooks.
- Smart booking, self-booking, rescheduling, cancellation, slot recovery en end-of-lesson scheduling zijn als flows aanwezig.

### Gedeeltelijk aanwezig

De SaaS-architectuur is aanwezig, maar enkele "platform maturity" onderdelen zijn nog niet op hetzelfde niveau als de hoofdmodules:

- Monitoring, incidentproces en productie-observability zijn niet volledig aantoonbaar vanuit de applicatiecode.
- Volledige app store / custom PWA distributie per white-label tenant is voorbereid, maar niet als volledig beheerde klantflow zichtbaar.
- AI is aanwezig als ondersteuning, maar nog niet als brede operationele beslislaag.
- Visuele kwaliteit is sterk verbeterd, maar er is geen automatische visuele regressietestset die pixelconsistentie bewaakt.

### Ontbreekt of verdient vervolg

- Een volledige publieke marketingwebsite zoals de canon beschrijft is nog beperkt.
- Formele productiechecklists voor onboarding, monitoring, support en releasebeheer zijn niet volledig zichtbaar in het product.
- Een centraal productbreed "wat kan deze tenant wel/niet" overzicht is nuttig, zeker bij verschillende abonnementsniveaus.

## Organisaties, rollen en rechten

### Aanwezig

De canon benoemt meerdere rijschooltypen: zzp-instructeur, kleine rijschool, multi-instructor, multi-branch en franchise. De codebase ondersteunt dit in de kern:

- Tenant- en organisatie-instellingen.
- Rollen, permissies en memberships.
- Medewerkers, instructeurs, teams en branches.
- Branch-scoped toegang.
- Delegaties en franchise-scope.
- Parent/guardian toegang met instellingen en zichtbaarheid.

De rolverdeling voor admin, planner, finance, instructor, student, parent en franchise admin is herkenbaar in routes, services en UI.

### Gedeeltelijk aanwezig

Rollen en permissies zijn functioneel uitgebreid, maar productmatig kan het beheer nog simpeler:

- Een visuele permissiematrix voor klantadmins zou beheer begrijpelijker maken.
- Een auditvriendelijke uitleg per rol zou fouten in inrichting verminderen.
- Delegaties zijn verdiept, maar kunnen nog meer als wizard door het hele systeem heen terugkomen.

### Ontbreekt of verdient vervolg

- Klantvriendelijke roltemplates per rijschooltype.
- Een rechten-simulator: "wat ziet deze medewerker of leerling nu precies?"

## White-label en tenantstijl

### Aanwezig

De canon zegt dat NXTDRIVE standaard het merk is en white-label als premium optie werkt. Dit is aanwezig:

- Tenantlogo en kleuren.
- Reset naar NXTDRIVE standaardstijl.
- Thema-instellingen en previews.
- Doorwerking naar metadata, manifests en shells.
- Scheiding tussen NXTDRIVE default en tenantstijl.

### Gedeeltelijk aanwezig

De basis is goed, maar white-label kan nog robuuster worden:

- Preview per portaal: admin, instructeur, leerling en ouder.
- Contrastchecks bij tenantkleuren.
- Automatische waarschuwing als gekozen kleuren tekst slecht leesbaar maken.

### Ontbreekt of verdient vervolg

- Volledige self-service custom domain flow.
- Volledige branded PWA-publicatieflow per tenant.

## Leerlingen en dossier

### Aanwezig

De leerlingcanon vraagt om een centraal dossier met personalia, contact, ouder/voogd, intake, beschikbaarheid, ophaallocatie, ervaring, instructeur, vestiging, planning, RIS, theorie, CBR, documenten, pakketten, tegoed, facturen, communicatie en taken. De codebase bevat hiervoor veel routes en services:

- Leerlingbeheer in backoffice.
- Student detailviews en student server helpers.
- Intakegegevens en ervaring.
- Planning en leshistorie.
- RIS/voortgang.
- Theorie.
- CBR/examens.
- Documenten.
- Facturen, betalingen, tegoed en pakketten.
- Berichten en notificaties.
- Parent portal met gekoppelde kindgegevens.

### Gedeeltelijk aanwezig

- De dossierbreedte is aanwezig, maar de mate van polish verschilt per subonderdeel.
- Niet alle dossierinformatie lijkt overal even centraal samengevat te zijn.
- Sommige routes bestaan dubbel in Nederlands/Engels, wat gebruikersrouting en onderhoud complexer kan maken.

### Ontbreekt of verdient vervolg

- Een volledig klantvriendelijk "leerling 360" scherm waarin alle relevante waarschuwingen, status en acties in een compacte samenvatting staan.
- Meer automatisering rond dossierkwaliteit: ontbrekende gegevens, verlopen documenten, open CBR-acties, bijna-op-tegoed en examengereedheid.

## Leads, intake en proeflessen

### Aanwezig

De canon vraagt om leadregistratie, intake, leadstatussen, proeflesplanning, pakketadvies en follow-up. De huidige codebase bevat:

- Public intake routes.
- Lead pages en detailviews.
- Lead follow-up jobs.
- Package advice.
- Trial lesson suggestions.
- Lead routing en franchise assignment.
- Smart intake en booking records.
- Booking confirmations en hold-mechaniek.

### Gedeeltelijk aanwezig

- Standalone intake werkt, maar embeddable intake als externe widget is niet duidelijk als afgeronde productflow zichtbaar.
- Lead scoring en routing zijn aanwezig, maar de uitlegbaarheid richting gebruikers kan beter.
- Franchisebreed routeren is verbeterd, maar kan verder groeien naar volledig transparante ownership-overdracht.

### Ontbreekt of verdient vervolg

- Embeddable website-widget met volledige styling- en trackingopties.
- Lead score-uitleg in de UI: waarom adviseert NXTDRIVE deze vestiging, instructeur of proefles?
- Conversie-dashboard per bron/campagne met actieadvies.

## Planning en resource planner

### Aanwezig

De canon vraagt om dag-, week-, instructeur-, vestiging-, voertuig-, examen- en proeflesperspectieven. De codebase bevat:

- Agenda.
- Planning board.
- Planning queue.
- Herbezetten/reschedule.
- Appointment types.
- Resource planner helpers.
- Branch-, instructor-, vehicle-, route-, rayon- en capability-validatie.
- Availability helpers.
- Smart lesson suggestions.
- Multi-branch planning support.
- Slot recovery.

### Gedeeltelijk aanwezig

De planner is functioneel uitgebreid, maar de canon vraagt eigenlijk om een zeer volwassen dispatchomgeving. De basis staat; de volgende stap is producthardheid:

- Alle perspectieven moeten consistent voelen en dezelfde interactiepatronen hebben.
- Drag-and-drop, filters, warnings en details moeten overal dezelfde statuslogica gebruiken.
- Beschikbaarheid, voertuigen en rayon/capabilities moeten zichtbaar worden als begrijpelijke planningsredenen, niet alleen als validatie.

### Ontbreekt of verdient vervolg

- Meer end-to-end tests op planningconflicten.
- Betere simulatie voor drukke dagen: capaciteit, bottlenecks, voertuigen, instructeurs, examens en proeflessen tegelijk.
- Routeoptimalisatie als echte dispatchfunctie.

## Smart booking, rescheduling en slot recovery

### Aanwezig

De aanvullende smart-booking canon is grotendeels geimplementeerd in fases:

- Booking requests.
- Kandidaten en scoring.
- Holds.
- Confirmation events.
- Voorkeuren.
- Existing student self-booking.
- Student reschedule/cancel/recovery flow.
- Slot recovery engine.
- End-of-lesson scheduling.
- Multi-branch smart planning.
- AI-ready planning metrics.

### Gedeeltelijk aanwezig

De functionele bouwblokken zijn aanwezig, maar de canon stelt hoge eisen aan zekerheid:

- Race conditions, hold expiry, confirmation expiry en recovery-cases hebben meer integratietesten nodig.
- De lokale Supabase database was tijdens deze analyse niet bereikbaar, waardoor migrations niet opnieuw zijn toegepast of live gevalideerd.
- De UX rond "waarom deze drie slots" kan nog sterker.

### Ontbreekt of verdient vervolg

- Volledige testset voor alle smart-booking fases.
- Heldere klantinstellingen voor annuleringsregels, herstelregels en communicatie per tenant.
- Uitgebreidere rapportage op gemiste omzet, teruggewonnen slots en responstijd.

## Instructeursapp

### Aanwezig

De instructeurscanon vraagt om tablet-first cockpit, planning, leerlingen, les starten/afronden, RIS, notities, taken, huiswerk, CBR, tegoedwaarschuwingen en snelle afronding. Aanwezig:

- Cockpit en dashboard.
- Agenda en week/day views.
- Leerlingen.
- Les-evaluaties en leskaartflow.
- Plankaart.
- RIS-tabs: lesinfo, plankaart, beoordeling, reflectie, samenvatting/afronding.
- Concept opslaan en afronden/publiceren.
- Berichten.
- Taken.
- Voertuigen.
- Beschikbaarheid.
- Rapportages.

### Gedeeltelijk aanwezig

- De instructeursapp is sterk uitgebreid, maar moet blijvend getest worden op tablet landscape, tablet portrait, mobiel en desktop.
- Beschikbaarheid is data-driven gemaakt, maar dit is een kritisch pad en verdient extra testdekking.
- Leskaart en plankaart locks zijn aanwezig als productrichting, maar verdienen regressietesten.

### Ontbreekt of verdient vervolg

- Meetbaar afronden binnen 60 seconden met usability-test of telemetry.
- Offline-first lesafronding met latere sync.
- Volledig consistente typografie, spacing en componentstijl over alle instructeursschermen via visuele regressie.

## Leerlingapp

### Aanwezig

De canon vraagt om een mobile-first student PWA met volgende les, tegoed, voortgang, theorie, open acties, CBR, documenten, betalingen en vriendelijke taal. Aanwezig:

- Dashboard/home.
- Agenda en lessen.
- Self-booking.
- Reschedule/cancel.
- Tegoed/credits.
- Facturen/betalingen.
- CBR en examens.
- Documenten.
- Theorie.
- Journey/voortgang/RIS.
- Berichten.
- Notificaties.
- Profiel en instellingen.
- Offline/splash routes.

### Gedeeltelijk aanwezig

- De studentervaring is breed, maar enkele routes lijken nog overlappend of verschillend gepolijst.
- De generieke `payments` pagina bevat nog tekst dat de betaalflow later beschikbaar komt, terwijl factuur- en betaalacties elders wel aanwezig zijn. Dat moet productmatig worden rechtgetrokken.
- Offline support is zichtbaar, maar volledige offline sync is niet bewezen.

### Ontbreekt of verdient vervolg

- Volledige offline sync voor planning, berichten en leskaartinzage.
- Uniforme student payment journey zonder "binnenkort"-taal in productiepad.
- Meer uitleg bij RIS-voortgang en examengereedheid voor leerlingen.

## RIS, leskaart en voortgang

### Aanwezig

De canon benoemt RIS-methodiek, modules, scripts, voortgang, CBR-koppeling en scoremodel. Het scoremodel is definitief `N` plus `1` t/m `8`: `N` is niet beoordeeld, `8` is examenwaardig. Aanwezig:

- RIS-taxonomie en scripts.
- RIS-leskaarten.
- Plankaarten.
- Reflectie.
- Publicatieflow.
- Scoremodel N/1-8.
- Critical skills en readiness.
- Studentweergave van voortgang.
- Instructor beoordeling met modules en labels.

### Gedeeltelijk aanwezig

- De canon spreekt over RIS-native werken, maar echte RIS-compliance vraagt inhoudelijke validatie door rijopleidingsspecialisten.
- De UI is functioneel, maar inhoudelijke rubricteksten, tooltipteksten en modulelabels moeten blijven worden gecontroleerd op didactische kwaliteit.
- Rapportages op RIS kunnen nog sterker gekoppeld worden aan planning, pakketadvies en examengereedheid.

### Ontbreekt of verdient vervolg

- Volledige inhoudelijke RIS-review met domeinexpert.
- Exporteerbare RIS-rapportage per leerling.
- Leerlingvriendelijke uitleg van scoreontwikkeling per module.

## Theorie, CBR en examens

### Aanwezig

- Theorie routes en voortgang.
- CBR-statussen.
- Examens en exam candidates.
- Exam signals.
- Post-exam workflows.
- Retake/exam result cards.
- Manual CBR status management.

### Gedeeltelijk aanwezig

- De theorieomgeving bestaat, maar een volledige theoriecontentbibliotheek lijkt niet af.
- CBR is functioneel verwerkt, maar niet als officiele externe koppeling.

### Ontbreekt of verdient vervolg

- Officiele CBR-koppeling.
- Complete theoriecatalogus met beheer, opdrachten en rapportage.
- Examendossier met volledige historie, documenten, uitslag, advies en vervolgplanning.

## Pakketten, tegoed, facturen en betalingen

### Aanwezig

- Pakketten.
- Tegoed/credits.
- Credit ledger.
- Facturen.
- Invoice PDF.
- Installments.
- Partial payments.
- Payment reminders.
- Mollie checkout en webhooks.
- Finance dashboards en exports.

### Gedeeltelijk aanwezig

- Finance is breed aanwezig, maar moet gebruikersmatig volledig consistent blijven tussen backoffice, student app en ouderportaal.
- Mollie is technisch aanwezig, maar de producttekst in sommige studentroutes suggereert nog onvolledigheid.

### Ontbreekt of verdient vervolg

- Volledig finance onboarding script per klant.
- Heldere betaalstatus flow voor leerling/ouder.
- Geavanceerde boekhoudkoppelingen.

## Taken, workflows en notificaties

### Aanwezig

- Taken.
- Task board.
- Assignment rules.
- Planning, finance, instruction, CBR en support taken.
- Notification templates.
- Tenant/platform notification overrides.
- In-app, email en web-push infrastructuur.
- Reminder jobs.
- Notification preferences.

### Gedeeltelijk aanwezig

- De infrastructuur is sterk, maar workflowautomatisering kan nog meer producttemplates gebruiken.
- Pushnotificaties vragen productievalidatie per device/browser.

### Ontbreekt of verdient vervolg

- Workflow builder of templatecatalogus voor klantadmins.
- Delivery dashboard voor notificaties: verzonden, geopend, mislukt, opnieuw proberen.

## Franchise

### Aanwezig

Franchise is flink gegroeid richting command center:

- Franchise dashboard.
- Signalen.
- Acties.
- Eigenaar/status/audit flow.
- Delegaties met scope, geldigheid, granted/revoked by, reden en audit.
- Template apply flow met idempotency/audit/validatie.
- Lead routing.
- Benchmark targets en benchmark actions.
- Franchisee acknowledgement.
- Planning command actions.
- Auditfilters.
- AI/action insights.

### Gedeeltelijk aanwezig

De structuur is aanwezig, maar franchise is een groot domein. Verdere volwassenheid zit vooral in:

- UX van centrale actie naar lokale uitvoering.
- Rollback en rollout inzicht.
- Benchmarksturing met duidelijke afspraken, eigenaar en opvolging.
- Lokale acceptatie/afwijzing als dagelijkse werkflow.

### Ontbreekt of verdient vervolg

- Franchise playbooks als volledig klantbeheerbaar programma.
- Benchmark coaching flow: signaal, doel, actieplan, check-in, resultaat.
- Sterkere mobiele/tablet command center views.

## Rapportages en AI

### Aanwezig

- Dashboard KPI's.
- Finance, quality, review, franchise en operational reports.
- AI client/config.
- Instructor AI suggestions.
- Leskaart summary/advice.
- Lead package advice.
- AI-ready planning metrics.

### Gedeeltelijk aanwezig

- AI ondersteunt de gebruiker, maar is nog geen complete operations assistant.
- Rapportages tonen veel inzicht, maar kunnen nog vaker direct naar actie leiden.

### Ontbreekt of verdient vervolg

- AI cockpit per rol: admin, planner, instructeur, franchise.
- Verklaarbare aanbevelingen met brondata en "waarom".
- Actieknoppen vanuit elk rapport.

## Security, AVG en audit

### Aanwezig

- Tenantisolatie.
- Rollen en rechten.
- Branch scoping.
- Auditlogs op belangrijke franchise- en adminacties.
- Privacy-gerelateerde routes en instellingen.
- Server-side access helpers.

### Gedeeltelijk aanwezig

- De basis is sterk, maar AVG-operaties moeten productmatig explicieter.

### Ontbreekt of verdient vervolg

- Klantbedienbare data-export.
- Verwijder/anonymiseerflow.
- Bewaartermijnen per gegevenstype.
- Datalek- en auditrapportage voor klantadmins.
- Security dashboard voor verdachte activiteit.

## Testdekking en kwaliteit

### Aanwezig

Er zijn tests voor onder andere:

- Role home routing.
- Invoice payments en PDF.
- Payment return.
- CBR readiness.
- Exam signals en candidates.
- Planning board validation.
- Planning queue validation.
- Planning core validation.
- Parent portal visibility.

### Gedeeltelijk aanwezig

- Unit- en domeintests bestaan voor belangrijke onderdelen.
- De smart-booking fases vragen meer integratie- en edge-case tests.
- Responsive/pixel-perfect kwaliteit is niet automatisch geborgd.

### Ontbreekt of verdient vervolg

- Playwright tests voor leerling, instructeur en backoffice op mobile/tablet/desktop.
- Visual regression snapshots voor kernschermen.
- End-to-end tests op lead tot rijbewijs, leskaartpublicatie, betaling, annuleren/herplannen en slot recovery.
- Migration smoke-test in CI.

## Prioriteitenadvies

### Prioriteit 1: productpad zonder demo of "binnenkort"

Controleer alle productiepagina's op fallbackdata, demo-inhoud en tijdelijke teksten. Vooral student payments, previewcomponenten en oudere redesigncomponenten moeten geen demo-verwachting wekken.

### Prioriteit 2: planning en smart booking testhard maken

De meeste planningfunctionaliteit is aanwezig. Nu is betrouwbaarheid het belangrijkste: hold expiry, race conditions, branch-scope, voertuigconflicten, instructeurbeschikbaarheid, annuleringen, recovery en DST/datumtijd.

### Prioriteit 3: RIS inhoudelijk valideren

De techniek is aanwezig. Laat de taxonomie, scriptnamen, tooltips, scorebetekenis en rapportageteksten valideren door een RIS/domeinexpert.

### Prioriteit 4: finance/student payments recht trekken

Maak alle betaalroutes consistent: wat kan een leerling doen, wat kan een ouder doen, wat ziet admin, hoe wordt Mollie gebruikt en welke status hoort daarbij.

### Prioriteit 5: franchise UX naar dagelijks sturen brengen

De command-flow bestaat. Maak elke franchiseactie dagelijks bruikbaar: signalen openen, owner kiezen, actie accepteren, voortgang bewaken, afronden en auditen.

### Prioriteit 6: AVG tooling klantklaar maken

Maak privacybeheer zichtbaar en bruikbaar: export, anonimiseren, bewaartermijnen en auditrapportage.

### Prioriteit 7: visuele regressie toevoegen

Omdat pixel-perfect styling belangrijk is voor NXTDRIVE, moeten kernschermen automatisch worden bewaakt:

- Student home, agenda, progress, payments.
- Instructor cockpit, agenda, messages, evaluations.
- Tenant dashboard, planning board, students, finance.
- Franchise cockpit.

## Eigen productideeen

### 1. Rijschool Gezondheidsscore

Een eenvoudige score voor admins die combineert: bezetting, open taken, bijna-geen-tegoed leerlingen, no-shows, proeflesconversie, examengereedheid, open facturen en CBR-risico's. Niet als rapport, maar als dagelijkse actielijst.

### 2. Leerling "volgende beste actie"

Elke leerling krijgt een duidelijke next best action: les plannen, theorie oefenen, tegoed opwaarderen, document uploaden, reflectie invullen, examendatum voorbereiden of instructeur vragen stellen.

### 3. Planner uitlegmodus

Bij elk voorgesteld tijdslot toont NXTDRIVE waarom het slot goed is: beschikbaarheid, rayon, reistijd, voertuig, instructeur, leerlingvoorkeur, capaciteit en risico.

### 4. RIS-coach voor instructeurs

Na elke leskaart toont NXTDRIVE een korte didactische suggestie: welk script blijft achter, wat is het volgende haalbare doel en welke zin kan de instructeur gebruiken richting leerling.

### 5. Finance assistent

Een rustige assistent die per dag aangeeft: deze leerlingen hebben bijna geen tegoed, deze facturen lopen risico, deze pakketten passen beter, deze betalingen missen opvolging.

### 6. Franchise playbook runner

Franchise admin kiest een playbook, bijvoorbeeld "Proeflesconversie verhogen". Het systeem maakt targets, taken, templates, meetpunten en lokale acknowledgements aan.

### 7. Klant onboarding cockpit

Voor nieuwe rijscholen: checklist met branding, vestigingen, instructeurs, voertuigen, pakketten, rollen, intake, planningregels, factuurinstellingen en notificaties.

## Conclusie

NXTDRIVE is functioneel breed en staat dicht bij de canon. Het product heeft de belangrijkste pijlers: SaaS-fundament, planning, leerling/instructeur PWA, RIS, finance, taken, franchise, smart booking en theming. De grootste stap vooruit zit nu in producthardheid: consistente productieflows, minder tijdelijke tekst, betere testdekking, AVG tooling, officiele externe koppelingen en meetbare responsive kwaliteit.

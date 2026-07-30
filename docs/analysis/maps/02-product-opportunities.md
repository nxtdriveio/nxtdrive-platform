# Productkansen voor locaties, kaarten en routing

Status: beslisvoorstel, geen implementatie  
Peildatum: 30 juli 2026  
Scope: instructeursapp, planning/backoffice, leerlingapp, examens, vestigingen, voertuigen, werkgebieden en managementinformatie

## Besluit in één oogopslag

NXTDRIVE heeft al bruikbare bouwstenen voor locatie-invoer en route-inschatting, maar nog geen samenhangend locatieproduct. Adressen staan verspreid als vrije tekst, Place ID of coördinaten; het planbord ontvangt zelfs geen locatievelden. Daardoor is een grote kaart of optimalisatie nu vooral een visualisatie van onbetrouwbare input.

De aanbevolen volgorde is:

1. maak één tenant-scoped locatiecontract en herstelworkflow;
2. maak het standaard ophaalpunt en de afwijking per afspraak expliciet;
3. voeg voor instructeur en leerling externe navigatie naar een gepubliceerde locatie toe;
4. voeg een dagkaart toe als werkmodus van het bestaande planbord;
5. laat dezelfde centrale planningpreview reistijdconflicten bewaken;
6. pilot daarna pas kandidaatvergelijking en volgordevoorstellen;
7. behandel live GPS, aankomstdetectie en lesroute-opname als afzonderlijke privacyproducten.

Live tracking is dus geen voorwaarde voor de eerste kaart-, navigatie- of planningsfasen.

## Feitelijke productbasis in de repository

| Gebied                | Wat bestaat                                                                                                                                                                                                                                     | Productbeperking                                                                                            |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Locatiecatalogus      | `public.locations` heeft tenant, naam en vrij adres (`supabase/migrations/0032_lesson_context.sql:69-103`).                                                                                                                                     | Geen centraal genormaliseerd adrescontract of verplichte coördinaten.                                       |
| Lessen en proeflessen | Lessen kregen `location_lat`, `location_lng` en `location_place_id`; proeflessen ook route-uitkomsten (`supabase/migrations/0039_route_intelligence.sql:61-132`).                                                                               | Niet alle afspraaktypen gebruiken dit contract en de route-uitkomst dekt alleen de proeflesflow.            |
| Adresinvoer           | Een Places-autocomplete met vrije-invoerfallback bestaat (`artifacts/nxtdrive/components/places-autocomplete.tsx:3-79`).                                                                                                                        | De component gebruikt de oudere widget en is niet de standaard voor leerling, vestiging of agenda-afspraak. |
| Routing               | De proeflesflow combineert Haversine en Google Route Matrix, met timeout en fallback (`artifacts/nxtdrive/lib/trial-lessons/route.ts:1-12`, `artifacts/nxtdrive/lib/trial-lessons/route.ts:91-200`).                                            | De cache is proceslokaal en de dienst is nog geen gedeelde bron voor planbordvalidatie.                     |
| Kleine kaart          | Proeflesdetails kunnen een ophaalpunt en omliggende afspraken tonen (`artifacts/nxtdrive/components/trial-route-map.tsx:47-187`).                                                                                                               | Dit is geen dagkaart, routevolgorde of algemene kaartinfrastructuur.                                        |
| Leerlingadres         | Profiel en directe invoer hebben losse tekstvelden voor adres, woonplaats en ophaaladres (`supabase/migrations/20260729150100_student_profile_contact_fields.sql:1-20`, `artifacts/nxtdrive/components/students/AddStudentDialog.tsx:230-330`). | De default “ophaaladres = woonadres” is tekstkopie, geen relatie naar een versieerbare locatie.             |
| Instructeursapp       | Dagafspraken bevatten alleen een tekstuele `location` (`artifacts/nxtdrive/android/app/src/main/java/io/nxtdrive/instructeur/core/model/InstructorModels.kt:36-46`).                                                                            | Geen coördinaten, Place ID, navigatiestatus of locatiekwaliteit in het mobiele contract.                    |
| Planbord              | De loader haalt tijd, resource en service area op (`artifacts/nxtdrive/lib/planning-board/service.ts:188-228`) en de eventtypes hebben geen locatie (`artifacts/nxtdrive/lib/planning-board/types.ts:53-75`).                                   | De huidige werkruimte kan geen betrouwbare markers of ritbenen opbouwen.                                    |
| Werkgebieden          | Service areas, zones en een handmatige reistijdmatrix bestaan (`supabase/migrations/0117_planning_core_schema_foundation.sql:233-350`).                                                                                                         | Zones zijn beschrijvend; er is geen geometrie of punt-in-gebiedmodel.                                       |
| Planningvalidatie     | Reistijd wordt nu via service-area-matrix gecontroleerd (`artifacts/nxtdrive/lib/planning-core/validation.ts:404-500`).                                                                                                                         | De uitkomst is grof en kan een concrete deur-tot-deurverplaatsing niet bewijzen.                            |

Dit ondersteunt een incrementele route: bestaande flows blijven functioneren terwijl locaties stap voor stap betrouwbaar genoeg worden voor kaarten en routebeslissingen.

## Vier locatiebegrippen die niet door elkaar mogen lopen

| Begrip                       | Definitie                                                                                                                                      | Huidige status                                                                                                                                             | Mag de dagkaart dit tonen?                                                            |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| **Geplande locatie**         | Het gepubliceerde ophaal-, afzet-, examen-, vestigings- of afspraakpunt met adres en optioneel coördinaten.                                    | Bestaat gefragmenteerd als tekst, catalogusrecord of velden op een afspraak.                                                                               | Ja. Dit is de primaire bron.                                                          |
| **Laatst bekende appstatus** | Laatste succesvolle synchronisatie, API-heartbeat of functionele status van de instructeursapp. Dit bevat zonder GPS-toestemming geen positie. | Applicatiestatus kan bestaan, maar er is geen locatiecontract voor.                                                                                        | Alleen als tekstuele online/sync-indicatie; nooit als marker.                         |
| **Actieve navigatie**        | Een tijdelijke, door de gebruiker gestarte rit naar een bestemming, doorgaans in een externe navigatie-app.                                    | Er is geen actieve navigatiesessie in NXTDRIVE.                                                                                                            | Hooguit status “navigatie geopend” als dat later nuttig blijkt; geen voertuigpositie. |
| **Live GPS-locatie**         | Een actuele coördinatenstroom van het toestel of voertuig.                                                                                     | Afwezig. Het Android-manifest vraagt alleen internettoegang en geen locatiepermissie (`artifacts/nxtdrive/android/app/src/main/AndroidManifest.xml:1-17`). | Nee, niet in fase 0–3. Alleen na apart privacy- en arbeidsrechtelijk besluit.         |

Een vijfde begrip, **opgenomen lesroute**, is historische bewegingsdata. Die is niet hetzelfde als live GPS en niet nodig voor routeplanning. Ook daarvoor bestaat nu geen product- of gegevenscontract.

De UI moet daarom consequent spreken over “gepland adres”, “berekende reistijd” en “laatst berekend om …”. Woorden als “hier”, “actueel voertuig” of “instructeur bevindt zich” zijn zonder live bron misleidend.

## Instructeursapp

De canon positioneert de instructeursapp als dagcockpit op tablet, met een daglijst links en details rechts (`docs/NXTDRIVE_PWA_CANON.md:320-370`). Locatie staat al in Vandaag en lesdetail, maar de snelle acties bevatten nog geen navigatie (`docs/NXTDRIVE_PWA_CANON.md:390-438`). De native app volgt hetzelfde patroon: vijf hoofdbestemmingen en tekstlocaties op afspraakkaarten (`artifacts/nxtdrive/android/app/src/main/java/io/nxtdrive/instructeur/ui/InstructorApp.kt:117-129`, `artifacts/nxtdrive/android/app/src/main/java/io/nxtdrive/instructeur/ui/InstructorApp.kt:890-945`).

| Kans                                     | Gewenste gebruikersflow                                                                                           | Productadvies                                                                                                                              |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Volgende locatie (`MAP-20`)              | Bovenaan staat tijd, leerling/context, bevestigd adres, locatietype en eventuele afwijking van het standaardpunt. | **Nu bouwen** zodra het mobiele contract een genormaliseerde bestemming levert. De tekstuele fallback blijft bruikbaar.                    |
| Externe navigatie (`MAP-21`)             | “Navigeer” opent een deeplink met coördinaten of veilig gecodeerd adres. NXTDRIVE bewaart geen GPS-spoor.         | **Nu bouwen**. Dit levert directe waarde zonder Navigation SDK.                                                                            |
| Keuze navigatie-app (`MAP-22`)           | Eerste keer kiest de instructeur een aanwezige app; voorkeur is per apparaat wijzigbaar.                          | **Later**. Begin met een systeemchooser waar het platform dat betrouwbaar ondersteunt.                                                     |
| Dagroutekaart (`MAP-23`)                 | Read-only kaart met genummerde geplande stops; lijst en kaartselectie blijven gesynchroniseerd.                   | **Pilot** na locatiekwaliteit. De gepubliceerde agenda blijft de bron van volgorde.                                                        |
| Reistijd en verkeer (`MAP-24`, `MAP-25`) | Toon benodigde verplaatsing naar de volgende afspraak, buffer, bronstatus en berekentijd.                         | **Pilot/later**. Geen rood “te laat” op basis van verouderde of onbekende verkeersdata.                                                    |
| Offline locatie (`MAP-26`)               | De laatst gesynchroniseerde eigen afspraken houden adres en navigatiedoel beschikbaar.                            | **Voorbereiden** binnen de bestaande offline scope (`docs/NXTDRIVE_PWA_CANON.md:569-596`). Cache geen kaarttiles of ruwe providerpayloads. |
| Aankomstregistratie (`MAP-27`)           | Instructeur tikt desgewenst handmatig “aangekomen”.                                                               | **Later**. Geen impliciete geofence in dezelfde feature.                                                                                   |
| Live locatie (`MAP-28`)                  | Alleen tijdens een expliciete werkrit, zichtbaar doel, uit buiten werktijd en korte bewaartermijn.                | **Niet nu; privacyreview verplicht**. Het is geen dependency voor de dagkaart.                                                             |
| Interne turn-by-turn (`MAP-29`)          | NXTDRIVE zou zelf gesproken navigatie en verkeersveiligheids-UX leveren.                                          | **Afwijzen voor huidige richting**. Externe navigatie lost de kernbehoefte op met veel lagere risico- en supportlast.                      |

### Sneller een leerling toevoegen

De native instructeursflow vraagt veel losse adresvelden (`artifacts/nxtdrive/android/app/src/main/java/io/nxtdrive/instructeur/ui/InstructorApp.kt:1021-1140`). Voor “leerling snel toevoegen” is een progressieve flow geschikter:

1. naam en minimaal één contactmogelijkheid;
2. standaard ophaalpunt via zoekveld met handmatige fallback;
3. optioneel “zelfde als woonadres” of “woonadres later aanvullen”;
4. backoffice-taak voor ontbrekende administratieve gegevens.

Een instructeur hoeft dus niet eerst een compleet woonadres te administreren om een operationeel ophaalpunt vast te leggen. E-mail blijft optioneel zoals in de bestaande directe invoer (`artifacts/nxtdrive/components/students/AddStudentDialog.tsx:115-123`).

## Planning en backoffice

Het bestaande planbord is al de juiste operationele werkruimte. Het ondersteunt perspectieven per instructeur, vestiging, voertuig, examen en proefles (`artifacts/nxtdrive/app/backoffice/planning-board/planning-board-workspace.tsx:298-417`), plus filters, drag-preview en conflictfeedback (`artifacts/nxtdrive/app/backoffice/planning-board/planning-board-workspace.tsx:959-1018`, `artifacts/nxtdrive/app/backoffice/planning-board/planning-board-workspace.tsx:1304-1451`). De kaart hoort daarom daarbinnen en niet als nieuw hoofdproduct.

| Kans                                       | Beslissing                                                                                                                               | Belangrijke grens                                                                                     |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Dagkaart (`MAP-30`)                        | **Pilot** als operationele dagweergave met stops, routebenen, uitzonderingen en filters.                                                 | Toont geplande locaties en berekende routes, niet de actuele positie van medewerkers.                 |
| Planbord met kaart (`MAP-31`)              | **Bouwen** als kaartwerkmodus/tab onder `/backoffice/planning-board`, bij voorkeur deep-linkbaar als `/backoffice/planning-board/kaart`. | Geen apart hoofdmenu-item en geen tweede planningbron.                                                |
| Reistijdconflict (`MAP-32`)                | **Bouwen** in dezelfde preview én commitcontrole als andere planningregels.                                                              | Controleer vorige→kandidaat en kandidaat→volgende; “onbekend” is een waarschuwing, niet stil akkoord. |
| Route Matrix (`MAP-33`)                    | **Foundation** als serverdienst met batching, korte toegestane cache, metering, fallback en herleidbare berekentijd.                     | Geen directe Google-aanroep vanuit elk scherm.                                                        |
| Beste instructeur (`MAP-34`)               | **Pilot** als uitlegbare rangschikking van reeds bevoegde, beschikbare kandidaten.                                                       | Marginale reistijd is één scorefactor; planner beslist.                                               |
| Beste voertuig/vestiging (`MAP-35`)        | **Later** na betrouwbare voertuigstandplaats en vestigingslocaties.                                                                      | “Dichtstbij” mag capability, onderhoud, beschikbaarheid en branchbeleid nooit omzeilen.               |
| Volgordeoptimalisatie (`MAP-36`)           | **Pilot** voor flexibele, nog niet gepubliceerde afspraken van één instructeur.                                                          | Respecteer tijdvensters, pauzes, start/eindpunt en continuïteit. Geen stille herschikking.            |
| Multi-instructeuroptimalisatie (`MAP-37`)  | **Later**.                                                                                                                               | Eerst stabiele planningskernel en bewijs uit een één-instructeurpilot.                                |
| Heroptimalisatie bij annulering (`MAP-38`) | **Later** als scenario met gevolgen en expliciete bevestiging.                                                                           | Geen cascade van leerlingwijzigingen of notificaties zonder plannerbesluit.                           |
| Adresuitzonderingen (`MAP-39`)             | **Nu bouwen** als herstelbak met eigenaar en reden.                                                                                      | Alleen blokkeren wanneer een routeafhankelijke handeling echt niet veilig kan doorgaan.               |

De huidige planningskernel heeft wel een service-area-matrix, maar kandidaatobjecten bevatten alleen `pickupServiceAreaId` en geen concrete locatie (`artifacts/nxtdrive/lib/planning-core/types.ts:81-101`). De route-integratie moet dus de bestaande centrale beslisgrens versterken, niet een tweede validator naast het planbord creëren.

Cross-cutting securitygate: de huidige NXTDRIVE-CSP verbiedt permanent `unsafe-eval`, terwijl de actuele officiële Maps JavaScript strict-CSP-configuratie dit vereist. De productvoorkeur voor MAP-31 blijft staan, maar productieactivatie is daarom een **pilot na expliciet ADR-/threat-modelbesluit**; zie `09-security-architecture.md`. Een globale CSP-verruiming is geen impliciet onderdeel van dit productadvies.

### Voorstel “beste instructeur”

De rangschikking mag pas starten nadat harde eisen zijn toegepast:

1. bevoegdheid, beschikbaarheid en tenant/vestigingsscope;
2. voertuig- en transmissievereisten;
3. bestaande publicatie- en continuïteitsregels;
4. reistijd naar en van de kandidaat;
5. uitlegbare zachte factoren, zoals leerlingcontinuïteit en resterende dagbuffer.

De planner ziet bijvoorbeeld: “+12 min marginale reistijd, 25 min buffer over, vaste instructeur van leerling”. Er komt geen verborgen locatiescore of automatische personeelsbeslissing.

## Leerlingapp

De canon houdt de leerlingervaring bewust eenvoudig: volgende les, ophaallocatie en lesoverzicht (`docs/NXTDRIVE_PWA_CANON.md:154-201`). De huidige lesdetailpagina toont een locatie, maar “Bekijk route” verwijst terug naar de lessenlijst en opent geen route (`artifacts/nxtdrive/app/student/agenda/[lessonId]/page.tsx:37-49`, `artifacts/nxtdrive/app/student/agenda/[lessonId]/page.tsx:82-89`).

Aanbevolen flow:

1. na publicatie ziet de leerling het bevestigde ophaalpunt, type (“thuis”, “school”, “eenmalig”) en een compacte kaartpreview (`MAP-15`);
2. “Open route” start externe navigatie naar het eigen gepubliceerde punt;
3. “Klopt niet” maakt een wijzigingsvoorstel (`MAP-14`) en verandert de planning niet direct;
4. de planner beoordeelt het voorstel, waarna route- en conflictcontrole opnieuw lopen;
5. pas na bevestiging wordt de nieuwe locatie gepubliceerd.

Zichtbaarheidsregels:

- conceptlocaties en interne standplaatsen zijn niet zichtbaar;
- de leerling ziet uitsluitend locaties die bij de eigen afspraak horen;
- locatie van andere leerlingen mag nooit via een dagroute of ETA lekken;
- route- en vertrekadvies verschijnt alleen voor een bevestigde/gepubliceerde afspraak;
- het eigen geplande adres mag binnen de bestaande offline scope beschikbaar blijven;
- een toekomstige status “instructeur onderweg” toont hooguit een beperkte ETA, nooit een rauwe GPS-marker of historisch spoor;
- een ETA/live-status vereist een afzonderlijke privacyreview, expliciete activering per rit en een kort zichtbaarheidsvenster.

Bij zelf boeken voert de student nu vrije tekst in en worden coördinaten/Place ID bewust `null` opgeslagen (`artifacts/nxtdrive/app/student/actions.ts:224`, `artifacts/nxtdrive/app/student/actions.ts:276-279`). Die flow moet uiteindelijk hetzelfde locatiecontract en dezelfde handmatige fallback gebruiken als de backoffice.

## Examens, tussentijdse toetsen en moduletoetsen

Agenda-afspraken gebruiken een vrij tekstveld voor examenlocatie (`artifacts/nxtdrive/components/agenda/AppointmentForm.tsx:315-336`). Examenvoorbereiding bewaart daarnaast een tekstueel ophaalpunt (`supabase/migrations/0069_exam_preparation.sql:42-61`). De leerling ziet beide gegevens, maar krijgt nog geen routeactie (`artifacts/nxtdrive/components/student/ExamPrepCard.tsx:81-117`).

Aanbevolen productmodel:

- een gecontroleerde, providerneutrale CBR-locatiecatalogus met officiële naam, bevestigd adres, ingang/afspreekpunt, bron, geldigheid en handmatige correctie (`MAP-60`);
- een examen verwijst naar zo'n locatie, maar bewaart een publicatiesnapshot zodat een cataloguswijziging een bestaand examen niet stil verandert;
- “Open route” voor kandidaat en instructeur (`MAP-61`);
- configureerbare aankomstbuffer en vertrekadvies voor gepubliceerde examens (`MAP-62`);
- examenlogistiek met instructeur, voertuig, kandidaat, branch en buffer pas nadat de planningskernel routebenen betrouwbaar beoordeelt (`MAP-63`);
- geen scraping van ongedocumenteerde CBR-bronnen en geen product rond vermeende examenroutes (`MAP-46`).

RIS-moduletoetsen hebben tijd, resultaat, instructeur en CBR-referentie, maar geen locatie (`supabase/migrations/20260616104647_ris_lesson_card_foundation.sql:387-407`). Trainingsbeoordelingen hebben eveneens tijd en assessor, niet de operationele locatie (`supabase/migrations/20260729143000_training_readiness_assessment_foundation.sql:747-796`). De locatie hoort daarom bij de geplande afspraak of lescontext; het pedagogische resultaat verwijst daarnaar en hoeft geen tweede vrije adresbron te worden.

## Vestigingen, voertuigen en werkgebieden

Vestigingen hebben nu vrije tekst voor adres en plaats (`supabase/migrations/0091_branches.sql:46-65`), terwijl voertuigen wel branch, standaardinstructeur en status hebben, maar geen standplaats (`supabase/migrations/20260615213219_vehicle_constraints_planning_core.sql:64-140`).

Aanbevolen modellering:

- **vestiging:** verplichte verwijzing naar een gevalideerde locatie, plus optioneel afzonderlijke ontvangst- en voertuiguitgiftepunten;
- **voertuig:** optionele operationele standplaats of “volgt vorige geplande afspraak”; dit is géén live GPS;
- **instructeur:** optioneel start- en eindpunt voor een specifieke planningsdag, met passende zichtbaarheid;
- **werkgebied:** begin met de bestaande stad-, wijk- en postcodeprefixzones en visualiseer die grof;
- **polygonen:** pas toevoegen als selectie of tariefregels aantoonbaar niet met bestaande zones kunnen;
- **reistijdmatrix:** handmatige area-to-area-minuten blijven een verklaarbare fallback wanneer een concrete route ontbreekt.

Een kaart kan zo al vroeg branches, geplande voertuigbasis en vraagdekking tonen zonder een voertuigvolgsysteem te suggereren.

## Management en analytics

De productrichting vraagt geen los analyticsproduct naast de operatie (`docs/SPRINT_9_DASHBOARDS_REPORTING.md:23-32`). Kaart- en route-inzichten horen als managementlaag boven dezelfde planningsdata.

| Inzicht                         | Vereiste bron                                                              | Advies                                                                                                                                                                                                 |
| ------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Werkgebiedkaart (`MAP-50`)      | Branches, service areas en geaggregeerde vraag.                            | **Pilot**; eerst postcode/stad, polygonen later.                                                                                                                                                       |
| Vraagdekking (`MAP-56`)         | Grove postcodegebieden en voldoende grote aantallen.                       | **Pilot** vóór een exacte heatmap.                                                                                                                                                                     |
| Ophaalheatmap (`MAP-51`)        | Geaggregeerde locatiegegevens, minimumgroepsgrootte en beperkte periode.   | **Privacyreview**; geen individuele drill-down.                                                                                                                                                        |
| Lege kilometers (`MAP-52`)      | Betrouwbare opeenvolgende geplande stops, afstand, duur en routekwaliteit. | **Later**. De huidige kandidaatmetric met `route_total_minutes` is onvoldoende om alle lege kilometers te claimen (`supabase/migrations/20260623000939_ai_ready_planning_metrics_phase10.sql:44-100`). |
| Reistijdrapportage (`MAP-53`)   | Versiebeheer van berekende ritbenen en fallbackstatus.                     | **Later**, op team/tenantniveau.                                                                                                                                                                       |
| Vestigingsanalyse (`MAP-54`)    | Genormaliseerde branches, vraag, capaciteit en reistijd.                   | **Later**.                                                                                                                                                                                             |
| Afstandstoeslagzones (`MAP-55`) | Transparante, versieerbare prijsregels en bevestiging vóór boeking.        | **Later**; geen onverklaarbare realtime routeprijs.                                                                                                                                                    |

Bewaar voor analyse bij voorkeur samenvattingen per gepland ritbeen: van/naar-locatiereferentie, afspraaktypen, afstand, duur, berekenmoment, status en gebruikte fallback. Bewaar geen onnodig medewerkerstraject. Gebruik locatie-inzichten niet als verborgen individuele productiviteitsscore.

## Fasen en afhankelijkheden

### Fase 0 — fundament

- `MAP-01`, `MAP-05`, `MAP-09`: centraal locatie- en providercontract, publicatiestatus, kwaliteit en metering;
- migratiestrategie voor bestaande vrije tekst, zonder automatische destructieve merges;
- autorisatie per tenant en per rol;
- expliciete statussen `confirmed`, `manual`, `ambiguous`, `missing` en `stale`;
- audit van handmatige correcties en van publicatiewijzigingen.

### Fase 1 — directe operationele waarde

- `MAP-02`, `MAP-06`, `MAP-10`, `MAP-13`: betrouwbaar adres kiezen en corrigeren;
- `MAP-20`, `MAP-21`: volgende locatie en externe navigatie voor instructeur;
- `MAP-15`: gepubliceerde leerlingpreview en routeactie;
- `MAP-31`, `MAP-39`: kaartwerkmodus achter feature flag en herstelbak voor ontbrekende adressen;
- `MAP-60`, `MAP-61`: CBR-catalogus en route openen.

De kaartpilot start alleen voor afspraken met voldoende locatiekwaliteit. Onbetrouwbare records blijven zichtbaar in de herstelbak.

### Fase 2 — reistijd als planningsregel

- `MAP-32`, `MAP-33`: centrale routebenen in preview en commit;
- `MAP-25`, `MAP-34`: ETA/buffer en beste-instructeurpilot;
- `MAP-62`, `MAP-64`: vertrekadvies en gerichte herinnering;
- `MAP-50`, `MAP-56`: grove operationele dekking.

### Fase 3 — gecontroleerde optimalisatie

- `MAP-36`: één-instructeurvolgorde voor flexibele, ongepubliceerde stops;
- `MAP-38`: annulering als voorstel, niet als automatische mutatie;
- managementanalyses op samengevatte geplande routebenen;
- eventuele polygonen alleen na bewezen gebruikersprobleem.

### Fase 4 — afzonderlijk privacyprogramma

- `MAP-28`: live GPS;
- `MAP-27`: automatische aankomstdetectie;
- `MAP-40` en `MAP-41`: lesroute opnemen en terugkijken;
- iedere ETA die wordt afgeleid van een actuele medewerkerspositie.

Deze fase vereist onder meer doelbinding, proportionaliteit, DPIA-indicatie, arbeidsrechtelijke en eventuele medezeggenschapsbeoordeling, zichtbaarheid voor de medewerker, buiten-werktijdgrens, korte bewaartermijn en technisch afdwingbare verwijdering.

## Productguardrails

- Een ontbrekende route is **onbekend**, niet nul minuten.
- Een rechte lijn tussen markers is geen rijroute en wordt niet zo vormgegeven.
- Een cataloguswijziging overschrijft geen gepubliceerde afspraak zonder expliciete actie.
- Een leerlingvoorstel wijzigt de planning niet voordat een bevoegde gebruiker bevestigt.
- Een kaart is nooit de enige manier om locatie- of conflictinformatie te begrijpen.
- Kleuren zijn niet de enige drager van instructeur, status of ernst.
- Providerstoringen blokkeren bestaande afspraken niet; tekst, handmatige invoer en area-matrix blijven fallback.
- Routeoptimalisatie publiceert of communiceert nooit autonoom.
- Geen exact locatie-inzicht voor management wanneer aggregatie het productdoel volstaat.

## Meetbare productuitkomsten

Voor de eerste twee fasen zijn dit betere succesmaten dan “aantal kaartweergaven”:

- aandeel toekomstige afspraken met een bevestigde of handmatig bevestigde locatie;
- aandeel adresuitzonderingen dat vóór publicatie is hersteld;
- tijd van “volgende afspraak openen” tot externe navigatie;
- aantal reistijdconflicten ontdekt vóór commit versus na publicatie;
- percentage routeberekeningen met verse provideruitkomst, handmatige matrixfallback en onbekende status;
- aantal leerlingwijzigingsvoorstellen dat zonder stille planningsmutatie is afgehandeld;
- routekosten per tenant, afspraaktype en succesvolle planningsbeslissing;
- punctualiteitsverbetering bij examens zonder live tracking.

Niet als succesmaat gebruiken: permanent verzamelde GPS-punten, individueel gereden kilometers of een ranglijst van instructeurs op basis van locatiegedrag.

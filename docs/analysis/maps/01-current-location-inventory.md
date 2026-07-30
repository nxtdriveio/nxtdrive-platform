# 01 — Huidige locatie-inventaris

Status: analyse, geen implementatie

Peildatum repository: 2026-07-30

Scope: `artifacts/nxtdrive`, `supabase/migrations`, gedeelde libraries, API- en native-mobilecontracten

## Onderzoeksmethode en zoekdekking

De volledige versiebeheerbare repository is doorzocht, met uitsluiting van gegenereerde dependencies/buildoutput (`node_modules`, `.next`, `dist`, `.git`) en release-artefacten die geen bron van waarheid zijn. De verplichte termen zijn hoofdletterongevoelig afzonderlijk en in combinaties doorzocht:

```text
address, adres, street, straat, house_number, huisnummer,
postal_code, postcode, city, plaats, location, locatie,
pickup, ophalen, dropoff, afzetten, branch, vestiging,
exam, examen, CBR, route, distance, afstand, duration, reistijd,
latitude, longitude, lat, lng, geocode, maps, planning, agenda,
lesson, student, instructor, vehicle, availability
```

Ook camelCase- en provider-/domeinvarianten zoals `placeId`, `pickupAddress`, `locationLat`, `serviceArea`, `routeTravel*`, `startsAt`/`endsAt` en Nederlandse formulierlabels zijn meegenomen. Algemene woorden als `student`, `lesson`, `planning`, `route` en `location` leveren veel navigatie-, documentatie- en UI-copyhits op; die zijn getrieerd op materiële opslag, type, formulier, API/RPC, service, import/export, UI-route, validatie of autorisatie. De tabellen hieronder groeperen alle materiële vindplaatsen per broncontract; ze herhalen niet iedere ongerelateerde tekstlabel- of testfixturehit.

## Samenvatting

NXTDRIVE heeft al locatiefunctionaliteit, maar nog geen eenduidig locatiemodel. De data valt nu in vier groepen uiteen:

1. **Relatief stabiele profiel- of stamdata**: leerlingadres, standaard ophaaladres, vestigingsadres en de bestaande `locations`-catalogus.
2. **Operationele snapshots**: locatie op een les, proefles, agenda-afspraak, booking request/candidate, herbezettingsuitnodiging of examendetail.
3. **Geografische planningsindeling**: rayons/service areas en handmatig ingestelde reistijden.
4. **Providerdata**: Google Place ID, formatted address en coördinaten op een beperkt aantal intake-, les- en proeflesrecords.

Deze groepen mogen niet als onderling uitwisselbaar worden behandeld. Een leerlingadres kan veranderen, terwijl het adres waarop een historische les plaatsvond onveranderd moet blijven. Een rayon is een gebiedsclassificatie en geen puntlocatie. Een Google Place ID is providerprovenance en geen eigen businessidentiteit.

De grootste concrete problemen zijn:

- hetzelfde ophaaladres staat op meerdere tabellen zonder stabiele relatie;
- slechts enkele webflows gebruiken Places, terwijl backoffice-, student- en native flows vrije tekst blijven;
- leadconversie neemt de gestructureerde intake- en ophaalgegevens niet mee naar de leerling;
- de leerlingcockpit leest legacy-notities in plaats van de huidige gestructureerde leerlingkolommen;
- types lopen achter op de SQL-kolommen;
- privacy-export en anonimisering dekken bestaande adresvelden niet volledig;
- de planningskernel gebruikt service-area-schattingen en krijgt geen begin- en eindcoördinaten.

## Bron van waarheid

De geordende SQL-bestanden in `supabase/migrations` zijn de feitelijke bron van waarheid voor het databaseschema en de RPC-contracten. `lib/db/src/schema/index.ts:1-20` bevat alleen voorbeeldcommentaar en `export {}`; er is dus geen ingevuld Drizzle-schema waaruit de actuele database veilig kan worden afgeleid.

De TypeScript-typen zijn handgeschreven projecties. Ze zijn nuttig voor callers, maar niet schema-authoritatief. Twee zichtbare driftgevallen:

- `artifacts/nxtdrive/lib/lessons/types.ts:41-71` kent `lessons.location_lat`, `location_lng` en `location_place_id` niet, hoewel die in `supabase/migrations/0039_route_intelligence.sql:64-82` bestaan.
- `artifacts/nxtdrive/lib/leads/types.ts:359-387` kent de structured city/pickup Place- en coördinaatvelden van `lead_intake_details` niet, hoewel die in `0039_route_intelligence.sql:28-54` en `0043_intake_city_structured.sql:20-39` bestaan.

Voor een toekomstige wijziging moeten daarom steeds zowel de **laatste herdefinitie van iedere RPC** als alle app- en native-callers worden geïnventariseerd. Een oudere migratie is niet automatisch de actuele functie.

## Inventaris per domein

### 1. Leerlingen en contactprofiel

| Opslag / surface        | Huidige velden en gedrag                                                                                                                                                                                                             | Huidige autoriteit                          | Hiaten en duplicatie                                                                                                                                                                                                                                                  |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `students`              | `postcode` is sinds `supabase/migrations/0011_students.sql:6-19` vrije tekst. `birth_date`, `address_line`, `city` en `pickup_address` zijn toegevoegd in `20260729150100_student_profile_contact_fields.sql:5-20`.                  | Huidige leerlingprofieldata.                | Geen land, huisnummercomponenten, coördinaten, validatiestatus, bron of providerreferentie. Alleen lengtelimieten.                                                                                                                                                    |
| Contactprofiel-RPC      | `update_student_contact_profile` trimt tekst en zet postcode in uppercase (`20260729150100_student_profile_contact_fields.sql:22-80`).                                                                                               | Mutatiepad voor bestaand backofficeprofiel. | Geen adres- of postcodesemantiek; een willekeurige tekst binnen de maximale lengte is geldig.                                                                                                                                                                         |
| Backoffice toevoegen    | `createStudentDirect` leest postcode/adres/woonplaats/ophaaladres (`artifacts/nxtdrive/app/backoffice/leerlingen/actions.ts:65-145`) en schrijft ze direct naar `students`, met `pickup_address = ophaaladres                        |                                             | adres` (`:227-242`).                                                                                                                                                                                                                                                  | Directe leerlingcreatie. | Geen canonical location, Place ID of coördinaten. `buildDirectStudentNawNotes` wordt nog aangeroepen, maar het resultaat wordt niet opgeslagen; `notes` is expliciet `null`. |
| Backoffice UI           | Toevoegen gebruikt gewone inputs (`artifacts/nxtdrive/components/students/AddStudentDialog.tsx:241-249` en `:276-330`). Bewerken gebruikt gewone inputs (`artifacts/nxtdrive/components/students/StudentProfileEditor.tsx:119-155`). | Gebruikersinvoer.                           | Geen autocomplete/validatie en geen onderscheid tussen gecontroleerd en handmatig adres.                                                                                                                                                                              |
| Validatie               | `parseStudentContactProfileInput` trimt en limiteert (`artifacts/nxtdrive/lib/students/profile-edit.ts:19-40`); alleen e-mail en geboortedatum krijgen inhoudelijke validatie (`:42-48`).                                            | App-validatie.                              | Postcode, woonplaats en adressen zijn niet inhoudelijk gevalideerd.                                                                                                                                                                                                   |
| Native instructeursflow | `NativeStudentInput` heeft dezelfde vrije tekstvelden (`artifacts/nxtdrive/lib/mobile/instructor-students.ts:17-29`), trimt ze (`:49-68`) en schrijft dezelfde `students`-kolommen (`:187-202`).                                     | Native leerlingcreatie.                     | Geen providerdata of coördinaten; mobiel en web kunnen verschillende tekstvarianten vastleggen.                                                                                                                                                                       |
| Cockpitweergave         | `buildNaw` leest intakegegevens en parseert anders `student.notes` (`artifacts/nxtdrive/components/students/StudentCentralCockpit.tsx:564-584`).                                                                                     | Feitelijk huidige UI-projectie.             | Leest **niet** `student.address_line`, `student.city`, `student.pickup_address` of `birth_date`. Een direct aangemaakte of bewerkte leerling kan daardoor lege of verouderde NAW tonen. De legacy helper staat nog in `app/backoffice/leerlingen/actions.ts:914-934`. |

Er zijn geen afzonderlijke modellen gevonden voor correspondentieadres, factuuradres, voogdadres, schooladres of werkadres. `organization_profiles` bevat juridische naam, factuur/support-e-mail en KvK-/btw-gegevens, maar geen organisatieadres (`supabase/migrations/0098_organization_profiles.sql:20-39`).

Er is in de onderzochte applicatie-, migration- en scriptpaden geen leerling-/lead-CSV-adresimport gevonden. De bestaande klantenexport selecteert alleen naam, e-mail, telefoon, postcode, actief en aanmaakdatum (`artifacts/nxtdrive/app/backoffice/boekhouding/export/klanten/route.ts:18-50`); de volledige woon- en pickupvelden gaan niet mee.

**Conclusie:** `students` is nu de bron voor het actuele woon- en standaardophaaldeel van een leerling, maar de cockpit gebruikt die bron niet consequent. Woonadres en ophaaladres zijn tekstkopieën; wanneer ze gelijk zijn is er geen gedeelde identiteit.

### 2. Leads en openbare intake

| Opslag / surface           | Huidige velden en gedrag                                                                                                                                                                                                                                                                           | Huidige autoriteit                                 | Hiaten en duplicatie                                                                                                                                                                |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `leads` basis              | `postcode` is vrije tekst (`supabase/migrations/0007_leads.sql:29-42`).                                                                                                                                                                                                                            | Basis lead/contact.                                | Geen oorspronkelijk volledig adres.                                                                                                                                                 |
| `lead_intake_details`      | `city` en `pickup_location` zijn vrije tekst (`0035_lead_intake_details.sql:36-82`). Pickup kreeg lat/lng, Place ID en formatted address (`0039_route_intelligence.sql:28-59`); city kreeg lat/lng en Place ID (`0043_intake_city_structured.sql:20-39`).                                          | Inhoudelijke bron voor intakeantwoorden.           | City heeft geen apart formatted address. Provider is impliciet Google en niet opgeslagen.                                                                                           |
| `leads` dashboardprojectie | Denormaliseert city en pickup naar `leads.city`, `pickup_address`, `pickup_place_id`, `pickup_lat/lng`; `assigned_location_id` is een onbegrensde UUID (`0040_lead_dashboard.sql:88-127`).                                                                                                         | Zoek-/filterprojectie, geen nieuwe businessbron.   | Geen FK op `assigned_location_id`. Duplicatie kan afwijken als sync niet wordt uitgevoerd.                                                                                          |
| Projectiesync              | `sync_lead_from_intake` kopieert structured intake naar `leads` (`0040_lead_dashboard.sql:171-205`).                                                                                                                                                                                               | Expliciete projectieactie.                         | Geen trigger/automatische bronbinding zichtbaar in deze definitie; herstel vereist reconcile. `neighborhood` krijgt bovendien `pickup_location`, waardoor semantiek vermengd raakt. |
| Intake UI                  | Woonplaats en ophaallocatie gebruiken `PlacesAutocomplete` (`artifacts/nxtdrive/app/intake/[slug]/intake-wizard.tsx:420-480`). Server accepteert Place ID alleen bij een volledig coördinatenpaar (`app/intake/[slug]/actions.ts:200-231`) en schrijft via `create_lead_with_intake` (`:329-368`). | Enige brede invoerflow met structured Places-data. | Typen wist eerder opgeloste coördinaten terecht, maar er is geen aparte Address Validation-stap.                                                                                    |
| Leadconversie              | De actuele `convert_lead_to_student` selecteert alleen `full_name`, `email`, `phone`, `postcode` en schrijft alleen die velden (`supabase/migrations/0041_convert_lead_terminal_state.sql:14-48`).                                                                                                 | Autoritatieve conversie-RPC.                       | Structured city/pickup uit intake en dashboard gaan verloren voor de nieuwe leerling.                                                                                               |

`PlacesAutocomplete` slaat formatted address, Place ID en geometrie op, gebruikt een NL-restrictie en valt terug op vrije tekst (`artifacts/nxtdrive/components/places-autocomplete.tsx:17-23`, `:52-99`). De widget gebruikt `google.maps.places.Autocomplete` (`:57-73`), dus de precieze product-/widgetkeuze moet vóór uitbreiding opnieuw worden getoetst.

**Conclusie:** `lead_intake_details` hoort inhoudelijk leidend te zijn voor intakegegevens; `leads` is een denormaliseerde dashboardprojectie. Conversie doorbreekt deze keten.

### 3. Lessen, proeflessen en agenda

| Entiteit                    | Huidige locatieopslag                                                                                                                                                                                                                                                                  | Gebruik                                                          | Hiaat                                                                                                        |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `lessons`                   | `location text` (`supabase/migrations/0014_lessons.sql:19-34`), optionele `location_id` naar `locations` (`0032_lesson_context.sql:105-112`), lat/lng/Place ID (`0039_route_intelligence.sql:64-86`) en `pickup_service_area_id` (`0117_planning_core_schema_foundation.sql:694-699`). | Afspraak-/ophaallocatiesnapshot en optionele cataloguskoppeling. | `location_id`, tekst en coördinaten kunnen onderling verschillen; geen dropoff, validatiestatus of provider. |
| `trial_lessons`             | Pickup lat/lng/Place ID/formatted address en route-uitkomst (`0039_route_intelligence.sql:89-132`), plus `location_id` en service area (`0117_planning_core_schema_foundation.sql:701-708`).                                                                                           | Proeflessnapshot en routebeoordeling.                            | Dezelfde plaats wordt tevens in intake, lead en booking records gekopieerd.                                  |
| `agenda_appointments`       | `location text` (`0049_agenda_appointments.sql:46-75`), later `location_id`, vehicle en service area (`0117_planning_core_schema_foundation.sql:710-717`).                                                                                                                             | Examen, TTT, theorie, blokkades en overige agenda-items.         | Geen coördinaten/Place ID; één generiek locatieveld kan bestemming, pickup of afspraaklocatie betekenen.     |
| `exam_appointment_details`  | `pickup_location text` (`0069_exam_preparation.sql:44-61`).                                                                                                                                                                                                                            | Examenvoorbereiding naast generieke afspraaklocatie.             | Tweede vrije tekstlocatie zonder referentie, coördinaten of CBR-locatiecatalogus.                            |
| `lesson_refill_invitations` | `location`, lat/lng en Place ID (`0050_lesson_refill_waitlist.sql:119-148`); acceptatie kopieert dit naar een nieuwe les (`:423-433`).                                                                                                                                                 | Tijdelijke, historische aanbodsnapshot.                          | Geen formatted address, coördinaten-paircheck of canonical bron.                                             |

De nieuwe-lesflow in backoffice gebruikt Places en verborgen locatievelden (`artifacts/nxtdrive/app/backoffice/agenda/nieuw/location-field.tsx:11-36`). De server valideert coördinaten oppervlakkig en schrijft via `schedule_lesson` (`app/backoffice/agenda/actions.ts:86-118`, `:219-245`). Daartegenover:

- de generieke agendaform gebruikt een gewoon tekstveld (`components/agenda/AppointmentForm.tsx:327-336`) en `create_agenda_appointment` krijgt alleen tekst (`lib/agenda/actions.ts:256-272`);
- student-self-booking vraagt vrije tekst (`app/student/lessons/book/page.tsx:245-287`) en stuurt expliciet `null` voor lat/lng/Place ID (`app/student/actions.ts:269-283`);
- native planning accepteert alleen `location` als vrije tekst en stuurt voor lessen `null` voor providerdata (`lib/mobile/instructor-planning.ts:32-42`, `:123-168`, `:180-195`).

**Conclusie:** afspraaklocaties moeten historische snapshots blijven. De huidige mix van tekst, catalogus-FK en providerdata heeft echter geen expliciete prioriteitsregel.

### 4. Smart booking en tijdelijke planningsobjecten

`booking_requests` bevat pickup tekst, lat/lng, Place ID en formatted address (`supabase/migrations/20260622091831_smart_booking_phase1.sql:9-36`). `booking_candidates` kopieert hetzelfde en voegt route-uitkomsten toe (`:111-140`). Dit zijn operationele snapshots binnen de lifecycle, niet geschikte stamdata.

De checks valideren latitude en longitude elk afzonderlijk (`:76-82`, `:141-158`). Anders dan leads, lessen en proeflessen kunnen hier dus halfgevulde coördinaatparen ontstaan. Er zijn ook geen zichtbare lengtelimieten voor Place ID/formatted address in deze tabeldefinities.

`lesson_refill_invitations` is eveneens een tijdelijke snapshot. Bij acceptatie wordt de snapshot de leslocatie. Een migratie mag zulke rijen niet achteraf laten “meebewegen” met een gewijzigd leerlingadres.

### 5. Bestaande `locations`-catalogus, vestigingen en voertuigen

`public.locations` is de enige bestaande locatiestamtabel. Zij bevat `name`, vrije tekst `address`, status en sortering (`supabase/migrations/0032_lesson_context.sql:69-103`). `branch_id` is later toegevoegd (`0103_vehicle_location_branch_scope.sql:7-19`) met een tenantguard (`:21-54`). `upsert_location` trimt naam en adres en auditeert (`0032_lesson_context.sql:318-374`).

De beheer-UI toont en maakt locaties met naam en vrije tekst (`artifacts/nxtdrive/app/backoffice/voertuigen/page.tsx:596-731`); `createLocation` roept de RPC aan (`app/backoffice/voertuigen/actions.ts:291-315`). De tabel is daarom bruikbare businessstamdata, maar nog geen genormaliseerd adresrecord.

Er zijn twee scherpe duplicaties:

- `branches.address` en `branches.city` staan apart op vestigingen (`supabase/migrations/0091_branches.sql:48-62`) en de create/update-RPC’s schrijven vrije tekst (`:419-467`, `:469-525`). Er is geen FK naar `locations`.
- Een `location` kan een `branch_id` hebben, maar dat betekent alleen operationele scope; het record is niet aantoonbaar het adres van die vestiging.

Voertuigen hebben geen base/start/end location. Ze kunnen alleen aan een branch worden gekoppeld (`0103_vehicle_location_branch_scope.sql:7-15`). Ook instructeurs hebben geen profiel- of daggebonden start/eindlocatie in het onderzochte schema/API-contract.

De assignment-RPC’s schrijven branch scope, maar `assign_location_branch` gebruikt `p_actor` niet voor interne autorisatie of audit (`supabase/migrations/0104_vehicle_location_branch_assignment_rpc.sql:41-73`). De comment legt de autorisatie bij app-code (`:82-86`). Dat bestaande patroon mag niet zonder aanvullende guard naar gevoelige adresrelaties worden gekopieerd.

### 6. Rayons/service areas

`service_areas` zijn tenant-/branchgebonden planningsgebieden (`supabase/migrations/0117_planning_core_schema_foundation.sql:233-267`). `service_area_zones` bevat vrije waarden van het type `city`, `district`, `postcode_prefix` of `custom` (`:268-292`). `service_area_travel_matrix` bevat handmatig geschatte minuten tussen gebieden (`:330-361`).

De planningsinstellingen hanteren standaard 15 minuten buffer, 10 minuten binnen hetzelfde gebied en 30 minuten tussen gebieden (`supabase/migrations/20260615221124_rayons_capabilities_planning_core.sql:31-43`). In TypeScript bevat `PlanningCandidateInput` alleen `pickupServiceAreaId`, en busy intervals alleen `serviceAreaId` (`artifacts/nxtdrive/lib/planning-core/types.ts:81-111`); de matrix is gebied-naar-gebied (`:147-173`).

Rayons zijn dus een **classificatie-/policylaag** en geen vervanging voor adressen of routepunten. Ze kunnen naast een canonical location blijven bestaan.

### 7. Bestaande Maps- en routecode

De repository heeft al drie relevante bouwstenen:

- Eén gedeelde clientloader met `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`, graceful fallback en libraries `places`, `maps`, `marker`, `core` (`artifacts/nxtdrive/lib/maps/loader.ts:1-16`, `:81-147`).
- Een Places input die formatted address, Place ID en coördinaten levert en vrije tekst toestaat (`components/places-autocomplete.tsx:17-23`, `:52-99`).
- Server-side Route Matrix met `GOOGLE_ROUTES_API_KEY`, Haversine fallback, maximum 625 elementen, zes seconden timeout en een process-local cache van tien minuten (`lib/trial-lessons/route.ts:1-18`, `:78-119`, `:131-200`).

`TrialRouteMap` leest uitsluitend eerder opgeslagen coördinaten en geocodeert niet (`artifacts/nxtdrive/components/trial-route-map.tsx:1-15`, `:47-188`). De SQL bewaart route-minuten en status, niet de ruwe Google-response (`supabase/migrations/0039_route_intelligence.sql:91-105`). Dat is een goed precedent voor dataminimalisatie, maar de routeberekening is nog niet geïntegreerd in de algemene planning kernel.

## Validatie- en integriteitsbeeld

| Aspect            | Sterkste huidige implementatie                                                                                                                                   | Zwakkere/afwijkende implementatie                                                                                                                                                         |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Coördinatenpaar   | Leads, intake, lessons en trials eisen beide of geen coördinaten (`0040_lead_dashboard.sql:120-127`; `0039_route_intelligence.sql:34-42`, `:69-76`, `:107-114`). | Booking requests/candidates valideren de waarden los (`20260622091831_smart_booking_phase1.sql:76-82`, `:141-158`); refill-invitations hebben geen range-/paircheck in de tabeldefinitie. |
| Tekstlengte       | Student- en locatievelden hebben limieten. Place ID/formatted pickup op intake max. 300 (`0039_route_intelligence.sql:44-54`).                                   | Branch action trimt zonder expliciete app-lengte (`artifacts/nxtdrive/lib/branches/actions.ts:18-51`); booking snapshotvelden hebben geen zichtbare lengtecheck.                          |
| Adresvalidatie    | Een gekozen Places-resultaat geeft coördinaten en provider-ID.                                                                                                   | Geen Address Validation API, geen validatiestatus, geen gecorrigeerde componenten, geen NL-postcode/huisnummercontrole.                                                                   |
| Tenantintegriteit | Kernentiteiten hebben `tenant_id`; verschillende samengestelde FK’s/guards bestaan.                                                                              | `leads.assigned_location_id` heeft geen FK (`0040_lead_dashboard.sql:94-106`). Elke toekomstige locatierelatie moet tenantgelijkheid database-side afdwingen.                             |
| Historie          | Trial-, lesson-, booking- en refilldata functioneert feitelijk als snapshot.                                                                                     | Dit is niet als expliciet snapshotcontract gemodelleerd; mutable `locations` kan via `location_id` een andere actuele tekst krijgen dan de afspraaktekst.                                 |

## Privacy- en retentiebevindingen

Dit zijn reeds bestaande hiaten die vóór uitbreiding van locatieopslag moeten worden gesloten:

- De data-export selecteert bij `students` alleen ID, naam, e-mail, telefoon, postcode en timestamps en bij lessen geen locatievelden (`artifacts/nxtdrive/lib/privacy/service.ts:76-100`). `address_line`, `city`, `pickup_address`, intake-, trial-, agenda- en bookinglocaties ontbreken.
- `complete_privacy_deletion_request` wist naam, e-mail, telefoon, postcode, notities en gebruiker (`supabase/migrations/20260729090000_security_privacy_foundation.sql:294-307`), maar niet de later toegevoegde `address_line`, `city`, `pickup_address` en `birth_date`. Toch meldt het rapport `directIdentifiersRemoved = true` (`:309-314`).
- De retention dry run inventariseert alleen `students` als `student_profile` (`artifacts/nxtdrive/lib/privacy/retention-service.ts:43-73`), niet de locatiekopieën op kind- en planningsrecords.

Locatie- en routegegevens zijn direct of indirect persoonsgebonden. Een canonical model mag niet live voordat export, anonimisering, legal hold en retention alle nieuwe relaties en bestaande kopieën dekken.

## Expliciete bron- en snapshotregels

De volgende regels maken de huidige situatie bestuurbaar zonder bestaande historie te herschrijven:

| Gegeven                                        | Aanbevolen huidige bron tijdens overgang                                                 | Kopieën/projecties                                                                                   |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Actueel leerling-woonadres en standaard pickup | `students` structured tekstkolommen, totdat canonical student-locationrelaties live zijn | Cockpit en formulieren moeten deze lezen; legacy `notes` alleen als eenmalige fallback/backfillbron. |
| Intakeantwoorden                               | `lead_intake_details`                                                                    | `leads.city/pickup_*` is dashboardprojectie en moet reconcilebaar zijn.                              |
| Historische/plande afspraaklocatie             | Eigen lesson/trial/appointment snapshot                                                  | `students` of intake nooit met terugwerkende kracht laten doorwerken.                                |
| Booking request/candidate/refill               | Eigen immutable lifecycle-snapshot                                                       | Bij bevestiging gecontroleerd kopiëren naar de definitieve afspraak.                                 |
| Vestigingsadres                                | `branches.address/city`, totdat branch→LocationRecord gemigreerd is                      | Een branch-scoped `locations`-rij is niet automatisch hetzelfde adres.                               |
| Benoemde leslocatie                            | `public.locations`                                                                       | `lessons.location_id` is cataloguskeuze; `lessons.location` blijft historische weergavesnapshot.     |
| Rayon                                          | `service_areas` + `service_area_zones`                                                   | Niet converteren naar een puntadres; alleen koppelen/classificeren.                                  |
| Provideridentiteit                             | Bestaande `*_place_id` naast bijbehorende snapshot                                       | Niet als NXTDRIVE business-ID gebruiken. Provider moet bij nieuw model expliciet worden.             |

## Prioritaire beslispunten

1. Hergebruik de bestaande tabelnaam `locations` niet stilzwijgend met een nieuwe betekenis. Kies expliciet tussen uitbreiden/hernoemen of een nieuwe `location_records`-tabel plus gecontroleerde migratie.
2. Maak actuele opgeslagen locaties en afspraaklocatiesnapshots verschillende concepten.
3. Bepaal of wijzigingen nieuwe immutable locatieversies maken; voorkom dat historische route-input verandert.
4. Maak lead→studentconversie en cockpitweergave onderdeel van de eerste correctness-release.
5. Sluit privacygaten vóór geocoding/backfill.
6. Voer eerst een data-preview uit; de repository bevat geen bewijs dat productiegegevens veilig automatisch te dedupliceren of parseren zijn.

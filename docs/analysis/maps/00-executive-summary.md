# Executive summary — Google Maps, locaties en routing

Peildatum: 30 juli 2026  
Status: beslisdossier; geen brede implementatie of onomkeerbare migratie uitgevoerd

## Hoofdadvies

NXTDRIVE moet Google Maps niet als één brede feature “aanzetten”. De repository bevat al een nuttige, maar gefragmenteerde proof-of-concept: een legacy Places-widget, een kleine Maps JavaScript-preview, Place IDs/coördinaten in enkele flows en een server-side Compute Route Matrix-helper met Haversine-fallback. Tegelijk bestaan adressen als vrije tekst, profieldatum, catalogusrij, operationele snapshot en service-area-classificatie door elkaar.

De aanbevolen beslissing is:

1. **keur eerst fase 0 goed:** centraal providerneutraal locatiedomein, publicatiegrens, providercontract, gescheiden credentials, tenantmetering, privacydekking en additieve migratie;
2. **bouw daarna een kleine operationele MVP:** betrouwbaar pickupadres, afwijking per les, volgende locatie, externe navigatie, CBR-locatie en kaart als werkmodus van het bestaande planbord;
3. **voeg in fase 2 reistijd toe aan dezelfde centrale planningpreview én commitcontrole;**
4. **pilot optimalisatie pas na betrouwbare data en kernelbewijs;**
5. **maak live GPS en lesroute-opname tot een afzonderlijk privacyprogramma, nooit een afhankelijkheid van de kaart-MVP.**

Alle 56 beoordeelde opties staan in [03-integration-catalogue.md](./03-integration-catalogue.md) en de uniforme [04-decision-matrix.md](./04-decision-matrix.md). De product owner kan per ID kiezen in [GOOGLE_MAPS_INTEGRATION_SELECTION.md](../../decisions/GOOGLE_MAPS_INTEGRATION_SELECTION.md).

## Repositoryconclusies die het besluit sturen

- SQL-migrations en actuele RPC-definities zijn schema-authoritatief; `lib/db/src/schema/index.ts` bevat geen actueel databaseschema.
- `lead_intake_details` is de rijkste intakebron, maar `convert_lead_to_student` laat structured city/pickupdata vallen.
- Het leerlingprofiel heeft inmiddels structured tekstvelden, terwijl de cockpit nog legacy-notities parseert.
- `students`, leads/intake, `lessons`, `trial_lessons`, `agenda_appointments`, booking requests/candidates, refill-invitations, `locations` en `branches` hebben overlappende locatievelden zonder één prioriteitsregel.
- Booking request/candidate-constraints kunnen halve coördinaatparen toelaten.
- De huidige privacy-export en deletionflow nemen de latere structured studentadresvelden niet volledig mee, terwijl deletion rapporteert dat directe identifiers verwijderd zijn.
- De algemene planningkernel gebruikt service areas en een handmatige area-matrix, niet de bestaande concrete Google-matrixhelper.
- Het planbordcontract bevat nog geen betrouwbare locatieprojectie en kan dus niet rechtstreeks een dagkaart voeden.
- De Android-app heeft geen locatiepermissie; dat bevestigt dat geplande locatie, appstatus, actieve navigatie en live GPS nog gescheiden concepten zijn.

Deze hiaten staan met paden en regelnummers in [01-current-location-inventory.md](./01-current-location-inventory.md). Privacy-export/deletion en leadconversie moeten vóór verbreding van locatieopslag worden hersteld, ook als live tracking nooit wordt gebouwd.

## Tien integraties met de hoogste waarde

| Rang | ID     | Integratie                     | Waarom                                                                                             |
| ---: | ------ | ------------------------------ | -------------------------------------------------------------------------------------------------- |
|    1 | MAP-01 | Centrale locatie-entiteit      | Maakt alle volgende functies consistent, tenant-safe en migreerbaar.                               |
|    2 | MAP-10 | Standaard ophaalpunt           | Lost een dagelijks kernprobleem voor leerling, planner en instructeur op en houdt woonadres apart. |
|    3 | MAP-13 | Afwijkende locatie per les     | Ondersteunt school/werk/tijdelijke pickup zonder profiel of historie stil te wijzigen.             |
|    4 | MAP-32 | Reistijdconflictcontrole       | Voorkomt onhaalbare planning in plaats van die alleen op een kaart te visualiseren.                |
|    5 | MAP-02 | Autocomplete (New)             | Vermindert invoertijd en fouten in meerdere flows met handmatige fallback.                         |
|    6 | MAP-20 | Volgende locatie               | Hoogfrequente operationele waarde in de instructeurscockpit, ook zonder kaart.                     |
|    7 | MAP-21 | Openen in Google Maps          | Levert navigatie met zeer lage complexiteit zonder GPS-opslag of Navigation SDK.                   |
|    8 | MAP-31 | Planbord met kaart             | Geeft ruimtelijk inzicht in dezelfde werkruimte, filters en mutatiegrens.                          |
|    9 | MAP-39 | Ontbrekende/ongeldige adressen | Maakt datakwaliteit zichtbaar en herstelbaar vóór routefouten.                                     |
|   10 | MAP-60 | CBR-locatiecatalogus           | Vermindert kritieke examenlogistiekfouten en voedt route/vertrekadvies.                            |

MAP-61 (externe route naar de CBR-locatie) hoort wel in de MVP, maar bouwt inhoudelijk op MAP-21 en MAP-60.

## Vijf integraties die architectonisch nu moeten worden voorbereid

1. **MAP-01 — centrale locatie-entiteit:** eigen UUID, provenance, validatiestatus, copy-on-change en typed owner-/stoprelaties.
2. **MAP-05 — Place ID-opslag/refresh:** duurzame ID apart van tijdelijke providercontent en een ouderdoms-/NOT_FOUND-pad.
3. **MAP-09 — providergrens, tenantmetering en entitlements:** één gecontroleerde gateway in plaats van providerclients per scherm.
4. **MAP-16 — publicatie-/zichtbaarheidsgrens:** uitsluitend de eigen, gepubliceerde afspraaklocatie naar leerling/ouder/offline client.
5. **MAP-33 — centrale Route Matrix-dienst:** server-side batching, field mask inclusief elementstatus, fallback, toegestane korte cache en kostenteller.

MAP-47 (retentie/audit/delete voor bewegingsdata) wordt eveneens als foundation ontworpen, maar niet geactiveerd zolang fase 4 uitstaat.

## Vijf integraties die nog niet gebouwd moeten worden

1. **MAP-28 — live locatie:** eerst een specifieke noodzakelijke businesscase, DPIA-/legal-/arbeidsrechtelijke beoordeling en medezeggenschapsbesluit.
2. **MAP-29 — interne turn-by-turnnavigatie:** afwijzen; externe navigatie lost het kernprobleem met veel lagere veiligheids- en supportlast op.
3. **MAP-37 — multi-instructeuroptimalisatie:** wacht op stabiele kernel, datakwaliteit en bewijs uit één-instructeuroptimalisatie.
4. **MAP-40 — lesroute-opname:** eerst doelbinding, minimale gegevensverwerking, bewaartermijn en medewerker-/leerlingtransparantie.
5. **MAP-46 — toetsroutevoorbereiding:** afwijzen; bouw geen product rond vermeende CBR-examenroutes.

## Aanbevolen MVP

### Alleen foundation voorbereiden

`MAP-01, MAP-05, MAP-09, MAP-16, MAP-26, MAP-33`

### Zichtbaar activeren na de foundationgates

`MAP-02, MAP-06, MAP-10, MAP-13, MAP-15, MAP-20, MAP-21, MAP-39, MAP-60, MAP-61, MAP-64`

`MAP-31` start daarnaast als feature-flagged pilot, uitsluitend na een expliciet CSP-/threat-modelbesluit. De voorkeurs-PoC is een geïsoleerde maporigin zonder sessiecookies; een globale CSP-verruiming wordt niet geaccepteerd.

De MVP heeft vrije-tekstfallback, handmatige correctie en provider-disabled tests als releasevoorwaarden. Zij voert geen brede backfill, optimalisatie, live tracking of Navigation SDK in.

## Aanbevolen fase 2

- gerichte pilot van MAP-03 Address Validation en MAP-14 pickupbevestiging;
- MAP-25 verwachte reistijd met timestamp en expliciete fallback;
- MAP-32 routeconflicten in centrale preview én commit;
- MAP-30 operationele dagkaartpilot;
- MAP-34 uitlegbaar beste-instructeurvoorstel op een vooraf hard gefilterde shortlist;
- MAP-24 traffic-aware vernieuwing uitsluitend voor relevante nabije/conflicterende legs;
- MAP-50 werkgebiedkaart en MAP-56 grof postcodebereik;
- MAP-62 examenvertrekadvies met configureerbare aankomstbuffer.

Optimalisatie mag pas in fase 3 en blijft adviserend; zij publiceert nooit zelfstandig afspraken.

## Dagkaartadvies

De dagkaart is het nuttigst als **werkmodus/child route van het bestaande planbord**:

`/backoffice/planning-board/kaart?date=YYYY-MM-DD&perspective=instructor`

- **Desktop:** tijdlijn/lijst links en kaart rechts, circa 42/58, resizable binnen grenzen; gedeelde selectie, filters en detail/mutatieflow.
- **Tablet:** kaart als canvas met planning in een touchvriendelijke bottom sheet; landscape mag 35/65 split gebruiken.
- **Mobiel:** aparte tabs **Lijst** en **Kaart**, standaard Lijst; belangrijkste uitzondering bovenaan, geen verkleinde split view.
- **Dashboard:** hoogstens een compacte uitzonderingswidget met deeplink, geen volledige operationele kaart.

De kaart toont geplande stops en berekende legs, nooit impliciet een live voertuigpositie. Zie [07-day-map-concept.md](./07-day-map-concept.md).

## Live-trackingadvies

Live tracking is **geen MVP- of fase-2-afhankelijkheid**. De eerste operationele behoefte wordt beter en privacyvriendelijker opgelost met:

- gepubliceerde geplande locatie;
- “volgende locatie”;
- externe navigatie;
- route-ETA op basis van geplande stops;
- optionele handmatige status “onderweg” of “aangekomen”.

Alleen wanneer een later specifiek doel aantoonbaar niet met deze alternatieven kan worden bereikt, mag MAP-28 opnieuw worden beoordeeld. Toestemming is binnen een arbeidsrelatie niet automatisch een geldige of vrij gegeven grondslag.

## Kostenbandbreedtes

Het rekenmodel gebruikt 22 lesdagen, actuele globale PAYG-SKU’s in USD en traffic-aware Matrix Pro voor vier elementen per les:

| Rijschool                                                | Basis kern | Met SingleVehicle-optimalisatie | Realistische laag–hoogband |
| -------------------------------------------------------- | ---------: | ------------------------------: | -------------------------: |
| Klein: 3 instructeurs, 150 leerlingen, 25 lessen/dag     |      $0,00 |                           $0,00 |                $0,00–$0,00 |
| Middel: 15 instructeurs, 750 leerlingen, 120 lessen/dag  |     $55,60 |                          $55,60 |              $2,80–$164,00 |
| Groot: 75 instructeurs, 4.000 leerlingen, 600 lessen/dag |    $478,00 |                         $560,00 |          $214,00–$1.241,25 |

FleetRouting in plaats van SingleVehicle brengt de baseline naar ongeveer $104,80 (middel) en $844,00 (groot). Aanbevolen interne waarschuwingsbudgetten tot productiemeting: circa $0–25, $5–200 en $250–1.500 per maand, exclusief btw, valuta, eigen cloud en incidentverbruik.

Belangrijke nuance: Google aggregeert prijsstaffels en kosteloze SKU-caps over projecten onder hetzelfde billing-account. NXTDRIVE mag een kosteloze cap dus niet per tenant “vermenigvuldigen”. Matrixelementen en optimization-shipments, niet alleen HTTP-requests, moeten per tenant worden gemeten. Zie [08-cost-scenarios.md](./08-cost-scenarios.md).

## Belangrijkste privacybesluiten

| Categorie                      | Advies                                                                                                                                                |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| A. Geplande afspraaklocaties   | Noodzakelijk voor planning/navigatie, maar rol-, tenant-, publicatie- en retentiebegrensd; leerling ziet alleen eigen afspraak.                       |
| B. Berekende routes/reistijden | Kort bewaren/cachen volgens doel en providerterms; bewaar vooral het afgeleide planningsbesluit, actualiteit en methode, geen onnodige ruwe response. |
| C. Live instructeurslocatie    | Hoog risico; afzonderlijke beoordeling, DPIA-indicatie, buiten-werktijdgrens, zichtbare sessie/stop, korte TTL en geen heimelijke beoordeling.        |
| D. Opgenomen lesroutes         | Ander doel en dataset dan live GPS; alleen na afzonderlijke goedkeuring, minimale precisie en bewaartermijn.                                          |

Vóór elke fase-4-pilot zijn daarnaast arbeidsrechtelijke/OR-PVT-beoordeling, transparantie, toegangsaudit, verwijdering/export en subverwerker-/doorgiftebesluiten nodig. Zie [10-privacy-assessment.md](./10-privacy-assessment.md).

## Exacte productkeuzes voor de eigenaar

De product owner moet vóór implementatie minimaal deze keuzes vastleggen:

1. de eerste productbelofte: aanbevolen “betrouwbaar pickupadres + navigatie + planbordkaart”;
2. woonadres en pickup als afzonderlijke relaties: aanbevolen **ja**;
3. welke adresrollen echte Address Validation vereisen;
4. of een leerling een gepubliceerde pickup alleen mag bevestigen/voorstellen: aanbevolen **ja, geen directe mutatie**;
5. canonieke kaartplek: aanbevolen **child/work mode van het planbord**;
6. rollen/scopes die de dagkaart mogen zien;
7. reistijdsemantiek: berekend onhaalbaar policyblock, geschat/onbekend waarschuwing;
8. tenantbuffers per afspraaktype/regio en overridebeleid;
9. eigenaar en officiële bron van de CBR-catalogus;
10. inbegrepen versus premium route-/matrix-/trafficgebruik;
11. pilottenants, duur, succes- en stopcriteria;
12. functionele mapstijl/white-labelgrens;
13. keuze van Cloudproject/contractstatus onder de EER-voorwaarden;
14. maandquota, budgetalerts, tenant-entitlements en kill-switchowner;
15. keuze van toegestane provideropslag/caching per API;
16. migratiecohort, paritydrempel en legacy-retirementbesluit;
17. of live locatie überhaupt een noodzakelijke toekomstige businesscase heeft;
18. privacygrondslag, DPIA, medezeggenschap, zichtbaarheid en bewaartermijnen voor fase 4;
19. verbod op individuele locatiegebaseerde werknemersranglijsten;
20. premiumprijs en fair-use pas na gemeten pilotverbruik.

De volledige eigenaars-, techniek-, privacy- en commerciële beslislijst staat in [13-open-decisions.md](./13-open-decisions.md); iedere MAP-keuze staat aankruisbaar in het [selectiedocument](../../decisions/GOOGLE_MAPS_INTEGRATION_SELECTION.md).

## Go/no-go

**Go voor foundation** zodra scope, credentialarchitectuur, privacydekking en migratiepreview zijn goedgekeurd.  
**Go voor MVP** pas na provider-disabled tests, tenant/RLS-tests, loggingredactie, budget/quota en rollbackoefening.  
**No-go** bij onbekende cross-tenantrelatie, incorrecte privacy-export/deletion, onverklaarde wijziging van een historische afspraakstop, onbeperkte API-key of een kaartflow die kernplanning blokkeert wanneer Google faalt.

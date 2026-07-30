# Google API mapping voor NXTDRIVE

**Peildatum:** 30 juli 2026  
**Status:** analyse en beslisdocument; geen implementatiespecificatie of juridisch advies

## 1. Samenvatting

Voor NXTDRIVE is geen enkele Google API de juiste oplossing voor alle locatievragen. De aanbevolen grens is:

- de browser toont een kaart en vraagt adresvoorspellingen op;
- de NXTDRIVE-server valideert/geocodeert adressen, berekent routes en optimaliseert planningen;
- een eventuele Android-app gebruikt een eigen Android-credential;
- live locatie en opgenomen lesroutes blijven buiten de eerste release;
- providerdata wordt niet als permanent, canoniek klantadres behandeld.

De bestaande proof-of-concept is bruikbaar als verkenning, maar nog niet releasegeschikt. De Places-component gebruikt het legacy `google.maps.places.Autocomplete`-widget en vraagt `formatted_address` en `geometry` op. De kaart gebruikt het afgeschreven `google.maps.Marker`. De server-side matrixaanroep gebruikt een API-key, een procescache en een field mask zonder `status`. Vooral dat laatste kan elementfouten als schijnbaar geldige resultaten laten doorgaan. Zie [Places Autocomplete](../../../artifacts/nxtdrive/components/places-autocomplete.tsx), [trial-route-map](../../../artifacts/nxtdrive/components/trial-route-map.tsx) en [route helper](../../../artifacts/nxtdrive/lib/trial-lessons/route.ts).

De Nederlandse entiteit valt voor nieuwe of wezenlijk gewijzigde integraties onder de [Google Maps Platform EEA-voorwaarden](https://cloud.google.com/terms/maps-platform/eea) en de [EEA Service Specific Terms](https://cloud.google.com/terms/maps-platform/eea/maps-service-terms). Die voorwaarden beïnvloeden welke Places-inhoud met een kaart mag worden gecombineerd en hoe lang bepaalde providerresultaten mogen worden opgeslagen. Contractuele en privacybeoordeling is daarom een releasevoorwaarde, niet alleen een administratieve stap.

## 2. Voorgestelde productgrens

| NXTDRIVE-functie                         | Voorkeursproduct                                                      | Uitvoering                                       | Besluit                                                  |
| ---------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------ | -------------------------------------------------------- |
| Kaart met afspraken, clusters en verkeer | Maps JavaScript API, Advanced Markers, MarkerClusterer, Traffic Layer | Browser                                          | Alleen na expliciet CSP-besluit                          |
| Adres zoeken                             | Place Autocomplete (New)                                              | Browser via nieuw widget of afgeschermde backend | Legacy widget niet verder uitbouwen                      |
| Gekozen adres normaliseren               | Place Details (New), Essentials-velden                                | Browser/backend in dezelfde sessie               | Minimaal field mask; gebruiker laat bevestigen           |
| Adreskwaliteit voor boeking/import       | Address Validation API                                                | Server                                           | Alleen op betekenisvolle mutaties, niet op iedere render |
| Vrije tekst uit legacy-import            | Geocoding API v4                                                      | Server                                           | Fallback, niet het standaard invoerpad                   |
| ETA en individuele route                 | Routes API Compute Routes                                             | Server                                           | Pro alleen wanneer actuele verkeersinformatie nodig is   |
| Conflicten en kandidatenmatrix           | Routes API Compute Route Matrix                                       | Server                                           | Elementen zijn de billable unit; begrens streng          |
| Volgorde van enkele tussenstops          | Compute Routes waypoint optimization                                  | Server                                           | Alleen voor eenvoudige routevolgorde                     |
| Volledige dag-/vlootplanning             | Route Optimization API                                                | Server                                           | Premium; single-vehicle waar functioneel passend         |
| Android-kaart                            | Maps SDK for Android                                                  | Native Android                                   | Alleen wanneer een native app bestaat                    |
| In-app turn-by-turn                      | Navigation SDK for Android                                            | Native Android                                   | Latere fase; vervangt Maps SDK in die app                |
| Externe navigatie                        | Google Maps URL/deeplink                                              | Browser/Android                                  | MVP-fallback zonder Navigation SDK                       |

## 3. Productmapping

### 3.1 Maps JavaScript API

**Gebruik.** Interactieve planningkaart, afspraakmarkers, selectie en viewport. Een kaartinitialisatie is een Dynamic Maps map load; her-renderen binnen dezelfde bestaande map hoort niet steeds een nieuwe instantie te maken.

**Plaatsing en authenticatie.** Alleen in de browser, met een afzonderlijke browser-key. Beperk die key met exacte productie- en staging-HTTP-referrers en uitsluitend de Maps JavaScript API plus de daadwerkelijk gebruikte client-API's. `auth_referrer_policy=origin` vermindert de referrer die Google ontvangt wanneer de ingestelde restricties op originniveau werken. Zie [Maps JavaScript laden](https://developers.google.com/maps/documentation/javascript/load-maps-js-api) en [API security best practices](https://developers.google.com/maps/api-security-best-practices).

**Velden.** Niet van toepassing op de kaartload. Laad libraries pas wanneer de route ze nodig heeft; laad `places` niet globaal voor iedere pagina.

**Quota en facturatie.** Dynamic Maps heeft per maand een SKU-specifieke kosteloze drempel van 10.000 map loads; daarna geldt in de eerste betaalde band $7 per 1.000. Google publiceert daarnaast 30.000 map loads per minuut per project en 300 per minuut per IP-adres. Maps Embed is onbeperkt kosteloos maar veel minder interactief. Controleer altijd de actuele [prijslijst](https://developers.google.com/maps/billing-and-pricing/pricing) en [Maps JavaScript usage and billing](https://developers.google.com/maps/documentation/javascript/usage-and-billing).

**EEA/opslag.** Applicatiedata die over de kaart wordt gelegd blijft NXTDRIVE-data, maar providerinhoud uit Places mag niet zonder meer “With any Map” worden gebruikt. Een place ID en coördinaten zijn volgens de EEA-wijziging wel toegestaan; voor adreslabels moet duidelijk zijn of de tekst door de gebruiker is bevestigd of providerinhoud is. Zie [EEA Places changes](https://developers.google.com/maps/comms/eea/places).

**Fallback en fouten.** Toon bij loader-, auth-, quota- of netwerkfouten de afspraaklijst en een link “Open in Google Maps”; planning moet zonder kaart mogelijk blijven. Monitor map-loads, `gm_authFailure`, loaderfouten en CSP-rapporten, maar log geen volledige adressen of coördinaten. [Maps JavaScript error messages](https://developers.google.com/maps/documentation/javascript/error-messages) beschrijft de foutklassen.

**Besluit.** Voorwaardelijk geschikt. De officiële strikte CSP-variant vereist onder meer `'unsafe-eval'`, terwijl NXTDRIVE dat expliciet verbiedt. Dit is een open architectuurbesluit; zie `09-security-architecture.md`.

### 3.2 Maps SDK for Android

**Gebruik.** Native kaart, markers en camerabesturing wanneer NXTDRIVE een echte Android-app bouwt. Het is geen afhankelijkheid voor de huidige webapp.

**Plaatsing en authenticatie.** Alleen in de Android-app met een Android-key, beperkt op package name én SHA-1 signing-certificate fingerprint. Gebruik verschillende keys voor debug, staging en release en beperk de release-key tot Maps SDK for Android.

**Velden.** Niet van toepassing op de kaartweergave. Haal planningdata via de geauthenticeerde NXTDRIVE-API op; zet geen tenantregels in de key of client.

**Quota en facturatie.** De actuele globale prijslijst noemt Maps SDK als onbeperkt kosteloos. Een billing-account, key en quota-/misbruikmonitoring blijven vereist. “Kosteloos” betekent niet dat een onbeperkte of gedeelde key veilig is.

**EEA/opslag.** Dezelfde scheiding tussen eigen planningdata en Google-providerinhoud geldt. Sla kaarttegels of UI-output niet zelf op.

**Fallback en fouten.** Bij SDK- of netwerkproblemen toont de app een tekstuele planning en een externe navigatielink. Monitor SDK-initialisatie, auth- en renderingfouten per appversie, zonder locaties in crashlogs.

**Besluit.** Alleen activeren voor een native app. Voeg de SDK niet preventief toe aan de webroadmap.

### 3.3 Places API (New)

**Gebruik.** Overkoepelende Places-service voor zoeken en details. Voor NXTDRIVE is Places (New) de doelarchitectuur; de bestaande legacy Autocomplete-widget mag niet verder worden uitgebreid.

**Plaatsing en authenticatie.** Een browserwidget gebruikt een browser-key met referrer- en API-restricties. REST-aanroepen en verrijking horen achter NXTDRIVE-serverendpoints met OAuth/service identity of, tijdelijk, een streng beperkte server-key. Een client mag nooit een servercredential ontvangen.

**Velden.** Elk Places (New)-endpoint krijgt een expliciet minimaal field mask; `*` is alleen voor lokale verkenning, niet voor productie. Het hoogste opgevraagde veld bepaalt de Place Details-SKU. Zie [Places data fields](https://developers.google.com/maps/documentation/places/web-service/data-fields).

**Quota en facturatie.** Quota zijn per methode en project en moeten uit de Cloud Console worden uitgelezen; hardcode geen verondersteld defaultquota. Meet Autocomplete-requests, sessies, beëindigingsmethode en Details-SKU afzonderlijk. Zie [Places usage and billing](https://developers.google.com/maps/documentation/places/web-service/usage-and-billing).

**EEA/opslag.** Place IDs mogen volgens Google worden bewaard en kunnen kosteloos via Details IDs Only worden ververst; Google adviseert verouderde IDs na meer dan twaalf maanden te verversen. Andere Places-inhoud kent strengere cache- en kaartcombinatiebeperkingen. Zie [Place IDs](https://developers.google.com/maps/documentation/places/web-service/place-id) en de EEA-voorwaarden.

**Fallback en fouten.** Sta altijd handmatige invoer en bevestiging toe. Behandel `NOT_FOUND`, gewijzigde/verplaatste places, quota, auth en timeouts afzonderlijk; een providerfout mag een bestaand klantadres niet wissen.

**Besluit.** Geschikt met Places (New), minimale velden, sessiediscipline en EEA-review.

### 3.4 Place Autocomplete (New)

**Gebruik.** Adresvoorspellingen bij het invoeren of wijzigen van een ophaal-/leslocatie. Gebruik debounce, een minimumaantal tekens en geografische begrenzing op Nederland of het werkgebied. `locationBias` en `locationRestriction` mogen niet samen worden gebruikt.

**Plaatsing en authenticatie.** Bij een clientwidget: beperkte browser-key. Bij REST: eigen backendendpoint dat alleen noodzakelijke invoer doorstuurt. Start per invoeractie een nieuwe UUID-v4-session token en hergebruik die niet. Autocomplete en de afsluitende Details/Address Validation-aanroep moeten credentials uit hetzelfde Cloud-project gebruiken. Zie [session tokens](https://developers.google.com/maps/documentation/places/web-service/place-session-tokens).

**Field mask.** Voor adresvoorspellingen volstaat in de REST-variant doorgaans `suggestions.placePrediction.placeId,suggestions.placePrediction.text.text`; voeg structured-format-velden alleen toe wanneer de UI ze toont. Vraag geen POI-foto's, ratings of businessvelden op.

**Quota en facturatie.** Autocomplete Requests heeft 10.000 kosteloze requests per maand en kost vervolgens $2,83 per 1.000 in de eerste band. Facturatie hangt sterk af van sessieafsluiting:

- zonder geldige afsluiting worden requests per stuk afgerekend;
- bij afsluiting met Place Details Essentials worden de eerste 12 requests per sessie als requests afgerekend en volgende requests onder de kosteloze session-usage-SKU;
- bij afsluiting met Address Validation worden autocomplete-requests in de sessie onder de kosteloze session-usage-SKU geboekt en Address Validation als Enterprise afgerekend;
- Details IDs Only beëindigt een sessie niet voor voordelige sessiepricing.

Zie [Autocomplete session pricing](https://developers.google.com/maps/documentation/places/web-service/session-pricing).

**EEA/opslag.** Bewaar niet de volledige predictionlijst. Bewaar na bevestiging het eigen, door de gebruiker bevestigde adres en eventueel het place ID; label providertekst totdat de gebruiker die heeft bevestigd.

**Fallback en fouten.** Na timeout/quota/auth: handmatige invoer en optionele latere servervalidatie. Monitor requests per sessie, afgebroken sessies, gemiddelde tekens/requests en terminator-SKU, zonder querytekst of token te loggen.

**Besluit.** Geschikt, maar alleen met een nieuwe sessie-implementatie. De legacy widget in de huidige proof-of-concept is geen basis voor verdere ontwikkeling.

### 3.5 Place Details (New)

**Gebruik.** Een geselecteerde voorspelling omzetten naar de minimale adres- en locatiegegevens die de gebruiker kan bevestigen.

**Plaatsing en authenticatie.** Browser of server, maar als onderdeel van dezelfde Autocomplete-sessie en hetzelfde Cloud-project. Serveruitvoering heeft de voorkeur wanneer details direct een tenantrecord wijzigen.

**Field mask.** Aanbevolen voor NXTDRIVE: `id,formattedAddress,addressComponents,location`. Deze velden vallen onder Essentials. Vraag `displayName` niet standaard op: dat is een Pro-veld en heeft voor een ophaaladres weinig waarde. Zie [Place Details](https://developers.google.com/maps/documentation/places/web-service/place-details).

**Quota en facturatie.** Details Essentials IDs Only is onbeperkt kosteloos. Details Essentials heeft een drempel van 10.000 en daarna $5 per 1.000; Pro heeft 5.000 kosteloos en daarna $17 per 1.000. Het duurste gevraagde veld bepaalt de SKU.

**EEA/opslag.** Sla het place ID apart op en laat het adres expliciet bevestigen. Behandel Google-adresvelden niet stilzwijgend als onbeperkt houdbare providercache. Voor een kaartlaag mogen place ID en coördinaten worden gebruikt; het tonen van overige Places-inhoud “With any Map” vereist beoordeling tegen de EEA-regels.

**Fallback en fouten.** Bij een verouderd/moved place ID: ververs via IDs Only, laat opnieuw zoeken of val terug op het bevestigde tenantadres. Monitor veldmasker/SKU, `NOT_FOUND` en moved-place-resolutie.

**Besluit.** Geschikt met Essentials-masker; Pro/Enterprise-velden blokkeren in een server-side allowlist.

### 3.6 Address Validation API

**Gebruik.** Adreskwaliteit controleren bij een betekenisvolle opslagactie, bulkmigratie of mislukte routeberekening. De response ondersteunt een beslisboom “accepteren, bevestigen, corrigeren”; hij is geen automatische waarheid. Zie [response begrijpen](https://developers.google.com/maps/documentation/address-validation/understand-response) en [validation logic](https://developers.google.com/maps/documentation/address-validation/build-validation-logic).

**Plaatsing en authenticatie.** Alleen server-side. Gebruik OAuth/service identity waar ondersteund in de gekozen integratie, anders een server-key met vaste egress-IP en uitsluitend Address Validation API. Stuur geen ontvangersnaam of organisatienaam mee wanneer die niet voor adresvalidatie nodig is.

**Velden.** `validateAddress` documenteert geen SKU-sturend response-field-mask zoals Places. Verwerk en bewaar alleen de minimale `verdict`, benodigde adrescomponenten en `geocode.placeId/location`; laat metadata en USPS-extra's weg tenzij een onderbouwde use case bestaat.

**Quota en facturatie.** Google publiceert 6.000 requests per minuut voor validation en een afzonderlijk quota van 6.000 per minuut voor feedback. Standalone Address Validation Pro heeft 5.000 kosteloze requests en kost daarna $17 per 1.000. Als Address Validation een Autocomplete-sessie beëindigt, geldt de Enterprise-SKU: 1.000 kosteloos en daarna $25 per 1.000. Zie [usage and billing](https://developers.google.com/maps/documentation/address-validation/usage-and-billing).

**EEA/opslag.** De EEA Service Terms beperken provider-formatted address, postal address en component names, validatieflags en lat/lng in dit gebruik tot in beginsel 30 dagen voor de downstream transactie/correctie, waarna verwijdering of vervanging door bevestigde/gecorrigeerde eigen data nodig is. De precieze contractuele toepassing moet juridisch worden bevestigd.

**Fallback en fouten.** Laat de gebruiker handmatig bevestigen/corrigeren; blokkeer een les niet alleen omdat de provider onzeker is. Queue validatie bij providerstoring en markeer de status “nog niet gevalideerd”. Monitor accept/confirm/fix, retries, latency, SKU en overrides, niet het adres.

**Besluit.** Geschikt als gerichte kwaliteitscontrole, niet als aanroep bij ieder formulier-event.

### 3.7 Geocoding API

**Gebruik.** Legacy-import, losse vrije tekst en herstel wanneer een bevestigd adres nog geen bruikbare coördinaat/place ID heeft. Voor nieuwe invoer blijft Autocomplete + Details de voorkeursroute.

**Plaatsing en authenticatie.** Gebruik Geocoding API v4 server-to-server en bij voorkeur OAuth; Google raadt directe browseraanroepen af. Zie [Geocoding v4 overview](https://developers.google.com/maps/documentation/geocoding/geocoding-v4-overview).

**Field mask.** Start met `results.placeId,results.location,results.granularity`. Voeg `results.formattedAddress,results.addressComponents` alleen toe wanneer de gebruiker of importworkflow die echt nodig heeft. Zie [choose fields](https://developers.google.com/maps/documentation/geocoding/choose-fields).

**Quota en facturatie.** Geocoding Essentials heeft 10.000 kosteloze events en daarna $5 per 1.000. Voor de bestaande productdocumentatie publiceert Google 3.000 queries per minuut; voor v4 moet het effectieve projectquota in Cloud Console leidend zijn. Zie [usage and billing](https://developers.google.com/maps/documentation/geocoding/usage-and-billing).

**EEA/opslag.** De EEA-voorwaarden noemen een algemene 30-dagenlimiet voor geocodingcoördinaten en daarnaast een specifieke mogelijkheid voor langduriger opslag van lat/lng en formatted/structured address wanneer dat uitsluitend directe, door die eindgebruiker geïnitieerde functionaliteit ondersteunt, logisch per gebruiker is geïsoleerd en geen vervanging voor Google-aanroepen vormt. Deze uitzondering is contextgevoelig en moet contractueel worden beoordeeld. Place IDs blijven de veiligere duurzame providerreferentie.

**Fallback en fouten.** Markeer ambigue resultaten voor menselijke selectie; accepteer geen lage granulariteit als exact huisadres. Retry alleen begrensd op 429/5xx; niet op ongeldige invoer. Monitor granulariteit, nul/meerdere resultaten, latency en quota zonder querytekst.

**Besluit.** Geschikt als server-side fallback/importtool, niet als primaire adreszoeker.

### 3.8 Routes API — Compute Routes

**Gebruik.** ETA, afstand en eventueel routepolyline voor één les of verplaatsing.

**Plaatsing en authenticatie.** Alleen server-side. Gebruik service-account/OAuth met korte tokens waar mogelijk; anders een strikt API- en IP-beperkte server-key. De browser ontvangt uitsluitend de afgeleide output die voor de UI nodig is.

**Field mask.** Voor ETA/preview: `routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline`; laat de polyline weg als alleen duur/afstand nodig is. Voeg `routes.routeLabels` of waarschuwingen alleen toe als de UI ze werkelijk verwerkt. Zie [Compute Routes](https://developers.google.com/maps/documentation/routes/compute_route_directions).

**Quota en facturatie.** Compute Routes wordt per succesvolle request afgerekend. Essentials heeft 10.000 kosteloos en daarna $5 per 1.000. `TRAFFIC_AWARE`, `TRAFFIC_AWARE_OPTIMAL`, waypoint-optimalisatie, 11–25 tussenstops en bepaalde route modifiers activeren Pro: 5.000 kosteloos en daarna $10 per 1.000. Het gepubliceerde quota is 3.000 requests per minuut. Zie [Routes usage and billing](https://developers.google.com/maps/documentation/routes/usage-and-billing).

**EEA/opslag.** De EEA Service Terms beperken Routes-coördinaten in beginsel tot 30 dagen en verbieden het combineren van routebeschrijvingen/-stappen met een kaart. Bewaar actuele verkeersroutes daarom alleen kort; een eigen planningsbesluit zoals “verwachte reistijd 31 min, berekend om 10:15” kan afzonderlijk als NXTDRIVE-besluit worden geaudit, mits de juridische/retentiegrondslag klopt.

**Fallback en fouten.** Bij `NO_ROUTE`, invalid waypoint, timeout of quota: gebruik een gemarkeerde recente afgeleide reistijd, een configureerbare conservatieve buffer of handmatige plannercontrole. Retry met jitter alleen op 429/5xx en respecteer deadlines. Monitor SKU, routing preference, responsecategorie, stale/fresh en latency.

**Besluit.** Geschikt; Essentials voor ver-vooruitplanning en Pro selectief voor nabije/conflicterende afspraken.

### 3.9 Routes API — Compute Route Matrix

**Gebruik.** Conflicten tussen opeenvolgende lessen en beperkte kandidaatvergelijking. Bouw geen onbeperkte alle-tegen-alle matrix.

**Plaatsing en authenticatie.** Alleen server-side met dezelfde credentialregels als Compute Routes. Autoriseer tenant en rol vóórdat een matrix wordt opgebouwd.

**Field mask.** Minimale productievariant: `originIndex,destinationIndex,status,condition,distanceMeters,duration`; voeg `fallbackInfo` toe wanneer de UI een degraded traffic result onderscheidt. `status` is essentieel: zonder dit veld kunnen elementfouten op een geldige response lijken. De huidige helper mist `status`.

**Quota en facturatie.** De billable unit is ieder teruggegeven origin-destination-element, niet de HTTP-request. Google publiceert 3.000 elementen per minuut, maximaal 625 elementen per request in de algemene variant en maximaal 100 bij `TRAFFIC_AWARE_OPTIMAL` of transit. Wanneer origins/destinations als place IDs of adressen worden opgegeven, is de gezamenlijke limiet 50. Essentials heeft 10.000 kosteloze elementen en daarna $5 per 1.000; Pro 5.000 kosteloos en daarna $10 per 1.000. Zie [Compute Route Matrix](https://developers.google.com/maps/documentation/routes/compute_route_matrix) en de [REST-reference](https://developers.google.com/maps/documentation/routes/reference/rest/v2/TopLevel/computeRouteMatrix).

**EEA/opslag.** Dezelfde Routes-beperkingen gelden. Cache actuele trafficresultaten slechts minuten, nooit tenantoverschrijdend, en behandel de cache niet als historisch routearchief.

**Fallback en fouten.** Verwerk status per element: één mislukte relatie mag niet de hele matrix stilzwijgend “0 minuten” maken. Kap matrixgrootte vóór de Google-call af; chunk binnen quota en deadline. Bij storing gebruikt de planner gemarkeerde schattingen/handmatige controle. Monitor elementen én requests, partial failures, fallback info en cost per planningactie.

**Besluit.** Geschikt, maar vormt het grootste voorspelbare verbruik. Strenge kandidaatselectie en productentitlement zijn nodig.

### 3.10 Routes API — waypoint optimization

**Gebruik.** De volgorde van tussenstops op één route optimaliseren, bijvoorbeeld een eenvoudige ophaalronde. Dit is niet hetzelfde als voertuig-/instructeurtoewijzing met tijdvensters.

**Plaatsing en authenticatie.** Server-side Compute Routes met `optimizeWaypointOrder=true`.

**Field mask.** Vraag minimaal `routes.optimizedIntermediateWaypointIndex` en daarnaast de werkelijk gebruikte `routes.duration` en `routes.distanceMeters` op. Zonder de optimized index kan NXTDRIVE de nieuwe volgorde niet veilig toepassen.

**Quota en facturatie.** Activeert Compute Routes Pro. Maximaal 25 intermediate waypoints; via-waypoints zijn niet toegestaan in deze combinatie en alternative routes passen niet bij routes met intermediates. Zie [Optimize waypoint order](https://developers.google.com/maps/documentation/routes/opt-waypoint-order).

**EEA/opslag.** Behandel de routeoutput zoals andere Routes-data. Sla de door een planner geaccepteerde eigen afspraakvolgorde apart op van provideroutput.

**Fallback en fouten.** Houd altijd de oorspronkelijke volgorde; pas een voorstel pas na succesvolle response en geldigheidscontrole toe. Monitor hoeveel voorstellen geaccepteerd/overruled worden, zonder locaties te loggen.

**Besluit.** Alleen voor eenvoudige één-routeproblemen. Gebruik Route Optimization voor tijdvensters, meerdere voertuigen of complexe constraints.

### 3.11 Route Optimization API

**Gebruik.** Een dagplanning met tijdvensters, voertuigen/instructeurs, capaciteit en kosten optimaliseren. Gebruik SingleVehicle wanneer het model exact één voertuig bevat; twee of meer voertuigen activeren FleetRouting.

**Plaatsing en authenticatie.** Uitsluitend server-to-server. Gebruik een service account/Workload Identity, OAuth-scope `cloud-platform` en de minimale IAM-permissie `routeoptimization.locations.use`. Nooit vanuit browser of Android-client. Zie de [`optimizeTours` reference](https://developers.google.com/maps/documentation/route-optimization/reference/rest/v1/projects/optimizeTours).

**Velden.** De requestmodelering en output controls bepalen de omvang; er is geen Places-achtig response-field-mask dat de SKU verlaagt. Gebruik eerst validation-only/modelvalidatie waar passend, vraag polylines alleen op als de UI ze nodig heeft en stuur alleen relevante constraints.

**Quota en facturatie.** `OptimizeTours` en batch hebben elk 60 requests per minuut. Batch ondersteunt maximaal 100 individuele requests en 100 MB. Facturatie is per shipment in de request, niet per HTTP-call. SingleVehicle: 5.000 kosteloze shipments en daarna $10 per 1.000; FleetRouting: 1.000 kosteloos en daarna $30 per 1.000. Invalid, validate-only en aantoonbaar infeasible/ignored shipments worden volgens de SKU-definitie niet als verwerkte shipments afgerekend. Zie [usage and billing](https://developers.google.com/maps/documentation/route-optimization/usage-and-billing) en [SKU details](https://developers.google.com/maps/billing-and-pricing/sku-details).

**EEA/opslag.** De EEA Service Terms beperken routeoptimalisatiecoördinaten in beginsel tot 30 dagen en vermelden geen SLA voor deze service. Een geaccepteerde NXTDRIVE-planning is eigen bedrijfsdata, maar ruwe providerresponse, polylines en coördinaten moeten apart worden geclassificeerd.

**Fallback en fouten.** Optimalisatie is adviserend: behoud de actuele planning, toon geen half resultaat en laat een planner een voorstel publiceren. Bij `INVALID_ARGUMENT` eerst model repareren; bij 429/5xx begrensde exponential backoff. Bij uitval blijft handmatig plannen mogelijk. Monitor shipments, vehicles, solve time, infeasible/ignored, cost en acceptatiepercentage.

**Besluit.** Premiumfunctie na aantoonbare behoefte. Begin met single-vehicle/dagdeel; activeer FleetRouting alleen wanneer multi-vehicle constraints de meerprijs rechtvaardigen.

### 3.12 Navigation SDK for Android

**Gebruik.** In-app turn-by-turn, guidance, rerouting en arrival events in een native Android-app.

**Plaatsing en authenticatie.** Android-key met package + release-SHA-1 en alleen Navigation SDK. De Navigation SDK vervangt de Maps SDK in dezelfde app; neem ze niet beide op. Zie [Navigation overview](https://developers.google.com/maps/documentation/navigation/android-sdk/overview).

**Velden.** Niet als REST-field-mask. Geef alleen de actieve bestemming(en) door en houd NXTDRIVE-lesmetadata buiten navigatielogs.

**Quota en facturatie.** De billable unit is een destination. Er zijn 1.000 kosteloze destinations, daarna $25 per 1.000 in de eerste band; begeleiding en reroutes naar dezelfde aangevraagde destination brengen niet opnieuw een destination in rekening. Google noemt maximaal 25 destinations per call en 30.000 requests per minuut. Zie [Navigation pricing](https://developers.google.com/maps/documentation/navigation/android-sdk/pricing).

**EEA/opslag.** De EEA Service Terms beperken Navigation-coördinaten in beginsel tot 30 dagen. De standaard-UI is voor EEA-safetyvereisten het veilige uitgangspunt; UI-wijzigingen vereisen extra beoordeling.

**Fallback en fouten.** Externe Google Maps-deeplink blijft beschikbaar. Behandel onder meer `LOCATION_UNKNOWN`, `NETWORK_ERROR`, `NO_ROUTE_FOUND`, `QUOTA_CHECK_FAILED` en `WAYPOINT_ERROR` expliciet; zie [`Navigator.RouteStatus`](https://developers.google.com/maps/documentation/navigation/android-sdk/reference/com/google/android/libraries/navigation/Navigator.RouteStatus).

**Besluit.** Niet voor MVP. Pas na native-app-, safety- en privacybesluit.

### 3.13 Traffic Layer

**Gebruik.** Visuele indicatie van actuele verkeersdrukte voor planners. De laag levert geen programmatic travel-timewaarden; daarvoor is Routes met traffic awareness nodig.

**Plaatsing en authenticatie.** Client-side onderdeel van Maps JavaScript API en dezelfde browser-key.

**Velden.** Niet van toepassing. De laag is aan/uit; NXTDRIVE hoort kleuren niet te scrapen of als data op te slaan.

**Quota en facturatie.** De huidige prijslijst noemt geen afzonderlijke Traffic Layer-SKU; de onderliggende Dynamic Maps map load blijft factureerbaar. Zie het [Traffic Layer voorbeeld](https://developers.google.com/maps/documentation/javascript/examples/layer-traffic).

**EEA/opslag.** Niet cachen of afleiden naar een eigen verkeersdataset.

**Fallback en fouten.** Verberg de laag bij fout; markers en planning blijven werken. Monitor alleen activatie en kaartfouten.

**Besluit.** Geschikte optionele plannerlaag, geen bron voor conflictberekening.

### 3.14 Marker clustering

**Gebruik.** Grote aantallen afspraak-/leerlingmarkers overzichtelijk en performant groeperen.

**Plaatsing en authenticatie.** Client-side met de open-source `@googlemaps/markerclusterer` bovenop Maps JavaScript. Gebruik `AdvancedMarkerElement`; daarvoor is een map ID nodig. Zie [marker clustering](https://developers.google.com/maps/documentation/javascript/marker-clustering) en [Advanced Markers](https://developers.google.com/maps/documentation/javascript/advanced-markers/add-marker).

**Velden.** Alleen de minimale eigen markerdata: pseudoniem/initialen waar passend, status, tijd en coördinaat. Stop geen volledig adres of studentrecord in marker-HTML. Escape/sanitise alle dynamische content.

**Quota en facturatie.** Geen afzonderlijke Google-SKU; client CPU/geheugen en de Dynamic Maps map load zijn de relevante kosten. Een cluster mag geen extra servermatrixcalls triggeren.

**EEA/opslag.** Clustering verandert geen opslagrecht. Providercoördinaten en Places-inhoud houden hun oorspronkelijke contractuele classificatie.

**Fallback en fouten.** Boven een ingestelde markerlimiet cluster of toon een heat/countweergave; bij libraryfout toon beperkte markers of de lijst. Monitor rendertijd en markeraantal, niet markerlocaties.

**Besluit.** Geschikt. Vervang de bestaande, sinds 2024 afgeschreven [`google.maps.Marker`](https://developers.google.com/maps/documentation/javascript/reference/3.62/marker).

## 4. Gegevensmodel en cachebeleid

Houd vier soorten gegevens uit elkaar:

1. **Door gebruiker ingevoerd/bevestigd adres:** canoniek tenantrecord, met eigen retentie- en toegangsbeleid.
2. **Providerreferentie:** place ID, provider, `refreshedAt`, geldigheidsstatus.
3. **Tijdelijke providerverrijking:** formatted address, componenten, coördinaten en validatieflags met `source`, `obtainedAt` en contractueel bepaalde `expiresAt`.
4. **Afgeleid NXTDRIVE-besluit:** bijvoorbeeld berekende reistijd, geplande buffer en door planner gepubliceerde volgorde, met `asOf` en methode/SKU.

Een cachekey bevat minimaal tenant, product/versie, parameters en verkeers-/vertrektijdklasse. Geen cross-tenant cache voor adressen, place IDs, routes of matrices. Traffic-ETA's horen hooguit enkele minuten in cache; de bestaande tienminutencache kan als startpunt dienen, maar moet tenantbewust, gedistribueerd en contractueel gelabeld worden. Sla polylines en turn-by-turn-stappen niet op tenzij een goedgekeurde use case dat aantoonbaar nodig maakt.

## 5. Releasegates

Voor productie moeten minimaal deze besluiten zijn vastgelegd:

- EEA-voorwaarden door een bevoegde vertegenwoordiger geaccepteerd en Places-“With any Map”-gebruik juridisch beoordeeld;
- CSP-keuze voor interactieve Maps JavaScript expliciet goedgekeurd;
- browser-, Android- en servercredentials gescheiden en beperkt;
- server-side OAuth/Workload Identity ingericht of een tijdelijke, aantoonbaar beperkte API-key;
- field-mask allowlists, request-/elementlimieten en tenantautorisatie afgedwongen;
- providerdata, user-confirmed data en afgeleide planningbesluiten afzonderlijk gemodelleerd;
- quota én budgetalerts ingesteld, met fallback die planning zonder Google mogelijk houdt;
- logging bevat geen volledige adressen, coördinaten, polylines, queries, session tokens of keys;
- live locatie en opgenomen lesroutes blijven feature-disabled totdat `10-privacy-assessment.md` is afgerond en goedgekeurd.

## 6. Primaire officiële bronnen

- [Google Maps Platform pricing](https://developers.google.com/maps/billing-and-pricing/pricing)
- [SKU details](https://developers.google.com/maps/billing-and-pricing/sku-details)
- [API security best practices](https://developers.google.com/maps/api-security-best-practices)
- [Google Maps Platform EEA Terms](https://cloud.google.com/terms/maps-platform/eea)
- [EEA Service Specific Terms](https://cloud.google.com/terms/maps-platform/eea/maps-service-terms)
- [EEA FAQ](https://developers.google.com/maps/comms/eea/faq)

Prijzen, quota en voorwaarden kunnen wijzigen. De Cloud Console, het billing-account en de op de productiedatum geldende contractversie zijn steeds leidend.

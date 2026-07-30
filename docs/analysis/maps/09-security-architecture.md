# Security-architectuur voor Google Maps, locaties en routes

**Peildatum:** 30 juli 2026  
**Status:** doelarchitectuur en releasegates; geen implementatie

## 1. Kernbesluit

Google Maps mag in NXTDRIVE geen gedeelde “maps key” en geen directe clienttoegang tot gevoelige route- of optimalisatie-API's introduceren. De aanbevolen grens is:

```text
Browser ── beperkte web-key ──> Maps JavaScript / Places-clientfunctie
   │
   └── NXTDRIVE API ── service identity/OAuth ──> Places REST / Address Validation
                       │                         Geocoding / Routes / Route Optimization
                       └── tenantautorisatie, limieten, redactie, usage ledger

Android ── package + SHA-1 beperkte key ──> Maps SDK óf Navigation SDK
```

Minimaal nodig:

- aparte Google Cloud-projecten voor staging en productie;
- aparte credentials voor browser, Android en server, verder opgesplitst als de blast radius dat rechtvaardigt;
- één application restriction én expliciete API-restricties op iedere API-key;
- server-to-server bij voorkeur met Workload Identity/service account en kortlevende OAuth-tokens;
- tenant-, gebruiker- en kostenlimieten vóór iedere server-call;
- geen adres, route, coördinaat, polyline, search query, place ID, session token of key in logs;
- featuredegradatie bij provider-, auth-, quota- en budgetproblemen;
- geen live locatie of routeopname voordat privacy/DPIA/medezeggenschap is afgerond.

De actuele [Google API security best practices](https://developers.google.com/maps/api-security-best-practices) zijn leidend. Een browser-key is door zijn aard zichtbaar; veiligheid komt daar van correcte referrer- en API-restricties, niet van verbergen in JavaScript.

## 2. Bevindingen in de huidige repository

### 2.1 Positieve basis

- De applicatie genereert een requestnonce en gebruikt `script-src 'self' 'nonce-…' 'strict-dynamic'`.
- `unsafe-eval` is expliciet niet toegestaan en die keuze is vastgelegd in [ADR-001](../../decisions/ADR-001-security-observability-foundation.md).
- `Permissions-Policy` zet browsergeolocatie uit.
- De Google loader kopieert een bestaande nonce naar het geïnjecteerde script, vangt `gm_authFailure` af en degradeert naar een niet-kaartweergave.
- De Routes-helper staat als server-side bedoeld beschreven, gebruikt een korte timeout, begrenst de matrix en heeft een Haversine-fallback.
- Correlation IDs, redactie en een PostgreSQL-rate-limitfundament bestaan al.

### 2.2 Blokkerende of risicovolle punten

| Bevinding                                                                                                  | Risico                                                                                  | Vereiste vóór release                                                          |
| ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| De officiële Maps JavaScript strict-CSP-configuratie bevat `'unsafe-eval'`; ADR-001 verbiedt dit permanent | Interactieve kaart werkt niet betrouwbaar óf securitybeleid wordt stilzwijgend verzwakt | Expliciet ADR-/architectuurbesluit; zie §3                                     |
| `connect-src` staat nu alle `https:` en `wss:` toe                                                         | Exfiltratie naar iedere HTTPS/WebSocket-origin blijft CSP-technisch mogelijk            | Maak een expliciete allowlist; Google-origins alleen op kaartroute/origin      |
| `img-src` en `media-src` staan generiek `https:` toe                                                       | Te brede laadruimte en slechtere detectie van onverwachte vendors                       | Vervang door gemeten noodzakelijke origins                                     |
| `frame-src` staat alleen self en OpenStreetMap toe                                                         | Google Maps Embed-fallback wordt geblokkeerd                                            | Alleen indien Embed gekozen: expliciete Google-frame-origin toevoegen          |
| Serverhelper gebruikt `GOOGLE_ROUTES_API_KEY`                                                              | Langlevende key en grotere impact bij server-/loglek                                    | OAuth/Workload Identity; tijdelijk key alleen met API- en egress-IP-restrictie |
| De helper heeft geen expliciete `server-only`-compile guard                                                | Latere importrefactor kan secretcode naar een clientbundel trekken                      | Server-only modulegrens plus buildtest                                         |
| Matrix-field-mask mist `status`                                                                            | Per-elementfout kan als schijnbaar geldige response worden verwerkt                     | `status` opnemen en per element afdwingen                                      |
| Limiet staat op 625 voor alle modi                                                                         | `TRAFFIC_AWARE_OPTIMAL` heeft een lagere productlimiet; requests kunnen falen           | Limiet afleiden van routing preference; momenteel maximaal 100 voor deze modus |
| Cachekey bevat alleen exacte coördinaten                                                                   | Geen expliciete tenant-, product-, vertrektijd- of routing-isolatie                     | Tenantbewuste, versie- en tijdgebonden cachekey                                |
| Procescache wordt bij drukte volledig gewist                                                               | Geen gedeelde limiet, onvoorspelbare miss storm per replica                             | Gedistribueerde TTL-cache/single-flight of veilig zonder cache                 |
| Catch-all retourneert alleen lege resultaten                                                               | Auth-, quota-, netwerk- en dataproblemen zijn operationeel niet te onderscheiden        | Interne fouttaxonomie/metrics, generieke UI-fout                               |
| Legacy Autocomplete en afgeschreven `Marker`                                                               | Verouderd API-oppervlak en moeilijker veld-/SKU-beheer                                  | Migreren naar Places (New) en Advanced Markers                                 |
| Loader haalt `places`, `maps`, `marker`, `core` samen op                                                   | Meer code en provideroppervlak op pagina's die het niet nodig hebben                    | Libraries route-/featurematig lazy-loaden                                      |
| Marker-info gebruikt HTML-string                                                                           | XSS-risico bij toekomstige uitbreiding ondanks huidige escaping                         | DOM-node/tekstcontent of bewezen sanitizer; geen tenant-HTML                   |

De relevante broncode staat in [security headers](../../../artifacts/nxtdrive/lib/security/headers.ts), [Maps loader](../../../artifacts/nxtdrive/lib/maps/loader.ts), [Places autocomplete](../../../artifacts/nxtdrive/components/places-autocomplete.tsx), [trial route map](../../../artifacts/nxtdrive/components/trial-route-map.tsx) en [route helper](../../../artifacts/nxtdrive/lib/trial-lessons/route.ts).

## 3. CSP-impact en oplossingskeuze

### 3.1 Vastgesteld conflict

Google beschrijft een nonce-gebaseerde strict CSP voor Maps JavaScript, maar de gepubliceerde configuratie vereist ook `'unsafe-eval'`, Google-script-/connect-/imageorigins en nonce-propagatie naar de eerste script- en style-elementen. Zie [Maps JavaScript Content Security Policy](https://developers.google.com/maps/documentation/javascript/content-security-policy).

NXTDRIVE heeft tegelijk een geaccepteerd besluit dat permanente `unsafe-eval` verbiedt. Een nonce op het bootstrap-script lost het gebruik van `eval` in de geladen Google-runtime niet op. De kaart toevoegen is daarom geen gewone allowlistwijziging.

De huidige brede `connect-src https:` laat Google-netwerkverkeer waarschijnlijk door, maar is geen acceptabele Maps-configuratie: het verbergt welke origins echt nodig zijn en laat ook iedere andere HTTPS-origin toe. CSP moet in staging via report-only/verzamelde overtredingen worden aangescherpt; kopieer geen verouderde domeinenlijst uit deze analyse.

### 3.2 Opties

| Optie                                                         | Effect                                                                              | Security-/productafweging                                                                                                                  |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| A. Geen interactieve Google-kaart in eerste release           | Lijst, externe Google Maps-link en eventueel Embed waar toegestaan                  | Behoudt `unsafe-eval`-verbod; minste complexiteit; minder rijke planner-UX                                                                 |
| B. Kaart op geïsoleerde, dedicated origin in sandboxed iframe | `maps.nxtdrive…` heeft eigen minimale CSP en geen sessiecookies; parent behoudt ADR | Sterkere blast-radiusisolatie, maar postMessage, toegankelijkheid, framing, originbeheer en Googlevoorwaarden moeten goed worden ontworpen |
| C. Route-specifieke CSP-exceptie in hoofdapp                  | Alleen kaartroutes krijgen gedocumenteerd `'unsafe-eval'` en Google-origins         | Eenvoudiger UX, maar wijzigt ADR en vergroot XSS-impact op routes met gevoelige planningdata                                               |
| D. Globale CSP-verruiming                                     | Google Maps werkt overal                                                            | Niet aanbevelen; onnodig groot oppervlak en strijdig met bestaande keuze                                                                   |

**Aanbeveling.** Kies voor de eerste release A. Als de interactie aantoonbaar essentieel is, maak B de voorkeurs-PoC: dedicated origin, geen authcookies/secrets, geminimaliseerde markerpayload, exacte `postMessage`-origins en sandbox-capabilities. Optie C kan alleen na formele ADR-wijziging, threat model en routegerichte tests. D is een release blocker.

### 3.3 CSP-validatie

Voor de gekozen kaartcontext:

1. Gebruik de actuele Google CSP-documentatie als bron voor noodzakelijke origins.
2. Begin met `Content-Security-Policy-Report-Only` in een stagingproject met eigen key.
3. Test map load, zoom/pan, Advanced Markers, clusters, Traffic Layer, Places New, auth failure en netwerkfailure.
4. Controleer nonce-propagatie naar door Google gemaakte script- en style-elementen.
5. Behoud `object-src 'none'`, `base-uri`, `form-action`, `frame-ancestors` en een beperkte `worker-src`.
6. Voeg alleen `frame-src` toe wanneer Embed of geïsoleerde maporigin werkelijk wordt gebruikt.
7. Maak CSP-rapporten privacyveilig: strip volledige document-URL/query en samplecontent.
8. Leg elke uitzondering met eigenaar, scope en herbeoordelingsdatum vast.

De huidige `Permissions-Policy: geolocation=()` hoort voor geplande locaties en serverroutes onveranderd te blijven. Live webgeolocatie vereist later een afzonderlijk route-/originbeleid en privacygate; maak geolocatie niet globaal open omdat Maps JavaScript aanwezig is.

## 4. Project- en credentialmodel

### 4.1 Omgevingen

Gebruik minimaal:

- een productieproject/billingcontext;
- een stagingproject met eigen key/service identity, lager quota en geen productiegegevens;
- lokaal ontwikkelen met een aparte, sterk beperkte key of mocks.

Projectnamen zijn organisatiekeuzes; de harde eis is dat productiecredential, quota, auditlog en facturatie niet door staging worden gedeeld. Schakel alleen gebruikte API's in.

### 4.2 Credentialmatrix

| Credential                                | Application restriction                                                                | API restrictions                                              | Opslag/gebruik                                                     |
| ----------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------ |
| Web Maps                                  | Exacte HTTPS-productieorigins als HTTP referrer; geen brede wildcarddomeinen           | Maps JavaScript en alleen noodzakelijke client-Places-service | Publieke runtimeconfig; nooit server-API's                         |
| Web staging                               | Exacte stagingorigin, geen productieorigin                                             | Zelfde of kleinere API-set                                    | Eigen laag quota                                                   |
| Android Maps                              | Package name + SHA-1 van release signing cert                                          | Maps SDK for Android                                          | Android manifest/secure buildconfig; key is zichtbaar maar beperkt |
| Android Navigation                        | Package + SHA-1; aparte key van basiskaart                                             | Navigation SDK                                                | Alleen indien Navigation is geactiveerd                            |
| Android debug                             | Debugpackage + debugcert                                                               | Alleen gebruikte SDK                                          | Nooit geaccepteerd voor productiepackage                           |
| Server Places/Validation/Geocoding/Routes | Voorkeur: geen API-key maar service identity/OAuth; tijdelijke key met vaste egress-IP | Exacte server-API's; liefst sleutel per risicodomein          | Secret Manager, nooit client/DB/log                                |
| Route Optimization                        | Workload Identity/service account en minimaal IAM                                      | Route Optimization, `routeoptimization.locations.use`         | Kortlevend OAuth-token                                             |

Google staat per API-key slechts één type application restriction toe. Deel daarom nooit één key tussen web en Android of web en server. Gebruik bij HTTP-referrers volledige verwachte origins en test dat onbekende origins, `localhost`, previewdeployments en gekloonde mobiele packages worden geweigerd.

Voor serverproducten moet per product worden geverifieerd welke OAuth-authenticatie op de gekozen versie wordt ondersteund. Route Optimization vereist de service-account/IAM-route. Wanneer een API-key tijdelijk noodzakelijk is, gelden tegelijk:

- server-only Secret Manager;
- vaste NAT/egress-IP die als application restriction is ingesteld;
- exacte API-restricties;
- klein quota;
- korte rotatiecyclus;
- geen opname in `.env.example` met echte waarde, build artifact, telemetry of foutresponse.

## 5. Server-side control plane

Iedere Maps-serveractie doorloopt dezelfde controlelaag:

1. authenticatie van de NXTDRIVE-gebruiker/service;
2. resolutie van de actieve tenant op de server, nooit uit een vertrouwde clientheader alleen;
3. rol- en objectautorisatie: mag deze gebruiker deze les/adressen zien of wijzigen?;
4. schemas/normalisatie en locatiebegrenzing;
5. plan/entitlementcontrole;
6. kostenweging en rate limit;
7. cache-/single-flightcontrole binnen dezelfde tenant en use case;
8. minimale Google-request met expliciet field mask;
9. schema-, status- en contractvalidatie per response/element;
10. privacyveilige usage- en foutmetrics;
11. generieke, productgerichte fallback naar de client.

### 5.1 Inputlimieten

Handhaaf vóór de provider-call:

- maximale querylengte en toegestaan karakter-/landbereik;
- geldige lat/lng-ranges en geen `NaN`/infinity;
- maximum origins, destinations, elementen, waypoints, vehicles en shipments;
- lagere matrixlimiet voor `TRAFFIC_AWARE_OPTIMAL`;
- maximale requestbody en timeout;
- vertrek-/aankomsttijd binnen een aanvaardbaar venster;
- geen polylines/fields/route modifiers buiten een server-side allowlist.

Maak requestkosten berekenbaar vóór uitvoering. Een matrix van 20 × 20 kost 400 elementen, ook al is het één HTTP-call. Een optimalisatie wordt op shipments afgerekend. De rate limiter moet dus naast request count een gewogen cost unit ondersteunen.

### 5.2 Rate limiting en misbruik

Gebruik het bestaande atomaire PostgreSQL-bucketfundament, niet procesgeheugen, met samengestelde limieten:

- per tenant en product;
- per gebruiker/rol;
- per bron-IP als extra signaal, niet als tenantidentiteit;
- per tijdvenster en maandentitlement;
- globale circuitbreaker onder het Google-projectquota.

Autocomplete in de browser heeft daarnaast Cloudquota/referrerrestrictie; voor high-risk endpoints zoals matrix en optimalisatie mag alleen de server het aantal kandidaten bepalen. Voeg deduplicatie/single-flight en idempotency voor optimalisatieopdrachten toe.

### 5.3 Tenantisolatie

- Leid tenant-ID af uit de serverauthcontext en neem hem op in queryscope, autorisatie, cache namespace en usage ledger.
- Deel geen cache-entry op basis van alleen coördinaten of place ID tussen tenants.
- Geef route-/optimalisatiejobs een tenant-owner en controleer die bij polling/download.
- Gebruik row-level safeguards waar de datalaag die biedt; test expliciet cross-tenant object IDs.
- Geef browsermarkers alleen gegevens van het huidige geautoriseerde viewport/filter, niet alvast de hele tenantdataset.
- Voorkom dat een student andere leerlingen, routes of instructeurhistorie kan enumereren.

## 6. Field masks en responsevalidatie

Field masks zijn tegelijk dataminimalisatie, kostenbeheersing en schema-contract. Definieer ze server-side:

| API                   | Minimale uitgangsset                                                                             |
| --------------------- | ------------------------------------------------------------------------------------------------ |
| Autocomplete New REST | `suggestions.placePrediction.placeId,suggestions.placePrediction.text.text`                      |
| Place Details New     | `id,formattedAddress,addressComponents,location`                                                 |
| Geocoding v4          | `results.placeId,results.location,results.granularity`                                           |
| Compute Routes        | `routes.duration,routes.distanceMeters`; alleen zo nodig `routes.polyline.encodedPolyline`       |
| Compute Route Matrix  | `originIndex,destinationIndex,status,condition,distanceMeters,duration`; zo nodig `fallbackInfo` |
| Waypoint optimization | bovenstaande routevelden plus `routes.optimizedIntermediateWaypointIndex`                        |

Gebruik geen `*` in productie en accepteer geen willekeurige client-provided field masks. Voor Address Validation bestaat geen vergelijkbaar SKU-sturend responsemask; reduceer de intern verwerkte response tot verdict, noodzakelijke componenten en minimale geocode.

Valideer HTTP-status, response content type/omvang en ieder matrixelement. Een provider-200 betekent niet dat iedere relatie een route heeft. Een ontbrekende duration, non-OK `status`, `ROUTE_NOT_FOUND` of fallback trafficmodel blijft een expliciete interne toestand.

## 7. Secrets, rotatie en incidentrespons

### 7.1 Levenscyclus

- Inventariseer eigenaar, omgeving, APIscope, restriction, aanmaakdatum, laatste gebruik en rotatiedatum per credential.
- Gebruik twee overlappende servercredentials tijdens gecontroleerde rotatie; valideer de nieuwe vóór intrekken van de oude.
- Android-rotatie moet rekening houden met oude appversies; beperk die key alsnog op package + cert + API en monitor versiegebruik.
- Browser-keyrotatie is een deployment, maar referrer-/API-restricties blijven de primaire beveiliging.
- Scan repository en buildlogs op keypatronen; behandel ook historische commits als mogelijk lek.
- Audit Cloud IAM, API-keywijzigingen, API-enablement en quota-aanpassingen.

### 7.2 Bij vermoed lek/misbruik

1. Identificeer credential, project, APIs en afwijkend verbruik zonder de key in tickets te plakken.
2. Verlaag quota/disable feature of key waar nodig.
3. Maak een nieuwe beperkte credential/service identity en rol gecontroleerd.
4. Trek de oude credential in.
5. Onderzoek logs, billing en tenantimpact; bewaar forensische gegevens proportioneel.
6. Beoordeel of locatie-/persoonsgegevens geraakt zijn en activeer het privacy-incidentproces.
7. Leg oorzaak en preventieve maatregel vast.

## 8. Logging, monitoring en audit

### 8.1 Wel registreren

- pseudonieme/interne tenant-ID;
- API, methode, SKU-klasse en pricingversie;
- request count, matrixelementen, vehicles/shipments/destinations;
- statuscategorie, providerfoutcodeklasse, latency en timeout;
- cache hit/miss, retry count, routing preference en fallbacktype;
- correlation ID/trace ID;
- geautoriseerde actor-ID voor mutaties en publicatie van een planning;
- credential-ID/versie als interne alias, nooit de secret.

### 8.2 Niet registreren

- volledige of gedeeltelijke adressen en zoektekst;
- lat/lng, geohash of polyline;
- place IDs en Autocomplete-session tokens;
- studenten-/instructeursnamen, telefoon of e-mail;
- Google API-keys, OAuth-tokens of requestheaders;
- volledige providerrequest/-response;
- crash breadcrumbs met kaartviewport of markerpayload.

“Hash het adres” is geen automatische anonimisering: adressen hebben een klein en voorspelbaar domein en zijn vaak herleidbaar. Gebruik liever geen locatie-identificator in operationele logs. Als correlatie functioneel nodig is, gebruik een kortlevend, tenantgebonden intern request-ID dat niet uit het adres is afgeleid.

### 8.3 Signalen en alerts

- auth/permission failures en `gm_authFailure`;
- 429/5xx/timeouts en partial matrix failures;
- p50/p95/p99-latency en fallbackpercentage;
- no-route, low-granularity en validation override;
- quota op 50/80/95% en budgetforecast;
- onverwacht verbruik per credential/origin/package/API;
- nieuwe CSP-origins, `unsafe-eval`-overtredingen en Maps loader failures;
- elements-per-user-action en shipments-per-optimization;
- cachemiss-storm of retry-amplificatie.

Budgetalerts zijn geen kill switch. Combineer [Google monitoring](https://developers.google.com/maps/reporting-and-monitoring/monitoring), quota, NXTDRIVE cost-weighted rate limits en een featureflag/circuitbreaker.

## 9. Foutafhandeling en degradatie

De client krijgt producttaal, geen providerinternals:

| Interne toestand              | Veilige gebruikersmelding                    | Fallback                                                                  |
| ----------------------------- | -------------------------------------------- | ------------------------------------------------------------------------- |
| Auth/config/CSP               | “Kaart is tijdelijk niet beschikbaar”        | Lijst/externe link; operationele alert                                    |
| Quota/budget/circuit open     | “Reistijd kon niet worden vernieuwd”         | Gemarkeerde recente waarde of handmatige controle                         |
| 429/5xx/netwerk               | “Externe routeservice reageert niet”         | Begrensde retry server-side; daarna fallback                              |
| Ongeldig/ambigu adres         | “Controleer en bevestig het adres”           | Handmatige invoer/validation state                                        |
| Geen route                    | “Geen autoroute gevonden”                    | Plannerbesluit; nooit 0 minuten                                           |
| Gedegradeerde trafficresponse | “Schatting zonder actuele verkeersdata”      | Toon `asOf`/confidence                                                    |
| Optimization infeasible       | “Geen planning voldoet aan alle voorwaarden” | Bestaande planning behouden; constraints toelichten zonder Google-payload |

Retourneer geen Google-body, key, project-ID, stacktrace, quota-detail of volledig ingevoerd adres in een foutresponse. Differentieer de toestand intern voor operations.

## 10. Threat model

| Dreiging                   | Voorbeeld                                                | Belangrijkste maatregelen                                                 |
| -------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------- |
| Keymisbruik                | Browser-key gebruikt voor dure Routes-calls              | Key per app, referrer/package/IP + API-restricties, quota                 |
| Kostenuitputting           | Onbegrensde 25×25 matrices of retryloop                  | Elementlimiet, cost-weighted buckets, idempotency, circuitbreaker         |
| Cross-tenant lek           | Cache hit op dezelfde coördinaten bij andere rijschool   | Tenantnamespace en authz op ieder object/job                              |
| Locatie-exfiltratie        | Adressen/coords in logs of CSP-toegestane endpoint       | Logredactie, expliciete connect allowlist, egresscontrole                 |
| Clientmanipulatie          | Client vraagt extra Placesvelden of honderden kandidaten | Server-side allowlist en kandidaatselectie                                |
| XSS via marker             | Studentlabel als HTML in InfoWindow                      | Text nodes/sanitizer, minimal markerdata, CSP                             |
| Werknemersmonitoring creep | Geolocatie buiten actieve les                            | Feature off, privacygate, scope/indicator/retentie; zie privacyassessment |
| Providerstoring            | Routes/optimization onbeschikbaar                        | Geen hard dependency voor kernplanning, stale/handmatig fallback          |
| Supply-chain/API drift     | Weekly Maps loader wijzigt onverwacht                    | Stagingcanary, releasekanaalbeleid, CSP/error monitoring                  |

De huidige loader gebruikt `v: "weekly"`. Voor snelle fixes is dat praktisch, maar productie moet bewust kiezen tussen weekly en een stabiel kanaalbeleid, met stagingcanary en compatibiliteitstests. Een versiewijziging mag niet tegelijk ongetest de CSP-allowlist en marker-/Places-contracten veranderen.

## 11. Test- en releasegates

### Automatisch

- key ontbreekt, verkeerd referrer/package, API niet enabled en billing off;
- servermodule kan niet in een clientbundle worden geïmporteerd;
- field-mask snapshots bevatten geen `*` of Pro-veld zonder entitlement;
- matrix `status`/`condition` en partial errors;
- 100-elementlimiet voor traffic-aware optimal, algemene productlimieten en overflow vóór provider-call;
- cost-weighted tenant/user/IP/global rate limits;
- cross-tenant cache/job/object tests;
- timeout, 429, 5xx, invalid argument, no route en stale fallback;
- logcapturing bewijst dat adres, coords, place ID, polyline, session token en key afwezig zijn;
- CSP in report-only en enforcement, inclusief onverwachte origin en `unsafe-eval`;
- generieke foutresponses bevatten geen providerbody/secret.

### Handmatig

- Cloud Console-restricties inspecteren vanaf een niet-toegestane origin/package/IP;
- IAM/service-accountrechten minimaliseren;
- quota- en budgetalert end-to-end testen;
- keyrotatie oefenen;
- planning bruikbaar houden bij volledige Google-blokkade;
- privacyrollen/zichtbaarheid testen voor student, instructeur, planner en tenantadmin;
- EEA-voorwaarden en actuele Google-domainlijst opnieuw controleren.

### Go/no-go

Geen productie zonder:

1. vastgelegd CSP-besluit;
2. beperkte, gescheiden credentials en service identities;
3. server-side tenant-/rolautorisatie en cost limits;
4. privacyveilige observability en incidentrunbook;
5. providerloze fallback voor planning;
6. EEA/privacygoedkeuring voor de werkelijk geactiveerde categorieën;
7. bewezen afwijzing van onbekende origins, packages en cross-tenant IDs.

## 12. Open besluiten

- Geen interactieve map, geïsoleerde maporigin of ADR-wijziging met route-exceptie?
- OAuth/Workload Identity per Google server-API of tijdelijk IP-beperkte keys?
- Welke exacte production/stagingorigins en Android signingcertificaten zijn beheerd?
- Welke matrix- en optimization-entitlements gelden per tenantplan?
- Hoe lang mag een afgeleide plannings-ETA voor audit blijven bestaan?
- Wie bezit keyrotatie, Google billingincidenten en CSP-allowlistreview?
- Blijft geolocatie globaal uit totdat een afzonderlijke live-location releasegate is behaald?

Deze besluiten horen door security, platform, product, privacy en een bevoegde eigenaar gezamenlijk te worden vastgelegd.

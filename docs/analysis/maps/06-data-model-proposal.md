# 06 — Voorstel providerneutraal locatiemodel

Status: ontwerpvoorstel, geen migratie

Doel: één intern contract voor adressen en plaatsen, zonder Google-identiteit tot businessidentiteit te maken

## Ontwerpuitgangspunten

1. **NXTDRIVE-identiteit is leidend.** Een location krijgt een eigen UUID. Providerreferenties zijn vervangbare provenance.
2. **Actuele defaultlocaties en historische stops zijn verschillend.** Een leerling kan morgen verhuizen zonder dat de route-input van gisteren verandert.
3. **Gebruik is een relatie, geen kolom op de locatie.** HOME, PICKUP, BRANCH_BASE en VEHICLE_BASE horen op relaties; hetzelfde record kan voor meerdere rollen dienen.
4. **Provideroutput en klantinvoer blijven herleidbaar.** Handmatig gecorrigeerde gegevens mogen niet worden voorgesteld als provider-gevalideerd.
5. **Rayons blijven aparte gebiedsdata.** Een gebied is niet hetzelfde als een punt of postadres.
6. **Additief en tenant-safe.** Alle tenantrelaties worden database-side afgedwongen, niet alleen in application code.
7. **Dataminimalisatie.** Geen ruwe providerresponses; alleen velden die nodig, toegestaan en operationeel uitlegbaar zijn.

## Domain contract

Het appcontract kan compact en providerneutraal blijven:

```ts
type LocationType =
  | "ADDRESS"
  | "PICKUP_POINT"
  | "DROPOFF_POINT"
  | "BRANCH"
  | "VEHICLE_BASE"
  | "ASSESSMENT_LOCATION"
  | "MEETING_POINT"
  | "OTHER";

type LocationValidationStatus =
  | "UNVALIDATED"
  | "VALID"
  | "PARTIAL"
  | "MANUALLY_CONFIRMED"
  | "INVALID";

type LocationSource =
  | "USER_ENTERED"
  | "PROVIDER_RESULT"
  | "CSV_IMPORT"
  | "ADMIN_CORRECTION";

type LocationRecord = {
  id: string;
  tenantId: string;

  type: LocationType;
  label: string;

  formattedAddress: string;
  street?: string;
  houseNumber?: string;
  houseNumberAddition?: string;
  postalCode?: string;
  city?: string;
  region?: string;
  countryCode: string;
  latitude?: number;
  longitude?: number;

  provider?: "GOOGLE";
  providerPlaceId?: string;

  validationStatus: LocationValidationStatus;
  source: LocationSource;

  providerDataRefreshedAt?: string;
  validatedAt?: string;

  createdAt: string;
  updatedAt: string;
};
```

Dit is het minimale **domain view** uit de opdracht, niet noodzakelijk één fysieke tabel. Interne migratie- of workflowstatussen zoals `LEGACY_BACKFILL`, `PROVIDER_AUTOCOMPLETE` of `PARTIALLY_VALIDATED` kunnen in provenance-/jobrecords bestaan, maar worden aan deze stabiele publieke contractwaarden gemapt. In opslag verdient providerprovenance een aparte tabel, zodat een locatie later meerdere providerreferenties kan hebben en Google-specifieke retentie/refresh niet aan de businessrij vastzit.

## Fysiek model

### `location_records`

Voorgestelde kernkolommen:

| Kolom                                                                              | Type/regel                | Betekenis                                                                                                             |
| ---------------------------------------------------------------------------------- | ------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `id`                                                                               | UUID PK                   | Interne stabiele identiteit.                                                                                          |
| `tenant_id`                                                                        | UUID not null, FK tenant  | Eigenaar en RLS-scope.                                                                                                |
| `type`                                                                             | gecontroleerde text/enum  | Brede aard van de plaats; de concrete gebruiksrol blijft op de owner-/stoprelatie.                                    |
| `label`                                                                            | text not null             | Klantlabel zoals “Thuis”, “Station” of “Vestiging Noord”; mag bij import eerst gelijk zijn aan het formatted address. |
| `formatted_address`                                                                | text not null             | Leesbare NXTDRIVE-weergave; kan provider- of handmatig afkomstig zijn.                                                |
| `street`, `house_number`, `house_number_addition`, `postal_code`, `city`, `region` | text nullable             | Genormaliseerde componenten. Niet ieder named place heeft alle adresdelen.                                            |
| `country_code`                                                                     | char(2) not null          | ISO 3166-1 alpha-2, uppercase; default niet blind op NL zetten bij import.                                            |
| `latitude`, `longitude`                                                            | double precision nullable | Beide aanwezig of beide afwezig; bereikchecks.                                                                        |
| `validation_status`                                                                | gecontroleerde text/enum  | Geen impliciete claim op basis van alleen coördinaten.                                                                |
| `source`                                                                           | gecontroleerde text/enum  | Herkomst van de huidige versie.                                                                                       |
| `geocode_precision`                                                                | text nullable             | Bijvoorbeeld `ROOFTOP`, `STREET`, `POSTAL_CODE`, `LOCALITY`, `UNKNOWN`; intern genormaliseerd.                        |
| `normalized_fingerprint`                                                           | text nullable             | Tenant-lokale kandidaatdetectie, niet als automatische mergebeslissing.                                               |
| `manually_confirmed_by`, `manually_confirmed_at`                                   | nullable                  | Uitlegbaarheid van handmatige correctie.                                                                              |
| `provider_data_refreshed_at`, `validated_at`                                       | nullable                  | Freshness en bewijs voor respectievelijk providerref en `VALID` status.                                               |
| `superseded_by_location_id`                                                        | self-FK nullable          | Wijziging creëert een nieuwe businessversie; oude snapshots blijven stabiel.                                          |
| `active`, `created_at`, `updated_at`                                               | standaard                 | Lifecycle en auditbare timestamps.                                                                                    |

**Versiestrategie:** behandel semantische wijzigingen aan adres/coördinaten als “copy-on-change”: maak een nieuwe `location_records`-rij en verplaats alleen actuele defaultrelaties. Bestaande geplande/historische stops blijven naar de oude rij verwijzen. Een label of status mag zo nodig in-place wijzigen; adrescomponenten en coördinaten niet nadat het record in een definitieve afspraak is gebruikt.

Dit vermijdt in de eerste versie een zware `location_versions`-tabel, maar geeft wel immutable route-input. Als veel niet-adresmetadata later apart versieerbaar wordt, kan een expliciete versietabel alsnog worden toegevoegd.

### `location_provider_refs`

| Kolom                            | Regel                                                                         |
| -------------------------------- | ----------------------------------------------------------------------------- |
| `id`, `tenant_id`, `location_id` | `location_id + tenant_id` moet naar dezelfde tenant wijzen.                   |
| `provider`                       | Extensible text; in eerste instantie `GOOGLE`.                                |
| `provider_place_id`              | Provideridentiteit, geen business-ID.                                         |
| `provider_formatted_address`     | Alleen bewaren als productvoorwaarden en doelbinding dit toestaan.            |
| `resolved_at`, `refreshed_at`    | Provenance en freshness.                                                      |
| `metadata`                       | Standaard `{}`; alleen allowlisted minimale waarden, nooit een ruwe response. |

Uniek: `(tenant_id, provider, provider_place_id)`, waar een provider-ID aanwezig is. Een locatie zonder providerreferentie blijft volledig geldig.

### Relaties voor actuele defaults

#### `student_locations`

| Kolom                                          | Regel                                                                   |
| ---------------------------------------------- | ----------------------------------------------------------------------- |
| `id`, `tenant_id`, `student_id`, `location_id` | Samengestelde tenant-FK’s/guards.                                       |
| `role`                                         | `HOME`, `DEFAULT_PICKUP`, `DEFAULT_DROPOFF`, `SCHOOL`, `WORK`, `OTHER`. |
| `label`                                        | Optioneel relatie-specifiek label; verandert de locatie niet.           |
| `is_default`                                   | Partiële unique index per `(tenant_id, student_id, role)` waar true.    |
| `valid_from`, `valid_until`                    | Optioneel voor verhuizing/toekomstige default.                          |
| `created_by`, timestamps                       | Audit.                                                                  |

HOME en DEFAULT_PICKUP kunnen naar dezelfde `location_id` verwijzen. Daarmee is “pickup gelijk aan thuis” een relatiekeuze in plaats van tekstkopie. Een afwijkend pickupadres krijgt een apart record.

#### Overige ownerrelaties

- `branches.primary_location_id` of een `branch_locations`-relatie met rollen `PRIMARY`, `MEETING_POINT`, `PARKING`.
- `vehicles.base_location_id` voor de operationele standplaats, los van `branch_id`.
- `instructor_day_location_preferences` met `instructor_id`, `local_date` of geldigheidsperiode, `start_location_id`, `end_location_id`. Dit is planningvoorkeur, geen live tracking en geen verplicht privéwoonadres.
- De bestaande `public.locations`-catalogus wordt gemigreerd naar named saved locations of krijgt een expliciete `saved_location`-relatie. Naam, branch scope en sort order zijn catalogusmetadata; adrescomponenten horen in `location_records`.

### Afspraakstops en snapshots

Gebruik één intern stopcontract:

```ts
type PlanningStopRole = "START" | "PICKUP" | "DROPOFF" | "DESTINATION" | "END";

type PlanningStop = {
  id: string;
  tenantId: string;
  role: PlanningStopRole;
  locationId: string; // immutable/superseded-safe record
  sourceLocationId?: string; // actuele default waaruit gekopieerd
  sequence: number;
};
```

Fysiek verdient een niet-polymorfe FK de voorkeur. Een pragmatische eerste versie:

- `lesson_stops(lesson_id, tenant_id, role, sequence, location_id, source_location_id)`
- `trial_lesson_stops(...)`
- `agenda_appointment_stops(...)`
- booking request/candidate kan dezelfde velden plus een immutable `location_id` gebruiken, maar blijft lifecycledata.

Als codehergebruik zwaarder weegt, kan een generieke `planning_stops(owner_type, owner_id, ...)` alleen worden gekozen met database-triggers die owner-bestaan en tenantgelijkheid afdwingen. Losse polymorfe UUID’s, zoals het huidige `leads.assigned_location_id`, zijn niet acceptabel.

De bestaande tekstkolommen blijven tijdens transitie een **weergavesnapshot**. Op bevestiging:

1. resolveer of maak een immutable location record;
2. schrijf stoprelatie en source;
3. projecteer `formatted_address` naar het legacy tekstveld;
4. projecteer coördinaten/Place ID zolang oude callers die nodig hebben.

### CBR-/examencentra

CBR-locaties zijn gedeelde referentiedata en niet vanzelf tenantbezit. Houd een platformbrede `assessment_location_catalog` gescheiden van tenantdata. Wanneer een tenant een examen boekt:

- koppel het catalogus-ID als inhoudelijke referentie;
- materialiseer of selecteer een tenant-bound immutable `location_record` voor planning en historie;
- bewaar pickup en exam destination als twee afzonderlijke stops.

Zo blijft `LocationRecord.tenantId` consequent en ontstaan geen nullable-tenant/RLS-uitzonderingen in het kernmodel.

### Service areas

Behoud `service_areas`, `service_area_zones` en de handmatige area-matrix als beleidslaag. Voeg hoogstens:

- een afgeleide `location_service_area_membership` met method/status;
- later geometrieën/polygonen aan service areas;
- een optioneel centroid voor weergave, niet als routepunt.

Een canonical location wordt aan een rayon geclassificeerd; zij wordt er niet door vervangen.

## Validatie-invarianten

Deze regels horen zowel in inputservices als, waar mogelijk, in databaseconstraints:

1. `latitude` en `longitude` zijn beide null of beide niet-null; respectievelijk `[-90,90]` en `[-180,180]`.
2. Geen unique constraint op coördinaten: flats, bedrijfsverzamelgebouwen en ontmoetingspunten kunnen dezelfde geometrie delen.
3. `country_code` is exact twee uppercase letters. Landspecifieke regels alleen toepassen als het land bekend is.
4. Voor Nederland: normaliseer postcode voor matching naar `1234AB`; presenteer desgewenst `1234 AB`. Een mislukte regex maakt een record niet stilzwijgend `VALID`.
5. Een providerref vereist `provider`; een provider zonder Place ID kan alleen als provenance van een validatieresultaat worden opgeslagen als dit contractueel en technisch zinvol is.
6. `VALID` vereist `validated_at`, validation provenance en voldoende componenten voor het bedoelde gebruik. Coördinaten alleen betekenen `PARTIAL`, niet automatisch `VALID`.
7. Handmatige wijziging van providergeretourneerde componenten verandert de status naar `MANUALLY_CONFIRMED` of `UNVALIDATED`; providerprovenance blijft als historische bron herkenbaar en wordt niet als actuele providerclaim gepresenteerd.
8. `superseded_by_location_id` moet dezelfde tenant hebben en mag geen cyclus vormen.
9. Alle ownerrelaties moeten `(id, tenant_id)` controleren. Application-only autorisatie is onvoldoende.
10. Definitieve afspraakstops zijn immutable; correctie gebeurt met een geaudite wijziging/nieuw record, niet via cascade vanaf student- of branchdefaults.

## Dedupebeleid

`normalized_fingerprint` kan kandidaatgroepen maken uit:

- genormaliseerde land/postcode/huisnummer/toevoeging;
- anders provider + provider Place ID;
- anders genormaliseerde formatted address + stad;
- coördinaten alleen als ondersteunend signaal.

Geen automatische merge op alleen fuzzy tekst of coördinaten. Preview toont kandidaten per tenant, bronnen, gekoppelde owners en verschillen. Een merge:

- kiest een survivor;
- verplaatst alleen goedgekeurde actuele relaties;
- behoudt historische afspraakstops;
- zet het oude record op `superseded_by_location_id`;
- schrijft een audit-event met actor, reden en voor/na-ID’s.

## Provideradapter

Businesscode gebruikt capabilities, geen Google-DTO’s:

```ts
interface LocationProvider {
  autocomplete(input: AutocompleteInput): Promise<LocationSuggestion[]>;
  resolvePlace(input: ResolvePlaceInput): Promise<ResolvedLocation>;
  validateAddress(input: AddressInput): Promise<AddressValidationResult>;
  computeRoute(input: RouteInput): Promise<RouteResult>;
  computeMatrix(input: MatrixInput): Promise<RouteMatrixResult>;
}
```

Dit is één klein domeincontract; de Google-implementatie mag intern worden gesplitst in een `GooglePlacesAdapter` en `GoogleRoutingAdapter`. Maps-rendering, Places UI Kit en Navigation SDK blijven bewust Google-specifieke presentatie-/clientintegraties en worden niet achter een kunstmatige universele interface verstopt.

Niet iedere provider hoeft iedere capability te ondersteunen. De applicatie moet per capability graceful degradation definiëren:

- autocomplete uitgevallen → vrije tekst + `UNVALIDATED`;
- validatie uitgevallen → opslaan met expliciete status, geen vals groen vinkje;
- routing uitgevallen → Haversine/area-matrix + `needs_confirmation`;
- providerwissel → bestaande NXTDRIVE UUID’s en historische stops blijven geldig.

## Route-uitkomsten

Route-uitkomsten zijn afgeleid en tijdsafhankelijk. Voeg een aparte cache/auditstructuur toe, bijvoorbeeld `route_calculations`:

| Veld                                                              | Doel                                          |
| ----------------------------------------------------------------- | --------------------------------------------- |
| `tenant_id`, `from_location_id`, `to_location_id`                 | Immutable inputlocaties.                      |
| `departure_at` of tijdsbucket, `travel_mode`                      | Relevante routecontext.                       |
| `provider`, `status`                                              | Provenance en computed/estimated/unavailable. |
| `duration_seconds`, `distance_meters`, optioneel traffic-duration | Genormaliseerde uitkomst.                     |
| `calculated_at`, `expires_at`                                     | Freshness/cachebeleid.                        |
| `input_fingerprint`                                               | Dedupe/idempotency.                           |

Bewaar geen ruwe providerresponse. Bestaande `trial_lessons.route_*` en `booking_candidates.route_*` kunnen tijdens overgang compacte beslissnapshots blijven; normaliseer alleen als dit operationele waarde heeft.

## Eigendom en privacy

Maak in documentatie en code onderscheid:

**Klant-/NXTDRIVE-data**

- interne locatie-ID, tenant, label en gebruiksrelatie;
- door gebruiker/staf ingevoerde componenten;
- handmatige bevestiging en audit;
- afspraakstop en gekozen routebesluit.

**Provider-afgeleide data**

- providernaam en Place ID;
- provider-formatted address/componenten/coördinaten;
- routeafstand en -duur;
- freshness/provenance.

Provider-afgeleide data wordt alleen opgeslagen als de actuele productvoorwaarden dit voor het doel toestaan. De data-export, verwijdering, retention en legal-holdlogica moet zowel kernrecords, providerrefs als ownerrelaties omvatten. Logs mogen geen volledige adressen, Place IDs of coördinaten als standaardvelden bevatten.

## Waarom niet één brede `locations`-tabel muteren?

De bestaande `public.locations` is een tenantcatalogus voor benoemde leslocaties met `name`, `address`, branch scope, status en sortering (`supabase/migrations/0032_lesson_context.sql:69-103`; `0103_vehicle_location_branch_scope.sql:10-19`). Zij heeft al UI- en RPC-semantiek rond voertuigbeheer. Haar direct omvormen naar “elk woonadres, elke booking snapshot en iedere branch”:

- verandert de betekenis voor bestaande callers;
- vermengt PII met breed leesbare leslocatiestamdata;
- maakt RLS per gebruik moeilijk;
- moedigt mutable FKs voor historische afspraken aan.

Daarom is het veiligste voorstel:

1. nieuwe, privacybewuste `location_records` + providerrefs;
2. bestaande `locations` voorlopig als saved-locationcatalogus;
3. catalogusrijen koppelen aan een canonical `location_record`;
4. pas na bewezen migratie eventueel hernoemen naar `saved_locations`.

## Minimale eerste capability

De eerste productieversie hoeft niet alle relaties tegelijk te leveren. Het kleinste samenhangende deel is:

1. `location_records`, providerrefs en `student_locations`;
2. HOME en DEFAULT_PICKUP met handmatige invoer én provider-resolve;
3. lesson pickup-stop als immutable kopie, plus legacy projectie;
4. lead-intake→studentoverdracht;
5. privacy/export/retention;
6. provideradapter en expliciete fallbackstatus.

Branch-, vehicle-, instructor-day-, CBR- en multi-stoprouting volgen additief. Dit houdt het model uitbreidbaar zonder de eerste release van de volledige routeplanner afhankelijk te maken.

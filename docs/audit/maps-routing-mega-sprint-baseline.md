# Maps, locaties en routing — sprintbaseline

Peildatum: 30 juli 2026  
Startcommit: `940732d82df4496804ba648555d5e55c8d7dfb46`  
Werkbranch: `codex/maps-routing-mega-sprint`  
Status bij start: schone worktree

## Bronnen

De audit is opnieuw uitgevoerd tegen de actuele repository. Het bestaande
beslisdossier in `docs/analysis/maps/` en
`docs/decisions/GOOGLE_MAPS_INTEGRATION_SELECTION.md` is als inhoudelijke basis
gebruikt. SQL-migraties blijven schema-authoritatief; TypeScript-projecties zijn
niet als vervanging voor het databaseschema behandeld.

## Huidige Maps- en Places-code

- `artifacts/nxtdrive/lib/maps/loader.ts` laadt de Maps JavaScript API
  procesbreed en valt zonder browserkey terug naar `null`.
- `artifacts/nxtdrive/components/places-autocomplete.tsx` gebruikt nog de
  legacy `google.maps.places.Autocomplete`-widget.
- `artifacts/nxtdrive/components/trial-route-map.tsx` toont een beperkte
  routepreview.
- Intake en de backoffice-agenda gebruiken de bestaande autocompletewrapper.
- `artifacts/nxtdrive/lib/trial-lessons/route.ts` bevat Haversine,
  route-inschatting en een directe Google Compute Route Matrix-client.
- `lesson-planning/candidates.ts` en `trial-lessons/suggestions.ts` importeren
  deze helper rechtstreeks. Er bestaat nog geen centrale providergateway,
  tenantmetering of featuredegradatie.

## Huidige locatieopslag

Materiële locatievelden bestaan verspreid over:

- `students`: adresregel, plaats, postcode en standaard ophaaladres;
- `lead_intake_details`: woonplaats, pickup, Place ID en coördinaten;
- `lessons`, `trial_lessons` en `agenda_appointments`: vrije tekst, Place ID en
  coördinaten als operationele velden;
- booking requests/candidates en refill-uitnodigingen: tijdelijke
  locatieprojecties;
- `branches`, voertuigen, rayons/service areas en de bestaande operationele
  `locations`-catalogus;
- examen- en CBR-records.

De bestaande `locations`-tabel heeft een specifieke lescontextbetekenis en wordt
niet stil hergebruikt als universeel locatiedomein.

## RPC’s en domeintypen

- De laatste zichtbare definitie van `convert_lead_to_student` staat in
  `0041_convert_lead_terminal_state.sql` en neemt structured pickupdata niet
  volledig over.
- Planningmutaties lopen via meerdere `schedule_lesson`- en
  planbord-RPC-generaties.
- `execute_student_anonymization` uit
  `20260729090000_security_privacy_foundation.sql` dekt het nieuwe
  locatiedomein nog niet.
- `artifacts/nxtdrive/lib/students/types.ts` bevat alleen de structured
  studenttekstvelden; er is geen versioned location type.
- De planningkernel gebruikt capability-, rayon-, beschikbaarheids- en
  conflictdomeinen, maar geen centrale routegateway.

## Privacy, deletion en retentie

- Privacy-export wordt opgebouwd in `artifacts/nxtdrive/lib/privacy/service.ts`.
- Anonimisering is database-side en auditeerbaar, maar kent nog geen canonical
  locations, immutable stops, locatievoorstellen, providercaches of
  meteringrecords.
- Bestaande structured studentadresvelden hebben vóór deze sprint geen volledige
  parity met alle intake- en afspraaklocaties.
- Er is een algemene retentie-engine, maar nog geen maps-specifieke
  retentieactie of cache-invalidatie.

## CSP en credentials

- De hoofdapp gebruikt een nonce, `strict-dynamic` en geen `unsafe-eval`.
- `frame-src` staat alleen self en OpenStreetMap toe.
- De bestaande browserintegratie leest
  `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`.
- De bestaande servermatrix leest `GOOGLE_ROUTES_API_KEY`.
- Credentialeigenaar, omgeving, API-restricties en rotatie zijn niet
  versiebeheerbaar geregistreerd.
- Een geïsoleerde maporigin is nog niet gebouwd; de hoofd-CSP wordt in deze
  sprint niet stil verzwakt.

## Usage, billing en limieten

De repository heeft platformentitlements, generieke rate limiting en
observability, maar geen maps-specifiek usage-ledger, SKU-prijsversies,
tenantbudgetten, kostenreconciliatie, circuitbreaker of degradatiehistorie.

## Bestaande tests

Voor Maps relevante dekking bestaat onder meer in:

- `scripts/src/test-route-scoring.ts`;
- planningcore-, planningboard- en planningqueue-tests;
- security header- en observabilitytests;
- privacy service- en retentietests;
- authenticated business E2E.

Baseline-uitvoering:

- `pnpm run typecheck`: geslaagd;
- `pnpm run test:unit`: 224/224 geslaagd;
- bekende falende tests bij sprintstart: geen.

Ruwe baseline-uitvoer en inventarismetadata staan in
`artifacts/maps-routing-baseline/`.

## Additieve implementatiescope

De sprint voegt hoofdzakelijk toe:

- één additieve migratie voor locaties, snapshots, voorstellen, routebesluiten,
  metering, prijzen, limieten, degradatie, scenario’s en CBR-locaties;
- providerneutrale domein- en application-services onder `domains/maps/`;
- server-only Google-adapters met gecontroleerde fallbacks;
- rolgebonden student-, instructeur-, backoffice- en platformroutes;
- tests, ADR’s, operations-/incidentdocumentatie en release-evidence.

Legacyvelden blijven tijdens de migratiefase bestaan. Productiebackfill,
providercontractkeuze, definitieve cost allocation en multi-instructeuractivatie
blijven achter preview, beleid of featureflag.

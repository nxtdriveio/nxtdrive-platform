# NXTDRIVE Maps, Locations, Routing & Optimization — final report

Datum: 30 juli 2026  
Branch: `codex/maps-routing-mega-sprint`  
Baseline: `940732d`  
Gevalideerde sprint-HEAD vóór rapportage: `4f5604a`

## Executive summary

De sprint levert een additieve, multi-tenant locatie- en routefundering met immutable locatieversies en afspraakstops, leerlinglocaties en lesbevestiging, een server-only Google-providergrens, centrale Route Matrix-gateway, per-tenant metering, prijs- en limietmodellen, veilige degradatie, circuitbreakers, route- en optimalisatiescenario's, een instructeursdagroute, planning- en beheerschermen, privacyflows en echte visuele baselines.

Alle Google-backed entitlements staan standaard uit. NXTDrive blijft bruikbaar via handmatige adresinvoer, lijstplanning, externe navigatie en zichtbaar gelabelde interne schattingen. Live GPS, routeopname, interne turn-by-turn, verborgen medewerkersranglijsten en automatische publicatie van optimalisatie zijn niet toegevoegd.

De lokale releaseketen is groen: 270 unit-tests, 3 bestaande integratietests, 172 migraties op een lege én bestaande gevulde PostgreSQL-fixture, 29 visuele regressies, volledige typecheck/build, repositorylint, secret scan en productie-dependencyaudit. Een live Google-/authenticated stagingreis is bewust niet geclaimd: credentials, billing, `maps.nxtdrive.io` en pilotentitlements zijn externe activatiestappen.

## Baseline

De beginsituatie en inventarisatie staan in:

- `docs/audit/maps-routing-mega-sprint-baseline.md`
- `artifacts/maps-routing-baseline/inventory.md`
- `artifacts/maps-routing-baseline/manifest.json`

De bestaande `locations`-tabel had een operationele lescontextbetekenis en is daarom niet stil hergebruikt. Bestaande route-intelligence was deels browser-/Google-gebonden, adressen stonden verspreid over leads, leerlingen en afspraken, en Maps-gebruik had geen centraal tenantledger, prijsversie, hard-limitgate of providerneutrale grens.

## Architectuur en datamodel

```text
UI / server action
→ tenant- en rolcontrole
→ entitlement + limit + circuit gate
→ tenant cache / deduplicatie
→ providerneutraal contract
→ server-only Google-adapter
→ responsevalidatie
→ PII-vrije usage event
→ expliciete provider-, cache- of fallbackstatus
```

De stabiele businessidentiteit staat in `location_records`; immutable adresinhoud en provenance in `location_versions`; typed eigenaarschap in `entity_location_links`; gepubliceerde historie in `appointment_stops`. Planningbesluiten, overrides en optimalisatiescenario's zijn afzonderlijke auditobjecten.

## Migraties

| Migratie         | Doel                                                                                                         |
| ---------------- | ------------------------------------------------------------------------------------------------------------ |
| `20260730150000` | canonical locations, versies, relaties, validatie, merge, stops, voorstellen, travelstatus                   |
| `20260730151000` | usage-ledger, rollups, prijsversies, kosten, entitlements, limieten, budget, reconciliatie, circuit, cache   |
| `20260730152000` | routebesluiten, conflictbeleid, overrides, optimalisatiescenario's, werkgebieden en privacyveilige analytics |
| `20260730153000` | studentlocatieworkflows, snapshots, voorstellen, leadconversie, migratiepreview en anonymisering             |
| `20260730154000` | centrale entitlement-, circuit- en limit-gate                                                                |
| `20260730155000` | leerling-/staff-assisted bevestiging van gepubliceerde lesstops                                              |

## Schermen en routes

- `/leerling/instellingen/locaties`
- `/leerling/lessen/[lessonId]`
- `/instructeur/dagroute`
- `/backoffice/planning-board/kaart`
- `/backoffice/locaties`
- `/platform/maps`
- `/platform/maps/tenants/[tenantId]`
- `/api/maps/places`

## Releasebewijs

- `release-evidence/maps-routing/validation-summary.json`
- `release-evidence/maps-routing/implementation-manifest.md`
- `release-evidence/maps-routing/screenshots-manifest.md`
- `release-evidence/maps-routing/provider-research.md`
- `release-evidence/migration-results/migration-manifest.json`

## Onderdeel: centrale locatie-entiteit

Status: VOLTOOID

Uitgevoerd:

- Stabiele tenantgebonden `location_records` toegevoegd zonder bestaande `locations` semantisch te wijzigen.
- Typed relaties modelleren leerling, instructeur, vestiging en voertuig.
- Merge- en auditobjecten voorkomen stille deduplicatie.

Belangrijkste bestanden:

- `supabase/migrations/20260730150000_location_records_and_stops.sql`
- `artifacts/nxtdrive/domains/maps/domain/location.ts`

Tests:

- Domeintests voor tenantgrenzen, provenance en deduplicatiesleutels.
- Migratiesmoke op lege en gevulde database.

Resterend:

- Geen destructieve legacy-retirement; die volgt pas na cohortparity.

## Onderdeel: locatieversies en snapshots

Status: VOLTOOID

Uitgevoerd:

- Immutable `location_versions` met bron, provider, validatie en bevestigingsmetadata.
- Immutable `appointment_stops` met publicatie- en supersedegrens.
- Profielwijziging maakt een versie en herschrijft een gepubliceerde stop niet.

Belangrijkste bestanden:

- `supabase/migrations/20260730150000_location_records_and_stops.sql`
- `supabase/migrations/20260730153000_location_workflows_privacy.sql`

Tests:

- Unit-test op immutable snapshot.
- PostgreSQL-smoke publiceert een stop, wijzigt het profiel en bewijst dat het oude adres blijft staan.

Resterend:

- Geen.

## Onderdeel: leadconversie

Status: VOLTOOID

Uitgevoerd:

- Idempotente conversie bewaart plaats, pickup, coördinaten en Place-provenance.
- Eerste canonical pickup en typed standaardrelatie worden aangemaakt.
- Audit legt gebruikte bronvelden vast en voorkomt dubbele studentlocaties.

Belangrijkste bestanden:

- `supabase/migrations/20260730153000_location_workflows_privacy.sql`

Tests:

- Migratiesmoke en canonical cockpitprojectietests.

Resterend:

- Productiedata moet cohortgewijs door de paritycontrole.

## Onderdeel: leerlingcockpit

Status: VOLTOOID

Uitgevoerd:

- Cockpit leest eerst canonical relaties, daarna structured student/intakevelden en pas dan legacy-notities.
- Postcode, plaats, adres, pickup en bron worden consistent getoond.
- Direct aangemaakte en geconverteerde leerlingen gebruiken dezelfde projectie.

Belangrijkste bestanden:

- `artifacts/nxtdrive/lib/students/location-display.ts`
- `artifacts/nxtdrive/components/students/StudentCentralCockpit.tsx`
- `artifacts/nxtdrive/app/backoffice/leerlingen/[id]/page.tsx`

Tests:

- Vier projectietests inclusief direct-versus-converted parity.

Resterend:

- Legacy-notitiefallback verwijderen na migratieparity.

## Onderdeel: privacy-export en deletion

Status: GEDEELTELIJK

Uitgevoerd:

- Export bevat canonical records, versies, relaties, validatie, les-, proefles-, examen-, agenda- en moduletoetsstops, booking/intake, voorstellen, bevestigingen en travelstatus.
- Anonimisering verwijdert directe velden, links, voorstellen, bevestigingen, orphan locaties en tenantcache.
- Rapport vermeldt eerlijk dat historische gepubliceerde stops onder retentie kunnen blijven.

Belangrijkste bestanden:

- `artifacts/nxtdrive/lib/privacy/service.ts`
- `supabase/migrations/20260730153000_location_workflows_privacy.sql`

Tests:

- Privacy-IDOR-unittests en migratiesmoke voor de onderliggende locatieflow.

Resterend:

- De volledige export moet nog in één authenticated browser-/storage-smoke worden bewezen.
- Retentie-uitvoering vraagt per tenant een goedgekeurde beleidsversie.

## Onderdeel: autocomplete

Status: VOLTOOID

Uitgevoerd:

- Toegankelijke combobox met keyboardbediening, debounce, sessietoken en maximaal acht resultaten.
- Serverendpoint voert auth, tenantfeaturegate, rate limiting, field masks en metering uit.
- Minimaal drie tekens en begrensde payloads voorkomen requestexplosies.

Belangrijkste bestanden:

- `artifacts/nxtdrive/domains/maps/ui/address-autocomplete.tsx`
- `artifacts/nxtdrive/app/api/maps/places/route.ts`
- `artifacts/nxtdrive/domains/maps/application/autocomplete-session.ts`

Tests:

- Sessiehergebruik, nieuwe token na resolve, minimumlengte en provider-securitytests.

Resterend:

- Live Google-contracttest pas na pilotcredential.

## Onderdeel: address validation

Status: GEDEELTELIJK

Uitgevoerd:

- Server-only Address Validation-adapter vertaalt provideruitvoer naar `VALID`, `PARTIAL`, `REVIEW_REQUIRED` of `INVALID`.
- Correctie, explanation codes, handmatige bevestiging en provenance zijn gemodelleerd.
- Entitlement, metering en veilige handmatige fallback bestaan.

Belangrijkste bestanden:

- `artifacts/nxtdrive/domains/maps/infrastructure/google/google-location-provider.ts`
- `artifacts/nxtdrive/domains/maps/infrastructure/metering/metered-location-provider.ts`

Tests:

- Providercontract-, field-mask- en handmatige-confirmatietests.

Resterend:

- De correctie-diff moet nog als echte gebruikersflow aan alle adresformulieren worden gekoppeld.

## Onderdeel: handmatige correctie

Status: VOLTOOID

Uitgevoerd:

- Vrije invoer blijft beschikbaar wanneer entitlement, credential, quota of provider faalt.
- Handmatige bevestiging vereist reden en bewaart actor/tijdstip.
- UI toont expliciet dat providercontrole ontbreekt.

Belangrijkste bestanden:

- `artifacts/nxtdrive/domains/maps/ui/address-autocomplete.tsx`
- `artifacts/nxtdrive/domains/maps/domain/location.ts`

Tests:

- Validatie van verplichte reden en degraded visual baseline.

Resterend:

- Geen.

## Onderdeel: leerlinglocaties

Status: VOLTOOID

Uitgevoerd:

- Leerling beheert thuis, standaard pickup/dropoff en favorieten.
- Iedere wijziging maakt een immutable versie.
- De UI toont adresbron en validatiestatus.

Belangrijkste bestanden:

- `artifacts/nxtdrive/app/leerling/instellingen/locaties/`
- `supabase/migrations/20260730153000_location_workflows_privacy.sql`

Tests:

- Canonical projectietests, migratiesmoke en visuele baseline.

Resterend:

- Geen.

## Onderdeel: locatie per les

Status: VOLTOOID

Uitgevoerd:

- Gepubliceerde lesstop is zichtbaar op de lesdetailpagina.
- Leerling kiest een eigen opgeslagen alternatief en motiveert het voorstel.
- Voorstel verandert de les niet automatisch en wacht op route-/plannerreview.

Belangrijkste bestanden:

- `artifacts/nxtdrive/app/leerling/lessen/[lessonId]/page.tsx`
- `artifacts/nxtdrive/app/leerling/lessen/[lessonId]/location-actions.ts`

Tests:

- PostgreSQL-smoke voor snapshot en `location_change_proposals`.
- Visuele baseline voor de leslocatiekiezer.

Resterend:

- Plannerreview moet nog in de bestaande planbord-commitflow worden opgenomen.

## Onderdeel: leerlingbevestiging

Status: VOLTOOID

Uitgevoerd:

- Leerling bevestigt uitsluitend de eigen gepubliceerde stop.
- `STUDENT` en `STAFF_ASSISTED` worden afzonderlijk opgeslagen en geaudit.
- Correctieverzoek en bevestiging zijn zichtbaar verschillende toestanden.

Belangrijkste bestanden:

- `supabase/migrations/20260730155000_student_stop_confirmations.sql`
- `artifacts/nxtdrive/app/leerling/lessen/[lessonId]/location-actions.ts`

Tests:

- Echte PostgreSQL-flow bewijst studentauthorship en opslag.
- Visuele baseline voor bevestiging.

Resterend:

- Staff-assisted bediening heeft nog geen afzonderlijke backofficeknop.

## Onderdeel: volgende locatie instructeur

Status: VOLTOOID

Uitgevoerd:

- Dagroute toont eerstvolgende immutable stop, reistijdstatus, vertrekadvies en actualiteit.
- Exact adres blijft beperkt tot toegewezen instructeur en operationele scope.
- Onbekend en fallback worden niet als nul minuten getoond.

Belangrijkste bestanden:

- `artifacts/nxtdrive/app/instructeur/dagroute/page.tsx`
- `artifacts/nxtdrive/domains/maps/application/navigation.ts`

Tests:

- Navigatie-/vertrekadvies-unittests en mobile/tablet baselines.

Resterend:

- Live trafficactualiteit vraagt provideractivatie.

## Onderdeel: externe navigatie

Status: VOLTOOID

Uitgevoerd:

- Handoff naar Google Maps of Apple Maps gebruikt voorkeur voor Place ID en veilige URL-encoding.
- Geen interne turn-by-turn of routeopname.
- Exacte bestemming wordt niet in notificatiepayloads geplaatst.

Belangrijkste bestanden:

- `artifacts/nxtdrive/domains/maps/application/navigation.ts`

Tests:

- URL-encoding en Place-ID-prioriteit.

Resterend:

- Geen.

## Onderdeel: instructeursdagroute

Status: VOLTOOID

Uitgevoerd:

- Tablet- en mobielvriendelijke daglijst met list/maptabs, statussen, stale-labels en primaire navigatieactie.
- Alleen aan de instructeur toegewezen lessen worden geladen.
- Onderweg/aangekomen wordt append-only vastgelegd.

Belangrijkste bestanden:

- `artifacts/nxtdrive/app/instructeur/dagroute/`

Tests:

- Tablet- en mobiele visuele regressies.

Resterend:

- Interactieve kaart blijft list-only tot de geïsoleerde origin actief is.

## Onderdeel: offline stops

Status: VOLTOOID

Uitgevoerd:

- Dagstops worden lokaal versleuteld in IndexedDB bewaard met expiry en stale-status.
- Offline cache bevat alleen de actuele instructeursdag en geen tenantbrede dataset.
- Statuswijzigingen vereisen weer een serververbinding; er is geen stille conflictmerge.

Belangrijkste bestanden:

- `artifacts/nxtdrive/app/instructeur/dagroute/day-route-client.tsx`

Tests:

- Offline/stale UI-baselines en bestaande offline-conflicttests.

Resterend:

- Browsermatrix voor Safari/Android WebView blijft onderdeel van de pilotacceptatie.

## Onderdeel: planbordkaart

Status: EXTERNE BESLISSING NODIG

Uitgevoerd:

- Operationele lijst-/kaartworkspace, dagfilter, statusfilter, exact-stopselectie en routebewijsweergave.
- Lijstmodus is volledig bruikbaar en de kaartknop blijft uit zolang de veilige origin ontbreekt.
- Alleen de geselecteerde dag en zichtbare stops gaan naar de kaartlaag.

Belangrijkste bestanden:

- `artifacts/nxtdrive/app/backoffice/planning-board/kaart/page.tsx`
- `artifacts/nxtdrive/domains/maps/ui/list-map-workspace.tsx`

Tests:

- Desktop- en tabletbaselines, build en CSP-securitytests.

Resterend:

- `maps.nxtdrive.io`, framecontract, CSP-headers en providercredential moeten extern worden gedeployed en gevalideerd.

## Onderdeel: Route Matrix-gateway

Status: VOLTOOID

Uitgevoerd:

- Centrale servergateway met tenantgate, caching, deduplicatie, timeout, validatie en per-element metering.
- Matrixgrootte is maximaal 100 elementen en traffic-aware requests gebruiken een strengere beleidsgrens.
- Partiële provideruitvoer wordt per element gevalideerd en zichtbaar aangevuld met laag-vertrouwenfallback.

Belangrijkste bestanden:

- `artifacts/nxtdrive/domains/maps/application/route-gateway.ts`
- `artifacts/nxtdrive/domains/maps/infrastructure/google/google-routing-provider.ts`
- `artifacts/nxtdrive/lib/trial-lessons/route.ts`

Tests:

- Explosieguard, elementtelling, provider-disabled, partial matrix, cache-expiry en tenantisolatie.

Resterend:

- Live quota-/billingcontracttest pas na Google-pilotactivatie.

## Onderdeel: reistijdconflicten

Status: GEDEELTELIJK

Uitgevoerd:

- Beslismodel onderscheidt haalbaar, krap, onmogelijk en onbekend inclusief buffer, methode, confidence en reden.
- Versioneerbaar tenantbeleid en geaudite override met verplichte reden bestaan.
- Routebesluiten zijn immutable en de bestaande planningsvalidator blokkeert onvoldoende reistijd.

Belangrijkste bestanden:

- `artifacts/nxtdrive/domains/maps/application/planning-conflicts.ts`
- `supabase/migrations/20260730152000_route_planning_scenarios.sql`
- `artifacts/nxtdrive/lib/planning-core/validation.ts`

Tests:

- Conflictstatussen, unknownbeleid en bestaande planning-conflicttests.

Resterend:

- Preview en uiteindelijke planbordcommit gebruiken nog niet één database-RPC met dezelfde routebeslissing.

## Onderdeel: beste-instructeurvoorstel

Status: GEDEELTELIJK

Uitgevoerd:

- Shortlist filtert bevoegdheid, beschikbaarheid, werktijd, voertuig en harde conflicten vóór routevergelijking.
- Sortering verklaart continuïteit, vestiging, extra reistijd en buffer.
- Maximaal vijf kandidaten voorkomt matrixexplosies.

Belangrijkste bestanden:

- `artifacts/nxtdrive/domains/maps/application/recommendations.ts`

Tests:

- Hard-constraintfilter en verklaarbare volgorde.

Resterend:

- Voorstel moet nog als interactieve keuze in de definitieve planbordcommit worden aangesloten.

## Onderdeel: voertuig-/vestigingsvoorstel

Status: GEDEELTELIJK

Uitgevoerd:

- Resourcevoorstel filtert beschikbaarheid, capabilities en onderhoud en verklaart branch- en route-impact.
- Scenario- en mutatiemodellen ondersteunen voertuig- en vestigingswijzigingen.

Belangrijkste bestanden:

- `artifacts/nxtdrive/domains/maps/application/recommendations.ts`
- `supabase/migrations/20260730152000_route_planning_scenarios.sql`

Tests:

- Onderhouds-, capability- en branchsortering.

Resterend:

- Nog geen end-to-end plannerdialoog met commit en notificatie.

## Onderdeel: routevolgordevoorstel

Status: GEDEELTELIJK

Uitgevoerd:

- Single-instructorheuristiek accepteert uitsluitend expliciet flexibele, ongepubliceerde stops.
- Huidige en voorgestelde volgorde, lege afstand, mutaties en uitleg worden apart bewaard.
- Planner moet mutaties selecteren; automatische publicatie is technisch uitgesloten.

Belangrijkste bestanden:

- `artifacts/nxtdrive/domains/maps/application/optimization.ts`
- `supabase/migrations/20260730152000_route_planning_scenarios.sql`

Tests:

- Gepubliceerde stops worden geweigerd; scenario en diff blijven human-gated.

Resterend:

- Backoffice toont scenario's maar heeft nog geen volledige create/apply/rollbackdialoog.

## Onderdeel: multi-instructeursvoorbereiding

Status: EXTERNE BESLISSING NODIG

Uitgevoerd:

- Datamodel, providercontract, veilige pilotlimieten en OAuth/IAM-grens zijn voorbereid.
- `fleetEnabled` en tenantentitlement staan standaard uit.
- Zelfstandige provideruitvoer kan niets publiceren.

Belangrijkste bestanden:

- `artifacts/nxtdrive/domains/maps/infrastructure/google/google-routing-provider.ts`
- `docs/decisions/ADR-013-multi-instructor-optimization-flag.md`

Tests:

- Provider weigert fleetoptimalisatie zonder expliciete flag.

Resterend:

- Arbeids-/operationeel beleid, Googleprojecttoegang en tenantpilot moeten worden goedgekeurd.

## Onderdeel: optimalisatie bij annuleringen

Status: GEDEELTELIJK

Uitgevoerd:

- Afzonderlijk `CANCELLATION_RECOVERY`-scenario met baseline, voorstel, uitleg en selecteerbare mutaties.
- Constraints houden gepubliceerde planning leidend en notificaties wachten op commit.
- Runbook beschrijft veilige fallback zonder provider.

Belangrijkste bestanden:

- `supabase/migrations/20260730152000_route_planning_scenarios.sql`
- `docs/maps/cancellation-recovery.md`

Tests:

- Optimalisatiegate en visuele baseline.

Resterend:

- Annuleringsactie maakt nog niet automatisch een conceptscenario in de product-UI.

## Onderdeel: werkgebiedenkaart

Status: GEDEELTELIJK

Uitgevoerd:

- Versioneerbare werkgebieden ondersteunen branchscope, postcodeprefixen, plaatsen, geometrie en capaciteit.
- Beheerscherm toont gepubliceerde gebieden zonder exacte leerlingmarkers.
- Bestaande rayons blijven policylaag.

Belangrijkste bestanden:

- `supabase/migrations/20260730152000_route_planning_scenarios.sql`
- `artifacts/nxtdrive/app/backoffice/locaties/page.tsx`

Tests:

- Migratieconstraints en werkgebiedenbaseline.

Resterend:

- Polygoneditor, overlapberekening en privacyveilige drill-down zijn nog niet volledig bedienbaar.

## Onderdeel: lege-kilometeranalyse

Status: GEDEELTELIJK

Uitgevoerd:

- Rollupmodel bewaart geplande lege afstand, tijd, dekking, methode en potentiële besparing.
- UI noemt expliciet dat dit geen GPS-meting is en toont geen medewerkersranglijst.
- Domeinsummarizer rapporteert onzekerheid en datadekking.

Belangrijkste bestanden:

- `artifacts/nxtdrive/domains/maps/application/analytics.ts`
- `artifacts/nxtdrive/app/backoffice/locaties/page.tsx`

Tests:

- Uitlegbaarheidsunit-test en visuele baseline.

Resterend:

- Periodieke productiejob die alle stopketens berekent en een branchdrill-down.

## Onderdeel: postcodeanalyse

Status: GEDEELTELIJK

Uitgevoerd:

- Alleen POSTCODE4-, plaats- of regioaggregaten; geen volledig adres of coördinaten.
- Minimumgroepsgrootte en automatische suppressie zijn database- en domeinregels.
- Onveilige employee-/persoon-dimensies worden afgewezen.

Belangrijkste bestanden:

- `artifacts/nxtdrive/domains/maps/application/analytics.ts`
- `supabase/migrations/20260730152000_route_planning_scenarios.sql`

Tests:

- Dubbele privacydrempel, onveilige dimensies en visuele baseline.

Resterend:

- Productie-ETL voor leads, wachttijd en capaciteit en combinatorische filterprivacycheck.

## Onderdeel: vestigingsanalyse

Status: GEDEELTELIJK

Uitgevoerd:

- Datamodellen voor branchgebonden werkgebieden, lege kilometers, postcodecellen, capaciteit en route-impact zijn beschikbaar.
- UI kan branchgebonden werkgebieden en aggregaten tonen zonder automatische vestigingsconclusie.

Belangrijkste bestanden:

- `supabase/migrations/20260730152000_route_planning_scenarios.sql`
- `artifacts/nxtdrive/app/backoffice/locaties/page.tsx`

Tests:

- Branchscopeconstraints in migraties en bestaande planningsscope-tests.

Resterend:

- Eén scenariovergelijking voor vraag, voertuigen, wachttijd, conversie en capaciteit is nog niet gebouwd.

## Onderdeel: CBR-locatiecatalogus

Status: GEDEELTELIJK

Uitgevoerd:

- Stabiele IDs, versies, bronreferentie, geldigheid, verificatiedatum, status en audit.
- Tenantbeheer kan een brongebonden locatie voorstellen; publicatie vereist review.
- Geen scraping of claim van officiële status zonder aantoonbare bron.

Belangrijkste bestanden:

- `supabase/migrations/20260730150000_location_records_and_stops.sql`
- `artifacts/nxtdrive/app/backoffice/locaties/cbr-actions.ts`

Tests:

- Migratieconstraints en CBR-catalogusbaseline.

Resterend:

- Bevoegde centrale bronreview en gebruiksrechten; geen officiële API is verondersteld.

## Onderdeel: examenroute en vertrekadvies

Status: GEDEELTELIJK

Uitgevoerd:

- Vertrekadvies combineert geplande aankomstbuffer met actuele of gelabelde fallbackreistijd.
- CBR-locatie en examenstop zijn immutable; externe navigatie is beschikbaar.
- Geen vermeende examen-/oefenroute of gereden route wordt opgeslagen.

Belangrijkste bestanden:

- `artifacts/nxtdrive/domains/maps/application/navigation.ts`
- `docs/maps/cbr-locations.md`

Tests:

- Vertrekfallback- en externe-navigatietests.

Resterend:

- Examenkaart, reminder en volledige logistieke checklist moeten nog in leerling- en instructeursschermen worden gekoppeld.

## Onderdeel: tenantmetering

Status: VOLTOOID

Uitgevoerd:

- Append-only, PII-vrij usage-ledger met tenant, omgeving, feature, surface, provider, SKU, unittype, status, latency en correlation ID.
- Matrix wordt per element gemeten; cache en fallback blijven zichtbaar.
- Dagrollups bewaren units, kosten, p50/p95/p99, hits, fallbacks en errors.

Belangrijkste bestanden:

- `supabase/migrations/20260730151000_maps_metering_limits.sql`
- `artifacts/nxtdrive/domains/maps/infrastructure/metering/`

Tests:

- Per-element unit-test en echte PostgreSQL usage-/rollupsmoke.

Resterend:

- Productiescheduler voor dagelijkse rollup activeren.

## Onderdeel: kostenmodel

Status: GEDEELTELIJK

Uitgevoerd:

- Versioneerbare SKU-prijzen en tierberekening.
- Bruto gebruikswaarde, tenantallocatie en werkelijke accountkosten zijn verschillende velden.
- Reconciliatietabel ondersteunt BigQuery-export of handmatige import zonder bedragen als factuur te presenteren.

Belangrijkste bestanden:

- `artifacts/nxtdrive/domains/maps/application/limits-and-costs.ts`
- `supabase/migrations/20260730151000_maps_metering_limits.sql`

Tests:

- Tierovergang en allocatiebetekenis.

Resterend:

- Definitieve commerciële allocatiemethode en geautomatiseerde billingimport.

## Onderdeel: Control Center

Status: VOLTOOID

Uitgevoerd:

- Platformcockpit toont forecast, budgetstatus, units, tenants, fallback/error, trends, productverdeling en operationele waarschuwingen.
- Tenantdetail heeft overzicht, gebruik, kosten, functies, limieten, fouten, degradatie, configuratie en historie.
- Alle Maps-featurecodes zijn individueel te configureren.

Belangrijkste bestanden:

- `artifacts/nxtdrive/app/platform/maps/`

Tests:

- Typecheck/build en Control Center-/tenantlimits-baselines.

Resterend:

- Echte grafieken vullen pas na rollup- en billingdata.

## Onderdeel: limieten

Status: VOLTOOID

Uitgevoerd:

- Tenant-, feature-, SKU-, omgeving- en globale scopes met uur/dag/maand.
- Soft/hard limits, waarschuwingstrappen en expliciete degradatieactie.
- Server-RPC beslist op trusted usage; client kan matrixunits niet verkleinen.

Belangrijkste bestanden:

- `supabase/migrations/20260730151000_maps_metering_limits.sql`
- `supabase/migrations/20260730154000_maps_feature_gate_rpc.sql`

Tests:

- Unit-limiet/forecast en PostgreSQL hard-limitdegradatie.

Resterend:

- Voor extreme gelijktijdigheid is een reserveringsledger nodig om overshoot tussen gate en usage-insert volledig uit te sluiten.

## Onderdeel: automatische degradatie

Status: VOLTOOID

Uitgevoerd:

- Uitgeschakeld, limiet, budget, quota, credential, foutpercentage en timeoutstorm zijn expliciete triggers.
- Adressen vallen terug op handmatig, kaart op lijst, routing op cache/non-traffic/Haversine en optimalisatie op lokale heuristiek of uit.
- Circuitbreaker ondersteunt closed/open/half-open en herstelregistratie.

Belangrijkste bestanden:

- `artifacts/nxtdrive/domains/maps/application/limits-and-costs.ts`
- `supabase/migrations/20260730151000_maps_metering_limits.sql`

Tests:

- Provider-disabled, circuit/limitdatabaseflow en degraded visual baseline.

Resterend:

- Automatische alertworker en half-open probe in productie activeren.

## Onderdeel: beveiliging

Status: VOLTOOID

Uitgevoerd:

- Provideradapters zijn `server-only`, credentials zijn per API/omgeving gesplitst en fouten serialiseren geen secrets.
- Requests hebben timeouts, beperkte field masks, inputgrenzen, SSRF-onafhankelijke vaste origins en centrale rate limiting.
- Exacte adressen, coördinaten, queries, Place IDs, polylines en personen zijn verboden in usage-events.

Belangrijkste bestanden:

- `artifacts/nxtdrive/domains/maps/infrastructure/google/http.ts`
- `artifacts/nxtdrive/lib/security/maps-provider.static.test.ts`
- `docs/maps/security.md`

Tests:

- Vier provider-securitytests, centrale headerstest, secret scan van 1.625 bestanden en productie-audit met nul bekende kwetsbaarheden.

Resterend:

- Google Cloud key restrictions, IAM en rotatie moeten extern worden ingesteld en daarna operationeel bewezen.

## Onderdeel: CSP en kaartorigin

Status: EXTERNE BESLISSING NODIG

Uitgevoerd:

- Hoofdapp behoudt nonce, `strict-dynamic`, Permissions Policy en geen `unsafe-eval`.
- Interactieve kaart is achter exact `https://maps.nxtdrive.io` geplaatst en degradeert anders naar lijst.
- ADR en deploymentchecklist leggen framecontract en isolatie vast.

Belangrijkste bestanden:

- `artifacts/nxtdrive/lib/security/headers.ts`
- `docs/decisions/ADR-007-isolated-map-origin.md`
- `docs/maps/csp-map-origin.md`

Tests:

- Securityheadertests en lijstfallbackbaselines.

Resterend:

- DNS, aparte deployment, responseheaders en frame-CSP moeten extern worden goedgekeurd en geactiveerd.

## Onderdeel: observability

Status: GEDEELTELIJK

Uitgevoerd:

- Correlation IDs, latency, resultaat, fallback, cache, units en rolluppercentielen zijn centraal gemodelleerd.
- Budget-, degradation-, reconciliation- en circuitbreakerwaarschuwingen zijn zichtbaar.
- Vendorneutrale tracecontext bestaat en providerlogs bevatten geen locatiepayload.

Belangrijkste bestanden:

- `supabase/migrations/20260730151000_maps_metering_limits.sql`
- `artifacts/nxtdrive/lib/observability/`
- `docs/maps/operations-runbook.md`

Tests:

- Trace-/safe-error-unittests en usage-rollupsmoke.

Resterend:

- Providercredential-, onbekende-origin-, cachemiss-storm- en kaartlaadalerts moeten nog aan het gekozen externe observabilityplatform worden gekoppeld.

## Onderdeel: migratie

Status: GEDEELTELIJK

Uitgevoerd:

- Volledig additieve schemawijzigingen; legacyvelden blijven bestaan.
- Dry-run rapporteert studentdekking, adressen, pickups, canonical records, halve coördinaten, orphans en mogelijke duplicaten.
- Cohort-, parity- en rollbackdocumenten zijn gemodelleerd.

Belangrijkste bestanden:

- `supabase/migrations/20260730152000_route_planning_scenarios.sql`
- `supabase/migrations/20260730153000_location_workflows_privacy.sql`
- `docs/maps/migration.md`

Tests:

- Alle 172 migraties op leeg en bestaand gevuld PostgreSQL.

Resterend:

- Echte tenantcohorten uitvoeren en oud/nieuw op adres, pickup, coördinaten, route en zichtbaarheid vergelijken.

## Onderdeel: tests

Status: GEDEELTELIJK

Uitgevoerd:

- 270 groene unit-tests, waaronder 42 Maps-/locatieprojectietests.
- Echte PostgreSQL-smoke voor versie, snapshot, voorstel, bevestiging, cross-tenantguard, metering, hard limit en rollup.
- 20 nieuwe Maps-baselines; volledige suite van 29 visuele regressies is groen.
- Volledige typecheck/build, lint, secretscan en dependency-audit zijn groen.

Belangrijkste bestanden:

- `artifacts/nxtdrive/domains/maps/maps-domain.test.ts`
- `scripts/release/migration-smoke.mjs`
- `scripts/src/visual-regression.ts`
- `release-evidence/maps-routing/validation-summary.json`

Tests:

- Exacte commando's staan onder “Validatiecommando's”.

Resterend:

- Authenticated browser-E2E over leerling → planner → instructeur → platform en live providercontracttests vereisen een gemigreerde testtenant en pilotcredentials.

## Onderdeel: documentatie

Status: VOLTOOID

Uitgevoerd:

- Negentien Maps-documenten voor architectuur, provider, beveiliging, privacy, kosten, limieten, conflicten, optimalisatie, analytics, migratie en runbooks.
- Negen ADR's voor de belangrijkste grenzen.
- Baseline, evidence, providerresearch, screenshots en dit 40-puntenrapport.

Belangrijkste bestanden:

- `docs/maps/`
- `docs/decisions/ADR-005` t/m `ADR-013`
- `release-evidence/maps-routing/`

Tests:

- Prettiercontrole en repositorylint.

Resterend:

- Runbooks aanvullen met echte Google project-, dashboard- en on-callreferenties na activatie.

## Gebruiksmetering, kosten, limieten en degradatie

De normale providerroute wordt uitsluitend vrijgegeven wanneer entitlement, circuit en relevante limits dit toelaten. Een matrixactie reserveert niet stil één “request”, maar registreert het aantal elementen. Prijsversies zijn tijdgebonden; bruto cataloguswaarde, tenantallocatie en werkelijke Google-accountkosten worden niet samengevoegd. Fallbacks blijven kernplanning ondersteunen, maar tonen bron, actualiteit en confidence.

Een belangrijke resterende hardening is een reserverings-/finalisatieledger voor zeer gelijktijdige calls. De huidige RPC bepaalt betrouwbaar op serverdata, maar gate en uiteindelijke usage-insert zijn twee transacties. Het ingestelde maximum kan daardoor onder zware concurrency beperkt worden overschreden. Tot die hardening is een conservatieve hard limit en providerquota nodig.

## Security en privacy

Exacte locatie is operationele data voor de leerling, toegewezen instructeur en bevoegde planner. Management gebruikt aggregaten met suppressie; platformmetering is PII-vrij. Er is geen live GPS, achtergrondlocatie, polylinelog, routeopname of verborgen werknemersscore. De hoofd-CSP is niet versoepeld.

De deletionflow verwijdert profieladressen, canonical links, voorstellen, bevestigingen, orphan records en routecache. Gepubliceerde historische stops kunnen volgens retentie bewaard blijven; de completion report zegt daarom nooit dat alle locatiehistorie is verwijderd.

## Performance

Ingebouwde grenzen:

- maximaal 100 matrixelementen per actie en strengere traffic-aware policy;
- lokale shortlist vóór providercall;
- tenantcache met TTL en defensive copies;
- identieke calls kunnen worden gededupliceerd;
- begrensde provider-timeouts;
- alleen geselecteerde dag/stops naar de planningworkspace;
- list-only fallback zonder kaart;
- pagination/limits op Control Center-tabellen;
- rolluptabellen voor zware usage- en analyticsqueries.

Niet geclaimd:

- Er is nog geen productie-latencybenchmark voor map load, routepreview, optimization runtime of Control Center.
- Markerclustering en viewportpayload horen bij de nog niet geactiveerde geïsoleerde kaartapp.

## Screenshots

Twintig Maps-baselines dekken autocomplete, handmatig, leerlinglocaties, leslocatie, leerlingbevestiging, instructeur next/day, planbord desktop/tablet, conflict, optimalisatie, annulering, werkgebieden, lege kilometers, postcode, CBR, Control Center, tenantlimits en degraded state. Hashes staan in `release-evidence/maps-routing/screenshots-manifest.md`.

## Bekende beperkingen

| Beperking                                    | Impact                                                                 | Veilige huidige toestand                                                |
| -------------------------------------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Geen Google credentials/billing              | Geen live Places, Routes of Optimization                               | Handmatig, lijst, external navigation en gelabelde schatting            |
| Geen geïsoleerde mapdeployment               | Geen echte interactieve providerkaart                                  | Lijstmodus                                                              |
| Conflictcheck niet atomair in planbordcommit | Routebewijs kan tussen preview en commit verouderen                    | Bestaande planningsbuffers blijven blokkeren; routebesluit is zichtbaar |
| Scenario-UI niet volledig muterend           | Planner kan nog niet alle diffs toepassen/rollbacken                   | Geen automatische wijziging                                             |
| Analyticsjobs niet ingepland                 | Tabellen kunnen leeg zijn                                              | UI meldt ontbrekende complete periode                                   |
| Privacy authenticated exportsmoke onvolledig | Storage-download en alle subjecttypen nog niet als browserreis bewezen | Geen bredere “compleet”-claim                                           |
| Geen live provider-E2E                       | Contract-/quota-afwijking kan pas in pilot blijken                     | Entitlements standaard uit                                              |

## Externe acties

1. Maak gescheiden Google Cloud-projecten/credentials voor staging en productie; beperk browserkey op origin, Androidkey op package/fingerprint en serverkeys op API/egress.
2. Bevestig billing, quotas, budgetalerts, data-/EEA-voorwaarden en bron-/gebruiksrechten.
3. Deploy `maps.nxtdrive.io` met eigen CSP, frame-ancestors en monitoring en voer de CSP-releasegate uit.
4. Publiceer prijsversie en tenantentitlements voor uitsluitend een testtenant.
5. Activeer rollup-, budget-, reconciliation- en analyticsjobs.
6. Voer authenticated E2E, live providercontracttests, accessibilitytest en tablet/mobile pilot uit.
7. Migreer testtenant → pilotcohort → overige tenants alleen na parity en rollbackreview.

## Invloedrijke open beslissingen

### Beslissing: geïsoleerde interactieve kaartarchitectuur

Waarom niet autonoom definitief gemaakt: DNS, deploymenttopologie en CSP hebben platformbrede beveiligings- en operationele impact.

Optie A: `maps.nxtdrive.io` als geïsoleerde kaartapp met strikt postMessagecontract en lijstfallback.

Optie B: voorlopig uitsluitend lijst en externe navigatie; geen embedded kaart.

Optie C: Google Maps direct in de hoofdapp en globale CSP verruimen.

Aanbeveling: Optie A na securityreview; Optie C niet kiezen.

Gevolg van uitstel: alle operationele functies blijven werken, maar kaarttab blijft list-only.

### Beslissing: Google Cloud, billing en commerciële kostenallocatie

Waarom niet autonoom definitief gemaakt: contract-/EER-uitleg en doorbelasting zijn juridische en commerciële keuzes.

Optie A: beperkte stagingpilot met eigen budget, echte prijsversie en geen klantdoorbelasting.

Optie B: Maps uit laten en alleen gratis provideronafhankelijke functies gebruiken.

Optie C: brede productieactivatie en directe overage-doorbelasting.

Aanbeveling: Optie A, daarna reconciliatiebewijs en pas dan een commercieel besluit.

Gevolg van uitstel: geen providerkosten en geen live routeverkeer; veilige fallbacks blijven beschikbaar.

### Beslissing: multi-instructeuroptimalisatie

Waarom niet autonoom definitief gemaakt: kan roosters, continuïteit en arbeidsbeleving beïnvloeden.

Optie A: standaard uit; eerst single-instructor en annulering in een meetbare pilot.

Optie B: opt-in pilot met vier-ogenpublicatie en expliciete tenantpolicy.

Optie C: breed inschakelen of automatisch publiceren.

Aanbeveling: Optie A, daarna eventueel B; Optie C is strijdig met de publicatiegrens.

Gevolg van uitstel: single-instructorvoorstellen en handmatige planning blijven beschikbaar.

## Commitoverzicht

De sprint bestaat vóór dit rapport uit 25 kleine conventional commits van `1fe9bc4` tot en met `4f5604a`. De volgorde staat volledig in Git; hoofdgroepen:

- locatie-/migratiefundament;
- providerneutraal domein en Google-adapters;
- leerling-, instructeur-, planning- en platformschermen;
- privacy, featuregate en cockpitparity;
- documentatie/ADR's;
- visuele en PostgreSQL-releasebewijzen.

## Validatiecommando's

```bash
pnpm run lint
pnpm run test:unit
pnpm run test:integration
pnpm run migration:smoke
pnpm run security:audit
pnpm run security:secrets
```

Build:

```bash
NEXT_PUBLIC_APP_URL=http://127.0.0.1:22557 \
NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co \
NEXT_PUBLIC_SUPABASE_ANON_KEY=ci-placeholder-not-a-secret \
SUPABASE_SERVICE_ROLE_KEY=ci-placeholder-not-a-secret \
SESSION_SECRET=ci-only-placeholder-with-at-least-32-characters \
VISUAL_FIXTURES_ENABLED=true \
pnpm run build
```

Visual regression tegen die production build:

```bash
pnpm --filter @workspace/nxtdrive run start
pnpm --filter @workspace/scripts run visual:regression
```

Resultaten:

- unit: 270/270;
- integratie: 3/3;
- migraties: 172/172 op leeg en bestaande gevulde fixture;
- visual: 29/29, waarvan 20 Maps-cases;
- build/typecheck: geslaagd;
- production dependency audit: nul bekende kwetsbaarheden;
- secret scan: 1.625 bestanden, geslaagd.

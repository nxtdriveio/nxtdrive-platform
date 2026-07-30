# 11 — Migratie-impact, preview en rollback

Status: migratieontwerp, geen uitvoerbare migratie

Principe: additief, idempotent, tenant-voor-tenant en omkeerbaar via readswitch; geen legacykolommen verwijderen in dezelfde release

## Impactsamenvatting

De migratie is geen tabelwijziging op zichzelf. Locatievelden worden geschreven en gelezen via publieke intake, backoffice, leerlingportaal, native API’s, meerdere SECURITY DEFINER-RPC’s, smart booking, trial planning, privacyservices en notificatie-/exportpaden. De grootste risico’s zijn daarom:

- onbedoeld herschrijven van historische afspraaklocaties;
- verlies van structured intake bij leadconversie;
- cross-tenant locatiereferenties;
- partial dual writes waarbij legacy en canonical uiteenlopen;
- geocoding van ambigue vrije tekst met foutieve hoge zekerheid;
- extra providerkosten of PII in logs;
- anonimisering/export die nieuwe en reeds bestaande adressen overslaat;
- schema/type/RPC-drift doordat SQL en handgeschreven types apart evolueren.

Een “big bang” en een destructieve kolomrename zijn niet verantwoord.

## Verplicht impactregister

### Databaseobjecten

| Groep             | Bestaande objecten die moeten worden meegenomen                                                               | Waarom                                                                                                                                         |
| ----------------- | ------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Leerling          | `students`; `update_student_contact_profile`; directe inserts                                                 | Actuele HOME/PICKUP en legacyprojectie. Zie `20260729150100_student_profile_contact_fields.sql:5-80`.                                          |
| Lead/intake       | `leads`, `lead_intake_details`, `create_lead_with_intake`, `sync_lead_from_intake`, `convert_lead_to_student` | Intakebron, dashboardprojectie en conversie. Conversie kopieert nu alleen basale contactvelden (`0041_convert_lead_terminal_state.sql:28-48`). |
| Les               | `lessons`, actuele `schedule_lesson`-signatuur, self-booking/reschedule/refill RPC’s                          | Definitieve afspraakstop, coördinaten en legacy tekst.                                                                                         |
| Proefles          | `trial_lessons`, book/reschedule/confirm-RPC’s                                                                | Pickup snapshot en routebesluit.                                                                                                               |
| Agenda/examen     | `agenda_appointments`, create/update-RPC’s, `exam_appointment_details` en exam prep-RPC                       | Onderscheid tussen pickup en destination.                                                                                                      |
| Booking lifecycle | `booking_requests`, `booking_candidates`, holds/confirmation                                                  | Immutable aanvraag-/kandidaatsnapshots; partial-coordinate checks repareren.                                                                   |
| Refill            | `lesson_refill_invitations` en acceptatie-RPC                                                                 | Snapshot wordt bij acceptatie gekopieerd naar les (`0050_lesson_refill_waitlist.sql:423-433`).                                                 |
| Stamdata          | `locations`, `upsert_location`, `set_location_active`, `assign_location_branch`; `branches` create/update     | Saved locations en vestigingsadressen gecontroleerd koppelen.                                                                                  |
| Planning          | `service_areas`, zones, area travel matrix, planning settings                                                 | Bestaande fallback behouden; niet vervangen door puntlocaties.                                                                                 |
| Privacy           | privacy deletion RPC, data-exportservice, retention dry run/legal holds                                       | Adres-PII correct exporteren, anonimiseren en bewaren/verwijderen.                                                                             |

Omdat functies in latere migrations opnieuw kunnen zijn aangemaakt, moet vóór implementatie een gegenereerd register de **laatste definitie per functienaam/signatuur** en iedere `.rpc("…")`-caller tonen. Oude migrationbestanden worden niet aangepast; veranderingen komen in nieuwe append-only migrations.

Bekende actuele of laatst gevonden definities die minimaal in dat register horen:

- `schedule_lesson` in `supabase/migrations/0057_schedule_lesson_instructor.sql:20-33`;
- `book_trial_lesson` in `0039_route_intelligence.sql:274-290`, plus de bestaande confirm/reschedule-contracten uit `0037_trial_lessons.sql:254-344`;
- `create_lead_with_intake` in `0043_intake_city_structured.sql:57-93`;
- `sync_lead_from_intake` in `0040_lead_dashboard.sql:173-205`;
- `convert_lead_to_student` in `0041_convert_lead_terminal_state.sql:14-48`;
- `create_agenda_appointment` en `update_agenda_appointment` in `20260615221124_rayons_capabilities_planning_core.sql:592-606` en `:725-738`;
- `create_booking_request` en `replace_booking_candidates` in `20260622091831_smart_booking_phase1.sql:492-514` en `:659-679`, met de latere replacement in `20260622215442_slot_recovery_phase7.sql:57`;
- `student_self_book_lesson` in `20260622195814_student_self_booking_phase5.sql:51-65`;
- `update_student_contact_profile` in `20260729150100_student_profile_contact_fields.sql:22-34`;
- `upsert_location`, `set_location_active` en de branch-assignment-RPC’s in `0032_lesson_context.sql:318-385` en `0104_vehicle_location_branch_assignment_rpc.sql:41-80`;
- `create_branch` en `update_branch` in `0091_branches.sql:419-525`;
- exam preparation en refill acceptance, omdat zij pickuptekst respectievelijk locatiesnapshots kopiëren (`0069_exam_preparation.sql:44-61`; `0050_lesson_refill_waitlist.sql:423-433`).

Dit is een startlijst, geen vervanging voor de gegenereerde scan. Vooral booking-, reschedule- en confirmationfuncties kunnen dezelfde snapshot via JSON of een downstream insert doorgeven.

### Applicatie- en API-surfaces

| Surface                     | Huidig gedrag                                                                                                                                                          | Migratie-impact                                                                                |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Publieke intake             | Places voor city/pickup, structured RPC (`artifacts/nxtdrive/app/intake/[slug]/intake-wizard.tsx:420-480`; `artifacts/nxtdrive/app/intake/[slug]/actions.ts:329-368`). | Schrijf canonical location + providerref en behoud intake-/leadprojectie.                      |
| Leerling toevoegen/bewerken | Vrije tekst in web (`components/students/AddStudentDialog.tsx:276-330`; `artifacts/nxtdrive/components/students/StudentProfileEditor.tsx:119-155`).                    | Nieuw location payload/ID, vrije-tekstfallback, HOME/PICKUP-relaties.                          |
| Leerlingcockpit             | Intake/legacy notes (`artifacts/nxtdrive/components/students/StudentCentralCockpit.tsx:564-584`).                                                                      | Eerst structured student/canonical lezen; legacy notes alleen fallback.                        |
| Backoffice les              | Places + coördinaten (`app/backoffice/agenda/nieuw/location-field.tsx:11-36`).                                                                                         | Resolve canonical stop en blijf legacyvelden projecteren.                                      |
| Generieke agenda            | Vrije tekst (`components/agenda/AppointmentForm.tsx:327-336`).                                                                                                         | Semantische rol toevoegen: pickup/destination/other; canonical/fallback.                       |
| Student self-booking        | Vrije tekst en expliciete null-coördinaten (`app/student/actions.ts:269-283`).                                                                                         | Default pickup tonen/kiezen; request krijgt immutable location ID.                             |
| Native leerling/planning    | Vrije tekstcontracten (`lib/mobile/instructor-students.ts:17-29`; `lib/mobile/instructor-planning.ts:32-42`).                                                          | API-versie of achterwaarts compatibele optionele `LocationInput`; oude clients blijven werken. |
| Saved locations/branches    | Vrije tekstcatalogus en aparte branch address (`app/backoffice/voertuigen/page.tsx:596-731`; `lib/branches/actions.ts:18-96`).                                         | Koppeling naar canonical record, zonder `locations` direct van betekenis te veranderen.        |

### Types en reads

Werk alle projecties bij vanuit het SQL-contract:

- `artifacts/nxtdrive/lib/students/types.ts`;
- `artifacts/nxtdrive/lib/leads/types.ts`, inclusief de nu ontbrekende intakecoords/Place IDs;
- `artifacts/nxtdrive/lib/lessons/types.ts`, inclusief de nu ontbrekende lessoncoords/Place ID;
- `artifacts/nxtdrive/lib/agenda/types.ts`;
- `artifacts/nxtdrive/lib/smart-booking/types.ts`;
- native Kotlin models en de mobile route payloads.

Voeg contracttests toe tussen RPC-inputs, databasevelden en TypeScript/Kotlin serialization. Het lege `lib/db/src/schema/index.ts:1-20` biedt nu geen automatische bescherming.

## Gefaseerd migratieplan

### Fase 0 — Read-only preview en besluit

Geen data wijzigen. Draai tenant-scoped inventoryquery’s en produceer:

1. aantallen per tabel/veldcombinatie;
2. null-, lege- en whitespacewaarden;
3. volledige versus halve coördinaatparen en out-of-rangewaarden;
4. Place ID zonder coördinaten en coördinaten zonder Place ID;
5. conflicten tussen intake en leadprojectie;
6. conflicten tussen student HOME/PICKUP en legacy NAW-notities;
7. `lessons.location_id` waarvan `locations.address` afwijkt van `lessons.location`;
8. branch-adressen versus branch-scoped saved locations;
9. kandidaatduplicaten per tenant met confidence en bronnen;
10. cross-tenant/orphan IDs, met speciale controle op `leads.assigned_location_id`;
11. privacy/legal-hold/retentiondekking;
12. geschatte aantallen provider-resolves/validations en budget.

De preview bevat alleen aantallen en gepseudonimiseerde voorbeelden. Geen volledige adressen of coördinaten in CI-artefacts/logs.

### Fase 1 — Additief schema, nog geen nieuwe reads

Voeg in nieuwe migrations toe:

- `location_records`;
- `location_provider_refs`;
- `student_locations`;
- eerste lesson/trial/agenda stoprelaties of nullable canonical FK’s;
- mapping/reconciletabellen;
- tenant-consistente unique/FK’s, RLS en audit;
- coord-pair/rangechecks;
- privacycategorieën en export-/deletionondersteuning.

Geen bestaande kolom droppen, hernoemen, `NOT NULL` maken of overschrijven. Feature flags staan uit. De nieuwe tabellen moeten zonder Google-configuratie werken.

### Fase 2 — Deterministische backfill zonder providercalls

Maak location records alleen uit bestaande data. Bronstatus wordt `LEGACY_BACKFILL` + `UNVALIDATED` of, bij een bestaande consistente Place-koppeling, hoogstens `PARTIALLY_VALIDATED`.

Gebruik een idempotente mappingtabel, bijvoorbeeld:

```text
legacy_location_links(
  tenant_id,
  source_table,
  source_pk,
  role,
  location_id,
  source_fingerprint,
  migration_run_id,
  created_at
)
```

Uniek op `(tenant_id, source_table, source_pk, role)`. Elke batch:

- selecteert met stabiele volgorde en limiet;
- schrijft alleen bij ontbrekende mapping;
- controleert tenantgelijkheid;
- registreert count/checksum, geen PII-payload;
- kan veilig opnieuw worden uitgevoerd.

Bronprioriteit:

1. bestaande complete Place ID + coördinaten + formatted address;
2. gestructureerde student-/branchcomponenten;
3. vrije tekst;
4. legacy notes alleen wanneer structured velden leeg zijn en parse confidence expliciet is.

Geen automatische fuzzy merge en geen geocoding in deze fase.

### Fase 3 — Dedupepreview en menselijke goedkeuring

Maak kandidaatgroepen met normalized fingerprint/providerref. Rapporteer survivorvoorstel, gekoppelde owners, historische stops en veldverschillen. Alleen exact aantoonbare duplicaten kunnen na expliciete goedkeuring worden samengevoegd.

Historische stops worden niet verplaatst als hun immutable input zou veranderen. Het oude record wordt `superseded`, niet fysiek verwijderd.

### Fase 4 — Dual write in shadow mode

Per tenant/surface achter flags:

1. schrijf canonical record/relatie;
2. schrijf in dezelfde transactie of RPC de legacyprojectie;
3. lees nog legacy;
4. vergelijk canonical→legacyprojectie asynchroon;
5. meet mismatch, latency en fallback.

RPC-dual-write verdient de voorkeur boven twee losstaande appwrites. Waar appcode nog direct naar tabellen schrijft, migreer eerst naar één service/RPC zodat partial success niet kan ontstaan.

Belangrijke correcties in deze fase:

- `convert_lead_to_student` kopieert of koppelt intake HOME/PICKUP naar de student;
- cockpit leest structured/canonical data;
- booking requests/candidates krijgen harde coördinaat-pairchecks;
- privacy deletion wist/unlinks studentlocaties en bestaande adresvelden;
- data-export bevat relevante locaties en provenance;
- logs/audit bevatten ID’s en status, niet standaard het adres.

### Fase 5 — Optionele providerverrijking

Pas na budget-, voorwaarden- en privacygoedkeuring:

- queueer alleen ambigue/onvoldoende validated records waarvoor verrijking doelgebonden is;
- rate limit per tenant en globaal;
- sla status/foutcategorie/freshness op, geen ruwe response;
- blokkeer normale opslag niet bij provideruitval;
- overschrijf handmatige correcties nooit automatisch;
- zet resultaten met lage confidence in review.

Deze fase is uitschakelbaar zonder dat location records onbruikbaar worden.

### Fase 6 — Shadow read en reconciliatie

Bereken beide projecties, toon gebruikers nog legacy. Vergelijk:

- formatted address;
- HOME/PICKUP-keuze;
- stoprol;
- lat/lng binnen afgesproken tolerantie;
- providerref;
- tenant;
- route-inputfingerprint.

Mismatchcategorieën moeten oorzaakgericht zijn: legacy parse, stale lead projection, missing dual write, manual correction, provider refresh, cross-tenant reject.

### Fase 7 — Gefaseerde readswitch

Schakel per surface en tenant:

1. interne read-only beheerweergave;
2. leerlingcockpit/profiel;
3. backoffice lesplanning;
4. publieke intake/leadconversie;
5. student self-booking;
6. native clients;
7. algemene planning/routing.

De fallback is tijdens deze fase `canonical → legacy`, met metriek op iedere fallback. Geen stille lege locatie.

### Fase 8 — Canonical write leidend

Pas na bewezen parity wordt canonical leidend en legacy uitsluitend geprojecteerd voor oude callers. Oude native clients blijven via dezelfde projectielaag functioneren.

### Fase 9 — Legacy retirement in aparte release

Legacykolommen pas verwijderen wanneer:

- alle reads en writes aantoonbaar gemigreerd zijn;
- ondersteunde native appversies geen oude payload nodig hebben;
- exports, rapportages, notificaties en jobs zijn gecontroleerd;
- retentiontermijnen en historische explainability zijn geborgd;
- rollbackwindow verstreken en een restoretest geslaagd is.

Kolomverwijdering is een afzonderlijk expliciet besluit, niet onderdeel van de eerste integratierelease.

## Go/no-go-criteria

Minimale go-criteria vóór iedere readswitch:

- 100% van nieuwe locatiereferenties heeft geldige tenantmapping;
- 0 halve of out-of-range coördinaatparen in canonical data;
- 0 orphan/cross-tenant ownerrelaties;
- ≥99,5% canonical/legacy-parity op records die deterministisch vergelijkbaar zijn;
- 100% van relevante RPC- en API-callers staat in het impactregister;
- privacy-export en anonimisering hebben integratie- en deletiontests voor HOME, PICKUP en afspraakstops;
- legal holds en retention zijn getest op relaties en providerrefs;
- provider-disabled testpad is groen;
- dual-writefouten zijn zichtbaar en herstelbaar;
- providerbudget, quota-alerts en kill switch zijn geconfigureerd;
- een rollbackoefening op een niet-productietenant is geslaagd.

No-go bij een onbekende cross-tenantrelatie, incorrecte anonimisering, onverklaarde historische wijziging of structurele mismatch boven de drempel.

## Rollbackstrategie

Rollback is primair een **read- en feature-rollback**, geen destructieve reverse migration.

1. Zet readswitch per tenant/surface terug naar legacy.
2. Laat dual write indien veilig actief zodat data niet verder divergeert; bij writebug zet de specifieke canonical writer uit en queue herstel.
3. Stop providerverrijkings- en routejobs via kill switch.
4. Bewaar `legacy_location_links` en migration-runmetadata; verwijder geen bronvelden.
5. Markeer foutief nieuw aangemaakte records als inactief/quarantined na tenant-scoped preview; hard delete niet automatisch.
6. Herstel de vorige RPC-definitie via een nieuwe forward migration, niet door reeds toegepaste migrationbestanden te wijzigen.
7. Gebruik PITR/backup alleen voor werkelijk corrupte data; een restoreprocedure moet vooraf getest zijn.
8. Reconcile canonical opnieuw vanuit ongewijzigde legacybron zodra de fout is opgelost.

Omdat geen legacykolom in de eerste releases wordt verwijderd of overschreven, blijft de readswitch een snelle en controleerbare terugweg.

## Testmatrix

### Database

- tenantgelijkheid op iedere relatie en providerref;
- RLS per staff/student/guardian/platformrol;
- coord pair/ranges en statusinvarianten;
- idempotente backfill en dual write;
- copy-on-change/superseded-cyclus;
- immutability van definitieve stops;
- leadconversie met en zonder structured intake;
- refill/bookingbevestiging met snapshot;
- privacy delete met en zonder legal hold.

### Contract en surface

- web Places gekozen, vrije tekst en provideruitval;
- handmatige correctie na autocomplete;
- pickup gelijk aan HOME en afwijkende pickup;
- student self-booking default pickup;
- agenda pickup versus destination;
- native oude payload (alleen tekst) en nieuwe payload (location ID/input);
- saved location/branch scope;
- geen coordinates of address in standaardlogs/errors.

### Planning

- route met twee immutable stops;
- vorige/volgende afspraak met gewijzigde studentdefault;
- instructor day start/end ontbreekt;
- vehicle base ontbreekt;
- Routes-provider uitgevallen → area/Haversine fallback + confirmation;
- routecache gescheiden op richting, vertrektijdcontext en location fingerprint.

## Open besluiten vóór implementatie

1. Definitieve tabelnamen en of `public.locations` later `saved_locations` wordt.
2. Welke surfaces in de eerste capability vallen; aanbevolen: student HOME/PICKUP, leadconversie en lesson pickup.
3. Copy-on-change versus expliciete `location_versions` als de organisatie uitgebreid versiebeheer nodig heeft.
4. Welke providerafgeleide velden en bewaartermijnen onder de actuele voorwaarden zijn toegestaan.
5. Wie ambigue dedupe- en validationreview uitvoert.
6. Ondersteuningswindow en versioneringsstrategie voor native clients.
7. Concrete providerbudgetten, quota, alertdrempels en kill-switchowner.

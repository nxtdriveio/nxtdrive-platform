# Smart Appointment Wizard — implementatierapport

Datum: 12 augustus 2026  
Surface: NXTDRIVE Instructeur · Dagagenda

## 1. Appointment type policies

**Status:** Uitgevoerd.  
**Uitgevoerd:** Eén versieerbare policy-engine bevat de actieve NXTDRIVE-afspraaktypen, leerling-, locatie-, voertuig-, duur-, buffer-, route-, notificatie- en overridesemantiek. Platformwaarden zijn expliciet defaults en geen landelijke normen.  
**Belangrijkste bestanden:** `domains/planning/domain/appointment-policy.ts`, `domains/planning/application/appointment-policy-service.ts`, `supabase/migrations/20260811233933_smart_appointment_wizard_foundation.sql`.  
**Tests:** Resolutieprioriteit, grenzen, locked regels, voertuigbeleid en dynamische stappen zijn met pure unit tests afgedekt.  
**Eventuele resterende externe/invloedrijke beslissing:** Geen blokkade. Het bestaande type `trial` blijft `EXISTING_ONLY`, omdat de repository geen canonieke proefles-create-mutatie heeft; er is bewust geen tweede proeflesdomein geïntroduceerd.

## 2. Tenantconfiguratie

**Status:** Uitgevoerd.  
**Uitgevoerd:** Tenantadmins beheren onder Instellingen → Planning → Afspraaktypen de actieve typen, labels, veilige pasteltoon, duurgrenzen, buffers, leerling-/locatie-/voertuigvereisten, routecontrole, zichtbaarheid, notificaties en toegestane overrides. Wijzigingen verhogen de policyversie en worden geaudit.  
**Belangrijkste bestanden:** `app/backoffice/instellingen/planning/afspraaktypen/page.tsx`, `appointment-type-policy-manager.tsx`, `actions.ts`.  
**Tests:** Autorisatie, constraints, migratiesmoke en policy-snapshotgedrag.  
**Eventuele resterende externe/invloedrijke beslissing:** Geen.

## 3. Instructeursvoorkeuren

**Status:** Uitgevoerd.  
**Uitgevoerd:** Instructeurs kunnen per vrijgegeven afspraaktype hun duur en buffers instellen. Tenant-locked waarden blijven zichtbaar en niet wijzigbaar.  
**Belangrijkste bestanden:** `app/instructeur/instellingen/planningvoorkeuren/page.tsx`, `instructor-planning-preferences-manager.tsx`, `actions.ts`.  
**Tests:** Resolvertests bewijzen tenant-defaults, persoonlijke voorkeuren, minimumwaarden en locks.  
**Eventuele resterende externe/invloedrijke beslissing:** Geen.

## 4. Dynamic wizard engine

**Status:** Uitgevoerd.  
**Uitgevoerd:** `SmartAppointmentWizard` bouwt programmatic uitsluitend relevante stappen. Rijles, examen, pauze, privé en operationele afspraken delen dezelfde state-machine zonder lege stappen. Upstreamwijzigingen wissen alleen niet langer geldige context.  
**Belangrijkste bestanden:** `domains/planning/ui/appointment-wizard/SmartAppointmentWizard.tsx`, `domains/planning/domain/appointment-policy.ts`.  
**Tests:** Unitdekking voor lesson/private/break/exam en E2E-dekking voor alle primaire subflows.  
**Eventuele resterende externe/invloedrijke beslissing:** Geen.

## 5. Leerlingzoeker

**Status:** Uitgevoerd.  
**Uitgevoerd:** De ARIA-combobox zoekt server-side vanaf drie tekens, met 250 ms debounce en maximaal tien minimale resultaten. Er wordt geen leerlingdataset gepreload.  
**Belangrijkste bestanden:** `domains/planning/ui/appointment-wizard/StudentSearchCombobox.tsx`, `lib/instructor/smart-appointment-service.ts`, de RPC `search_instructor_students`.  
**Tests:** Twee tekens doen geen request; drie tekens leveren async resultaten; loading, leeg, fout, toetsenbord en screenreaderstatus zijn getest.  
**Eventuele resterende externe/invloedrijke beslissing:** Geen.

## 6. Student scope en permissions

**Status:** Uitgevoerd.  
**Uitgevoerd:** Zoekscope wordt tenantconfigureerbaar maar uitsluitend server-side toegepast. Actieve status, instructeurskoppeling, vestiging, membership en tenantgrens worden opnieuw gecontroleerd bij contextresolutie én create.  
**Belangrijkste bestanden:** `appointment-policy-service.ts`, `smart-appointment-service.ts`, `20260811233933_smart_appointment_wizard_foundation.sql`.  
**Tests:** Migratiesmoke bewijst eigen leerling, niet-vindbare cross-tenantleerling en geweigerde cross-tenantcreate.  
**Eventuele resterende externe/invloedrijke beslissing:** Geen.

## 7. Smart context resolver

**Status:** Uitgevoerd.  
**Uitgevoerd:** Na leerlingselectie wordt in één serverfacade de minimale leerlingcontext, pickup, duur, buffers, voertuig en planningburen opgelost. Datum- of tijdswijzigingen herberekenen dezelfde context gericht.  
**Belangrijkste bestanden:** `lib/instructor/smart-appointment-service.ts`, `application/smart-appointment-contracts.ts`, `app/instructeur/agenda/wizard/actions.ts`.  
**Tests:** E2E bewijst directe telefoon-, pickup-, duur- en voertuigresolutie zonder dossierpreload.  
**Eventuele resterende externe/invloedrijke beslissing:** Geen.

## 8. Pickup/location flow

**Status:** Uitgevoerd.  
**Uitgevoerd:** Canonieke standaardpickup, alternatieven, tijdelijk adres en examenbestemming gebruiken de bestaande location- en adreszoekfundering. Tijdelijke adressen wijzigen het leerlingprofiel niet en worden als afspraaksnapshot opgeslagen.  
**Belangrijkste bestanden:** `SmartAppointmentWizard.tsx`, `domains/maps/ui/address-autocomplete.tsx`, `app/api/maps/places/route.ts`.  
**Tests:** Pickupselectie, tijdelijk adres, CBR-bestemming en snapshotcontract zijn afgedekt.  
**Eventuele resterende externe/invloedrijke beslissing:** Geen.

## 9. Duration resolver

**Status:** Uitgevoerd.  
**Uitgevoerd:** Prioriteit is leerling → instructeur → tenant → platform, daarna begrensd en gesnapt op tenant-minimum, maximum en stap. Historische afspraken behouden hun toegepaste policy.  
**Belangrijkste bestanden:** `appointment-policy.ts`, `appointment-policy-service.ts`.  
**Tests:** Alle bronnen, min/max, stapgrootte en locked examenduur zijn getest.  
**Eventuele resterende externe/invloedrijke beslissing:** Geen.

## 10. Buffer resolver

**Status:** Uitgevoerd.  
**Uitgevoerd:** Voor- en nabuffer volgen instructeursvoorkeuren waar toegestaan en tenantdefaults/locked minima waar vereist. Buffers blokkeren planning zonder de zichtbare eventduur te verlengen.  
**Belangrijkste bestanden:** `appointment-policy.ts`, `smart-appointment-service.ts`, create-RPC.  
**Tests:** Resolvertests en migratiesmoke bewijzen buffer-overlap en correcte zichtbare eindtijd.  
**Eventuele resterende externe/invloedrijke beslissing:** Geen.

## 11. Vehicle resolver

**Status:** Uitgevoerd.  
**Uitgevoerd:** Resolutie volgt vaste toewijzing/persoonlijke voorkeur, vestigingsdefault, tenantdefault en exact één geldige kandidaat. Beschikbaarheid, status, vestiging en bestaande boekingen worden in batch gecontroleerd.  
**Belangrijkste bestanden:** `appointment-policy.ts`, `smart-appointment-service.ts`, voertuigvelden in de migratie.  
**Tests:** Fixed/default/single/ambiguous/unavailable/capabilitygevallen zijn afgedekt.  
**Eventuele resterende externe/invloedrijke beslissing:** Geen.

## 12. Conditional vehicle selection

**Status:** Uitgevoerd.  
**Uitgevoerd:** Een succesvol automatisch gekozen voertuig blijft uit de normale flow en verschijnt alleen subtiel in de samenvatting. Een selectie wordt dynamisch ingevoegd bij `ALWAYS_SELECT`, ambiguïteit of een ongeldige default.  
**Belangrijkste bestanden:** `SmartAppointmentWizard.tsx`, `appointment-policy.ts`.  
**Tests:** E2E en visuele baseline `appointment-wizard-vehicle-required-*`.  
**Eventuele resterende externe/invloedrijke beslissing:** Geen.

## 13. Route/planning validation

**Status:** Uitgevoerd.  
**Uitgevoerd:** De bestaande planning-core controleert tenantlokale daggrenzen, instructeur-, leerling- en voertuigoverlap, buffers, vorige/volgende afspraak en beschikbare routeprojectie. De bestaande Maps gateway verzorgt adresgebruik en metering met surface `INSTRUCTOR_APPOINTMENT_WIZARD`; bij provideruitval blijft de wizard bruikbaar met expliciete fallback/unknown-status. Definitieve create herhaalt harde controles atomair.  
**Belangrijkste bestanden:** `lib/planning-core/*`, `smart-appointment-service.ts`, `domains/maps/domain/types.ts`.  
**Tests:** Studentoverlap, adjacency, waarschuwing/override, routefallback en provideronafhankelijke create zijn getest.  
**Eventuele resterende externe/invloedrijke beslissing:** Geen; actuele providerprecisie blijft afhankelijk van de bestaande tenant Maps-configuratie.

## 14. Private appointments

**Status:** Uitgevoerd.  
**Uitgevoerd:** Privé slaat leerling, contact, pickup en voertuig volledig over en vraagt alleen titel, optionele locatie, tijd en duur.  
**Belangrijkste bestanden:** `SmartAppointmentWizard.tsx`, platformpolicy `private_block`.  
**Tests:** Mobiele E2E-create en drie responsive visuele baselines.  
**Eventuele resterende externe/invloedrijke beslissing:** Geen.

## 15. Breaks

**Status:** Uitgevoerd.  
**Uitgevoerd:** Pauze gebruikt de korte flow Type → Tijd → Bevestigen met 30 minuten tenantconfigureerbare default.  
**Belangrijkste bestanden:** `SmartAppointmentWizard.tsx`, platformpolicy `break`.  
**Tests:** Dynamische-stappentest en fixture-create.  
**Eventuele resterende externe/invloedrijke beslissing:** Geen.

## 16. Exams

**Status:** Uitgevoerd.  
**Uitgevoerd:** Examen en tussentijdse toets gebruiken leerling, pickup, CBR-bestemming, langere/locked duur en buffers, voertuig- en logistiekcontrole, plus de bestaande examenmelding na create.  
**Belangrijkste bestanden:** `appointment-policy.ts`, `SmartAppointmentWizard.tsx`, `smart-appointment-service.ts`.  
**Tests:** Mobiele examen-E2E, locked waarden en mobile/tablet visual regressions.  
**Eventuele resterende externe/invloedrijke beslissing:** Geen.

## 17. Confirmation/create

**Status:** Uitgevoerd.  
**Uitgevoerd:** De rustige samenvatting toont tijd, buffer, type, leerling, locatie, voertuig en planningstatus. De service-role create-RPC herautoriseert alle resources, neemt advisory locks, controleert overlaps, schrijft immutable policy/location-snapshots en audit in één transactie. Bij fout blijft wizardstate behouden.  
**Belangrijkste bestanden:** `SmartAppointmentWizard.tsx`, `smart-appointment-service.ts`, `create_smart_appointment`.  
**Tests:** Gedragsmatige migratiesmoke, statisch RPC-contract en E2E-create.  
**Eventuele resterende externe/invloedrijke beslissing:** Geen.

## 18. Calendar integration

**Status:** Uitgevoerd.  
**Uitgevoerd:** Een leeg kwartierslot opent de wizard met gesnapte datum, starttijd en huidige instructeur. Succes sluit de wizard, bewaart scroll/focus, refreshes de dagprojectie en positioneert het nieuwe event correct. De agenda prelaadt geen leerlingen.  
**Belangrijkste bestanden:** `InstructorDayCalendar.tsx`, `AppointmentSheets.tsx`, `app/instructeur/agenda/page.tsx`, `components/instructor/RedesignViews.tsx`.  
**Tests:** Volledige slot → wizard → rijles/private/examen → event-E2E.  
**Eventuele resterende externe/invloedrijke beslissing:** Geen.

## 19. Mobile UX

**Status:** Uitgevoerd.  
**Uitgevoerd:** 390×844 gebruikt een compacte large bottom sheet die zich via `visualViewport` aan het softwaretoetsenbord aanpast, met eigen scroll, verkleinde header/footer, safe-area padding, 44×44 acties en zichtbare contentmarges. De primaire actie blijft boven het toetsenbord bereikbaar zonder de agendashell te verlengen.
**Belangrijkste bestanden:** `SmartAppointmentWizard.tsx`, `components/ui/dialog.tsx`.  
**Tests:** Mobiele kalender/wizard-E2E, accessibility-E2E en elf mobiele wizardbaselines.  
**Eventuele resterende externe/invloedrijke beslissing:** Geen.

## 20. Tablet UX

**Status:** Uitgevoerd.  
**Uitgevoerd:** Portrait en landscape gebruiken een gecentreerde premium modal van 576 px met interne scroll; de agenda blijft herkenbaar op de achtergrond en de wizard wordt niet als uitgerekte telefoon weergegeven.  
**Belangrijkste bestanden:** `SmartAppointmentWizard.tsx`.  
**Tests:** 768×1024, 834×1194, 1024×768 en 1194×834 E2E plus portrait/landscape-baselines per wizardstaat.  
**Eventuele resterende externe/invloedrijke beslissing:** Geen.

## 21. Accessibility

**Status:** Uitgevoerd.  
**Uitgevoerd:** Semantische labels, ARIA-combobox/status, toetsenbordresultaten, Enter/Space, Escape, focustrap, focusherstel, gekoppelde fouten, reduced motion, browserzoom en minimale 44×44 doelen zijn geborgd.  
**Belangrijkste bestanden:** `StudentSearchCombobox.tsx`, `SmartAppointmentWizard.tsx`, `components/ui/dialog.tsx`, `scripts/src/e2e-appointment-wizard-accessibility.ts`.  
**Tests:** `e2e:appointment-wizard-accessibility` groen.  
**Eventuele resterende externe/invloedrijke beslissing:** Geen.

## 22. Tests

**Status:** Uitgevoerd en groen.  
**Uitgevoerd:** Unit-, integratie-, migratie-, build-, mobiele/tablet-E2E-, accessibility- en visual-regressiondekking zijn toegevoegd. Fixtures gebruiken een vaste klok, datum en `Europe/Amsterdam`. Visuele vergelijkingen tolereren uitsluitend zeer beperkte anti-aliasruis (maximaal 256 kanalen met delta ≤ 4), terwijl structurele of zichtbare afwijkingen blijven falen.  
**Belangrijkste bestanden:** `appointment-policy.test.ts`, `validation.test.ts`, `smart-appointment.rpc.test.ts`, `scripts/release/migration-smoke.mjs`, `scripts/src/e2e-instructor-day-calendar.ts`, `scripts/src/e2e-appointment-wizard-accessibility.ts`, `scripts/src/visual-regression.ts`, `scripts/visual-baselines/appointment-wizard-*.png`.  
**Exacte eindvalidatie:**

- install: bestaande lockfile/dependencies, geen pakketwijziging nodig;
- formatcheck: groen;
- lint: groen;
- typecheck: groen;
- unit tests: groen;
- integration tests: groen;
- migration smoke: groen, 174 migraties op lege database en bestaande fixture;
- build: groen;
- instructor agenda + wizard E2E: groen;
- accessibility E2E: groen;
- visual regression: groen.

**Eventuele resterende externe/invloedrijke beslissing:** Geen.

## Productiehotfix 12 augustus 2026

**Status:** Uitgevoerd en gevalideerd.
**Uitgevoerd:** Het adresveld behoudt focus tijdens iedere toetsaanslag; de wizard past hoogte en ondermarge aan de zichtbare mobiele viewport aan; rijlesdefaults volgen tenantconfiguratie met 50 minuten duur, 10 minuten buffer en 10-minutenopties; een handmatig gekozen voertuig wordt opnieuw server-side gevalideerd en wist de oude voertuigblokkade voordat de samenvatting opent. De bestaande configuratieschermen voor tenant en instructeur gebruiken dezelfde 10-minutenstappen.
**Belangrijkste bestanden:** `components/ui/dialog.tsx`, `SmartAppointmentWizard.tsx`, `smart-appointment-service.ts`, `appointment-policy.ts`, `planning-settings/service.ts`, `20260812021837_align_lesson_wizard_defaults.sql`.
**Tests:** 311 unit tests, 6 integratietests, typecheck, lint, productiebuild, migratiesmoke, mobiele agenda-E2E, wizard accessibility/focus/keyboard/vehicle-E2E en alle visual regressions groen.
**Eventuele resterende externe/invloedrijke beslissing:** Geen.

## 23. Commits

**Status:** Uitgevoerd in logisch gescheiden commits.  
**Uitgevoerd:**

1. `feat(planning): add smart appointment policy engine`
2. `feat(instructor): add configurable planning preferences`
3. `feat(instructor): add smart appointment wizard`
4. `test(instructor): prove smart appointment wizard flows`
5. `docs(instructor): document smart appointment wizard`
6. `fix(instructor): harden mobile appointment wizard`

**Belangrijkste bestanden:** Zie bovenstaande secties.  
**Tests:** Iedere laag is vóór de uiteindelijke releasevalidatie afzonderlijk gecontroleerd.  
**Eventuele resterende externe/invloedrijke beslissing:** Geen.

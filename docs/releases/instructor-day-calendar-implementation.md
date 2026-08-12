# NXTDRIVE Instructeur — 24-uurs dagagenda

Implementatiestatus: gereed op 11 augustus 2026.

## 1. Architectuur

De canonieke route `/instructeur/agenda` gebruikt voor `weergave=day` nu één
visuele dagagenda. De bestaande week-, maand- en historieprojecties blijven
beschikbaar en delen dezelfde beveiligde agendadata. Er zijn geen concurrerende
dagroutes of nieuwe planningsmutaties toegevoegd.

De implementatie is verdeeld in:

- domain: `domains/planning/domain/instructor-day-calendar.ts` met tijdpositie,
  clipping, snapping, initial-scroll en overlapalgoritme;
- application: `appointment-type-catalog.ts` en de minimale
  `InstructorDayAgendaItem`-projectie;
- UI: `InstructorDayCalendar`, `DayCalendarHeader`, `CalendarEventBlock` en de
  type-, create- en quick-viewsheets;
- server: de bestaande `loadInstructorAgenda`-grens in
  `lib/instructor/experience-server.ts` projecteert lessen, proeflessen,
  algemene afspraken, permissies, voertuigen, locaties en de laatste
  routebeslissing in één dagdataset;
- create: `createInstructorAgendaItem`, `scheduleLesson`, `createAppointment`
  en de bestaande centrale planningvalidator blijven de enige
  productie-mutatiegrenzen;
- native Android: dezelfde dagervaring is als begrensde Compose-tijdlijn
  geïntegreerd. Het mobiele bootstrapcontract levert de tenanttijdzone en een
  begrensd datumbereik. De native createflow blijft de bestaande
  `/api/mobile/instructor/planning`-mutatie gebruiken.

De query- en mutatiegrenzen leiden tenant en instructeur server-side af.
Clientwaarden kunnen geen tenant kiezen. Bestaande branch-, leerling-, voertuig-,
overlap-, route- en rechtenvalidatie wordt hergebruikt.

## 2. Kalendergrid

De tijdlijn loopt van 00:00 tot 24:00: 1.440 minuten, 24 uur en 96
kwartierslots. Er zijn 25 gelabelde hele-uurgrenzen, 24 gestreepte
halfuurgrenzen en 48 lichte gestippelde kwartiergrenzen. Zo blijft ieder
kwartier ook visueel traceerbaar zonder de grid zwaar te maken.

De centrale schaal is responsief:

- mobiel: 70 px per uur;
- tablet: 76 px per uur;
- breed web: 80 px per uur;
- native Android: 72 dp per uur.

Alleen de kalender-viewport heeft verticale scroll. Header, app-shell,
bottom-navigation en safe areas blijven buiten die scrollcontainer.

## 3. Eventpositionering

Start en duur worden zonder visuele afronding naar pixels vertaald. Alleen een
nieuw gekozen starttijdstip snapt naar 15 minuten. Events over middernacht worden
aan de geselecteerde kalenderdag geclipt; afspraken binnen de tenantdag vallen
daardoor nooit buiten het zichtbare tijdvenster.

Het pure overlapalgoritme sorteert op start/einde, maakt transitieve
overlapgroepen, wijst lanes toe en benut vrije kolommen met `columnSpan`. Exact
aansluitende events overlappen niet. Compacte en zeer korte blokken reduceren
hun inhoud responsief.

## 4. Quick-add

De grid gebruikt één roving tabstop. Pijltjestoetsen bewegen per kwartier of uur;
Enter en Spatie openen quick-add. Pointer- en touch-Y worden geclamped en naar
het dichtstbijzijnde vrije kwartier gesnapt. Events liggen boven de lege slots,
waardoor event-hit-testing nooit per ongeluk quick-add opent.

Quick-add opent direct de bestaande afspraakflow. `Type afspraak` is daarin een
echte wijzigbare dropdown met uitsluitend typen die de bestaande mutatiegrens
ondersteunt. Rijles start als veilige standaard en datum, starttijd, instructeur,
vestiging, standaardduur/buffer, leerling, voertuig, rayon en ophaalpunt worden
waar mogelijk vooringevuld. De formuliersecties en centrale standaardduur
reageren op het gekozen type.
Proefles blijft zichtbaar in de agenda, maar staat niet in de dropdown omdat
daarvoor geen veilige bestaande instructeursmutatie bestaat.

Na succesvolle create redirect de beveiligde serveractie terug naar dezelfde
geselecteerde kalenderdag, waarna de serverprojectie opnieuw de bron van waarheid
is. Offline create is uitgeschakeld; er wordt geen losse mutatiequeue gebouwd.

## 5. Current time en initial scroll

De current-time-indicator gebruikt de tenanttijdzone, verschijnt gedurende de
volledige geselecteerde huidige dag en ververst iedere minuut en bij hervatten
van het tabblad. Ook late avond- en nachttijden blijven zichtbaar. Een lopende
afspraak krijgt aanvullend het tekstlabel `NU`.

De vaste late-time fixture controleert 23:04 expliciet: de initiële scroll zet
22:00 bovenin, houdt de actuele lijn in beeld en toont de eindgrens 24:00.

Initial scroll gebeurt eenmaal per geselecteerde datum:

- vandaag: circa één uur vóór de tenantlokale tijd;
- andere datum: circa één uur vóór het eerste event, anders 07:00.

Gebruikersscroll wordt daarna niet overschreven.

## 6. Viewport en responsive gedrag

- Mobile portrait (360–430 px): compacte gutter, korte datum, bottom sheets,
  veilige bottom-navruimte en geen horizontale overflow.
- Tablet portrait (768×1024 en 834×1194): ruimere grid, bredere eventcontent en
  gecentreerde dialogen.
- Tablet landscape (1024×768 en 1194×834): begrensde kalenderbreedte en een
  gelijktijdige quick-view als rechter side sheet.
- Desktop: de agenda blijft gecentreerd en wordt niet onbeperkt breed.
- Android Compose: `Scaffold` houdt appbar/navigatie vast; alleen de tijdlijn
  scrollt. Dagheader, quick-add bottom sheet en detail bottom sheet blijven in de
  native viewport.

De webshell gebruikt `100dvh`, `min-height: 0`, `overflow: hidden` en safe-area
insets. De agenda vergroot de documenthoogte niet en veroorzaakt geen dubbele
scroll.

## 7. Reistijd

De dagprojectie leest de laatste tenant- en instructeurgebonden
`route_calculation_decisions` in batch. Een event kan `AMPLE`, `TIGHT`,
`INFEASIBLE`, `FALLBACK` of `UNKNOWN` tonen met reistijd, beschikbare tijd en
`asOf`.

De timeline laadt geen Maps SDK en doet geen routecall per event. Bij onbekende
of uitgevallen routing blijven alle agenda- en createfuncties werken; de
quick-view meldt dat de route handmatig moet worden gecontroleerd.

## 8. Accessibility

- Semantische links, eventbuttons, grid/gridcells en Nederlandstalige labels.
- Eén roving tabstop voor 96 slots; pijltjestoetsen voor navigatie.
- Enter/Spatie opent slot of afspraak; Escape sluit sheet/dialog.
- De bestaande Radix-dialoggrens verzorgt focus trap en focusherstel.
- Zichtbare focusringen, minimaal 44 px voor primaire acties en geen blokkade van
  browserzoom of font scaling.
- Type, icoon en tekst blijven aanwezig; kleur is nooit de enige informatiedrager.
- De mobiele create-sheet heeft expliciete boven- en onderruimte, houdt de titel
  volledig zichtbaar en bewaart veilige ruimte rond de laatste velden.
- Dialogs worden op `document.body` geportald, zodat de kalendercontainer met
  `overflow: hidden` een sheet nooit meer aan boven- of onderzijde afknipt.
- Light/dark contrast en `prefers-reduced-motion` worden gerespecteerd.
- De E2E bewijst toetsenbordnavigatie, focusherstel, interne scroll en
  `reducedMotion: reduce`.

## 9. Tests en verificatie

Uitgevoerd op de uiteindelijke implementatie:

- repository lint: geslaagd;
- repository typecheck: 4 workspacepackages geslaagd;
- web unit: 298/298 geslaagd, inclusief 14 nieuwe kalender-/timezone-/DST-tests;
- integratie: 3/3 betalings-RPC-regressietests geslaagd;
- centrale lesson-planning karakterisatietests: geslaagd;
- instructor UI- en app-releasegates: geslaagd;
- Android `testDebugUnitTest lintDebug`: geslaagd, 37 Gradletaken;
- productie-Next-build: geslaagd;
- bestaande release-E2E: geslaagd;
- kalender-E2E: geslaagd op 390×844, 768×1024, 834×1194, 1024×768 en
  1194×834;
- volledige E2E-createfixture: 13:30 → Rijles → leerling → opslaan → nieuw
  proportioneel blok: geslaagd;
- visual regression: 38/38 baselines geslaagd, inclusief een 23:04-fixture;
- format check en `git diff --check`: geslaagd.

Lokale productiemeting van de vaste fixture:

- initial render: 1.194 ms;
- quick-add openen: 101 ms;
- gemiddelde geanimeerde scrollframe: 16,2 ms;
- create-return: 165 ms;
- dagwissel: 97 ms.

Deze tijden zijn regressiesignalen uit de lokale Playwright-run, geen
device-benchmarkgarantie.

## 10. Screenshots en baselines

Nieuwe vaste baselines staan onder `scripts/visual-baselines/`:

- `instructor-agenda-mobile-empty.png`;
- `instructor-agenda-mobile-filled.png`;
- `instructor-agenda-mobile-overlap.png`;
- `instructor-agenda-mobile-current-time.png`;
- `instructor-agenda-mobile-quick-add.png`;
- `instructor-agenda-tablet-portrait.png`;
- `instructor-agenda-tablet-landscape.png`;
- `instructor-agenda-tablet-current-time.png`;
- `instructor-agenda-tablet-travel-conflict.png`;
- `instructor-agenda-dark.png`.

De publieke instructeurcaptures `public/screenshots/instructor-1.png` en
`instructor-2.png` zijn eveneens vernieuwd.

## 11. Commits

- `81469d4` — `refactor(planning): add instructor day agenda projection`
- `c1aec77` — `feat(instructor): add viewport-bound day timeline`
- `acf4282` — `fix(instructor): harden calendar create return and themes`
- `82927ac` — `feat(android): add tenant-aware instructor day timeline`
- `3b78da8` — `test(instructor): add day calendar e2e and visual baselines`
- `bd15917` — `test(e2e): prove instructor calendar create return flow`
- `4963bd3` — `test(performance): measure instructor calendar interactions`
- `4adb1f5` — `refactor(android): centralize appointment presentation types`
- `049dd9e` — `feat(instructor): extend day calendar to 24 hours`
- `484dbcc` — `test(instructor): cover 24-hour agenda`

## 12. Open punten

De database-backed `db:test-rls-agenda`-suite kon in deze werkruimte niet worden
uitgevoerd omdat `SUPABASE_URL`, `SUPABASE_ANON_KEY` en
`SUPABASE_SERVICE_ROLE_KEY` niet beschikbaar zijn. Die bestaande suite bevat 11
RLS/RPC-scenario's, waaronder anonieme toegang, unauthorized actors en een
cross-tenant leerling. De suite moet in de Supabase-gevoede CI-omgeving blijven
meelopen. Er zijn geen openstaande product- of UX-beslissingen.

# Concept voor de operationele dagkaart

Status: UX- en productconcept, geen implementatie  
Peildatum: 30 juli 2026  
Primaire gebruiker: planner/backoffice  
Secundaire gebruiker: instructeur, met een beperktere eigen-dagvariant

## Productbesluit

De dagkaart wordt een **werkmodus van het bestaande planbord**, niet een los dashboard en niet een nieuw hoofdmenu-item.

Voorkeursroute:

`/backoffice/planning-board/kaart?date=YYYY-MM-DD&perspective=instructor`

De kaart gebruikt dezelfde datum, filters, selectie, previewvalidatie en autorisatie als `/backoffice/planning-board`. Een queryvariant zoals `?mode=map` is technisch ook mogelijk, maar een child route geeft een stabiele deeplink voor uitzonderingen, browsergeschiedenis en support. Dit is een routekeuze binnen hetzelfde planbord, geen tweede product.

Het managementdashboard krijgt hooguit een compacte tegel zoals “7 afspraken zonder routeerbare locatie” met een deeplink naar de gefilterde dagkaart. De volledige kaart hoort daar niet: de canon plaatst managementinformatie direct boven de operatie en wijst een los analyticsproduct af (`docs/SPRINT_9_DASHBOARDS_REPORTING.md:23-32`).

## Waarom het bestaande planbord de canonieke plek is

De huidige route `/backoffice/planning-board` staat al als Planbord in de backoffice-navigatie (`artifacts/nxtdrive/components/backoffice/sidebar.tsx:81-108`). De pagina ondersteunt datum, dag/week, perspectief, vestiging, instructeur, status, type, rayon, transmissie, capability, voertuig en conflictfilters (`artifacts/nxtdrive/app/backoffice/planning-board/page.tsx:62-249`). De werkruimte heeft daarnaast:

- perspectieven per instructeur, vestiging, voertuig, examen en proefles (`artifacts/nxtdrive/app/backoffice/planning-board/planning-board-workspace.tsx:298-417`);
- bestaande conflict- en dispatchadviezen, waaronder onvoldoende reistijd en buiten-werkgebied (`artifacts/nxtdrive/app/backoffice/planning-board/planning-board-workspace.tsx:419-458`);
- drag-preview en centrale validatie vóór mutatie (`artifacts/nxtdrive/app/backoffice/planning-board/planning-board-workspace.tsx:959-1018`);
- een responsive filterdrawer (`artifacts/nxtdrive/app/backoffice/planning-board/planning-board-workspace.tsx:1131-1180`);
- de feitelijke tijdlijnwerkruimte en interacties (`artifacts/nxtdrive/app/backoffice/planning-board/planning-board-workspace.tsx:1304-1451`).

Een aparte kaartpagina met een eigen loader zou filterdrift, afwijkende conflictuitkomsten en dubbele mutatieflows veroorzaken. De kaart moet een andere projectie van dezelfde `PlanningBoardData` worden.

Er is wel eerst een contractuitbreiding nodig: de huidige `PlanningBoardEvent` bevat geen locatie, adres of coördinaten (`artifacts/nxtdrive/lib/planning-board/types.ts:53-75`) en de loader selecteert die velden evenmin (`artifacts/nxtdrive/lib/planning-board/service.ts:188-228`).

## Wat de kaart wel en niet voorstelt

### Wel

- gepubliceerde en conceptuele **geplande stops**, afhankelijk van rol en filter;
- de door de planning bedoelde volgorde per instructeur;
- berekende ritbenen tussen opeenvolgende stops;
- routekwaliteit: vers, verouderd, fallback, onbekend of niet routeerbaar;
- benodigde reistijd, beschikbare tussenruimte en configureerbare buffer;
- operationele uitzonderingen zoals ontbrekend adres, overlap, rayonafwijking of voertuigconflict;
- geselecteerde afspraak en bijbehorende detail-/mutatieflow.

### Niet

- de actuele positie van een instructeur of voertuig;
- een marker op basis van “laatst online” of “laatst gesynchroniseerd”;
- een actieve turn-by-turnnavigatiesessie;
- een opgenomen lesroute;
- een impliciete voorspelling dat iemand daadwerkelijk een getoonde route rijdt;
- een managementheatmap van individuele medewerkers.

De titelbalk vermeldt daarom “Geplande dagkaart” en de legenda “Geen live locaties”. Dat voorkomt dat gebruikers een geplande stop aanzien voor GPS.

## Kerntaken van de planner

De dagkaart moet vijf vragen sneller beantwoorden:

1. Welke afspraken hebben geen bruikbare locatie?
2. Waar is de verplaatsing tussen twee afspraken onmogelijk of krap?
3. Welke instructeur heeft geografisch én operationeel een passende opening?
4. Welke voorgestelde wijziging lost een conflict op zonder nieuwe conflicten te maken?
5. Waar wijkt de planning af van vestiging, rayon, voertuigbasis of examenlogistiek?

De kaart is niet bedoeld om de planning visueel “mooi” te maken. Elke marker, lijn en kleur moet één van deze beslissingen ondersteunen.

## Voorgesteld view-contract

Het domeinmodel moet providerneutraal blijven. De UI krijgt een afgeleide kaartprojectie, bijvoorbeeld:

```ts
type DayMapStop = {
  eventId: string;
  eventType: "lesson" | "trial_lesson" | "exam" | "appointment";
  planningStatus: string;
  publishStatus: "draft" | "published" | "cancelled";
  startsAt: string;
  endsAt: string;
  instructorId: string | null;
  vehicleId: string | null;
  branchId: string | null;
  location: {
    locationId: string | null;
    label: string;
    formattedAddress: string | null;
    lat: number | null;
    lng: number | null;
    quality: "confirmed" | "manual" | "ambiguous" | "missing" | "stale";
  };
  sequence: number | null;
  permissions: {
    canViewAddress: boolean;
    canEdit: boolean;
  };
};

type DayMapLeg = {
  fromEventId: string;
  toEventId: string;
  instructorId: string;
  distanceMeters: number | null;
  durationMinutes: number | null;
  availableMinutes: number;
  requiredBufferMinutes: number;
  calculationStatus: "fresh" | "stale" | "fallback" | "unknown";
  calculatedAt: string | null;
  encodedGeometry: string | null;
};
```

Dit is een conceptueel contract, geen voorgeschreven migratie. Belangrijke eigenschappen:

- een stop kan zonder coördinaten bestaan en blijft dan in de uitzonderingenlijst zichtbaar;
- adreszichtbaarheid wordt vóór serialisatie afgedwongen;
- een ritbeen heeft expliciet een onbekende status;
- geometrie is optioneel en mag alleen worden getoond als die uit een geldige routedienst komt;
- `sequence` komt uit de planning, niet uit de volgorde waarin providerresultaten terugkomen;
- provider-ID's en ruwe providerpayloads zijn geen onderdeel van het algemene planbordcontract.

## Informatiearchitectuur

### Bovenbalk

De bestaande planbordbalk blijft leidend:

- datum en vorige/vandaag/volgende;
- dag/week, waarbij de kaart in MVP alleen dag ondersteunt;
- perspectief;
- compacte actieve filterchips;
- knop “Filters”;
- kaart/list/tijdlijn-werkmodus;
- datastatus “Routes berekend 10:42” met verversactie waar toegestaan.

Bij weekselectie blijft de tijdlijn actief of vraagt de kaart om één dag te kiezen. Zeven volledige routekaarten tegelijk zijn geen bruikbare MVP.

### Uitzonderingenrail

Boven de lijst staan aantallen die tevens filteren:

- ontbrekende of ambigue locatie;
- reistijd tekort;
- route onbekend of verouderd;
- buiten rayon;
- voertuig- of instructeurconflict.

Er is altijd een tekstuele lijst. Zo blijft het probleem vindbaar voor toetsenbordgebruikers, screenreaders en situaties waarin de kaart niet laadt.

### Detailpaneel

Selectie van een marker, lijn of lijstregel opent hetzelfde afspraakdetail. Het toont:

- afspraaktype, tijd en publicatiestatus;
- leerling/context voor rollen die dit mogen zien;
- geplande locatie en kwaliteitsstatus;
- vorige en volgende stop;
- beschikbare tijd, route-inschatting, buffer en berekentijd;
- bestaande conflictredenen;
- acties naar de huidige edit-, verplaats- en previewflow.

Er ontstaat geen tweede formulier in de kaart.

## Desktop

Doel: veel afspraken vergelijken zonder de tijdlijncontext kwijt te raken.

Aanbevolen layout vanaf circa 1200 px:

- **42% links:** compacte dagtijdlijn/lijst met groepen per instructeur;
- **58% rechts:** kaart;
- resizable scheiding binnen begrensde verhouding, bijvoorbeeld 30/70 tot 60/40;
- sticky bovenbalk over de volledige breedte;
- uitzonderingenrail boven de linker lijst;
- filterdrawer of popover, niet een permanent derde zijpaneel;
- detail in de linker kolom of als tijdelijke rechter drawer, afhankelijk van beschikbare breedte.

De planner kan een instructeur inklappen, één of meerdere instructeurs isoleren en daarna een routebeen selecteren. De kaart zoomt niet bij iedere enkele hover; alleen een expliciete selectie verplaatst de viewport.

Op grote schermen is “tijdlijn + kaart” de voorkeursmodus. Een kaart zonder tijdas maakt tijdvensters en pauzes moeilijk te beoordelen.

## Tablet

Doel: kaartinspectie en beperkte planning tijdens balie- of mobiel gebruik.

Aanbevolen layout tussen circa 768 en 1199 px:

- kaart als primair canvas;
- compacte toolbar met datum, perspectief en actieve filters;
- lijst/tijdlijn in een bottom sheet of slide-over;
- sheet heeft drie standen: samengevouwen, half en bijna volledig;
- selectie op de kaart opent de sheet op afspraakdetail;
- touch targets minimaal 44 px en geen interactie die alleen op hover werkt;
- drag-and-drop is niet de enige manier om een afspraak te wijzigen.

In landscape kan een vaste 35/65-split worden aangeboden wanneer genoeg hoogte resteert. In portrait blijft de sheetvariant rustiger.

## Mobiel

Doel: één uitzondering begrijpen of één afspraak openen, niet een verkleind desktopplanbord.

De UI-audit adviseert voor mobiel een daglijst in plaats van een gekrompen grid (`docs/tenant-dashboard-ui-ux-audit.md:118-129`). Daarom:

- twee expliciete tabs: **Lijst** en **Kaart**;
- standaard opent **Lijst**, omdat tijden, uitzonderingen en acties daar sneller en toegankelijker zijn;
- kaart is opt-in en toont standaard de geselecteerde instructeur of uitzondering, niet automatisch de hele tenant;
- bovenaan staat de belangrijkste operationele uitzondering;
- de afspraakdetailkaart opent als bottom sheet;
- geen dense drag-and-drop of meerkolommenplanbord;
- filterselectie zit in een volledige mobiele drawer;
- “Open navigatie” verschijnt alleen voor de eigen/geautoriseerde geplande locatie.

Een mobile deeplink naar `/backoffice/planning-board/kaart` opent wel de Kaart-tab, zodat een notificatie of dashboardtegel zijn context behoudt.

## Visuele semantiek

### Markers

- iedere instructeur krijgt een stabiele kleur binnen de dag;
- markers tonen ook een volgnummer en initialen/symbool, zodat kleur niet de enige betekenisdrager is;
- afspraaktype krijgt een klein pictogram of vorm;
- geselecteerde marker heeft een duidelijke outline en correspondeert met de geselecteerde lijstregel;
- ontbrekende coördinaten krijgen geen fictieve marker, maar een prominente lijstregel;
- geannuleerde afspraken zijn standaard verborgen of duidelijk doorgestreept, nooit als actieve stop weergegeven.

### Routebenen

- een solide lijn betekent dat een routegeometrie is berekend;
- een verouderd ritbeen krijgt een statusbadge en subtiel afwijkend patroon;
- een area-matrixfallback toont alleen de relatie en tijdinschatting, bijvoorbeeld als gestippelde connector, met label “rayonschatting”;
- een onbekend ritbeen krijgt geen rijroute of nulwaarde;
- rechte lijnen mogen alleen als abstracte relatie worden gebruikt en moeten visueel anders zijn dan een wegroute;
- een tekort krijgt ernst op basis van `beschikbaar - reistijd - buffer`, met tekstwaarde naast kleur.

### Clustering

- alleen bij overzichtszoom en hoge dichtheid;
- clusterlabel toont aantal afspraken en aantal uitzonderingen;
- bij normale dagzoom blijven stopnummers en routevolgorde zichtbaar;
- clusters combineren niet stil verschillende instructeurskleuren tot één betekenisloze marker.

### Verkeer

Een verkeerslaag is optioneel en standaard uit. Verkeersinformatie is context, geen bron van waarheid. Als reistijden verkeersafhankelijk zijn, toont de UI:

- “actueel” of “typisch”;
- berekentijd;
- geldigheidsstatus;
- handmatige verversactie binnen rate- en kostengrenzen.

## Filters

De kaart hergebruikt de bestaande planbordfilters. Minimaal:

- datum;
- instructeur;
- vestiging;
- voertuig;
- afspraaktype;
- status/publicatiestatus;
- rayon;
- transmissie/capability waar relevant;
- alleen conflicten;
- alleen ongeldige/ontbrekende locaties.

De kaart voegt geen eigen semantisch afwijkende filters toe. Een gekozen marker blijft geselecteerd bij een onschuldige kaartpan, maar wordt gesloten wanneer een filter de afspraak uitsluit.

URL-state bewaart datum, werkmodus, perspectief en deelbare filters. Gevoelige zoektekst of persoonsinformatie komt niet in de URL.

## Interacties

### Afspraak inspecteren

1. selecteer lijstregel of marker;
2. bijbehorende marker/lijstregel krijgt focus;
3. detailpaneel toont stop, aangrenzende ritbenen en conflicten;
4. “Open afspraak” gaat naar de bestaande detailflow;
5. terugkeren herstelt datum, filters, kaartviewport en selectie waar praktisch.

### Afspraak verplaatsen

1. start vanuit bestaand tijdlijn- of detailcommando;
2. kies kandidaat-instructeur/tijd en eventueel locatie;
3. preview berekent vorige→kandidaat en kandidaat→volgende;
4. kaart toont de voorgestelde stop en ritbenen als previewlaag;
5. planner ziet welke conflicten verdwijnen en ontstaan;
6. pas na expliciete bevestiging muteert de planning en volgt bestaande communicatie.

De kaart zelf hoeft in MVP geen willekeurige drop op een geografisch punt te ondersteunen. Een locatie zonder tijd en resource is nog geen geldige planning.

### Nieuwe afspraak

“Nieuwe afspraak” opent de bestaande createflow met datum, eventueel instructeur en geselecteerde locatie vooraf ingevuld. Klikken op een leeg kaartpunt mag hooguit een zoek-/locatievoorstel starten; het publiceert niets.

### Uitzondering herstellen

1. kies “Locatie ontbreekt”;
2. lijst toont afspraak, eigenaar, huidige vrije tekst en reden;
3. gebruiker kiest een gevonden locatie of handmatige correctie;
4. preview toont gewijzigde routebenen en eventuele nieuwe conflicten;
5. correctie krijgt bron, actor en tijd;
6. een gepubliceerde leerlinglocatie wordt niet stil gewijzigd zonder de geldende bevestigingsflow.

## Conflictlogica

Voor opeenvolgende afspraken A en B:

```text
beschikbare_minuten = start(B) - einde(A)
benodigde_minuten = route_duur(A, B) + vereiste_buffer
marge = beschikbare_minuten - benodigde_minuten
```

Interpretatie:

- `marge >= gezonde_drempel`: voldoende;
- `0 <= marge < gezonde_drempel`: krap;
- `marge < 0`: conflict;
- route onbekend: “niet te beoordelen”, nooit “voldoende”.

Voor het invoegen van kandidaat X worden zowel A→X als X→B beoordeeld. Een totaalscore alleen kan verbergen dat één been onmogelijk is.

De bestaande area-matrix blijft fallback (`artifacts/nxtdrive/lib/planning-core/validation.ts:404-500`). De UI toont duidelijk of de duur komt uit:

1. een verse concrete route;
2. een verouderde concrete route;
3. een handmatige rayonmatrix;
4. een standaardbuffer;
5. geen beschikbare bron.

Preview en commit moeten dezelfde centrale beslisfunctie gebruiken. De kaart geeft geen zelfstandig “groen licht”.

## Standaard- en fouttoestanden

| Toestand                     | Gedrag                                                                                                                         |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Geen afspraken               | Lege dagstaat met datumkeuze en link naar bestaande createflow.                                                                |
| Geen routeerbare locaties    | Kaart blijft secundair; uitzonderingenlijst is primair en biedt herstelactie.                                                  |
| Eén routeerbare stop         | Marker tonen, geen routebeen suggereren.                                                                                       |
| Provider niet beschikbaar    | Bestaande planning blijft zichtbaar; tekstlocaties en area-matrixfallback blijven; geen eindeloze spinner.                     |
| Gedeeltelijke route-uitkomst | Geldige ritbenen tonen, mislukte benen expliciet als onbekend.                                                                 |
| Verouderde berekening        | Tijd en status tonen; conflict niet presenteren als vers bewijs.                                                               |
| Autorisatie ontbreekt        | Adres en marker vóór serialisatie weglaten; geen client-side blur als beveiliging.                                             |
| Offline                      | Laatst gesynchroniseerde eigen tekstlocaties en tijden kunnen zichtbaar blijven; geen belofte van kaarttiles of actuele route. |
| Te veel punten               | Filteradvies en clustering; geen stille truncatie.                                                                             |

## Rollen, privacy en gegevensminimalisatie

### Planner/backoffice

Mag binnen tenant- en vestigingsscope geplande locaties zien voor operationele planning. Exacte leerlingadressen verschijnen alleen wanneer de rol ze voor die taak nodig heeft. Export en analytics gebruiken waar mogelijk grove gebieden.

### Instructeur

Ziet alleen eigen/geautoriseerde stops en de context die nodig is voor de volgende afspraak. De eigen-dagkaart toont geen adressen van andere instructeurs. Offline cache volgt dezelfde scope en vervalt volgens sessie- en gegevensbeleid.

### Leerling

Krijgt geen volledige dagkaart. De leerling ziet alleen het eigen gepubliceerde punt en eventueel een route naar branch/CBR. Geen andere stops, instructeursroute of intern startpunt.

### Management

Krijgt geaggregeerde dekking en operationele uitzonderingen. Exacte individuele routegeschiedenis is geen standaard managementfunctie.

### Live GPS

Als een later programma live GPS toevoegt, komt dat niet automatisch als laag op deze kaart. Daarvoor zijn afzonderlijk nodig:

- expliciet productdoel en grondslag;
- herkenbare status voor de instructeur;
- start/stop per toegestane werkcontext;
- uitschakeling buiten werktijd;
- korte bewaartermijn en toegangslog;
- beoordeling van proportionaliteit, DPIA-indicatie, arbeidsrecht en medezeggenschap;
- een aparte legenda die gepland, laatst bekend en live ondubbelzinnig onderscheidt.

Tot dat besluit blijft de dagkaart volledig bruikbaar zonder live positie.

## Gefaseerde oplevering

### Stap A — read-only datakwaliteit

- child route en gedeelde filterstate;
- markers voor betrouwbare locaties;
- uitzonderingenrail voor ontbrekend, ambigu en verouderd;
- lijst/markerselectie;
- feature flag per tenant;
- geen routegeometrie en geen mutaties vanaf de kaart.

### Stap B — geplande routebenen

- centrale routeberekening;
- routekwaliteit, duur, afstand, buffer en berekentijd;
- vorige/volgende-conflict;
- fallback naar de bestaande rayonmatrix;
- kostenmetering en begrensde verversing.

### Stap C — preview en beslisondersteuning

- voorgestelde verplaatsing als tijdelijke kaartlaag;
- uitlegbare kandidaat-instructeurs;
- conflictimpact vóór bevestiging;
- één-instructeurvolgorde alleen voor flexibele, ongepubliceerde stops.

### Stap D — managementlaag

- geaggregeerde werkgebied- en vraagdekking;
- geplande lege-afstand- en reistijdsamenvattingen;
- privacydrempels en minimumgroepsgrootte;
- geen individuele GPS-trajecten.

## Acceptatiecriteria voor de eerste pilot

- de kaart en tijdlijn tonen aantoonbaar dezelfde afspraken, selectie en filters;
- geen marker wordt als live locatie gelabeld of geïnterpreteerd;
- 100% van de niet-routeerbare afspraken blijft vindbaar in een tekstuele herstelbak;
- een markerselectie opent dezelfde afspraakcontext als de lijst;
- een onbekend ritbeen wordt nooit als nul minuten of groene verbinding weergegeven;
- iedere berekende reistijd toont bronstatus en berekentijd;
- de preview gebruikt dezelfde conflictlogica als commit;
- een providerstoring verhindert het bekijken of handmatig plannen van bestaande afspraken niet;
- desktop, tablet en mobiel hebben ieder de hierboven beschreven eigen compositie;
- toetsenbord, screenreader en niet-kleurafhankelijke statussen zijn onderdeel van de pilotacceptatie;
- leerling- en instructeurrollen ontvangen geen adressen buiten hun taak- en afspraakscope;
- routeverbruik en fouten zijn per tenant en feature meetbaar.

## Bewust afgewezen varianten

- **Losse hoofdroute `/backoffice/planning/kaart`:** creëert een tweede planningproduct en afwijkende filterstate.
- **Volledige kaart op het managementdashboard:** te zwaar voor signalering en te ver van de mutatieflow.
- **Mobile desktop-grid met kaart ernaast:** te klein en strijdig met de bestaande mobile-day-list-richting.
- **Rechte verbindingslijnen als “route”:** suggereert rijbaarheid en duur die niet zijn berekend.
- **Live GPS als MVP-afhankelijkheid:** niet nodig voor gepland-routewerk en introduceert een ander risicoprofiel.
- **Automatisch herschikken bij annulering:** publicatie, leerlingafspraken en continuïteit vereisen menselijke bevestiging.
- **Eigen kaartformulier voor afspraken:** dupliceert validatie en autorisatie van de bestaande create/editflow.
- **Interne turn-by-turnnavigatie:** externe navigatie levert de benodigde cockpitactie zonder een verkeersveiligheidskritische navigatie-UX in NXTDRIVE.

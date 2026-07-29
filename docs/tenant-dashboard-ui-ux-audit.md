# UI/UX-audit tenant-backoffice

Datum: 29 juli 2026
Omgeving: staging, `NXTDRIVE Demo Academy`, tenantbeheerder
Methode: Playwright, desktop `1440 × 1000` en mobiel `390 × 844`

## Scope en conclusie

De audit omvatte alle 35 zichtbare links in de tenantnavigatie en representatieve
vervolgpagina's. In totaal zijn 50 unieke UI-routes op desktop en mobiel
doorgelopen. De CSV-export is terecht als download behandeld. Drie
franchiseroutes waren voor dit abonnement niet toegankelijk en vallen buiten de
tenant-audit.

De visuele basis is professioneel: rustig kleurgebruik, consistente componenten,
goede formulieren en herkenbare statuskleuren. Het hoofdprobleem is niet de
stijl, maar de informatiedichtheid. Bijna ieder gegeven, stukje uitleg en
statussignaal krijgt een eigen kaart. Daardoor ontstaan kaart-in-kaartpatronen,
lange pagina's en te weinig verschil tussen primaire taken, naslaginformatie en
uitzonderingen.

De belangrijkste cijfers:

- De sidebar toont 35 links; in de mobiele drawer zijn dat 36 links inclusief
  de abonnementroute.
- De mobiele topbar is 541 px breed binnen 390 px. Meldingen, thema en
  gebruikersmenu vallen buiten beeld.
- `Instellingen` telt circa 2.301 zichtbare woorden, 99 paneelachtige
  oppervlakken en 14 desktop-schermhoogtes; mobiel circa 32 schermhoogtes.
- `Permissies` telt circa 1.946 woorden, 86 oppervlakken en 10,8
  desktop-schermhoogtes; mobiel circa 22,9 schermhoogtes.
- `Rapportages` telt circa 995 woorden, 33 oppervlakken en 5,6
  desktop-schermhoogtes; mobiel circa 12,2 schermhoogtes.
- Van 5.876 gemeten tekstnodes gebruiken er 5.067 al 12 of 14 px. De oplossing
  is daarom niet een kleiner basisfont.

## Prioriteiten

### P0 — generieke mobiele fouten

1. Maak de topbar passend.
   Toon mobiel alleen menu, korte tenantnaam, zoeken en één overflowknop.
   Verplaats meldingen, thema, paginauitleg en account naar die overflow of het
   mobiele menu. Alle bediening moet binnen 390 px zichtbaar en bereikbaar zijn.

2. Maak voor datatabellen en werkborden een echte mobiele variant.
   Leerlingen, instructeurs, facturen en pakketten moeten compacte lijstrijen of
   kaarten krijgen. Planboard en Taken hebben mobiel een daglijst respectievelijk
   status-tabs nodig; een verkleind desktopgrid is hier niet bruikbaar.

3. Corrigeer Nederlandse lokalisatie.
   Formulieren tonen nu onder meer `07/29/2026` en `11:00 PM`. Gebruik
   `nl-NL`, `dd-mm-jjjj` en een 24-uursklok.

4. Herstel het sidebarlogo.
   Het NXTDRIVE-woordmerk wordt donker op een donker vlak getoond. Gebruik de
   inverse variant of de sidebar-foregroundtokens.

### P1 — informatiearchitectuur

Verminder de primaire navigatie naar ongeveer 12–16 bestemmingen:

- Vandaag: Dashboard, Agenda, Taken
- Planning: Planboard, Queue, Beschikbaarheid
- Relaties: Leerlingen, Leads, Instructeurs
- Opleiding: RIS, CBR, Theorie
- Financieel: Facturen, Pakketten, Rapportages
- Beheer: Organisatie, Middelen, Instellingen

Aanpassingen:

- Zet `Herbezetten` als actie in Agenda, niet als permanente bestemming.
- Zet `Referrals` onder Leads of Marketing.
- Combineer Voertuigen en Rayons onder Middelen.
- Maak Organisatie de ingang voor Medewerkers, Rollen, Permissies, Teams,
  Vestigingen en Eigenschappen; toon die niet allemaal als primaire links.
- Verplaats Support, Checklists, Releases, Roadmap en Mogelijkheden naar
  Help/Productinformatie of het accountmenu.
- Toon Abonnement op één plaats; nu staat het zowel in de navigatie als vast in
  de footer.
- Maak secties in de mobiele drawer inklapbaar. Het huidige navigatiegebied is
  1.622 px hoog binnen 590 px beschikbare hoogte.

### P1 — container- en contentstrategie

- Gebruik één hoofdoppervlak per taak. Binnen dat oppervlak werken witruimte,
  tussenkoppen en subtiele scheidingslijnen beter dan nieuwe kaarten.
- Gebruik een compacte KPI-strip zonder afzonderlijke zware schaduw per metric.
  Op mobiel mogen korte metrics in twee kolommen staan.
- Laat lege modules weg of vervang meerdere lege kaarten door één relevante
  empty state met één actie.
- Open create/edit-formulieren in een drawer of aparte pagina; laat een formulier
  niet permanent naast een lijst staan.
- Gebruik tabs wanneer inhoud verschillende werkmodi vertegenwoordigt, niet om
  willekeurige stukken van één taak te verbergen.
- Verlaag verticale padding en kaarthoogte vóórdat tekst kleiner wordt gemaakt.
  Houd bodytekst op 14 px en metadata minimaal op 12 px.

## Tooltips en uitleg

De topbar bevat al een paginainfo-popover, maar die herhaalt meestal de zichtbare
introductietekst. Geef beide een eigen rol:

- Onder de paginatitel: één korte taakzin, maximaal ongeveer 90 tekens.
- Paginainfo: wanneer gebruik je dit scherm, wat verandert een actie en welke
  rechten zijn nodig.
- Contextuele info-popovers: alleen voor termen als vestigingsscope,
  tenantoverride, matching, readiness, SLA, herplanning en RIS Legacy.
- Lange beveiligings-, audit- en abonnementsuitleg: in een `Meer uitleg`-drawer
  of gekoppelde helptekst, niet permanent tussen de bediening.

Een tooltip mag nooit de enige plek zijn voor informatie die nodig is om een
formulier veilig in te vullen. Gebruik op mobiel klikbare popovers in plaats van
hover-only gedrag.

## Analyse per pagina

### Dashboard en planning

| Pagina                   | Diagnose                                                                                                                                                                          | Advies                                                                                                                                                                                                           |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dashboard                | 35 oppervlakken, 2,6 desktop- en 8,8 mobiele schermhoogtes. Zes KPI's, Planning vandaag, weekgrafiek, alerts, snelle acties, voortgang, activiteit en taken concurreren tegelijk. | Maak drie zones: Vandaag, Actie nodig en Trend. Verwijder Snelle acties omdat `Nieuw` dit al afdekt. Voeg Activiteit en Taken samen. Verberg de lege weekgrafiek en lege planningmodule wanneer er geen data is. |
| Agenda                   | Rustig en taakgericht; past desktop in één viewport.                                                                                                                              | Behouden. Maak `Herbezetten` een toolbaractie en maak weekdagen mobiel een doorlopende agenda-/lijstweergave.                                                                                                    |
| Planboard                | Desktop logisch, maar filters, queue en assistent zijn extra panelen. Mobiel blijft een afgeknipt tijdgrid.                                                                       | Houd het tijdgrid voor desktop/tablet. Gebruik mobiel een daglijst per instructeur. Zet filters in een drawer en queue/assistent in inklapbare zijpanelen.                                                       |
| Planning queue           | De filterbalk en het permanente create-formulier domineren een vaak lege lijst.                                                                                                   | Gebruik filterchips plus `Meer filters`. Open `Nieuw queue-item` in een drawer. Geef de lijst de volle breedte.                                                                                                  |
| Herbezetten              | Een vrijwel lege zelfstandige pagina met één container.                                                                                                                           | Integreer als gefilterde toestand of actie in Agenda. Alleen een aparte route houden voor deeplinks.                                                                                                             |
| Nieuwe afspraak          | Formulierstructuur is helder. Intro en veldhulp zijn aan de lange kant.                                                                                                           | Behouden; verkort intro, groepeer datum/tijd/duur en plaats uitzonderingsuitleg bij info-iconen. Corrigeer datum- en tijdnotatie.                                                                                |
| Nieuwe les               | Het formulier is helder, maar de permanente kolom `Slimme suggesties` wordt ook getoond als er niets nuttigs is.                                                                  | Toon suggesties alleen als compacte callout wanneer ze bestaan; anders gebruikt het formulier de volle breedte.                                                                                                  |
| Planning per instructeur | Desktop is bruikbaar; mobiel erft hetzelfde ongeschikte tijdgrid.                                                                                                                 | Gebruik dezelfde mobiele daglijst als Planboard. Houd acties en waarschuwingen bovenaan, details in een drawer.                                                                                                  |

### Relaties

| Pagina            | Diagnose                                                                                                                                                                   | Advies                                                                                                                                                              |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Instructeurs      | Goede desktop-tabel, maar vier samenvattingskaarten en een horizontale mobiele tabel voegen ruis toe.                                                                      | Maak één compacte samenvattingsregel. Gebruik mobiel naam, beschikbaarheid, leerlingen en volgende afspraak in lijstrijen met een overflowmenu.                     |
| Instructeurdetail | Circa 34 oppervlakken en 3,7 desktop-/7,2 mobiele schermhoogtes. KPI's, cockpit, gegevens, agenda, leerlingen, eigenschappen, voertuigen en readiness staan achter elkaar. | Gebruik tabs `Overzicht`, `Planning`, `Beschikbaarheid` en `Middelen`. Houd maximaal drie primaire acties in de header en toon alleen afwijkende readinesssignalen. |
| Leerlingen        | 540 woorden en 36 dossiers in één lange tabel. Mobiel wordt de tabel afgesneden.                                                                                           | Voeg zoeken, paginering en opgeslagen filters toe. Gebruik mobiel een dossierlijst met naam, saldo, volgende les en aandachtstatus.                                 |
| Leerlingdetail    | 39 oppervlakken, 4,3 desktop- en 10,9 mobiele schermhoogtes. `Centrale cockpit`, `Leerling 360` en `Next best action` overlappen inhoudelijk.                              | Maak tabs `Overzicht`, `Planning & voortgang`, `Financieel`, `Communicatie` en `Documenten`. Houd één aandachtblok bovenaan en verwijder dubbele samenvattingen.    |
| Leads             | Zes KPI's, funneltabs, filters en een lange leadlijst vormen samen 2,6/4,3 schermhoogtes.                                                                                  | Maak een compacte funnelteller, laat filters pas uitklappen en gebruik mobiel leadkaarten. Toon één dominante vervolgactie per lead.                                |
| Leaddetail        | Goede tweekolomsverdeling en beperkte lengte.                                                                                                                              | Behouden. Zet mobiel contact en primaire acties vóór proeflessuggesties; maak Slimme opvolging sticky op desktop.                                                   |
| Referrals         | Heldere cockpit, maar veel losse kleine kaarten.                                                                                                                           | Vervang de vier KPI-kaarten door één strip en combineer Programmasignalen en Top doorverwijzers in één verdeeld paneel.                                             |

### Middelen en aanbod

| Pagina                | Diagnose                                                                                                    | Advies                                                                                                                         |
| --------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Voertuigen            | Lijst/empty state en permanent invoerformulier staan naast elkaar.                                          | Geef de lijst volle breedte en open `Nieuw voertuig` in een drawer. Combineer locaties als tab of secundaire lijst.            |
| Beschikbaarheid       | Begrijpelijke taakopbouw, maar 15 oppervlakken voor vooral nulwaarden en weekdagen.                         | Maak nulmetrics compact, toon het weekschema als één lijst/tabel en uitzonderingen als afzonderlijke tijdlijn.                 |
| Rayons                | Veel permanente beheerformulieren naast lege data.                                                          | Maak Rayons de primaire lijst, `Nieuw` een drawer en `Planningbeleid` een ingeklapte sectie onder Geavanceerd.                 |
| Pakketten             | Tabel, create-formulier, productlijst en koppelingen staan onder elkaar; mobiel loopt de tabel horizontaal. | Gebruik tabs `Pakketten`, `Producten`, `Koppelingen`. Open create/edit in een drawer en gebruik mobiel compacte productregels. |
| Planningeigenschappen | Compact en begrijpelijk, maar het create-formulier krijgt permanent veel ruimte.                            | Behouden; verplaats `Nieuwe eigenschap` naar een drawer en maak de drie gebruiksstatistieken één regel.                        |

### Leskaart en taken

| Pagina  | Diagnose                                                                                                        | Advies                                                                                                                                |
| ------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| RIS     | 29 oppervlakken en meerdere lege deelcockpits. Er zijn vier info-popovers, maar uitleg blijft ook inline staan. | Begin met een uitzonderingenlijst. Verplaats modulevoortgang, toetsen en ongepubliceerde kaarten naar tabs. Verberg lege deelkaarten. |
| CBR     | 538 woorden en 3,5 schermhoogtes; samenvatting, directe opvolging en volledige tabel staan allemaal open.       | Maak `Directe opvolging` de eerste lijst, KPI's een strip en de volledige leerlingtabel een aparte tab.                               |
| Theorie | De desktoplijst is duidelijk. Op mobiel veroorzaken rijacties veel horizontale overflow.                        | Houd de lijst, zet Deactiveren en gekoppelde vaardigheden in een rij-overflowmenu en open `Nieuwe module` in een drawer.              |
| Taken   | Desktop-kanban is begrijpelijk. Mobiel zijn kolommen naast elkaar afgeknipt.                                    | Gebruik mobiel status-tabs `Te doen`, `Bezig`, `Klaar` met één verticale lijst. Houd drag-and-drop voor grotere schermen.             |

### Financieel

| Pagina         | Diagnose                                                                                                                                                               | Advies                                                                                                                                                           |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rapportages    | 995 woorden, 33 oppervlakken, 5,6 desktop-/12,2 mobiele schermhoogtes. Managementfocus, aandachtspunten, snelle routes, KPI's en grafieken herhalen dezelfde signalen. | Maak tabs `Overzicht`, `Planning`, `Commercieel`, `Kwaliteit` en `Financieel`. Houd bovenaan één periodefilter en maximaal vier KPI's. Toon lege grafieken niet. |
| Facturen       | Goede desktoptabel; mobiel blijft het een horizontale tabel.                                                                                                           | Gebruik mobiel factuurrijen met nummer, leerling, status, vervaldatum en bedrag. Plaats zeldzame filters onder `Meer filters`.                                   |
| Factuurdetail  | Heldere hoofd-/zijkolom en beperkte lengte.                                                                                                                            | Behouden. Maak regels mobiel gestapeld en zet creditfactuur onder een secundair actiemenu.                                                                       |
| Nieuwe factuur | Logische invoervolgorde.                                                                                                                                               | Behouden; maak optionele eerste regel inklapbaar totdat de gebruiker die toevoegt.                                                                               |
| Termijnfactuur | Goed afgebakend formulier.                                                                                                                                             | Behouden; vat termijnbedrag en eerstvolgende vervaldatum live samen. Corrigeer datumlokalisatie.                                                                 |
| Boekhouding    | 23 oppervlakken en 3,6/7,9 schermhoogtes. Export, koppeling, mappings, controles en rapportage staan op één pagina.                                                    | Splits in `Export`, `Koppeling` en `Mapping`. Laat Export de standaardtaak zijn en zet geavanceerde inrichting achter een setup-tab.                             |

### Abonnement en productinformatie

| Pagina        | Diagnose                                                                                                     | Advies                                                                                                                                       |
| ------------- | ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Abonnement    | 36 oppervlakken; huidige limieten, downgrade-impact, planvergelijking en featurelijsten staan tegelijk open. | Toon eerst huidig gebruik en echte blokkades. Gebruik één vergelijkingstabel voor plannen. Toon downgrade-impact pas na een downgrade-actie. |
| Mogelijkheden | Herhaalt grotendeels abonnement en featuretoegang in 30 kaarten.                                             | Voeg dit samen met Abonnement als tab `Functies`; verwijder de primaire navigatielink.                                                       |
| Releases      | De lijst zelf is compact, maar hoort niet in de dagelijkse beheerstructuur.                                  | Verplaats naar Help/Productupdates. Toon een badge in het accountmenu bij ongelezen updates.                                                 |
| Roadmap       | Productmeta-informatie concurreert met operationele navigatie.                                               | Verplaats naar Help/Productupdates. Maak kaarten een compacte kolomlijst met fase en stemactie.                                              |

### Organisatie, beheer en instellingen

| Pagina                | Diagnose                                                                                                                                                                        | Advies                                                                                                                                                                                                                |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Organisatie           | Geschikte hub, maar kaarten herhalen de losse sidebarlinks.                                                                                                                     | Maak dit de enige primaire ingang. Gebruik een compacte statuslijst en sectienavigatie naar Profiel, Mensen, Structuur en Toegang.                                                                                    |
| Rollen                | 25 oppervlakken en veel governance-uitleg.                                                                                                                                      | Toon rollen in een lijst/tabel met scope, gebruikers en overrides. Open uitleg en details in een zijpaneel.                                                                                                           |
| Permissies            | Grootste beheerprobleem na Instellingen: 86 oppervlakken, 10,8/22,9 schermhoogtes. Matrix, templates, delegatie, simulator en audit staan onder elkaar.                         | Splits in tabs `Effectieve rechten`, `Overrides`, `Simulator` en `Audit`. Gebruik een sticky rolselector en inklapbare permissiecategorieën. Verplaats roltemplates naar de aanmaakflow.                              |
| Teams                 | Redelijk compact; create-formulier en vier nulmetrics nemen relatief veel ruimte.                                                                                               | Maak metrics één strip en open `Nieuw team` in een drawer.                                                                                                                                                            |
| Medewerkers           | 567 woorden en 15 oppervlakken vóór/naast de medewerkerlijst. Governance-uitleg krijgt meer nadruk dan de dagelijkse taak.                                                      | Zet zoeken en medewerkerlijst direct bovenaan. Verplaats uitnodigen naar een modal en governance naar een helpdrawer.                                                                                                 |
| Medewerkerrol         | Rol, scope, teams, rolwissel en uitleg staan als losse kaarten.                                                                                                                 | Voeg samen met Toegang, Teams en Vestigingen in één medewerkerdetail met tabs.                                                                                                                                        |
| Medewerkertoegang     | Goede inhoud, maar 25 oppervlakken en veel herhaalde governancecontext.                                                                                                         | Eén tab `Toegang` met samenvatting, effectieve rechten en overrides. Toon context één keer.                                                                                                                           |
| Medewerkerteams       | Veel permanente uitleg voor een eenvoudige koppeltaak.                                                                                                                          | Eén tab `Teams` met huidige teams, zoekveld en toevoegen/verwijderen.                                                                                                                                                 |
| Medewerkervestigingen | Zelfde patroon als Teams.                                                                                                                                                       | Eén tab `Vestigingen`; toon de branch-scope-uitleg via info-popover.                                                                                                                                                  |
| Vestigingen           | Redelijke pagina, maar create-formulier is permanent zichtbaar.                                                                                                                 | Volle-breedtelijst met status en capaciteit; `Nieuwe vestiging` in drawer.                                                                                                                                            |
| Support               | Duidelijke taakverdeling; formulier neemt permanent ruimte in.                                                                                                                  | Behouden, maar open `Nieuw ticket` in een drawer en toon afspraken alleen in een helpblok.                                                                                                                            |
| Checklists            | 18 oppervlakken, mobiel 6,6 schermhoogtes en 10 overflowelementen.                                                                                                              | Toon alleen onvoltooide checks, groepeer categorieën als accordion en verplaats naar Organisatie-onboarding in plaats van primaire navigatie.                                                                         |
| Instellingen          | 2.301 woorden, 99 oppervlakken, 14/32 schermhoogtes. Dashboard, scripts, onboarding, branding, previews, elf beleidsmanagers, PWA, domeinen en notificaties staan op één route. | Maak dit een zoekbare instellingenindex met categorieën. Render hier geen volledige formulieren. Maak aparte routes voor Algemeen, Planning, Leads & taken, Finance, Communicatie, Merk & domeinen en Automatisering. |
| Notificaties          | 602 woorden; de lange triggercatalogus wordt volledig onder de samenvatting gerenderd.                                                                                          | Gebruik zoeken, gebeurteniscategorieën en compacte rijen met kanaalstatus. Open één trigger in een detaildrawer.                                                                                                      |
| Notificatielevering   | Compact en taakgericht.                                                                                                                                                         | Behouden; zet mobiele filters achter `Filters` en laat mislukte leveringen standaard bovenaan staan.                                                                                                                  |
| Workflows             | 883 woorden, 38 oppervlakken en 4,5/16,2 schermhoogtes. De catalogus en configuratie van alle templates staan tegelijk open.                                                    | Maak links een filterbare templatelijst en rechts een detail-/editdrawer. Toon per rij alleen status, eigenaar, SLA en automatiseringsniveau.                                                                         |

## Aanbevolen ontwerpregels

1. Maximaal één zware rand/schaduw per inhoudsgroep.
2. Maximaal vier KPI's vóór de primaire werkruimte; overige cijfers in
   rapportage of een detailsdrawer.
3. Eén primaire actie per paginaheader, maximaal twee secundaire acties.
4. Formulieren voor aanmaken zijn standaard gesloten.
5. Mobiel: twee kolommen voor korte metrics, één kolom voor inhoud, geen
   desktopdatagrid zonder alternatieve lijstweergave.
6. Empty states nemen niet meer dan circa 240 px hoogte in en tonen één
   vervolgstap.
7. Gebruik 14 px bodytekst, 12 px metadata en minimaal 16 px voor
   invoervelden op mobiel om zoomgedrag en leesbaarheid te bewaken.
8. Lange uitleg is progressief: korte taakzin, contextuele info, vervolgens
   volledige help.

## Voorgestelde uitvoeringsvolgorde

1. Mobiele topbar, sidebarlogo, drawer en datum-/tijdlokalisatie.
2. Responsieve lijstvarianten voor Leerlingen, Instructeurs, Facturen,
   Pakketten, Planboard en Taken.
3. Navigatie terugbrengen en Organisatie/Help als hubs gebruiken.
4. Instellingen opsplitsen.
5. Permissies, Rapportages en de leerling-/instructeurdetails opdelen in
   werkmodi.
6. Daarna pas globale padding, schaduwen en microtypografie finetunen.

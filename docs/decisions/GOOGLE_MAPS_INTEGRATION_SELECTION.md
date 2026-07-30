# Product-ownerselectie — Google Maps, locaties en routing

Status: ter goedkeuring; geen brede implementatie vóór selectie  
Peildatum: 30 juli 2026

## Gebruiksaanwijzing

Vink per MAP-ID precies één keuze aan. “Foundation voorbereiden” activeert de eindgebruikersfunctie niet. Kostenklassen: `€` laag/waarschijnlijk binnen lage gebruikslagen, `€€` variabel en te meten, `€€€` premium/streng te begrenzen. De kolom “Advies” is het architectuurvoorstel; de checkbox is het productbesluit.

Keuzes in iedere rij:

```text
[ ] Nu implementeren
[ ] Foundation voorbereiden
[ ] Pilot
[ ] Later
[ ] Niet doen
[ ] Eerst privacy/juridisch beoordelen
```

## Foundation

| ID     | Functie                   | Selectie                                                                                                                            | Advies     | Voordeel                                         | Nadeel                                             | Complexiteit | Kosten | Belangrijkste afhankelijkheid  |
| ------ | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------ | -------------------------------------------------- | ------------ | ------ | ------------------------------ |
| MAP-01 | Centrale locatie-entiteit | [ ] Nu implementeren · [ ] Foundation voorbereiden · [ ] Pilot · [ ] Later · [ ] Niet doen · [ ] Eerst privacy/juridisch beoordelen | Foundation | Eén betrouwbare locatiebron voor alle domeinen.  | Migratie en semantiek zijn complex.                | Hoog         | €      | Inventaris + migratiepreview   |
| MAP-02 | Adres-autocomplete        | [ ] Nu implementeren · [ ] Foundation voorbereiden · [ ] Pilot · [ ] Later · [ ] Niet doen · [ ] Eerst privacy/juridisch beoordelen | Nu         | Snellere invoer met minder typfouten.            | Providerafhankelijk en sessie-/kostenbeheer nodig. | Middel       | €      | MAP-01/05, veilige browserflow |
| MAP-03 | Adresvalidatie            | [ ] Nu implementeren · [ ] Foundation voorbereiden · [ ] Pilot · [ ] Later · [ ] Niet doen · [ ] Eerst privacy/juridisch beoordelen | Pilot      | Verlaagt kritieke operationele adresfouten.      | Betaald en geen absolute waarheid.                 | Middel       | €–€€   | Validatiepolicy + MAP-06       |
| MAP-04 | Geocoding                 | [ ] Nu implementeren · [ ] Foundation voorbereiden · [ ] Pilot · [ ] Later · [ ] Niet doen · [ ] Eerst privacy/juridisch beoordelen | Foundation | Maakt gecontroleerde legacy-backfill mogelijk.   | Ambigue resultaten vereisen review.                | Hoog         | €      | Batchpreview + rollback        |
| MAP-05 | Place ID-opslag/refresh   | [ ] Nu implementeren · [ ] Foundation voorbereiden · [ ] Pilot · [ ] Later · [ ] Niet doen · [ ] Eerst privacy/juridisch beoordelen | Foundation | Stabiele providerreferentie met beperkte opslag. | IDs kunnen verouderen.                             | Middel       | €      | Data-handlingbeleid            |
| MAP-06 | Handmatige adrescorrectie | [ ] Nu implementeren · [ ] Foundation voorbereiden · [ ] Pilot · [ ] Later · [ ] Niet doen · [ ] Eerst privacy/juridisch beoordelen | Nu         | Werkt bij nieuwbouw, poorten en providerfouten.  | Menselijke correcties kunnen fout zijn.            | Laag         | €      | Audit + correctiestatus        |
| MAP-07 | Importnormalisatie        | [ ] Nu implementeren · [ ] Foundation voorbereiden · [ ] Pilot · [ ] Later · [ ] Niet doen · [ ] Eerst privacy/juridisch beoordelen | Pilot      | Schone CSV-import zonder handwerk per rij.       | Bulkfouten en kosten moeten begrensd.              | Hoog         | €–€€   | Preview/dedupe/jobcontrole     |
| MAP-08 | Duplicaatdetectie         | [ ] Nu implementeren · [ ] Foundation voorbereiden · [ ] Pilot · [ ] Later · [ ] Niet doen · [ ] Eerst privacy/juridisch beoordelen | Later      | Vermindert dubbele locatiebronnen.               | Verkeerde merge heeft grote impact.                | Hoog         | €      | MAP-01 + merge-undo            |
| MAP-09 | Providergrens/metering    | [ ] Nu implementeren · [ ] Foundation voorbereiden · [ ] Pilot · [ ] Later · [ ] Niet doen · [ ] Eerst privacy/juridisch beoordelen | Foundation | Beperkt lock-in, misbruik en tenantkosten.       | Extra platformwerk vóór zichtbare UI.              | Hoog         | €      | Cloudprojecten + entitlements  |

## Leerling

| ID     | Functie                         | Selectie                                                                                                                            | Advies     | Voordeel                                                 | Nadeel                                              | Complexiteit | Kosten | Belangrijkste afhankelijkheid |
| ------ | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ---------- | -------------------------------------------------------- | --------------------------------------------------- | ------------ | ------ | ----------------------------- |
| MAP-10 | Standaard ophaalpunt            | [ ] Nu implementeren · [ ] Foundation voorbereiden · [ ] Pilot · [ ] Later · [ ] Niet doen · [ ] Eerst privacy/juridisch beoordelen | Nu         | Direct minder misverstanden en invoer.                   | Profiel- en lessnapshot moeten uit elkaar blijven.  | Middel       | €      | MAP-01/02/16                  |
| MAP-11 | Standaard afzetpunt             | [ ] Nu implementeren · [ ] Foundation voorbereiden · [ ] Pilot · [ ] Later · [ ] Niet doen · [ ] Eerst privacy/juridisch beoordelen | Foundation | Ondersteunt school/werk/thuis-flows.                     | Minder frequent en extra UI/data.                   | Laag–middel  | €      | Student-locationrollen        |
| MAP-12 | Meerdere leerlinglocaties       | [ ] Nu implementeren · [ ] Foundation voorbereiden · [ ] Pilot · [ ] Later · [ ] Niet doen · [ ] Eerst privacy/juridisch beoordelen | Later      | Favorieten voorkomen steeds opnieuw invoeren.            | Meer persoonsgegevens en beheerlast.                | Middel       | €      | MAP-10/11                     |
| MAP-13 | Afwijkende locatie per les      | [ ] Nu implementeren · [ ] Foundation voorbereiden · [ ] Pilot · [ ] Later · [ ] Niet doen · [ ] Eerst privacy/juridisch beoordelen | Nu         | Sluit aan op echte lespraktijk.                          | Vereist publicatie-, snapshot- en wijzigingslogica. | Hoog         | €      | MAP-01/10/16                  |
| MAP-14 | Pickupbevestiging leerling      | [ ] Nu implementeren · [ ] Foundation voorbereiden · [ ] Pilot · [ ] Later · [ ] Niet doen · [ ] Eerst privacy/juridisch beoordelen | Pilot      | Vangt miscommunicatie vóór de les.                       | Late voorstellen kunnen planning verstoren.         | Middel       | €      | Wijzigingsworkflow + MAP-32   |
| MAP-15 | Kaartpreview leerling           | [ ] Nu implementeren · [ ] Foundation voorbereiden · [ ] Pilot · [ ] Later · [ ] Niet doen · [ ] Eerst privacy/juridisch beoordelen | Nu         | Bevestigt visueel het juiste punt.                       | Map loads en zichtbaarheid moeten begrensd.         | Laag–middel  | €      | MAP-13/16                     |
| MAP-16 | Publicatie-/zichtbaarheidsgrens | [ ] Nu implementeren · [ ] Foundation voorbereiden · [ ] Pilot · [ ] Later · [ ] Niet doen · [ ] Eerst privacy/juridisch beoordelen | Foundation | Voorkomt lekken van concept- en andere leerlinglocaties. | Extra policy- en testwerk.                          | Middel       | €      | Planningpublicatie + RLS      |

## Instructeur

| ID     | Functie                 | Selectie                                                                                                                            | Advies            | Voordeel                                              | Nadeel                                               | Complexiteit             | Kosten | Belangrijkste afhankelijkheid |
| ------ | ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ----------------- | ----------------------------------------------------- | ---------------------------------------------------- | ------------------------ | ------ | ----------------------------- |
| MAP-20 | Volgende locatie        | [ ] Nu implementeren · [ ] Foundation voorbereiden · [ ] Pilot · [ ] Later · [ ] Niet doen · [ ] Eerst privacy/juridisch beoordelen | Nu                | Hoogfrequente, direct bruikbare cockpitactie.         | Offline/last-minute wijzigingen moeten kloppen.      | Laag–middel              | €      | MAP-13/16/26                  |
| MAP-21 | Openen in Google Maps   | [ ] Nu implementeren · [ ] Foundation voorbereiden · [ ] Pilot · [ ] Later · [ ] Niet doen · [ ] Eerst privacy/juridisch beoordelen | Nu                | Navigatiewaarde met minimale bouwlast.                | Verlaat NXTDRIVE en hangt van externe app af.        | Laag                     | €      | Bevestigde locatie/deep link  |
| MAP-22 | Keuze navigatie-app     | [ ] Nu implementeren · [ ] Foundation voorbereiden · [ ] Pilot · [ ] Later · [ ] Niet doen · [ ] Eerst privacy/juridisch beoordelen | Later             | Respecteert gebruikersvoorkeur en vermindert lock-in. | Meer platformvarianten/support.                      | Laag–middel              | €      | MAP-21                        |
| MAP-23 | Dagroute instructeur    | [ ] Nu implementeren · [ ] Foundation voorbereiden · [ ] Pilot · [ ] Later · [ ] Niet doen · [ ] Eerst privacy/juridisch beoordelen | Pilot             | Maakt dagvolgorde en spreiding duidelijk.             | Extra map loads en adressen op gedeeld scherm.       | Middel                   | €–€€   | MAP-13/16                     |
| MAP-24 | Verkeer                 | [ ] Nu implementeren · [ ] Foundation voorbereiden · [ ] Pilot · [ ] Later · [ ] Niet doen · [ ] Eerst privacy/juridisch beoordelen | Later             | Actuelere operationele waarschuwing.                  | Variabele kosten en schijnnauwkeurigheid.            | Middel                   | €€     | MAP-25/33                     |
| MAP-25 | Verwachte reistijd      | [ ] Nu implementeren · [ ] Foundation voorbereiden · [ ] Pilot · [ ] Later · [ ] Niet doen · [ ] Eerst privacy/juridisch beoordelen | Pilot             | Helpt te laat komen voorkomen.                        | Route kan stale/onbeschikbaar zijn.                  | Hoog                     | €€     | MAP-33 + bufferbeleid         |
| MAP-26 | Offline locatiegegevens | [ ] Nu implementeren · [ ] Foundation voorbereiden · [ ] Pilot · [ ] Later · [ ] Niet doen · [ ] Eerst privacy/juridisch beoordelen | Foundation        | Volgende stop blijft bruikbaar bij slecht bereik.     | Adressen blijven tijdelijk op apparaat.              | Middel                   | €      | Scoped offline sync           |
| MAP-27 | Aankomstregistratie     | [ ] Nu implementeren · [ ] Foundation voorbereiden · [ ] Pilot · [ ] Later · [ ] Niet doen · [ ] Eerst privacy/juridisch beoordelen | Later             | Ondersteunt no-show/startproces.                      | Automatisering vergroot privacy- en batterijrisico.  | Laag handmatig/hoog auto | €      | Werkproces + privacybeleid    |
| MAP-28 | Live locatie            | [ ] Nu implementeren · [ ] Foundation voorbereiden · [ ] Pilot · [ ] Later · [ ] Niet doen · [ ] Eerst privacy/juridisch beoordelen | Privacy/juridisch | Kan ETA/onderwegstatus verbeteren.                    | Hoog werknemers-, stalking- en datalekrisico.        | Zeer hoog                | €€–€€€ | DPIA/legal/OR + MAP-47        |
| MAP-29 | Interne navigatie       | [ ] Nu implementeren · [ ] Foundation voorbereiden · [ ] Pilot · [ ] Later · [ ] Niet doen · [ ] Eerst privacy/juridisch beoordelen | Niet doen         | Eén geïntegreerde ervaring.                           | Zeer hoge veiligheid-, SDK-, kosten- en supportlast. | Zeer hoog                | €€€    | Navigation SDK/safety         |

## Planning en backoffice

| ID     | Functie                        | Selectie                                                                                                                            | Advies     | Voordeel                                          | Nadeel                                                                  | Complexiteit | Kosten | Belangrijkste afhankelijkheid   |
| ------ | ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------- | ----------------------------------------------------------------------- | ------------ | ------ | ------------------------------- |
| MAP-30 | Dagkaart afspraken             | [ ] Nu implementeren · [ ] Foundation voorbereiden · [ ] Pilot · [ ] Later · [ ] Niet doen · [ ] Eerst privacy/juridisch beoordelen | Pilot      | Laat ruimtelijke uitzonderingen direct zien.      | Kan druk/overvol worden en scope lekken.                                | Hoog         | €–€€   | MAP-31/39/permissions           |
| MAP-31 | Planbord met kaart             | [ ] Nu implementeren · [ ] Foundation voorbereiden · [ ] Pilot · [ ] Later · [ ] Niet doen · [ ] Eerst privacy/juridisch beoordelen | Pilot      | Kaart en planning blijven in één werkruimte.      | CSP vraagt een formele `unsafe-eval`-/isolatiekeuze; planbord is groot. | Hoog         | €–€€   | CSP-ADR/isolatie + shared state |
| MAP-32 | Reistijdconflictcontrole       | [ ] Nu implementeren · [ ] Foundation voorbereiden · [ ] Pilot · [ ] Later · [ ] Niet doen · [ ] Eerst privacy/juridisch beoordelen | Nu         | Voorkomt onhaalbare roosters.                     | Kernplanning wordt complexer en providerafhankelijk zonder fallback.    | Zeer hoog    | €€     | Planningkernel + MAP-33         |
| MAP-33 | Route Matrix-gateway           | [ ] Nu implementeren · [ ] Foundation voorbereiden · [ ] Pilot · [ ] Later · [ ] Niet doen · [ ] Eerst privacy/juridisch beoordelen | Foundation | Eén gebatchte, meetbare routebron.                | Per element betaald en caching beperkt.                                 | Hoog         | €€     | Serversecurity/metering         |
| MAP-34 | Beste instructeur              | [ ] Nu implementeren · [ ] Foundation voorbereiden · [ ] Pilot · [ ] Later · [ ] Niet doen · [ ] Eerst privacy/juridisch beoordelen | Pilot      | Vermindert lege reistijd en planwerk.             | Kan ondoorzichtige personeelssturing worden.                            | Zeer hoog    | €€     | Harde constraints + uitleg      |
| MAP-35 | Beste voertuig/vestiging       | [ ] Nu implementeren · [ ] Foundation voorbereiden · [ ] Pilot · [ ] Later · [ ] Niet doen · [ ] Eerst privacy/juridisch beoordelen | Later      | Betere asset- en branchinzet.                     | Standplaats/statusdata is nog niet betrouwbaar genoeg.                  | Zeer hoog    | €€     | Vehicle base/capabilities       |
| MAP-36 | Eén-instructeuroptimalisatie   | [ ] Nu implementeren · [ ] Foundation voorbereiden · [ ] Pilot · [ ] Later · [ ] Niet doen · [ ] Eerst privacy/juridisch beoordelen | Pilot      | Kan lege kilometers bij flexibele stops verlagen. | Alleen veilig vóór publicatie/met constraints.                          | Zeer hoog    | €€     | MAP-32/33 + flexibiliteit       |
| MAP-37 | Multi-instructeuroptimalisatie | [ ] Nu implementeren · [ ] Foundation voorbereiden · [ ] Pilot · [ ] Later · [ ] Niet doen · [ ] Eerst privacy/juridisch beoordelen | Later      | Potentieel grote netwerkbrede efficiëntie.        | Zeer complex, duur en arbeidsgevoelig.                                  | Zeer hoog    | €€€    | Bewijs uit MAP-36               |
| MAP-38 | Heroptimalisatie annulering    | [ ] Nu implementeren · [ ] Foundation voorbereiden · [ ] Pilot · [ ] Later · [ ] Niet doen · [ ] Eerst privacy/juridisch beoordelen | Later      | Herstelt gaten na uitval.                         | Risico op wijzigingscascade/notificatiestorm.                           | Zeer hoog    | €€–€€€ | Queue/publicatie/approval       |
| MAP-39 | Ongeldige adressen             | [ ] Nu implementeren · [ ] Foundation voorbereiden · [ ] Pilot · [ ] Later · [ ] Niet doen · [ ] Eerst privacy/juridisch beoordelen | Nu         | Maakt datakwaliteit herstelbaar vóór routefouten. | False positives kunnen werk creëren.                                    | Middel       | €      | MAP-01/03/06                    |

## RIS en lessen

| ID     | Functie                     | Selectie                                                                                                                            | Advies            | Voordeel                                            | Nadeel                                                          | Complexiteit | Kosten | Belangrijkste afhankelijkheid    |
| ------ | --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ----------------- | --------------------------------------------------- | --------------------------------------------------------------- | ------------ | ------ | -------------------------------- |
| MAP-40 | Lesroute opnemen            | [ ] Nu implementeren · [ ] Foundation voorbereiden · [ ] Pilot · [ ] Later · [ ] Niet doen · [ ] Eerst privacy/juridisch beoordelen | Privacy/juridisch | Kan oefencontext vastleggen.                        | Zeer gevoelige bewegings- en werknemersdata.                    | Zeer hoog    | €€     | DPIA/legal/OR + MAP-47           |
| MAP-41 | Lesroute terugkijken        | [ ] Nu implementeren · [ ] Foundation voorbereiden · [ ] Pilot · [ ] Later · [ ] Niet doen · [ ] Eerst privacy/juridisch beoordelen | Later             | Maakt goedgekeurde opname bruikbaar.                | Kan woon-/derdenlocaties onthullen.                             | Hoog         | €      | MAP-40/47                        |
| MAP-42 | Oefengebied vastleggen      | [ ] Nu implementeren · [ ] Foundation voorbereiden · [ ] Pilot · [ ] Later · [ ] Niet doen · [ ] Eerst privacy/juridisch beoordelen | Pilot             | Didactische waarde zonder volledig GPS-spoor.       | Handmatig gebied kan verouderen.                                | Middel       | €      | Locatiecatalogus + RIS-tags      |
| MAP-43 | RIS-tags uit route          | [ ] Nu implementeren · [ ] Foundation voorbereiden · [ ] Pilot · [ ] Later · [ ] Niet doen · [ ] Eerst privacy/juridisch beoordelen | Later             | Bespaart registratietijd als voorstel.              | Inferentie kan fout en beoordelingsgevoelig zijn.               | Zeer hoog    | €€     | MAP-40/42 + mensbevestiging      |
| MAP-44 | Slim oefenroutevoorstel     | [ ] Nu implementeren · [ ] Foundation voorbereiden · [ ] Pilot · [ ] Later · [ ] Niet doen · [ ] Eerst privacy/juridisch beoordelen | Later             | Helpt routes aan lesdoel koppelen.                  | Veiligheid en actuele geschiktheid zijn moeilijk te garanderen. | Zeer hoog    | €€–€€€ | Gecurateerde oefengebieden       |
| MAP-45 | Onvoldoende gebiedsvariatie | [ ] Nu implementeren · [ ] Foundation voorbereiden · [ ] Pilot · [ ] Later · [ ] Niet doen · [ ] Eerst privacy/juridisch beoordelen | Later             | Kan opleidingsvariatie signaleren.                  | Groot risico op surveillance/function creep.                    | Hoog         | €€     | Geaggregeerde rechtmatige data   |
| MAP-46 | Toetsroutevoorbereiding     | [ ] Nu implementeren · [ ] Foundation voorbereiden · [ ] Pilot · [ ] Later · [ ] Niet doen · [ ] Eerst privacy/juridisch beoordelen | Niet doen         | Lijkt leerlingvoorbereiding te bieden.              | Kan CBR-integriteit en verwachtingen ondermijnen.               | Hoog         | €      | Geen                             |
| MAP-47 | Routebewaring/audit/delete  | [ ] Nu implementeren · [ ] Foundation voorbereiden · [ ] Pilot · [ ] Later · [ ] Niet doen · [ ] Eerst privacy/juridisch beoordelen | Foundation        | Maakt eventuele mobiliteitsdata technisch begrensd. | Veel werk zonder directe waarde zolang fase 4 uitstaat.         | Zeer hoog    | €      | Privacybeleid + retention engine |

## Management

| ID     | Functie                | Selectie                                                                                                                            | Advies            | Voordeel                                                     | Nadeel                                         | Complexiteit | Kosten | Belangrijkste afhankelijkheid  |
| ------ | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ----------------- | ------------------------------------------------------------ | ---------------------------------------------- | ------------ | ------ | ------------------------------ |
| MAP-50 | Werkgebiedkaart        | [ ] Nu implementeren · [ ] Foundation voorbereiden · [ ] Pilot · [ ] Later · [ ] Niet doen · [ ] Eerst privacy/juridisch beoordelen | Pilot             | Maakt rayons, branches en dekking begrijpelijk.              | Polygonen en conflicten kunnen complex worden. | Hoog         | €      | Bestaande rayons + MAP-01      |
| MAP-51 | Anonieme pickupheatmap | [ ] Nu implementeren · [ ] Foundation voorbereiden · [ ] Pilot · [ ] Later · [ ] Niet doen · [ ] Eerst privacy/juridisch beoordelen | Privacy/juridisch | Laat vraagconcentraties zien.                                | Kleine aantallen blijven herleidbaar.          | Hoog         | €–€€   | Aggregatiedrempel/DPIA-screen  |
| MAP-52 | Lege-kilometeranalyse  | [ ] Nu implementeren · [ ] Foundation voorbereiden · [ ] Pilot · [ ] Later · [ ] Niet doen · [ ] Eerst privacy/juridisch beoordelen | Later             | Onderbouwt capaciteits- en efficiëntieverbetering.           | Kan heimelijke werknemersscore worden.         | Hoog         | €€     | Betrouwbare start/eindlegs     |
| MAP-53 | Reistijdrapportage     | [ ] Nu implementeren · [ ] Foundation voorbereiden · [ ] Pilot · [ ] Later · [ ] Niet doen · [ ] Eerst privacy/juridisch beoordelen | Later             | Onderbouwt buffer- en gebiedsbeleid.                         | Onvolledige data kan misleiden.                | Hoog         | €€     | MAP-25/33 + aggregatie         |
| MAP-54 | Vestigingsanalyse      | [ ] Nu implementeren · [ ] Foundation voorbereiden · [ ] Pilot · [ ] Later · [ ] Niet doen · [ ] Eerst privacy/juridisch beoordelen | Later             | Koppelt vraag, capaciteit en reistijd.                       | Veel genormaliseerde branchdata nodig.         | Hoog         | €€     | MAP-50/56                      |
| MAP-55 | Afstandstoeslagzones   | [ ] Nu implementeren · [ ] Foundation voorbereiden · [ ] Pilot · [ ] Later · [ ] Niet doen · [ ] Eerst privacy/juridisch beoordelen | Later             | Maakt verre pickups commercieel beheersbaar.                 | Transparantie en versiebeheer zijn verplicht.  | Hoog         | €      | Zone- en prijsbeleid           |
| MAP-56 | Vraagdekking postcode  | [ ] Nu implementeren · [ ] Foundation voorbereiden · [ ] Pilot · [ ] Later · [ ] Niet doen · [ ] Eerst privacy/juridisch beoordelen | Pilot             | Goedkopere/privacyvriendelijkere dekking dan exacte heatmap. | Minder geografische precisie.                  | Middel       | €      | Postcodenormalisatie/threshold |

## Examens

| ID     | Functie                | Selectie                                                                                                                            | Advies | Voordeel                                                      | Nadeel                                             | Complexiteit | Kosten | Belangrijkste afhankelijkheid |
| ------ | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------ | ------------------------------------------------------------- | -------------------------------------------------- | ------------ | ------ | ----------------------------- |
| MAP-60 | CBR-locatiecatalogus   | [ ] Nu implementeren · [ ] Foundation voorbereiden · [ ] Pilot · [ ] Later · [ ] Niet doen · [ ] Eerst privacy/juridisch beoordelen | Nu     | Betrouwbare, herbruikbare examenlocaties.                     | Catalogus heeft bron- en actualiteitsbeheer nodig. | Middel       | €      | Officiële bron + beheerder    |
| MAP-61 | Examenroute openen     | [ ] Nu implementeren · [ ] Foundation voorbereiden · [ ] Pilot · [ ] Later · [ ] Niet doen · [ ] Eerst privacy/juridisch beoordelen | Nu     | Hoge punctualiteitswaarde met lage bouwlast.                  | Afhankelijk van correct catalogusrecord.           | Laag         | €      | MAP-21/60/16                  |
| MAP-62 | Vertrekadvies examen   | [ ] Nu implementeren · [ ] Foundation voorbereiden · [ ] Pilot · [ ] Later · [ ] Niet doen · [ ] Eerst privacy/juridisch beoordelen | Pilot  | Vermindert risico op te late aankomst.                        | Traffic kan veranderen; geen garantie.             | Hoog         | €–€€   | MAP-25/33/60                  |
| MAP-63 | Examenlogistiek        | [ ] Nu implementeren · [ ] Foundation voorbereiden · [ ] Pilot · [ ] Later · [ ] Niet doen · [ ] Eerst privacy/juridisch beoordelen | Later  | Controleert kandidaat, voertuig, instructeur en buffer samen. | Zeldzame maar zeer complexe planningsflow.         | Zeer hoog    | €€     | Planningkernel/capabilities   |
| MAP-64 | Vertrek-/routereminder | [ ] Nu implementeren · [ ] Foundation voorbereiden · [ ] Pilot · [ ] Later · [ ] Niet doen · [ ] Eerst privacy/juridisch beoordelen | Nu     | Waarde zonder live tracking of interne navigatie.             | Stale advies/notificatiemoeheid mogelijk.          | Middel       | €      | Publicatie + notifications    |

## Voorgestelde bundelselectie

Als de product owner één samenhangende keuze wil maken:

### Bundel A — Aanbevolen Maps-MVP

`MAP-01, 02, 05, 06, 09, 10, 13, 15, 16, 20, 21, 26, 31, 33, 39, 60, 61, 64`

- Activeer zichtbaar: 02, 06, 10, 13, 15, 20, 21, 39, 60, 61, 64.
- Pilot na apart CSP-/isolatiebesluit: 31.
- Bereid alleen foundation voor: 01, 05, 09, 16, 26, 33.
- Voordeel: directe operationele waarde met fallback en beheersbare kosten.
- Nadeel: conflictcontrole gebruikt in deze bundel nog niet breed actuele reistijd.

### Bundel B — Aanbevolen fase 2

`MAP-03, 14, 24, 25, 30, 32, 34, 50, 56, 62`

- Pilot: 03, 14, 25, 30, 34, 50, 56, 62.
- Productie-uitbreiding na pilotbewijs: 24 en 32.
- Voordeel: route-intelligentie voorkomt aantoonbaar onhaalbare planning.
- Nadeel: variabele matrix-/routekosten en hogere kernelcomplexiteit.

### Bundel C — Niet nu bouwen

`MAP-28, 29, 37, 40, 46`

- 28 en 40: eerst privacy/juridisch.
- 29 en 46: niet doen.
- 37: later, pas na MAP-36-pilot.

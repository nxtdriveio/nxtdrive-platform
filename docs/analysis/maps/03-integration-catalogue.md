# Integratiecatalogus Google Maps, locaties en routing

Status: beslisvoorstel, geen implementatiebesluit  
Peildatum: 30 juli 2026  
Schaal kostenklasse: `€` = waarschijnlijk binnen lage/gratis gebruikslaag, `€€` = merkbaar variabel verbruik, `€€€` = premium/streng te begrenzen.

## Beslisregels

- `IMPLEMENT_NOW`: opnemen in de eerstvolgende Maps-MVP nadat de product owner de selectie goedkeurt.
- `PREPARE_FOUNDATION`: schema, contract, beveiliging of meetpunt voorbereiden; niet automatisch zichtbaar activeren.
- `PILOT`: begrensde tenant- of gebruikerspilot met succes- en stopcriteria.
- `IMPLEMENT_LATER`: waardevol, maar pas na de genoemde afhankelijkheden.
- `REQUIRES_PRIVACY_REVIEW` of `REQUIRES_LEGAL_REVIEW`: geen productiegebruik vóór formele beoordeling.
- `REJECT`: niet bouwen binnen de nu voorziene productrichting.

## Foundation

| ID     | Functie                                | Waarom en concrete grens                                                                                                                                                                                                                                                             | Advies             | Fase | Kosten |
| ------ | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------ | ---- | ------ |
| MAP-01 | Centrale locatie-entiteit              | Eén tenant-scoped bron voorkomt dat `students`, `lessons`, `agenda_appointments`, `locations`, `branches`, leads en wachtrijen ieder een ander adrescontract houden. De entiteit bewaart eigen klantdata, coördinaten, herkomst en validatiestatus; providercontent blijft minimaal. | PREPARE_FOUNDATION | 0    | €      |
| MAP-02 | Adres-autocomplete                     | Versnelt intake, leerlingbeheer, afspraakplanning, vestigingen en catalogusbeheer. Bouw op Autocomplete (New) met sessietokens; behoud vrije invoer en handmatige bevestiging als fallback.                                                                                          | IMPLEMENT_NOW      | 1    | €      |
| MAP-03 | Adresvalidatie                         | Alleen inzetten waar een bezorgbaar/operationeel adres echt nodig is: hoofdadres, vestiging, CBR-catalogus en problematische import. Niet elke tijdelijke ophaaltekst hoeft een betaalde validatie.                                                                                  | PILOT              | 1    | €–€€   |
| MAP-04 | Geocoding                              | Nodig voor gecontroleerde backfill van bestaande vrije tekst en CSV-import, niet als standaardpad na een gekozen Place-resultaat. Alleen server-side, rate-limited en met reviewbak voor ambigue resultaten.                                                                         | PREPARE_FOUNDATION | 0–1  | €      |
| MAP-05 | Place ID-opslag en refresh             | Place ID mag als providerreferentie worden bewaard; een periodieke, budgetbegrensde ouderdomscontrole voorkomt stille veroudering. Bewaar niet ongemerkt het volledige Place-object.                                                                                                 | PREPARE_FOUNDATION | 0    | €      |
| MAP-06 | Handmatige adrescorrectie              | Essentieel voor nieuwbouw, verzamelpunten, CBR-terreinpoorten en providerstoringen. Elke correctie krijgt bron, actor, tijd en reden; een correctie wordt niet stil door providerdata overschreven.                                                                                  | IMPLEMENT_NOW      | 1    | €      |
| MAP-07 | Importnormalisatie                     | CSV-adressen eerst syntactisch normaliseren, dedupliceren en previewen; alleen twijfelgevallen of gekozen batches extern valideren/geocoderen.                                                                                                                                       | PILOT              | 1    | €–€€   |
| MAP-08 | Locatieduplicaatdetectie               | Combineer genormaliseerde adresonderdelen, nabijheid en optioneel Place ID; presenteer merges als voorstel en voer geen automatische destructieve samenvoeging uit.                                                                                                                  | IMPLEMENT_LATER    | 2    | €      |
| MAP-09 | Providergrens, metering en entitlement | Een dun `LocationProvider`-contract, tenantmetering, feature gates en kostenalerts voorkomen Google-koppeling in domeinlogica en onbeheerst verbruik. Maps-rendering en Navigation SDK blijven bewust Google-specifiek.                                                              | PREPARE_FOUNDATION | 0    | €      |

## Leerling

| ID     | Functie                            | Waarom en concrete grens                                                                                                                                                                                 | Advies             | Fase | Kosten |
| ------ | ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | ---- | ------ |
| MAP-10 | Standaard ophaalpunt               | Directe operationele waarde: planner en instructeur hoeven niet per les vrije tekst te interpreteren. Houd woonadres en ophaalpunt als afzonderlijke relaties; ze mogen naar dezelfde locatie verwijzen. | IMPLEMENT_NOW      | 1    | €      |
| MAP-11 | Standaard afzetpunt                | Waardevol bij school/werk/thuis-combinaties, maar minder frequent dan ophalen. Model nu de relatie; activeer de flow na bewijs uit pilots.                                                               | PREPARE_FOUNDATION | 1–2  | €      |
| MAP-12 | Meerdere leerlinglocaties          | Thuis, school, werk en tijdelijk punt als gelabelde, activeerbare records voorkomt overschrijven. Beperk de eerste UI tot een klein aantal favorieten.                                                   | IMPLEMENT_LATER    | 2    | €      |
| MAP-13 | Afwijkende locatie per les         | Nodig voor de werkelijkheid van rijlessen. De les bewaart een snapshot/referentie zodat een latere profielwijziging een gepubliceerde les niet stil verandert.                                           | IMPLEMENT_NOW      | 1    | €      |
| MAP-14 | Ophaalpuntbevestiging leerling     | Vermindert misverstanden; leerling bevestigt of stelt een wijziging voor. Een wijziging na publicatie wordt een verzoek en geen directe planningmutatie.                                                 | PILOT              | 1    | €      |
| MAP-15 | Kaartpreview leerling              | Laat na publicatie het bevestigde punt en een navigatielink zien. Geen kaart nodig tijdens elke invoerstap; tekstuele fallback blijft beschikbaar.                                                       | IMPLEMENT_NOW      | 1    | €      |
| MAP-16 | Publicatie- en zichtbaarheidsgrens | Een expliciete status bepaalt welke geplande locatie leerling/ouder ziet. Concepten, interne standplaatsen en adressen van andere leerlingen mogen nooit via routecontext lekken.                        | PREPARE_FOUNDATION | 0–1  | €      |

## Instructeur

| ID     | Functie                       | Waarom en concrete grens                                                                                                                                                 | Advies                  | Fase | Kosten |
| ------ | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------- | ---- | ------ |
| MAP-20 | Volgende locatie              | Toon offline-bruikbaar adres, tijd, contactcontext en afwijking bovenaan de instructeursapp. Dit is geplande data, geen live tracking.                                   | IMPLEMENT_NOW           | 1    | €      |
| MAP-21 | Openen in Google Maps         | Een deep link geeft met zeer lage complexiteit direct navigatiewaarde zonder Navigation SDK of GPS-opslag in NXTDRIVE.                                                   | IMPLEMENT_NOW           | 1    | €      |
| MAP-22 | Keuze externe navigatie-app   | Laat gebruiker Google Maps of een aanwezige alternatieve app kiezen; bewaar voorkeur per apparaat. Vermijd harde Google-lock-in in de operationele flow.                 | IMPLEMENT_LATER         | 1–2  | €      |
| MAP-23 | Dagroute op kaart             | Genummerde stops en volgorde ondersteunen voorbereiding. Start als read-only pilot; routevolgorde blijft de gepubliceerde agenda tenzij planner bevestigt.               | PILOT                   | 1    | €–€€   |
| MAP-24 | Verkeersinformatie            | Alleen rondom relevante toekomstige verplaatsingen laden. Permanente verkeerslagen op ieder scherm voegen kosten/ruis toe en zijn geen planningsbron van waarheid.       | IMPLEMENT_LATER         | 2    | €€     |
| MAP-25 | Verwachte reistijd            | Toon actuele/typische reistijd plus benodigde buffer naar de volgende afspraak. Label schatting, berekentijd en fallback; maak geen harde blokkade op verouderde data.   | PILOT                   | 2    | €€     |
| MAP-26 | Offline locatiegegevens       | Cache alleen eigen geplande stops, adressen en deep-linkgegevens binnen de bestaande offline scope; geen Google-kaarttiles of onbeperkte providerresponses.              | PREPARE_FOUNDATION      | 1    | €      |
| MAP-27 | Aankomstregistratie           | Begin met handmatige “aangekomen”-actie. Automatische geofence-detectie is een afzonderlijke privacy- en batterijbeslissing.                                             | IMPLEMENT_LATER         | 4    | €      |
| MAP-28 | Live locatie                  | Niet nodig voor de eerste kaartfasen. Alleen na doelbinding, DPIA-indicatie, arbeidsrechtelijke/medezeggenschapsbeoordeling, uit-buiten-werktijd en korte bewaartermijn. | REQUIRES_PRIVACY_REVIEW | 4    | €€–€€€ |
| MAP-29 | Interne turn-by-turnnavigatie | Hoge SDK-, veiligheid-, support-, UX- en kostenlast terwijl externe navigatie het kernprobleem oplost.                                                                   | REJECT                  | —    | €€€    |

## Planning en backoffice

| ID     | Functie                                  | Waarom en concrete grens                                                                                                                                                                                                    | Advies             | Fase | Kosten |
| ------ | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | ---- | ------ |
| MAP-30 | Dagkaart alle afspraken                  | Operationele kaart voor één dag met uitzonderingen, filters, stops en ontbrekende adressen. Bouw als planningweergave, niet als generiek directiedashboard.                                                                 | PILOT              | 1    | €–€€   |
| MAP-31 | Planbord met kaart                       | Voorkeur: een kaartweergave/tab naast het bestaande planbord met gedeelde selectie en filters. Zo blijven mutaties en planningcontext in één werkruimte. Activeer alleen als CSP-keuze via threat model/ADR is goedgekeurd. | PILOT              | 1    | €–€€   |
| MAP-32 | Reistijdconflictcontrole                 | Grootste routewaarde: controleer vorige→nieuwe en nieuwe→volgende verplaatsing in preview én commit. Onbekende route geeft waarschuwing, geen stil “veilig”.                                                                | IMPLEMENT_NOW      | 2    | €€     |
| MAP-33 | Route Matrix                             | Gedeelde serverdienst voor conflictcontrole en kandidaatvergelijking met batching, field masks, korte toegestane cache, fallback en tenantmetering.                                                                         | PREPARE_FOUNDATION | 0–2  | €€     |
| MAP-34 | Beste instructeur voor nieuwe afspraak   | Rangschik alleen bevoegde/beschikbare kandidaten op marginale reistijd; toon redenen en laat planner beslissen. Geen uitsluitend locatiegestuurde personeelsbeslissing.                                                     | PILOT              | 2    | €€     |
| MAP-35 | Beste voertuig of vestiging              | Pas zinvol na betrouwbare voertuigstandplaats, capability, branch- en beschikbaarheidsdata. Routeafstand is één factor, niet de beslisser.                                                                                  | IMPLEMENT_LATER    | 2–3  | €€     |
| MAP-36 | Volgordeoptimalisatie per instructeur    | Geschikt voor nog niet gepubliceerde, flexibele stops; respecteer tijdvensters, pauzes, start/eindpunt en leerlingafspraken. Wijzig nooit automatisch gepubliceerde lessen.                                                 | PILOT              | 3    | €€     |
| MAP-37 | Volledige multi-instructeuroptimalisatie | Zeer complex door bevoegdheden, voertuigen, continuïteit, contracten, branches en uitlegbaarheid. Eerst één-instructeurpilot en stabiele planningskernel.                                                                   | IMPLEMENT_LATER    | 3+   | €€€    |
| MAP-38 | Heroptimalisatie bij annulering          | Bied scenario’s aan, maar publiceer geen cascade van wijzigingen zonder menselijke bevestiging en leerlingcommunicatie.                                                                                                     | IMPLEMENT_LATER    | 3    | €€–€€€ |
| MAP-39 | Ontbrekende of ongeldige adressen        | Direct bruikbare datakwaliteitslijst met eigenaar en herstelactie; blokkeer alleen flows waarvoor locatie noodzakelijk is.                                                                                                  | IMPLEMENT_NOW      | 1    | €      |

## RIS en lessen

| ID     | Functie                              | Waarom en concrete grens                                                                                                                              | Advies                  | Fase | Kosten |
| ------ | ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- | ---- | ------ |
| MAP-40 | Lesroute vastleggen                  | Historische bewegingsdata is veel gevoeliger dan een afspraakadres en is niet nodig voor basisplanning. Alleen doelgebonden pilot na privacybesluit.  | REQUIRES_PRIVACY_REVIEW | 4    | €€     |
| MAP-41 | Lesroute terugkijken                 | Heeft pas waarde en rechtmatigheid na MAP-40; leerlingtoegang, instructeurtoegang en bewaartermijn moeten vooraf vaststaan.                           | IMPLEMENT_LATER         | 4    | €€     |
| MAP-42 | Oefengebied vastleggen               | Een handmatig gelabeld gebied of set oefenpunten kan didactische waarde geven zonder continu GPS-spoor. Start providerneutraal en grofmazig.          | PILOT                   | 3–4  | €      |
| MAP-43 | RIS-contexttags uit route            | Automatische inferentie “snelweg/rotonde/stad” kan fout zijn en raakt beoordeling. Alleen als voorstel aan instructeur, nooit als automatische score. | IMPLEMENT_LATER         | 4    | €€     |
| MAP-44 | Slim oefenroutevoorstel              | Potentiële leswaarde, maar verkeersveiligheid, actuele beperkingen, niveau en instructeursoordeel domineren. Pas na gevalideerde oefengebieden.       | IMPLEMENT_LATER         | 4    | €€–€€€ |
| MAP-45 | Gebieden met onvoldoende variatie    | Alleen geaggregeerd en didactisch gebruiken; niet als verborgen individuele prestatiemaatstaf. Vereist voldoende, rechtmatig verkregen routecontext.  | IMPLEMENT_LATER         | 4+   | €€     |
| MAP-46 | Toetsroutevoorbereiding              | Geen routes bouwen die vermeende examenroutes nabootsen of CBR-integriteit kunnen ondermijnen. Algemene route naar de CBR-locatie valt onder MAP-61.  | REJECT                  | —    | €      |
| MAP-47 | Routebewaring, audit en verwijdering | Als MAP-40 ooit start, moeten doel, korte bewaartermijn, toegangslog, export/verwijdering en buiten-werktijdgrens vooraf technisch afdwingbaar zijn.  | PREPARE_FOUNDATION      | 0/4  | €      |

## Management

| ID     | Functie                         | Waarom en concrete grens                                                                                                                                       | Advies                  | Fase | Kosten |
| ------ | ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- | ---- | ------ |
| MAP-50 | Werkgebiedkaart                 | Visualiseert rayons, branches en vraagdekking. Begin met bestaande stad/postcodegebieden; polygonen pas bij bewezen behoefte.                                  | PILOT                   | 2–3  | €      |
| MAP-51 | Geanonimiseerde ophaalheatmap   | Alleen met aggregatiedrempel, grove cellen, beperkte periode en uitsluiting van individuele drill-down. Kleine aantallen kunnen alsnog herleidbaar zijn.       | REQUIRES_PRIVACY_REVIEW | 3    | €–€€   |
| MAP-52 | Lege-kilometeranalyse           | Hoge managementwaarde, maar betrouwbare geplande/werkelijke start- en eindlocaties zijn nodig. Rapporteer op team/tenant, niet als heimelijke werknemersscore. | IMPLEMENT_LATER         | 3    | €€     |
| MAP-53 | Reistijdrapportage              | Gebruik geaggregeerde planningsdata voor capaciteit en bufferbeleid. Houd operationele analyse gescheiden van personeelsbeoordeling.                           | IMPLEMENT_LATER         | 3    | €€     |
| MAP-54 | Vestigingsanalyse               | Vergelijk vraag, capaciteit en reistijd per branch na normalisatie van locatie- en branchdata.                                                                 | IMPLEMENT_LATER         | 3    | €€     |
| MAP-55 | Afstandstoeslagzones            | Kan commerciële waarde hebben, maar vereist transparante prijsregels, versiebeheer en bevestiging vóór boeking. Geen realtime routeprijs als standaard.        | IMPLEMENT_LATER         | 3    | €      |
| MAP-56 | Vraagdekking per postcodegebied | Een grof, geaggregeerd postcode-overzicht is goedkoper en privacyvriendelijker dan exacte heatmaps en kan MAP-51 voorafgaan.                                   | PILOT                   | 2–3  | €      |

## Examens

| ID     | Functie                      | Waarom en concrete grens                                                                                                                                              | Advies          | Fase | Kosten |
| ------ | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- | ---- | ------ |
| MAP-60 | CBR-locatiecatalogus         | Beheer gecontroleerde examenlocaties met bron, geldigheid, ingang/afspreekpunt en handmatige correctie. Geen ongedocumenteerde scraping.                              | IMPLEMENT_NOW   | 1    | €      |
| MAP-61 | Examenroute openen           | Zeer lage complexiteit en hoge punctualiteitswaarde: publiceerde afspraak opent extern op bevestigd CBR-punt.                                                         | IMPLEMENT_NOW   | 1    | €      |
| MAP-62 | Reistijd- en vertrekadvies   | Bereken nabij de afspraak met configureerbare aankomstbuffer en duidelijke actualiteit; stuur herinnering alleen voor bevestigde/gepubliceerde examens.               | PILOT           | 2    | €–€€   |
| MAP-63 | Examenlogistiek              | Combineer voertuig, instructeur, branch, kandidaat en buffer in planningpreview. Eerst stabiele planningskernel en catalogus.                                         | IMPLEMENT_LATER | 2–3  | €€     |
| MAP-64 | Vertrek- en routeherinnering | Een notificatie met tijd, buffer en deep link levert waarde zonder live tracking. Voorkom herhaald routeverbruik door één geplande herberekening en een verversactie. | IMPLEMENT_NOW   | 1–2  | €      |

## Waardeconcentratie

De hoogste directe waarde zit niet in live GPS of volledige optimalisatie, maar in:

1. één betrouwbaar locatiecontract;
2. snel en corrigeerbaar adres kiezen;
3. een afzonderlijk standaard ophaalpunt;
4. een per-les afwijking met publicatiegrens;
5. volgende locatie en externe navigatie voor de instructeur;
6. de kaart als weergave van het bestaande planbord;
7. ontbrekende/ongeldige adressen zichtbaar maken;
8. reistijd in dezelfde centrale planningpreview en commitcontrole;
9. een gecontroleerde CBR-locatiecatalogus;
10. vertrekadvies zonder live tracking.

## Bewust niet in de eerste brede integratie

- Interne turn-by-turnnavigatie (`MAP-29`) wordt afgewezen.
- Volledige multi-instructeuroptimalisatie (`MAP-37`) wacht op één-instructeurbewijs en een centrale planningskernel.
- Live tracking (`MAP-28`) is geen afhankelijkheid voor enige fase 0–3.
- Routeopname (`MAP-40`) en afgeleide routeanalyse wachten op doelbinding en formele privacybeoordeling.
- “Toetsroutes” (`MAP-46`) worden niet als productrichting gekozen.

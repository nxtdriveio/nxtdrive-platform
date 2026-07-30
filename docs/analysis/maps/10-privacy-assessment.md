# Privacyassessment: locaties, routes en navigatie

**Peildatum:** 30 juli 2026  
**Status:** product- en architectuuranalyse; **geen juridisch advies of definitieve grondslagbeoordeling**

## 1. Managementsamenvatting

“Locatie” is niet één verwerking. NXTDRIVE moet ten minste vier categorieën afzonderlijk besluiten, documenteren en technisch afdwingen:

| Categorie                         | Aanbevolen releasebesluit                                                   | Belangrijkste reden                                                            |
| --------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| A. Geplande afspraaklocaties      | Toestaan met beperkte toegang en providerdataregels                         | Nodig voor lesplanning, maar exact woon-/ophaallocatie blijft persoonsgegevens |
| B. Berekende routes en reistijden | Toestaan, raw output kortstondig en geen automatische personeelsbeoordeling | Goed te minimaliseren tot duur/afstand/conflict                                |
| C. Live instructeurlocatie        | Niet in MVP; alleen na DPIA, doel-/grondslag- en medezeggenschapsbesluit    | Systematische werknemersmonitoring en locatie buiten werk voorkomen            |
| D. Opgenomen lesroutes            | Standaard uit; afzonderlijke latere pilotgate                               | Zeer gedetailleerde gedrags- en locatiehistorie van instructeur én leerling    |

Voor A en B is een privacy-by-design implementatie mogelijk zonder live tracking: de planner gebruikt geplande adressen en serverberekende reistijden. C en D mogen niet geleidelijk “meeliften” omdat een kaart of native SDK al aanwezig is.

Exacte rechtsrollen, grondslagen, bewaartermijnen, informatieplichten, doorgiften en medezeggenschapsrechten moeten vóór productie door een bevoegde privacy-/juridische eigenaar worden vastgesteld. De [AVG/GDPR](https://eur-lex.europa.eu/eli/reg/2016/679/oj), de Google EEA-contracten en Nederlands arbeidsrecht zijn contextafhankelijk.

## 2. Juridisch en contractueel kader

### 2.1 Relevante beginselen

Voor iedere categorie moeten minimaal worden onderbouwd:

- een specifiek, uitdrukkelijk en gerechtvaardigd doel;
- een toepasselijke grondslag per betrokken groep en doel;
- noodzakelijkheid en proportionaliteit;
- dataminimalisatie en juistheid;
- een concrete opslagtermijn en automatische verwijdering;
- transparantie vóór de verwerking;
- privacy by design/default, toegang, beveiliging en audit;
- afhandeling van inzage, rectificatie, verwijdering, beperking, overdraagbaarheid en bezwaar voor zover het betreffende recht van toepassing is;
- opname in het verwerkingsregister en contract-/leveranciersbeheer;
- een DPIA wanneer de verwerking waarschijnlijk een hoog risico oplevert.

Dit volgt onder meer uit AVG-artikelen 5, 6, 13/14, 25, 30, 32 en 35. Locatiegegevens zijn niet automatisch een bijzondere categorie onder artikel 9, maar routepatronen kunnen gevoelige bezoeken, religie, gezondheid, vakbond of privégedrag onthullen. Product en analytics mogen zulke gevolgtrekkingen niet maken.

De [EDPB-richtsnoeren over connected vehicles en mobility data](https://www.edpb.europa.eu/documents/guideline/guidelines-012020-on-processing-personal-data-in-the-context-of-connected_en) behandelen locatie- en reisgegevens als persoonsgegevens en benadrukken minimalisatie, lokale verwerking en de mogelijkheid om verzameling uit te zetten wanneer die niet nodig is.

### 2.2 Voorlopige rolverdeling

Een werkhypothese, te bevestigen in contracten en dataflows:

- de rijschool bepaalt doorgaans waarom afspraken, planning en personeelslocatie worden verwerkt en is daarvoor vermoedelijk verwerkingsverantwoordelijke;
- NXTDRIVE handelt voor tenantfunctionaliteit vermoedelijk grotendeels als verwerker, maar kan voor eigen doelen, producttelemetry of zelfstandige beslissingen een andere rol krijgen;
- Google's [Controller-Controller Data Protection Terms](https://business.safety.google/controllerterms/) kwalificeren Google en de contractpartner voor “Controller Personal Data” als onafhankelijke verwerkingsverantwoordelijken; voor de EEA is Google Ireland de genoemde Google-entiteit;
- Google Maps Platform EEA Terms nemen die controller-controllervoorwaarden op en beschrijven eigen gegevensverzameling door Google.

Dit is geen definitieve rolvaststelling. De directe Google-contractpartij, reseller-/tenantconstructie, gekozen API, SDK, client- versus servercall en eigen doeleinden kunnen de uitkomst veranderen. Leg per stroom vast wie contractpartij, verantwoordelijke, verwerker, ontvanger en aanspreekpunt is.

### 2.3 Google EEA-voorwaarden

Voor een Nederlands billing-account zijn de [Google Maps Platform EEA Terms](https://cloud.google.com/terms/maps-platform/eea), de [EEA Service Specific Terms](https://cloud.google.com/terms/maps-platform/eea/maps-service-terms), [EEA FAQ](https://developers.google.com/maps/comms/eea/faq) en [Places EEA changes](https://developers.google.com/maps/comms/eea/places) relevant. Nieuwe projecten en wezenlijk gewijzigde integraties na 8 juli 2025 vallen volgens Google onder dit EEA-regime.

De productimpact omvat onder meer:

- applicatievoorwaarden/privacyinformatie moeten het gebruik van Google Maps beschrijven en naar de toepasselijke Google Maps end-user terms en Google Privacy Policy verwijzen;
- Google noemt onder meer zoektermen, IP-adres en lat/lng als gegevens die bij Maps-gebruik kunnen worden ontvangen;
- voor toegang tot of opslag van een eindgebruikerslocatie leggen de Google-voorwaarden bovendien een voorafgaande locatiemelding en uitdrukkelijke, voorafgaande en intrekbare toestemming op; dit is een contractuele producteis en bepaalt niet op zichzelf welke AVG-grondslag voor de rijschool geldt;
- Place IDs mogen duurzaam worden opgeslagen en kunnen via IDs Only worden ververst;
- andere Places-inhoud kent cachebeperkingen en mag voor EEA-integraties niet zonder meer “With any Map” worden gebruikt; place ID en lat/lng zijn expliciete uitzonderingen;
- Address Validation provider-adresvelden, validatieflags en coördinaten kennen voor het beschreven transactionele gebruik in beginsel een 30-dagenvenster, waarna bevestigde/gecorrigeerde eigen data de providerdata vervangt;
- Routes-, Route Optimization- en Navigation-coördinaten kennen in beginsel een 30-dagenlimiet;
- een 30-dagenbepaling voor coördinaten is geen algemene toestemming om volledige responses, verkeersinformatie, routebeschrijvingen of polylines te archiveren;
- Geocoding bevat naast een algemene limiet een specifieke, contextgebonden uitzondering voor directe, door de eindgebruiker geïnitieerde en logisch per gebruiker geïsoleerde functionaliteit.

De precieze uitleg en samenloop van deze bepalingen vereist contractuele beoordeling. NXTDRIVE moet providerdata technisch van door de gebruiker bevestigde tenantdata scheiden en een `source`, `obtainedAt`, `confirmedAt` en `expiresAt` kunnen vastleggen.

### 2.4 Werknemersmonitoring en medezeggenschap

De Autoriteit Persoonsgegevens behandelt GPS-systemen in bedrijfsvoertuigen als een vorm van personeelsmonitoring. Haar [OR-privacyboek](https://www.autoriteitpersoonsgegevens.nl/uploads/imported/ap_or_privacy-boekje.pdf) benadrukt doel, periode, gebruik, bewaartermijn, toegang, transparantie en DPIA bij systematische/grootschalige monitoring.

Artikel 27 van de [Wet op de ondernemingsraden](https://wetten.overheid.nl/BWBR0002747/2023-02-18/0/HoofdstukIVA/Artikel27) geeft de ondernemingsraad instemmingsrecht bij regelingen over verwerking/bescherming van personeelsgegevens en voorzieningen gericht of geschikt voor waarneming of controle van aanwezigheid, gedrag of prestaties. Of een OR, personeelsvertegenwoordiging of ander traject in een specifieke rijschool van toepassing is, moet per werkgever worden vastgesteld.

Toestemming van een werknemer is door de gezagsverhouding doorgaans geen robuuste standaardgrondslag; de [EDPB-consentrichtsnoeren](https://www.edpb.europa.eu/our-work-tools/our-documents/guidelines/guidelines-052020-consent-under-regulation-2016679_en) vereisen een werkelijk vrije keuze zonder nadeel. Een producttoggle of akkoordknop is operationele controle, niet vanzelf de juridische grondslag.

## 3. Dataclassificatie en gemeenschappelijke regels

| Gegeven                               | Classificatie                                          | Standaardregel                                       |
| ------------------------------------- | ------------------------------------------------------ | ---------------------------------------------------- |
| Vrij ingevoerd/bevestigd ophaaladres  | Persoons-/tenantdata                                   | Alleen voor les/klantbeheer; need-to-know            |
| Place ID                              | Providerreferentie, vaak gekoppeld aan persoon/locatie | Apart opslaan; niet in logs; periodiek verversen     |
| Provider formatted address/components | Tijdelijke providerdata totdat bevestigd               | Contractuele TTL; vervang door user-confirmed versie |
| Exacte lat/lng                        | Precieze locatie, hoge herleidbaarheid                 | Alleen server/need-to-know; geen brede UI/logs       |
| Geplande reistijd/afstand             | Afgeleid planningsgegeven                              | `asOf`, methode en confidence; beperkte retentie     |
| Polyline/routebeschrijving            | Gedetailleerde bewegings-/route-informatie             | Niet bewaren tenzij afzonderlijk goedgekeurd         |
| Live GPS-punt                         | Zeer precieze actuele locatie                          | Feature off; alleen actieve sessie na aparte gate    |
| Opgenomen GPS-/sensortrack            | Gedetailleerde gedrags- en locatiehistorie             | Geen verzameling standaard; afzonderlijke pilot/DPIA |
| Autocomplete query/session token      | Tijdelijke invoer/provideridentificator                | Niet loggen of persistent bewaren                    |
| Usage-/audit-event                    | Pseudonieme operationele data                          | Geen locatiepayload; concrete retentie               |

Gemeenschappelijk:

- toon volledige adressen niet in brede dashboards, markerlabels, exports of notificatiepreview;
- geen cross-tenant cache of analytics;
- gebruik role- en objectautorisatie, niet alleen “is ingelogd”;
- een student ziet nooit andere studenten/lessen;
- een instructeur ziet alleen toegewezen of operationeel noodzakelijke lessen;
- een planner/tenantadmin krijgt geen locatiehistorie die niet bij de vastgelegde taak hoort;
- gebruik locatie niet stilzwijgend voor performance scoring, discipline, marketing of AI-training;
- Google-request-/responsepayloads gaan niet naar algemene logs, error tracking of session replay;
- locatiefeatures staan default uit waar ze niet noodzakelijk zijn.

## 4. Categorie A — geplande afspraaklocaties

### 4.1 Doel en noodzakelijkheid

Beoogde doelen:

- les ophalen/starten op een afgesproken locatie;
- les toewijzen en agenda tonen;
- reistijd tussen twee geplande lessen berekenen;
- leerling en toegewezen instructeur informeren over hun eigen afspraak.

Het volledige huisadres is niet voor iedere weergave nodig. Een lijst kan straat/wijk of een label als “thuis” tonen; exacte coördinaten zijn alleen nodig bij routeberekening/navigatie.

### 4.2 Mogelijke grondslag en rollen

Voor studentafspraken kunnen uitvoering van een overeenkomst of een gerechtvaardigd belang mogelijke beoordelingsroutes zijn, afhankelijk van wie partij is, welke verwerking objectief noodzakelijk is en of alternatieven bestaan. Voor de instructeurplanning kan een werkgevers-/bedrijfsbelang relevant zijn. Dit document kiest geen grondslag.

Vereist besluit:

- grondslag per student, instructeur en contactpersoon;
- noodzakelijkheid van exact adres versus buurt/meeting point;
- gerechtvaardigd-belangentoets wanneer daarop wordt gesteund;
- verwerking van minderjarige leerlingen en passende informatie/vertegenwoordiging;
- rol van tenant, NXTDRIVE en Google per client-/servercall.

### 4.3 Zichtbaarheid en toegang

- **Student:** uitsluitend eigen, bevestigde/gepubliceerde afspraaklocatie en wijzigingen.
- **Toegewezen instructeur:** exact adres vanaf een proportioneel tijdstip vóór de les; niet onbeperkt na afloop zoeken in leerlinghistorie.
- **Planner:** exacte geplande locatie waar nodig voor planning.
- **Tenantadmin/support:** alleen op expliciete taak en auditeerbaar; support standaard gemaskeerd.
- **Andere studenten/instructeurs:** geen toegang.
- **Google:** ontvangt de minimale query/place-/coördinatendata die het gekozen product technisch nodig heeft, onder eigen contract/privacyrol.

Markerlabels gebruiken bijvoorbeeld tijd + leerlinginitiaal/interne status, niet volledige naam en adres samen. Notificaties op een vergrendeld scherm bevatten geen exact adres tenzij de gebruiker dat bewust heeft geconfigureerd.

### 4.4 Retentievoorstel

Onder voorbehoud van tenantdoel, fiscale/contractuele verplichtingen en juridische beoordeling:

- user-confirmed afspraakadres: zolang de afspraak actief is en daarna volgens het vastgestelde les-/klantdossierbeleid; verwijder exacte locatie uit operationele views zodra niet meer nodig;
- historisch afspraakrecord: bewaar liever een locatie-ID/label dan blijvend een kopie van het volledige adres;
- Place ID: zolang de eigen locatie nodig is, met Google-aanbevolen refresh bij langdurig gebruik;
- provider-autocompletepredictions: niet bewaren;
- onbevestigde provider-adresvelden/coördinaten: contractuele TTL, in relevante Google EEA-clausules veelal maximaal 30 dagen;
- validatieflags: verwijderen of vervangen door de bevestigde/correctiestatus binnen het toepasselijke Googlevenster.

Deze termijnen moeten als automatische lifecycle rules worden geïmplementeerd; “tenant kan later handmatig opruimen” is onvoldoende.

### 4.5 DPIA, transparantie en audit

Een losse geplande leslocatie maakt niet vanzelf een hoog-risicoverwerking, maar schaal, kwetsbare/minderjarige leerlingen, koppeling aan gedrag, lange historie of andere datasets kunnen de beoordeling veranderen. Documenteer de DPIA-screening.

Privacyinformatie vermeldt:

- waarom exact adres nodig is;
- wie het ziet en vanaf welk moment;
- welke Google-services gegevens ontvangen;
- bewaartermijnen en rechten;
- handmatige invoer/correctie en gevolgen als iemand geen exact woonadres wil geven, bijvoorbeeld een afgesproken meeting point.

Audit: create/change/confirm/view/export door geprivilegieerde rollen, zonder het adres zelf in het audit-event.

## 5. Categorie B — berekende routes en reistijden

### 5.1 Doel en noodzakelijkheid

Toegestane uitgangsdoelen:

- controleren of opeenvolgende lessen haalbaar zijn;
- vertrek-/aankomsttijd en buffer voorstellen;
- een planner alternatieve volgorde laten beoordelen;
- leerling een gepubliceerde ETA of vertrekadvies geven.

Voor deze doelen volstaan meestal duration, distance, status, `asOf` en een confidence/fallback-indicatie. Een polyline, turn-by-turn-stappen of permanente routehistorie is niet nodig.

### 5.2 Mogelijke grondslag en rollen

De routeberekening kan onder dezelfde planningsgrondslag als de afspraken vallen wanneer hij noodzakelijk en proportioneel is. Dat rechtvaardigt niet automatisch gebruik voor werknemersperformance, snelheidsovertredingen, productiviteitsranking of studentprofilering. Ieder nieuw doel vereist een afzonderlijke beoordeling.

Google ontvangt bij een servercall de noodzakelijke origins/destinations en routeparameters. NXTDRIVE mag de response minimaliseren voordat die naar de browser gaat.

### 5.3 Zichtbaarheid en toegang

- **Planner:** duur, afstand, conflictstatus, source/as-of en optimalisatievoorstel.
- **Toegewezen instructeur:** eigen overgang tussen toegewezen lessen en gepubliceerde route/ETA.
- **Student:** alleen eigen relevante aankomststatus/ETA; geen vorige/volgende leerlinglocatie, intern conflict of instructeurdagroute.
- **Manager:** geaggregeerde servicekwaliteit zonder individuele routehistorie; detail alleen voor een vastgelegde operationele taak.
- **Support:** request-/fout-ID en status, geen origin/destination.

Een optimalisatie-uitkomst is een voorstel. Laat een bevoegde planner publiceren/overrulen en voorkom dat een model automatisch nadelige personeelsbesluiten neemt.

### 5.4 Retentievoorstel

- actuele trafficresponse/cache: 5–15 minuten;
- raw Google route-/matrixresponse en polyline: niet persistent opslaan;
- tijdelijke coördinaten in job/cache: zo snel mogelijk verwijderen en nooit langer dan het toepasselijke contractuele maximum;
- afgeleid planningbesluit: `duration`, `distance`, `asOf`, methode/fallback en geaccepteerde buffer maximaal 30 dagen voor operationele conflict-/supportanalyse, tenzij een kortere termijn volstaat;
- gepubliceerde afspraakvolgorde: onderdeel van het eigen afspraakrecord volgens categorie A, niet als providerroutearchief;
- optimizationmodel/resultaat met exacte coördinaten: job-TTL in uren/dagen; niet langer dan nodig en nooit als permanente debugpayload.

De 30 dagen voor een afgeleid planningsbesluit is een voorgestelde producttermijn, geen juridische verplichting of Google-toestemming voor de volledige providerresponse. Valideer of 7 of 14 dagen operationeel al genoeg is.

### 5.5 DPIA, transparantie en audit

Documenteer dat routeberekeningen:

- geen werkelijke beweging meten;
- niet als performance score worden gebruikt;
- traffic-/providerfouten kunnen bevatten;
- door een planner kunnen worden overruled;
- niet aan een student tonen waar een andere leerling woont.

Alleen geplande routeberekening is doorgaans minder ingrijpend dan live/recorded tracking, maar grootschalige profiling, automatische personeelsbesluiten of koppeling met werkelijk rijgedrag kan alsnog een DPIA vereisen. Audit wie een geoptimaliseerd voorstel publiceerde en welke generieke constraints golden; bewaar geen volledige Google-payload.

## 6. Categorie C — live instructeurlocatie

### 6.1 Releasebesluit

**Standaard uit en niet in MVP.** De huidige web-`Permissions-Policy` blokkeert geolocatie terecht. Alleen activeren na een afzonderlijke, goedgekeurde use case, DPIA, arbeidsrechtelijke/medezeggenschapsbeoordeling, grondslag, notice en technische off-switches.

Maps JavaScript, Traffic Layer of een Navigation SDK installeren is geen toestemming om live locatie te verzamelen.

### 6.2 Alleen mogelijke beperkte doelen

Voorbeelden die onderzocht kunnen worden:

- “instructeur nadert”/grove ETA voor de leerling;
- dispatch bij een concreet veiligheidsincident;
- navigatie tijdens een actieve, door de instructeur gestarte les.

Niet als standaarddoel:

- continu aanwezigheid, pauzes of snelheid volgen;
- ranglijsten, beloning, disciplinaire maatregelen of productiviteit;
- buiten werktijd of tussen niet-gerelateerde activiteiten volgen;
- exact live punt aan leerlingen tonen als een grove status volstaat;
- locatie voor marketing, algemene analytics of modeltraining.

### 6.3 Grondslag, DPIA en medezeggenschap

Een gerechtvaardigd belang kan alleen na een concrete noodzakelijkheid-/belangenafweging worden overwogen; toestemming is in een arbeidsrelatie doorgaans geen veilige default wegens de machtsongelijkheid. Andere grondslagen vereisen eveneens juridische onderbouwing. De studentcontext kan een andere basis hebben dan de werkgeverscontext.

Door de systematische observatie van werknemers, precisie en schaal bestaat een sterke indicatie voor een DPIA vóór ontwikkeling/pilot. Leg minimaal vast:

- exact doel en aantoonbaar minder ingrijpende alternatieven;
- meetfrequentie/precisie en waarom grover niet volstaat;
- ontvangers en moment van zichtbaarheid;
- risico op privé-/thuislocatie en misbruik door student/manager;
- off-hours- en background-controls;
- retentie, incidenttoegang en rechten;
- leveranciers/SDK-/OS-dataflows;
- OR/PVT/werknemersvertegenwoordiging en toepasselijke instemming.

### 6.4 Privacy-by-default controls

Als de gate later wordt gehaald:

- tracking start alleen door een duidelijke actie voor een actieve les/shift;
- permanente zichtbare OS- en appindicator;
- één knop om te stoppen; automatische stop bij les-/navigatie-einde, logout, diensttijd of timeout;
- geen achtergrondtracking buiten de expliciete actieve context;
- geofence/precision reduction waar “onderweg/binnen X minuten” volstaat;
- student ziet grove ETA/status, standaard geen exact bewegend punt;
- planner ziet exact alleen wanneer operationeel noodzakelijk en gedurende een klein tijdvenster;
- manager/performancefuncties krijgen geen live/history-feed;
- chauffeur/instructeur kan zien wie toegang had;
- geen sessiereplay, analytics SDK of crashlog met coördinaten;
- offline/networkbuffer versleuteld en automatisch gewist;
- een nood-/incidentoverride is specifiek, gelogd en achteraf beoordeeld.

Een opt-in toggle is nuttig voor controle maar vervangt geen grondslag of medezeggenschap.

### 6.5 Retentievoorstel

- live punten: alleen in memory/stream zolang de actieve sessie bestaat;
- client/server retrybuffer: minuten, versleuteld, wissen na aflevering/einde;
- geen standaard locatiehistorie;
- status “gestart/gestopt/onderweg” zonder coördinaten: maximaal 30 dagen voor operationele audit als dat aantoonbaar nodig is;
- alleen bij een vooraf gedefinieerd veiligheidsincident kan een beperkte snapshot apart worden veiliggesteld volgens een incidentbeleid met toegang, reden en verwijderdatum;
- Google Navigation-coördinaten: niet lokaal archiveren en uiterlijk binnen toepasselijke EEA-limiet verwijderen.

“Voor het geval dat” is geen retentiedoel. Als een incidentproces zonder bewaarde punten werkt, bewaar ze niet.

### 6.6 Transparantie, rechten en audit

Instructeur krijgt vóór activatie begrijpelijke informatie over doel, basis, frequentie, ontvangers, off-switch, geen-performancegebruik, retentie, rechten, medezeggenschap en Google/OS-ontvangers. De leerling ziet wanneer een live/grove status wordt gedeeld en mag die niet gebruiken om een instructeur buiten de afspraak te volgen.

Audit zonder locatiepayload:

- tracking start/stop + actor/device/lesson;
- wijziging precision/ontvangers;
- iedere privileged live view;
- incidentoverride met reden en reviewer;
- automatische verwijdering;
- configuratie-/retentiewijzigingen.

## 7. Categorie D — opgenomen lesroutes

### 7.1 Releasebesluit

**Standaard geen verzameling of opslag.** Een routeopname is een andere verwerking dan live ETA. Zij legt langdurig vast waar instructeur en leerling reden en kan snelheid, rijstijl, stops, fouten, woon-/school-/zorglocaties en privépatronen onthullen.

Een toekomstige RIS-/pedagogische use case vereist een afzonderlijke pilotgate, niet alleen een instellingenoptie.

### 7.2 Mogelijke doelafbakening

Een te onderzoeken smal doel kan zijn:

- de leerling na een les gekozen oefensegmenten of door de instructeur toegevoegde leerpunten tonen;
- on-device een korte pedagogische samenvatting afleiden.

Niet zonder nieuwe, afzonderlijke beoordeling:

- volledige ruwe route voor onbepaalde tijd;
- automatische score van instructeur of leerling;
- snelheids-/rem-/telefoonanalyse voor discipline, verzekering of marketing;
- secundaire AI-training;
- vergelijking/ranking tussen instructeurs;
- hergebruik van een veiligheidsdoel voor arbeidsperformance.

### 7.3 Grondslag, betrokkenen en DPIA

De verwerking raakt minstens twee personen met verschillende verhoudingen: de leerling en de werknemer/zelfstandige instructeur. Hun grondslag, informatie, rechten en mogelijke machtsongelijkheid moeten apart worden beoordeeld. Bij minderjarige leerlingen moet leeftijd/passende informatie worden meegenomen. Een route kan bovendien toevallig derden of gevoelige locaties onthullen.

Door gedetailleerde, stelselmatige gedrags-/locatiemonitoring ligt een DPIA sterk voor de hand. Voor werknemers zijn ook OR/PVT/arbeidsrechtelijke besluiten nodig. Toestemming van de instructeur is niet automatisch vrij; toestemming van de leerling maakt werknemersmonitoring evenmin rechtmatig.

### 7.4 Privacy-by-design alternatief

Voorkeursvolgorde:

1. geen ruwe route; instructeur kiest handmatig leerpunten;
2. on-device/edge afleiding tijdens de les, alleen minimale samenvatting uploaden;
3. alleen geselecteerde/grovere segmenten, niet begin/eind bij woning;
4. ruwe pilotdata alleen als 1–3 het doel aantoonbaar niet halen.

Technische controls bij een goedgekeurde pilot:

- aparte featureflag en pilottenant; geen stilzwijgende default;
- duidelijke opname-indicator en start/stop per les;
- uitsnijden van privé-/woningsegmenten en minimale precisie/samplefrequentie;
- versleuteling op device, transport en storage;
- per-les keys/strakke service accounts;
- geen export/bulkdownload standaard;
- geen analytics/session replay op routeviews;
- menselijke toelichting bij afgeleide scores en geen uitsluitend geautomatiseerde nadelige beslissing;
- meetbare automatische delete en audit van iedere routeview/export.

### 7.5 Zichtbaarheid

- **Leerling:** alleen eigen, door het goedgekeurde onderwijsdoel benodigde samenvatting/segmenten.
- **Instructeur:** eigen opgenomen les en mogelijkheid feitelijke fouten/privésegmenten te markeren.
- **Planner:** standaard geen routeopname.
- **Manager/opleidingscoach:** alleen met specifieke rol, doel, beperkte set en transparantie; geen algemene performancefeed.
- **Support/engineering:** geen inhoud standaard; privacyveilige technische metrics.
- **Andere leerlingen/instructeurs:** nooit.

### 7.6 Retentievoorstel voor een eventuele pilot

- raw GPS/sensortrack: niet opslaan als default;
- als een goedgekeurde pilot raw verwerking aantoonbaar nodig heeft: maximaal 24 uur in een geïsoleerde verwerkingszone om een minimale samenvatting te maken, daarna automatische en verifieerbare verwijdering;
- gekozen pedagogische segmenten: maximaal 30 dagen voor leerling/instructeurnabespreking, tenzij het onderwijsdoel een andere aantoonbare termijn vereist;
- minimale les-/leerpuntsamenvatting zonder exacte locatie: maximaal 90 dagen als werkhypothese, daarna verwijderen of opnieuw onderbouwen;
- incident-/bezwaarbevriezing: alleen specifiek, gelogd, juridisch vastgesteld en met eigen vervaldatum;
- providercoördinaten/-routes nooit langer dan de toepasselijke Googlevoorwaarden.

Deze 24/30/90-dagentermijnen zijn **conservatieve producthypothesen voor een eventuele pilot**, geen wettelijke normen. De DPIA moet aantonen waarom iedere termijn nodig is; korter of helemaal niet opslaan heeft voorkeur.

### 7.7 Transparantie en audit

Informeer afzonderlijk over opname, sensoren/precisie, afleidingen, ontvangers, performanceverbod, bewaartermijnen, rechten, Google/SDK's, on-device verwerking en gevolgen van niet-deelnemen. Een leerling of instructeur mag niet onverwacht ontdekken dat een gewone kaartweergave een routearchief heeft gemaakt.

Audit start/stop, ingest, transformatie, raw delete, view, share/export, correctie, legal hold en definitieve delete zonder routepayload in het auditlog.

## 8. Vergelijking van de vier categorieën

| Aspect                      | A. Afspraaklocatie                | B. Berekende route                          | C. Live locatie                    | D. Opgenomen route                      |
| --------------------------- | --------------------------------- | ------------------------------------------- | ---------------------------------- | --------------------------------------- |
| Werkelijke beweging gemeten | Nee                               | Nee                                         | Ja, actueel                        | Ja, historisch                          |
| Eerste release              | Ja, beperkt                       | Ja, geminimaliseerd                         | Nee                                | Nee                                     |
| Student ziet                | Eigen afspraak                    | Eigen ETA/advies                            | Hooguit grove eigen aankomststatus | Alleen eigen goedgekeurde samenvatting  |
| Werkgever ziet              | Planning                          | Conflict/ETA                                | Alleen beperkte dispatchuse case   | Niet standaard                          |
| Raw precisiedata bewaren    | Alleen tijdelijk/provider-TTL     | Nee                                         | Nee, alleen actieve stream         | Nee; pilot max 24 uur als bewezen nodig |
| Werknemersmonitoringrisico  | Laag–middel, contextafhankelijk   | Middel bij performancehergebruik            | Hoog                               | Hoog                                    |
| DPIA-indicatie              | Screening                         | Screening; DPIA bij profiling/schaal        | Sterk                              | Sterk                                   |
| OR/PVT-indicatie            | Bij personeelsregeling beoordelen | Bij controle-/performancegebruik beoordelen | Voor activatie beoordelen          | Voor activatie beoordelen               |
| Off buiten werk             | Niet van toepassing op tracking   | Niet van toepassing op tracking             | Harde automatische stop            | Geen background recording               |
| Default                     | Need-to-know                      | Alleen afgeleide velden                     | Uit                                | Uit                                     |

## 9. Transparantie- en toestemmingsontwerp

### 9.1 Privacy notice

De algemene en in-context informatie moet minstens verklaren:

- welke categorie actief is; “locatiefuncties” is te vaag;
- doelen, grondslag/legitimate-interestafweging waar relevant;
- data en bron: gebruiker, toestel, Google, planning;
- ontvangers/rollen, inclusief Google en eventuele subleveranciers;
- EEA-/internationale doorgiften en waarborgen volgens de vastgestelde dataflow;
- exacte retentie per categorie;
- geautomatiseerde voorstellen en menselijke override;
- rechten en route via rijschool/NXTDRIVE/Google;
- gevolgen/alternatief, bijvoorbeeld meeting point of handmatige planning;
- contact/DPO/privacycontact en klachtenmogelijkheid.

Google EEA Terms vereisen daarnaast verwijzingen naar de toepasselijke Google Maps end-user terms en Google Privacy Policy. Voer een aparte cookie-/terminal-accessscan uit voor de werkelijk geladen web-SDK/widget; een API-contract alleen beantwoordt niet automatisch of voor browserstorage/cookies toestemming nodig is.

### 9.2 Toestemming waar gebruikt

Als toestemming na juridische beoordeling geschikt is:

- specifiek per doel/categorie, geen bundeling met algemene voorwaarden;
- vooraf, geïnformeerd, aantoonbaar en even gemakkelijk in te trekken;
- geen nadeel bij weigering waar toestemming “vrij” moet zijn;
- withdrawal stopt toekomstige verzameling en activeert het vastgestelde deleteproces;
- aparte beoordeling voor minderjarigen en werknemers.

Gebruik toestemming niet als cosmetische laag boven een verplichte werknemersfeature. Als de werkgever de feature feitelijk vereist, moet de echte grondslag en proportionaliteit worden beoordeeld.

## 10. Rechten, juistheid en governance

### 10.1 Rechtenworkflow

Het datamodel moet locatiecategorie, tenant, betrokken leerling/instructeur, bron en retentie vindbaar maken. Definieer:

- hoe een tenant een verzoek ontvangt en NXTDRIVE als verwerker instrueert;
- wanneer NXTDRIVE of Google een zelfstandig aanspreekpunt is;
- hoe place/providerdata en caches worden gevonden/verwijderd;
- hoe correctie van een adres doorwerkt zonder oude routecaches te laten voortbestaan;
- hoe bezwaar of beperking live/recorded verwerking technisch stopt;
- hoe exports geen andere leerlingen/instructeurs of Google-secrets bevatten;
- hoe wettelijke uitzonderingen/retentieplichten door een bevoegde persoon worden beoordeeld.

### 10.2 Governance-eigenaren

| Besluit                               | Vereiste eigenaar                                         |
| ------------------------------------- | --------------------------------------------------------- |
| Doel en productnoodzaak per categorie | Product + tenantvertegenwoordiging                        |
| Grondslag, rollen, notice, transfers  | Legal/privacy                                             |
| DPIA en mitigaties                    | Verwerkingsverantwoordelijke met privacy/security/product |
| OR/PVT/werknemersproces               | Werkgever/HR/legal                                        |
| Google EEA-contract en Maps notices   | Contracteigenaar/legal                                    |
| Technische toegang/retentie/delete    | Engineering/security                                      |
| Usage en privacyveilige observability | Platform/FinOps/privacy                                   |
| Incident en datalekbeoordeling        | Security/privacy/tenant                                   |

NXTDRIVE moet tenants geen checkbox “AVG-compliant” tonen. Het product kan wel configuratie, documentatie, defaults, audit en verwerkersinformatie leveren waarmee de tenant zijn eigen verantwoordingsplicht invult. Zie de AP-uitleg over [verantwoordingsplicht](https://autoriteitpersoonsgegevens.nl/nl/onderwerpen/algemene-informatie-avg/verantwoordingsplicht).

## 11. Verplichte beslissingen vóór ontwikkeling/productie

### Voor A en B

- bevestigde rollen, grondslag en tenant-/Google-notices;
- exacte actorzichtbaarheid en moment waarop instructeur het adres ziet;
- providerdata versus user-confirmed data in het schema;
- retentie/delete per record/cache/audit;
- EEA Places-“With any Map”-beoordeling;
- DPIA-screening en LIA waar relevant;
- studentalternatief voor het woonadres;
- geen performancehergebruik;
- rechtenworkflow en minderjarigenbeoordeling.

### Aanvullend voor C

- afzonderlijke DPIA met resterend risico goedgekeurd;
- OR/PVT/arbeidsrechtelijk traject afgerond waar toepasselijk;
- grondslag per instructeur/student, zonder afhankelijkheid van fictief vrije werknemerstoestemming;
- frequentie, precision, tijdvenster, ontvangers en incidentoverride;
- hard off-hours-/backgroundverbod;
- geen standaard historie en getest deletionpad;
- native/browser Permissions Policy en OS-permissies in lijn met de notice.

### Aanvullend voor D

- bewezen pedagogisch doel dat niet met minder ingrijpende data kan;
- on-device/minimale variant als eerste optie;
- aparte DPIA en werknemers-/leerlingbeoordeling;
- verbod op verborgen performance-/discipline-/AI-traininghergebruik;
- raw en derived retention met automatische verificatie;
- toegang, correctie, bezwaar, export en delete voor beide betrokkenen;
- pilotstopcriteria en onafhankelijke evaluatie.

## 12. Privacy-go/no-go

Release mag alleen categorieën activeren waarvan doel, rollen, grondslag, zichtbaarheid, retentie, Googlevoorwaarden, notices, rechten, beveiliging en audit zijn goedgekeurd en technisch getest.

Concreet aanbevolen:

- **A gepland adres:** go na genoemde basisgates;
- **B berekende route:** go met minimale duration/distance/status, korte cache en menselijke planner;
- **C live:** no-go tot afzonderlijke DPIA/OR/privacyrelease;
- **D recorded:** no-go; alleen een later, afgeschermd en aantoonbaar noodzakelijk pilotbesluit.

Bij twijfel moet NXTDRIVE minder verzamelen en planning zonder live of opgenomen locatie bruikbaar houden.

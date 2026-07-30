# Kosten- en verbruiksscenario's Google Maps Platform

**Peildatum:** 30 juli 2026  
**Valuta:** USD, exclusief btw, wisselkoers en overige cloudkosten  
**Status:** transparant rekenmodel, geen offerte

## 1. Uitkomst

In het voorgestelde gebruik is niet de kaart, maar de **Compute Route Matrix Pro-elementen** de eerste en grootste kostenpost. Route Optimization wordt daarna relevant. In alle drie basisscenario's blijven Autocomplete, Place Details, Address Validation, Dynamic Maps en individuele Compute Routes onder hun eigen maandelijkse kosteloze SKU-drempel.

| Scenario              | Kern zonder optimalisatie | + SingleVehicle-optimalisatie | FleetRouting in plaats van SingleVehicle | Verbruiksband laag–hoog |
| --------------------- | ------------------------: | ----------------------------: | ---------------------------------------: | ----------------------: |
| Kleine rijschool      |                     $0,00 |                         $0,00 |                                    $0,00 |             $0,00–$0,00 |
| Middelgrote rijschool |                    $55,60 |                        $55,60 |                                  $104,80 |           $2,80–$164,00 |
| Grote rijschool       |                   $478,00 |                       $560,00 |                                  $844,00 |       $214,00–$1.241,25 |

De band is geen statistisch betrouwbaar interval: hij maakt zichtbaar hoe het bedrag reageert op andere productkeuzes en gebruiksintensiteit. Voor interne budgettering is een eerste maandelijkse waarschuwingsband van circa **$0–25**, **$5–200** en **$250–1.500** verdedigbaar, totdat productiemetingen een forecast mogelijk maken. Een budgetalert stopt het verbruik niet; een afdwingbaar plafond vereist quota en applicatielimieten.

De map-loadregels zijn een voorwaardelijk kostenmodel. `09-security-architecture.md` adviseert voor de eerste release geen interactieve Google-kaart zolang het CSP-besluit niet is genomen. Bij die releasekeuze zijn Dynamic Maps map loads dus nul; de route-/adreskosten blijven ongewijzigd.

## 2. Tariefbasis

De berekening gebruikt de actuele [Google Maps Platform-prijslijst](https://developers.google.com/maps/billing-and-pricing/pricing) en [SKU details](https://developers.google.com/maps/billing-and-pricing/sku-details).

| Product/SKU                                    | Billable unit       | Maandelijkse kosteloze drempel | Eerste betaalde band per 1.000 |
| ---------------------------------------------- | ------------------- | -----------------------------: | -----------------------------: |
| Dynamic Maps                                   | map load            |                         10.000 |                          $7,00 |
| Maps SDK Android                               | gebruik/map load    |                      onbeperkt |                          $0,00 |
| Places Autocomplete Requests                   | request             |                         10.000 |                          $2,83 |
| Place Details Essentials IDs Only              | event               |                      onbeperkt |                          $0,00 |
| Place Details Essentials                       | event               |                         10.000 |                          $5,00 |
| Address Validation Pro, standalone             | succesvolle request |                          5.000 |                         $17,00 |
| Address Validation Enterprise, sessieafsluiter | succesvolle request |                          1.000 |                         $25,00 |
| Geocoding Essentials                           | event               |                         10.000 |                          $5,00 |
| Compute Routes Essentials                      | succesvolle request |                         10.000 |                          $5,00 |
| Compute Routes Pro                             | succesvolle request |                          5.000 |                         $10,00 |
| Compute Route Matrix Essentials                | response-element    |                         10.000 |                          $5,00 |
| Compute Route Matrix Pro                       | response-element    |                          5.000 |                         $10,00 |
| Route Optimization SingleVehicle               | shipment in request |                          5.000 |                         $10,00 |
| Route Optimization FleetRouting                | shipment in request |                          1.000 |                         $30,00 |
| Navigation Request                             | destination         |                          1.000 |                         $25,00 |
| Traffic Layer                                  | geen aparte SKU     |                              — |             onder Dynamic Maps |
| MarkerClusterer                                | geen Google-SKU     |                              — |    alleen client/hostingkosten |

Voor grotere volumes gelden progressief lagere staffels. In het hoge grote scenario passeert Matrix Pro 100.000 maandelijkse elementen: 95.000 betaalde elementen vallen dan in de eerste band van $10 en 5.600 in de volgende band van $8. De kosteloze drempels zijn **SKU-specifiek**, niet één gecombineerd krediet.

Google aggregeert gebruik voor prijsstaffels en kosteloze caps over projecten die aan hetzelfde billing-account zijn gekoppeld. Een berekening alsof iedere tenant zijn eigen kosteloze cap krijgt, onderschat daarom het marginale SaaS-bedrag wanneer NXTDRIVE één gedeeld billing-account gebruikt.

## 3. Scenarioaannames

De drie opgegeven bedrijfsgroottes zijn:

| Scenario | Instructeurs | Actieve studenten | Lessen per lesdag |
| -------- | -----------: | ----------------: | ----------------: |
| Klein    |            3 |               150 |                25 |
| Middel   |           15 |               750 |               120 |
| Groot    |           75 |             4.000 |               600 |

Het basisscenario gebruikt de volgende expliciete aannames:

- 22 lesdagen per maand;
- maandlessen \(L = 22 \times lessenPerDag\);
- nieuwe of gewijzigde adressessies \(S = \lceil 10\% \times studenten + 5\% \times L \rceil\);
- 4 Autocomplete-requests per adressessie;
- 90% van adressessies eindigt in Place Details Essentials;
- 30% van die geselecteerde adressen krijgt daarnaast standalone Address Validation Pro;
- maandelijkse map loads \(M = \lceil 22 \times (1{,}5 \times instructeurs + 0{,}25 \times lessenPerDag) + 10\% \times studenten \rceil\);
- Compute Routes Pro voor 25% van alle lessen;
- Compute Route Matrix Pro: 4 elementen per les;
- optioneel: één SingleVehicle-optimalisatie per instructeur per lesdag, waarbij ieder lesbezoek één factureerbare shipment is.

Het model gebruikt bewust Pro voor traffic-aware routes en matrices. Voor een planning ver vooruit kan Essentials volstaan; voor conflictcontrole kort voor vertrek is verkeersinformatie functioneel waardevoller. Een hybride keuze kan het bedrag dus verlagen.

De aannames tellen geen herhaalde retries, testverkeer, dashboards of ongeautoriseerd gebruik mee. Staging krijgt eigen credentials en quota en moet in de forecast als aparte, gemeten verbruikscategorie worden meegenomen.

## 4. Baseline-volume

| Eenheid per maand                     | Klein | Middel |  Groot |
| ------------------------------------- | ----: | -----: | -----: |
| Lessen / Route Optimization-shipments |   550 |  2.640 | 13.200 |
| Adressessies                          |    43 |    207 |  1.060 |
| Autocomplete-requests                 |   172 |    828 |  4.240 |
| Place Details Essentials              |    39 |    187 |    954 |
| Address Validation Pro                |    12 |     57 |    287 |
| Dynamic Maps map loads                |   252 |  1.230 |  6.175 |
| Compute Routes Pro-requests           |   138 |    660 |  3.300 |
| Compute Route Matrix Pro-elementen    | 2.200 | 10.560 | 52.800 |
| SingleVehicle OptimizeTours-requests  |    66 |    330 |  1.650 |
| SingleVehicle-shipments               |   550 |  2.640 | 13.200 |

## 5. Baseline-berekening

### 5.1 Kleine rijschool

Alle SKU's blijven onder hun eigen drempel:

- Matrix Pro: 2.200 < 5.000 → $0;
- SingleVehicle: 550 < 5.000 → $0;
- ook Maps, Routes, Places en Address Validation blijven onder hun drempel.

**Totaal: $0,00 per maand.**

Dat nulbedrag is geen reden om limieten achterwege te laten: een keylek, clientretryloop of onbegrensde matrix kan de drempel snel overschrijden.

### 5.2 Middelgrote rijschool

- Matrix Pro: \((10.560 - 5.000) / 1.000 \times \$10 = \$55,60\);
- SingleVehicle: 2.640 < 5.000 → $0;
- overige gemodelleerde SKU's → $0.

**Kern: $55,60; met SingleVehicle eveneens $55,60.**

Wanneer hetzelfde probleem onnodig als FleetRouting wordt gemodelleerd:

- FleetRouting: \((2.640 - 1.000) / 1.000 \times \$30 = \$49,20\);
- totaal: $55,60 + $49,20 = **$104,80**.

### 5.3 Grote rijschool

- Matrix Pro: \((52.800 - 5.000) / 1.000 \times \$10 = \$478,00\);
- SingleVehicle: \((13.200 - 5.000) / 1.000 \times \$10 = \$82,00\);
- overige baseline-SKU's → $0.

**Kern: $478,00; met SingleVehicle: $560,00.**

Als dezelfde shipments als FleetRouting worden aangerekend:

- \((13.200 - 1.000) / 1.000 \times \$30 = \$366,00\);
- totaal: $478,00 + $366,00 = **$844,00**.

Dit toont waarom het aantal voertuigen in de Route Optimization-request een product- en kostbesluit is. Splits een reëel multi-vehicleprobleem niet kunstmatig op als dat slechtere of ongeldige planningen oplevert, maar gebruik FleetRouting ook niet voor onafhankelijk te optimaliseren dagen van één instructeur.

## 6. Lage en hoge verbruiksband

### 6.1 Lage band

Aannames:

- 2 Autocomplete-requests per sessie;
- 75% Place Details en 10% standalone validatie;
- 50% van de baseline-map loads;
- Compute Routes voor 10% van de lessen;
- 2 Matrix Pro-elementen per les;
- geen Route Optimization.

| Scenario | Dominante berekening                   |  Bedrag |
| -------- | -------------------------------------- | ------: |
| Klein    | 1.100 matrixelementen, onder cap       |   $0,00 |
| Middel   | \((5.280 - 5.000) \times \$10/1.000\)  |   $2,80 |
| Groot    | \((26.400 - 5.000) \times \$10/1.000\) | $214,00 |

### 6.2 Hoge band

Aannames:

- 6 Autocomplete-requests per sessie;
- 100% Place Details en 50% standalone validatie;
- 2× baseline-map loads;
- Compute Routes Pro voor 50% van de lessen;
- 8 Matrix Pro-elementen per les;
- SingleVehicle-optimalisatie van tweemaal het maandelijkse lesvolume.

| SKU-kosten                          |     Klein |      Middel |         Groot |
| ----------------------------------- | --------: | ----------: | ------------: |
| Dynamic Maps                        |     $0,00 |       $0,00 |        $16,45 |
| Compute Routes Pro                  |     $0,00 |       $0,00 |        $16,00 |
| Compute Route Matrix Pro            |     $0,00 |     $161,20 |       $994,80 |
| SingleVehicle                       |     $0,00 |       $2,80 |       $214,00 |
| Autocomplete / Details / Validation |     $0,00 |       $0,00 |         $0,00 |
| **Totaal**                          | **$0,00** | **$164,00** | **$1.241,25** |

Voor het grote Matrix-volume zijn de $994,80 als volgt opgebouwd:

- 95.000 betaalde elementen in de band tot 100.000: \(95.000 \times \$10/1.000 = \$950,00\);
- 5.600 elementen in de volgende band: \(5.600 \times \$8/1.000 = \$44,80\).

## 7. Sessiepricing en Address Validation

Autocomplete-kosten kunnen niet betrouwbaar worden voorspeld door alleen het aantal keystrokes te tellen. NXTDRIVE moet per sessie een nieuwe token gebruiken en meten hoe de sessie eindigt. Volgens [Autocomplete session pricing](https://developers.google.com/maps/documentation/places/web-service/session-pricing):

- Place Details Essentials als terminator: requests 1–12 worden per request gefactureerd, request 13+ valt onder kosteloze session usage, plus de Details-SKU;
- Address Validation als terminator: de Autocomplete-requests vallen onder kosteloze session usage, maar validatie wordt Address Validation Enterprise;
- afgebroken/ongeldige sessies: iedere Autocomplete-request wordt per stuk afgerekend;
- Place Details IDs Only is geen geldige prijsbeëindiging en maakt voorgaande requests dus niet kosteloos.

Het basisscenario modelleert **Place Details Essentials als sessieafsluiter plus een losse Address Validation Pro-call voor 30%**. Dit is een ontwerpaanname, geen algemene aanbeveling dat twee calls altijd goedkoper of functioneel beter zijn.

Als iedere basissessie in plaats daarvan rechtstreeks met Address Validation Enterprise zou eindigen, blijft klein en middel onder de 1.000-eventsdrempel. Groot heeft 1.060 validaties en zou voor die SKU circa \((1.060 - 1.000) \times \$25/1.000 = \$1,50\) kosten; de Autocomplete-requests in geldige sessies zijn dan session usage. De functionele respons, bewaartermijnen en het hoogste gezamenlijke accountverbruik moeten de keuze bepalen.

## 8. Niet opgenomen, maar prijsrelevant

### Navigation SDK

Als iedere les één in-app navigation destination wordt:

| Scenario | Destinations | Navigation-kosten |
| -------- | -----------: | ----------------: |
| Klein    |          550 |             $0,00 |
| Middel   |        2.640 |            $41,00 |
| Groot    |       13.200 |           $305,00 |

Dit gebruikt 1.000 kosteloze destinations en $25 per 1.000 daarna. Guidance en reroutes naar dezelfde aangevraagde bestemming tellen volgens Google niet als nieuwe destination. Navigation is niet in de kernprijs opgenomen omdat externe navigatie de aanbevolen eerste fase is.

### Geocoding

Geocoding is als import/fallback bedoeld. Het model bevat geen bulkimport. Een migratie van 50.000 unieke legacy-adressen zou, als alle calls factureerbare Geocoding Essentials-events zijn en er geen ander accountverbruik is, ruwweg \(40.000 \times \$5/1.000 = \$200\) kosten. Plan imports met dagquota, deduplicatie en menselijke behandeling van ambigue resultaten.

### Cloud- en ontwikkelkosten

Niet inbegrepen zijn onder meer:

- NXTDRIVE-compute, egress, database, cache en observability;
- ontwikkel-, privacy-, security- en supporturen;
- Google Cloud Logging/Monitoring buiten kosteloze allocaties;
- test- en stagingverbruik;
- valuta-, belasting- en contractwijzigingen;
- incidentverbruik door gelekte keys of misbruik.

## 9. Kostenbeheersing

### Producttechniek

- Maak alleen een matrix over vooraf geselecteerde kandidaten en kap oorsprongen × bestemmingen vóór de call af.
- Meet **matrixelementen** en **optimization shipments**, niet alleen HTTP-requests.
- Gebruik Essentials voor planning ver vooruit; vernieuw alleen nabije/conflicterende relaties met traffic-aware Pro.
- Cache actuele trafficresultaten kort en tenantbewust; dedupliceer gelijktijdige identieke calls.
- Houd één mapinstantie binnen de SPA-route in leven; voorkom loader-/remountloops.
- Debounce Autocomplete, start pas na voldoende tekens en beëindig sessies correct.
- Valideer alleen bij create/update/import of een routefout, niet bij iedere view.
- Vraag geen Places Pro/Enterprise-velden op zonder expliciete productentitlement.
- Maak optimalisatie adviserend en pas alleen opnieuw toe als inputs werkelijk veranderden.

### Google Cloud

- Scheid staging en productie in projecten/credentials en geef staging veel lagere quota.
- Stel per API/SKU quota in waar Google dat ondersteunt; een budget is alleen een alarm.
- Configureer budgetmeldingen op bijvoorbeeld 50%, 80%, 100% en forecast, naar product én operations.
- Monitor plotselinge veranderingen per credential, API, SKU en responsecode.
- Activeer alleen gebruikte API's en beperk iedere key.

Zie [cost management](https://developers.google.com/maps/billing-and-pricing/manage-costs) en [reporting and monitoring](https://developers.google.com/maps/reporting-and-monitoring/monitoring).

## 10. Tenantmetering en premiumgrenzen

Meet vóór toepassing van gedeelde credits minimaal:

- tenant, product, SKU, request count;
- map loads, Autocomplete-requests en geldige/afgebroken sessies;
- Place Details hoogste veldklasse;
- route requests en matrixelementen;
- optimization requests, vehicles en shipments;
- navigation destinations;
- cache hit/miss, retry en foutcategorie;
- datum/uur voor prijsversie en forecast.

Log hierbij geen adressen, queries, coördinaten, place IDs, polylines, session tokens of keys. Een intern usage ledger kan pseudonieme tenant-ID, SKU, eenheidsaantal, tijdvak en prijsversie bevatten.

Aanbevolen entitlement:

- **kern:** beperkte kaart, adres zoeken/bevestigen, losse ETA;
- **planning add-on:** traffic-aware conflictcontrole en begrensde kandidatenmatrix;
- **optimization premium:** waypoint-/SingleVehicle-/FleetRouting-optimalisatie;
- **navigation premium:** ingebouwde Navigation SDK;
- **live/recorded location:** geen prijsfeature voordat privacy- en werknemersmedezeggenschapsbesluiten zijn afgerond.

Voor doorbelasting moet NXTDRIVE vooraf kiezen of gedeelde kosteloze caps centraal blijven, pro rata worden verdeeld of niet in tenantprijzen worden verwerkt. Rapporteer zowel bruto gebruik als werkelijk accountbedrag; anders veranderen tenantkosten kunstmatig wanneer een andere tenant de gezamenlijke drempel passeert.

## 11. Beslispunten

Voor een pilot moeten product en finance goedkeuren:

1. Welke planningsmomenten Essentials versus Pro gebruiken.
2. De maximale matrixelementen per actie, tenant en maand.
3. Wanneer SingleVehicle functioneel volstaat en wanneer FleetRouting nodig is.
4. Of Address Validation standalone of als Autocomplete-terminator wordt gebruikt.
5. Hoe gedeelde caps en staffelkorting aan tenants worden toegerekend.
6. De quota, budgetalerts en automatische feature-degradatie per omgeving.
7. De prijs waarop premiumlimieten en fair-use worden gebaseerd.

Alle getallen moeten na een meetpilot van ten minste één volledige planningscyclus worden vervangen door p50/p95-verbruik en een maandforecast. De op dat moment geldende Google-prijslijst is leidend.

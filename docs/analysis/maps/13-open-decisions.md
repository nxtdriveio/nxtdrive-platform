# Open besluiten

Dit document bevat alleen besluiten die niet betrouwbaar uit code of documentatie kunnen worden afgeleid. De aanbevolen standaard maakt autonome voorbereiding mogelijk, maar activeert geen brede integratie zonder product-ownerselectie.

## Product owner — blokkeert de geselecteerde scope

| Besluit                                                       | Aanbevolen standaard                                                                                         | Alternatieven en gevolg                                                                                                                           | Blokkeert            |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| 1. Wat is de eerste productbelofte?                           | “Betrouwbaar ophaalpunt, volgende locatie, externe navigatie en ruimtelijk planinzicht.”                     | Eerst alleen datakwaliteit verlaagt risico maar toont minder zichtbare waarde; meteen optimalisatie vergroot afhankelijkheden en kosten te vroeg. | MVP                  |
| 2. Is woonadres een ander concept dan ophaalpunt?             | Ja: twee relaties die naar hetzelfde locatie-record mógen wijzen.                                            | Eén veld is eenvoudiger maar faalt bij school/werk/tijdelijke pickup en vergroot privacygebruik van woonadres.                                    | MAP-01/10/13         |
| 3. Welke adressen vereisen echte validatie?                   | Vestiging, CBR-catalogus en hoofd-/correspondentieadres; tijdelijke pickup alleen bij twijfel/beleid.        | Alles valideren kost meer en geeft schijnzekerheid; niets valideren laat operationele fouten bestaan.                                             | MAP-03/kosten        |
| 4. Mag een leerling een gepubliceerde pickup direct wijzigen? | Nee: bevestigen of wijzigingsverzoek; planner/instructeur accepteert.                                        | Direct wijzigen is sneller maar kan routeconflicten en late verrassingen veroorzaken.                                                             | MAP-14/16/32         |
| 5. Wat is de canonieke kaartplek?                             | Kaartweergave/tab in `/backoffice/planning-board`, plus later een compacte uitzonderingswidget op dashboard. | Apart `/backoffice/planning/kaart` dupliceert state; algemeen dashboard heeft te weinig operationele ruimte.                                      | MAP-30/31            |
| 6. Welke gebruikers krijgen de dagkaart?                      | Planners, tenant admins en bevoegde branchmanagers binnen bestaande scopes.                                  | Alle medewerkers vergroot dataminimalisatie- en adreslek-risico.                                                                                  | MAP-30/31/security   |
| 7. Is reistijd een waarschuwing of blokkade?                  | Berekend onhaalbaar = policygestuurde blocker; geschat/onbekend = waarschuwing + bevestiging.                | Altijd blokkeren maakt provideruitval bedrijfskritisch; altijd waarschuwen voorkomt geen onhaalbare planning.                                     | MAP-32               |
| 8. Welke tenantbuffer geldt per afspraaktype/regio?           | Configureerbaar met conservatieve default en expliciete override-reden.                                      | Eén universele buffer is eenvoudiger maar operationeel onnauwkeurig.                                                                              | MAP-25/32/62         |
| 9. Welke CBR-locatiebron en beheerder zijn leidend?           | Handmatig gecontroleerde catalogus met officiële bronlink, geldigheid en tenantoverride.                     | Automatisch scrapen is fragiel en juridisch/operationeel ongewenst.                                                                               | MAP-60–63            |
| 10. Wordt route-intelligentie premium?                        | Basisconflictcontrole met inbegrepen fair-use; matrixvolume, traffic en optimalisatie als premium/overage.   | Alles premium remt datakwaliteit; alles onbeperkt inbegrepen maakt kosten onbeheersbaar.                                                          | Entitlements/pricing |
| 11. Welke pilottenants en succescriteria gelden?              | 1 kleine + 1 middelgrote tenant, 4–6 weken, expliciete kosten-, correctie-, fout- en tijdswinstmetrics.      | Alleen interne demo bewijst multi-tenant werkbaarheid niet; brede release is te risicovol.                                                        | MAP-03/14/30/34      |
| 12. Welke kaartstijl/branding is nodig?                       | Functioneel en white-label-neutraal; kleur per instructeur en status, geen zware tenant-specifieke basemap.  | Volledige branded map styling verhoogt test-/supportlast en kan betekenis van statuskleuren verstoren.                                            | MAP-30/31            |

## Techniek en operations — blokkeert fase 0

| Besluit                                                         | Aanbevolen standaard                                                                                                                   | Benodigde eigenaar                   |
| --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| 13. Bestaand of nieuw Google Cloudproject onder EER-voorwaarden | Behandel de voorgenomen brede wijziging conservatief als nieuwe/materieel gewijzigde integratie; laat contracteigenaar dit bevestigen. | Engineering lead + legal/procurement |
| 14. Projectscheiding                                            | Afzonderlijke staging- en productieprojecten; waar operationeel mogelijk ook client/servergebruik scheiden voor blast radius.          | Platform/security                    |
| 15. Serverauthenticatie                                         | OAuth 2.0 waar de gebruikte Maps-webservice dit ondersteunt; anders aparte API-key met API- en vaste egress-IP-restrictie.             | Platform/security                    |
| 16. Kostenbudgetten                                             | Hard tenant entitlement + zachte productwaarschuwing + Cloudbudgetalert; definieer bedragen vóór pilot.                                | Product + finance + platform         |
| 17. Toegestane cache/opslag                                     | Per API/SKU een versioned data-handling register; Place ID apart behandelen; eigen klantcorrecties en providercontent labelen.         | Legal/privacy + engineering          |
| 18. Open-datafallback                                           | PDOK/BAG voor Nederlandse adresnormalisatie/geocoding als te onderzoeken fallback; Haversine + tenantbuffers blijft routefallback.     | Architecture/product                 |
| 19. SLO bij provideruitval                                      | Kernplanning blijft bruikbaar; routestatus wordt `UNKNOWN/ESTIMATED`, niet stil `OK`; kaart en autocomplete degraderen naar tekst.     | Operations/product                   |
| 20. Migratietempo                                               | Nullable relaties + read adapter + batchpreview; pas na reconciliatie bron van waarheid omzetten.                                      | Data owner/engineering               |

## Privacy, legal en medewerkersvertegenwoordiging — blokkeert fase 4

| Besluit                        | Aanbevolen standaard                                                                                                                                                                                                                           | Benodigde eigenaar         |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| 21. Doel live locatie          | Geen live locatie activeren zolang een specifiek, noodzakelijk doel niet overtuigend beter is dan “onderweg”-status + route-ETA.                                                                                                               | Product + privacy/legal    |
| 22. Grondslag medewerkersdata  | Niet automatisch op toestemming baseren; arbeidsrechtelijke en AVG-beoordeling documenteren.                                                                                                                                                   | Legal/privacy              |
| 23. DPIA                       | DPIA-screening vóór live GPS of routeopname; volledige DPIA wanneer screening hoog risico aanwijst.                                                                                                                                            | DPO/privacy owner          |
| 24. Medezeggenschap            | Bepaal OR/PVT-/arbeidsrechtelijke instemmings- of adviesbehoefte vóór pilot.                                                                                                                                                                   | HR/legal                   |
| 25. Buiten-werktijdgrens       | Technisch onmogelijk maken dat tracking buiten expliciete werksessie doorloopt; zichtbare indicator en stopactie.                                                                                                                              | Product/security/privacy   |
| 26. Bewaartermijnen            | Afsprakadres volgens afspraak-/dossierdoel; routeberekening kort/cached volgens provider- en productbeleid; live punt zeer kort; opgenomen route alleen indien apart goedgekeurd en zo kort mogelijk. Exacte termijnen niet uit code afleiden. | Privacy/legal + data owner |
| 27. Zichtbaarheid              | Leerling ziet hoogstens toegewezen instructeurstatus/ETA voor eigen gepubliceerde afspraak; werkgever alleen doelgebonden operationele view; geen onbeperkte historische medewerkerkaart.                                                      | Product/privacy            |
| 28. Analyticsverbod            | Geen individuele ranglijst of heimelijke beoordeling op lege kilometers, routekeuze, snelheid of locaties.                                                                                                                                     | Product/HR/privacy         |
| 29. Subverwerkers en doorgifte | Bevestig actuele Google-contracten, regio-/transferinformatie, DPA en verwerkingsregister vóór productie.                                                                                                                                      | Legal/procurement/privacy  |

## Commercieel — vóór premiumintroductie

| Besluit                 | Aanbevolen standaard                                                                                                  | Benodigde eigenaar    |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------- | --------------------- |
| 30. Inbegrepen gebruik  | Definieer per pakket map loads, autocomplete-sessies, route- en matrixelementen met fair-use.                         | Product + finance     |
| 31. Overagegedrag       | Geen onverwachte doorbelasting; eerst waarschuwing, vervolgens gecontroleerde fallback of expliciet pakketupgradepad. | Product + finance     |
| 32. Optimalisatiemodule | Pas prijzen nadat MAP-36 tijd-/kilometerwinst in een pilot meetbaar aantoont.                                         | Product owner         |
| 33. Tenantinzage        | Toon bruikbare gebruiksmeter per feature, niet de ruwe Google-SKU-complexiteit.                                       | Product + engineering |

## Besluiten die bewust níet meer open zijn in dit advies

- Interne turn-by-turnnavigatie wordt niet gebouwd (MAP-29).
- Vermeende toets-/examenroutes worden niet als product aangeboden (MAP-46).
- Live tracking is geen afhankelijkheid voor Foundation, adresflows, planbordkaart, reistijdcontrole of optimalisatie.
- Een handmatige adrescorrectie en provideruitvalfallback zijn verplichte kernpaden.
- De centrale planningpreview en commitcontrole, niet de kaartclient, beslissen over reistijdconflicten.

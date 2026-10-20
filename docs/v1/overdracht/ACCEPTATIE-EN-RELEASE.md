# Acceptatie en releasebewijs

Voer deze controles uit op de echte V1-staging met gescheiden testtenants en testaccounts. Gebruik geen echte ontvangers of betaalmiddelen voor testacties. Leg per scenario datum, build-SHA, testdata, resultaat en bewijs vast. Een test uit de demo is een bruikbaar domeinvoorbeeld, geen vervanging van server-/integratietests.

## Functionele acceptatiematrix

| ID | Scenario | Vereist bewijs |
| --- | --- | --- |
| A01 | Intake tweemaal converteren of request herhalen | Eén leerlingdossier en behouden intakekoppeling |
| A02 | Uitnodiging → activatie → login | Eigen account, juiste tenant, geen gelekte toegang via URL-ID |
| A03 | Instructeur met eigen en andermans leerling | Eigen data toegestaan; andere data via UI én directe API geweigerd |
| A04 | Tweede tenant probeert bekende ID van eerste tenant | Geen gegevens of wijziging; RLS/autorisatie daadwerkelijk getest |
| P01 | Kwartier aanklikken, duur kiezen en buffer toevoegen | Juiste voorinvulling; buffer blokkeert tijd zonder tegoed te verbruiken |
| P02 | Twee planners boeken tegelijk dezelfde auto/instructeur | Eén geldige uitkomst; tweede gebruiker krijgt begrijpelijk conflict |
| P03 | Slepen én formulierverplaatsing | Dezelfde validaties; touch/keyboardalternatief werkt |
| P04 | Vorige/volgende afspraak, privéblok en verplaatsing naar andere instructeur | Beide nieuwe reisdelen én achterblijvend gat opnieuw beoordeeld |
| P05 | Buurafspraak verandert na groene reiscontrole | Oude controle wordt niet blind geaccepteerd |
| P06 | Geen coördinaten of routingprovider valt uit | Onbekend/te beoordelen; nooit automatisch haalbaar |
| P07 | Annuleren: reden ontbreekt, vrijgeven, belasten en proefleskosten | Verplichte reden; correcte aparte gevolgen voor minuten/geld |
| P08 | Annulering dubbel versturen en later corrigeren | Eén mutatie; audit en herleidbare tegenboeking |
| P09 | Nederlandse feestdagen, zomertijd en daggrens | Juiste dag/tijdpresentatie; geen onbedoelde blokkade |
| L01 | Extra ophaallocatie aanvragen en goedkeuren | Limiet en goedkeuringsstatus; coördinaten van geselecteerd resultaat |
| L02 | Standaardadres aanpassen met bestaande afspraak | Bestaande afspraak behoudt eigen locatie |
| L03 | Ophaalverzoek goedkeuren terwijl planning intussen wijzigt | Opnieuw beoordelen/weigeren; oude afspraak blijft intact tot geldige commit |
| R01 | Voorbereiding met oude doelen, reflectie en leervraag | Herkomst zichtbaar; geen oude score als nieuwe waarneming |
| R02 | Beoordeeld / geoefend / niet behandeld | Drie onderscheiden gegevens en correcte voortgang |
| R03 | Gewone les met twee of drie doelen afronden | Circa 60 seconden in representatieve mobiel/tablet-praktijktest; gemeten resultaat |
| R04 | Concept opslaan, afsluiten, opnieuw openen, verbindingsverlies | Concept behouden of expliciet niet opgeslagen; geen schijnsucces |
| R05 | Afronden en publicatie opnieuw proberen | Minuten eenmaal; kaart eenmaal gepubliceerd; geldige reflectiestatus |
| R06 | Leerling bekijkt kaart/export/API | Alleen gepubliceerde informatie; interne notities afwezig in payload |
| R07 | Gepubliceerde kaart reviseren | Reden, auteur, tijd, oude versie en reflectierelatie behouden |
| R08 | Geannuleerde les proberen af te ronden/publiceren | Server weigert conflicterende statusovergang |
| E01 | Examenrijpheid zonder voldoende bewijs | Geen verzonnen score; expliciet onvoldoende informatie |
| E02 | Toets wisselt leerling/soort | Afhankelijke checklist/feedback opnieuw beoordeeld, geen oude vinkjes |
| E03 | Toetsmoment versus logistiek tijdvak | Beide tijden correct en wijziging/annulering consistent met agenda |
| F01 | Eén auto aan twee instructeurs; één instructeur aan twee auto's | Toewijzingen werken; gedeelde boekingsconflicten beschermd |
| F02 | Zakelijk → privé → zakelijk op één dag | Drie aansluitende, herleidbare segmenten |
| F03 | A: 22.333 km; B corrigeert naar 22.433 km | Verplichte reden, zichtbaar 100-km-verschil, opvolgactie voor A |
| F04 | A levert later eindstand aan; verzoek/retry dubbel | Geen dubbel tellen, B’s stand blijft geldig, eventueel restverschil apart |
| F05 | Gelijktijdige ritstart/eindstand en onderhoud | Geen ongeldige dubbele actieve rit; onderhoud blokkeert alle gebruikers |
| F06 | Schademelding door toegewezen instructeur | Correct voertuig, melder, status en afgeschermde bijlagen |
| M01 | Betaling/webhook tweemaal ontvangen | Een betaling en één toegekende hoeveelheid minuten |
| M02 | Open factuur gedeeltelijk crediteren | Geen restitutie van niet ontvangen geld; geen onbedoelde minuten |
| M03 | Tegoed bij reservering, uitvoering, annulering en correctie | Ledger sluit; saldo herleidbaar tot gebeurtenissen |
| C01 | Afspraak commit slaagt, mailprovider faalt | Afspraak blijft staan; outbox toont fout en herstelt zonder dubbele afspraak |
| C02 | Herinnering na annulering of veranderde voorkeur | Geen vervallen of ongewenst dubbel bericht |
| C03 | Verplaatsen na voorbereiding | Taakdeadline correct en voorbereiding waar nodig opnieuw open |
| I01 | Import bevat dubbele/ongeldige regels en ongeverifieerde adressen | Preview en duidelijke fouten; geen stille half-import |
| I02 | Privacyexport/anonimiseren | Geen interne gegevens; afgeleide contactgegevens meegenomen; bewaarbeleid gerespecteerd |
| U01 | Elke rolpagina en hoofdhandeling | Geen doodlopende knop of alleen succes-toast zonder opgeslagen gevolg |
| U02 | Smalle/korte viewport, zoom, tabletrotatie, schermtoetsenbord | Modals binnen viewport; scrollbarruimte; sluit- en actieknoppen bereikbaar |
| U03 | Toetsenbord, focus, labels, contrast, reduced motion | Alle kernflows uitvoerbaar zonder muis; geen focus achter modal |
| U04 | Tutorial hervatten, overslaan, zoeken en modalstap | Voortgang apart; geen automatische zakelijke mutaties |

## Technische en operationele poorten

1. Typecheck, lint waar geconfigureerd, productiebuild en relevante domein-/integratietests slagen.
2. Authenticatie, tenantisolatie en autorisatie zijn getest via echte serverroutes/RLS, inclusief ingetrokken rechten en directe ID-toegang.
3. Idempotentie en gelijktijdige writes worden met twee onafhankelijke requests of sessies getest.
4. Migratiebaseline is reproduceerbaar op de bedoelde bestaande stagingconfiguratie. Datareset en privéconfiguratieherstel zijn aantoonbaar gescheiden.
5. Echte mail/push/betaling/routing werken in gecontroleerde testmodus met de hergebruikte configuratie. Ontbrekende optionele integraties zijn zichtbaar gedegradeerd en blokkeren niet ongemerkt kernflows.
6. Readiness controleert benodigde afhankelijkheden. Logs bevatten bruikbare foutcontext en correlatie-ID’s, geen secrets of onnodige persoonsgegevens.
7. Bestaande credentialrecords kunnen na herstel worden ontsleuteld; deployment heeft geen benodigde env-variabelen verloren.
8. Back-up én restorepad zijn gecontroleerd. Verwijderlijst en archiefrefs zijn geverifieerd.
9. Kritieke mobiele handelingen en 60-secondenflow zijn handmatig met representatieve gebruikers getoetst. Meet en publiceer het resultaat intern.
10. Performance wordt op representatieve mobiele verbinding en dataset beoordeeld. Spreek meetbare budgetten af vóór de release; een grote demobundle wordt niet ongewijzigd als norm genomen.

## Omschakeling naar productie

Leg vooraf het exacte doel, release-SHA, schema-/configuratieversie en tijdvenster vast. Pauzeer oude automatische deploys en schrijftaken waar nodig. Maak een actuele afgeschermde back-up en controleer credentialbehoud. Voer alleen de vastgestelde applicatiereset uit, pas de V1-baseline toe, herstel benodigde configuratie en beheerrechten, deploy en controleer readiness. Test daarna login, tenanttoegang en de belangrijkste keten met een gecontroleerd account.

Hervat V1-jobs pas na functioneel bewijs. Monitor vanaf de eerste echte handelingen planningconflicten, outboxfouten, betaalwebhooks, ledgerafwijkingen, onvolledige leskaarten en integratiefouten. Beperk de eerste uitrol tot een beheersbare pilot; leg afhandeling van incidenten en support vast.

## Terugval en opruimen

Definieer de reden om terug te vallen, wie uitvoert en welke code/schema/configuratie samen worden teruggezet. Bij terugzetten van een database moet duidelijk zijn hoe nieuwe writes sinds de back-up worden veiliggesteld of verzoend. Benoem verwacht herstelpunt en hersteltijd op basis van werkelijk geteste back-ups.

De oude symlinkrollback alleen is onvoldoende na schemawijziging. Verwijder benodigde oude releases, configuratie of back-ups pas nadat de afgesproken herstelperiode en controles zijn afgerond. De GitHub-archiefbranch blijft als kennisbron bestaan.

## Bewijs bij oplevering

Lever een overzicht van geslaagde scenario’s, echte koppelingen, resterende demo-/beperkingspunten, gebruikte releases en configuratiebronnen zonder waarden. Voeg beheerinstructies toe voor uitnodigen, tenantinstellingen, integratiefouten, back-up/restore, migraties, deployment en terugval. Noteer ook welke toekomstige functies bewust buiten V1 zijn gebleven.

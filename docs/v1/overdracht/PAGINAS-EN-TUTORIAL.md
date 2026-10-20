# Pagina’s en interactieve tutorial

Gepubliceerd in prototypeversie 12. [Open de tutorial](https://nxtdrive-v1-studio.dgwebserv.chatgpt.site/tutorial).

82 stappen begeleiden de gebruiker langs alle 54 bestaande rolpagina’s plus publieke intake/activatie. De broncatalogus bevat doel, handelingen, verwacht resultaat, toelichting en waar nodig een dynamische bestemming. De tutorial telt bewust bekeken uitleg; hij beweert niet dat een zakelijke handeling is uitgevoerd.

## Pagina-inventaris

| Rol | Routes |
| --- | --- |
| Platformadmin | `/platform/vandaag`, `/platform/rijscholen`, `/platform/operatie`, `/platform/instellingen`, `/platform/ontdek` |
| Rijschoolbeheer | `/beheer/vandaag`, `/beheer/opvolging`, `/beheer/planning`, `/beheer/leerlingen`, `/beheer/intakes`, `/beheer/locaties`, `/beheer/examens`, `/beheer/aanvragen`, `/beheer/wagenpark`, `/beheer/afspraaktypen`, `/beheer/financien`, `/beheer/team`, `/beheer/beschikbaarheid`, `/beheer/import`, `/beheer/instellingen`, `/beheer/taken`, `/beheer/communicatie`, `/beheer/privacy`, `/beheer/ontdek` |
| Instructeursapp | `/instructeur/vandaag`, `/instructeur/agenda`, `/instructeur/autos`, `/instructeur/meer`, `/instructeur/opvolging`, `/instructeur/locaties`, `/instructeur/examens`, `/instructeur/leerlingen`, `/instructeur/taken`, `/instructeur/les`, `/instructeur/aanvragen`, `/instructeur/instellingen`, `/instructeur/berichten`, `/instructeur/beschikbaarheid`, `/instructeur/communicatie`, `/instructeur/privacy`, `/instructeur/ontdek` |
| Leerlingapp | `/leerling/vandaag`, `/leerling/lessen`, `/leerling/voortgang`, `/leerling/meer`, `/leerling/financien`, `/leerling/instellingen`, `/leerling/berichten`, `/leerling/beschikbaarheid`, `/leerling/locaties`, `/leerling/examens`, `/leerling/communicatie`, `/leerling/privacy`, `/leerling/ontdek` |

Daarnaast: `/intake`, `/activeren?leerling=<uitgenodigde leerling>`, de dynamische leswerkruimte `/instructeur/les/<les-id>`, de centrale `/tutorial` en `/<rol>/tutorial`.

De route `/instructeur/les` is het overzicht/ingang. Een les-ID wordt uit de actuele toegestane demogegevens gekozen. Ontbreekt een geschikt voorbeeld, dan toont de tutorial wat eerst moet worden aangemaakt. Er wordt niets automatisch uitgenodigd, geboekt, betaald of gepubliceerd.

## Bediening

- Start de volledige route of kies een van de zes thema’s: publiek, platform, beheer, instructeur, leerling of werkplek.
- Zoek in de inhoudsopgave en open een losse stap in het echte scherm.
- Gebruik Wijs aan, Open juiste scherm, Vorige, Begrepen & volgende, Overslaan en Pauzeren.
- Bij een modal staat de uitleg in dezelfde focusscope en start hij ingeklapt om ruimte te geven aan het formulier.
- Voortgang gebruikt een afzonderlijke lokale tutorialregistratie. Tutorial opnieuw beginnen wist niet de zakelijke demogegevens.
- Demo wijzigen of herstellen is een afzonderlijke, bewuste actie buiten de tutorialvoortgang.

## Intake en activatie — 3 stappen

### 01. Een persoonlijke start

**Doel:** De publieke intake verzamelt de informatie die nodig is voor een passende kennismaking. De rijschool hoeft dezelfde vragen niet opnieuw te stellen.

**Basisroute:** `/intake` · **ID:** `public-intake`

1. Vul fictieve contactgegevens in.
2. Kies schakel of automaat en geef je ervaring aan.
3. Leg beschikbare dagen en tijden vast en selecteer een adresresultaat.
4. Lees de samenvatting en verstuur alleen als je de demo-intake wilt bewaren.

**Resultaat:** De intake verschijnt bij de rijschool. Er is nog geen rijles gereserveerd.

**Let op:** Een getypt adres is pas bruikbaar voor routes na selectie of expliciete verificatie.

### 02. Van aanvraag naar kennismaking

**Doel:** Een intake wordt opgevolgd door een medewerker. Contact, proefles en inschrijving horen bij hetzelfde dossier.

**Basisroute:** `/beheer/intakes` · **ID:** `public-followup`

1. Open een intake.
2. Leg een contactnotitie en opvolgdatum vast.
3. Maak het gekoppelde leerlingdossier aan.
4. Bekijk vervolgens proeflesplanning en de uitnodiging.

**Resultaat:** De aanvraag blijft gekoppeld aan de leerling; opnieuw converteren maakt geen tweede dossier.

Dynamisch voorbeeld: `lead`; wordt uit de actuele demogegevens bepaald.

### 03. De leerlingomgeving activeren

**Doel:** De leerling krijgt een eigen ingang met afspraken, leskaarten en facturen.

**Basisroute:** `/activeren` · **ID:** `public-activation`

1. Lees de voorbeeldinformatie.
2. Activeer alleen wanneer je dit als demo wilt uitproberen.
3. Open daarna de leerlingapp.
4. Ontbreekt een uitnodiging? Zet deze eerst klaar in het leerlingdossier.

**Resultaat:** De geselecteerde leerling ziet zijn eigen omgeving. De demo gebruikt geen echt wachtwoord of echte e-mail.

**Let op:** De tutorial nodigt niemand automatisch uit en verandert geen accountstatus.

Dynamisch voorbeeld: `activation`; wordt uit de actuele demogegevens bepaald.

## Platformadmin — 6 stappen

### 04. Het platform in één oogopslag

**Doel:** Platformbeheer houdt rijscholen en de operationele gezondheid in beeld. De dagelijkse leerlingadministratie ligt bij de rijschool.

**Basisroute:** `/platform/vandaag` · **ID:** `platform-home`

1. Bekijk de aantallen rijscholen en instructeurs.
2. Open een rijschool vanuit de lijst.
3. Bekijk de onboarding van Vooruit Rijschool.

**Resultaat:** Je ziet waar aandacht nodig is en kunt vanuit het overzicht door naar de juiste functie.

**Let op:** De platformstatistieken zijn voorbeeldgegevens.

### 05. Rijscholen beheren

**Doel:** Iedere rijschool is een afzonderlijke organisatie met een eigen status en beheerder.

**Basisroute:** `/platform/rijscholen` · **ID:** `platform-schools`

1. Zoek op rijschoolnaam.
2. Filter op Actief of Onboarding.
3. Open Beheren om de organisatie te bekijken.

**Resultaat:** Je werkt vanuit één organisatiecontext en ziet de voortgang van de inrichting.

### 06. Een nieuwe rijschool onboarden

**Doel:** De onboarding begeleidt de stap van organisatie naar een geactiveerde werkplek.

**Basisroute:** `/platform/rijscholen` · **ID:** `platform-newschool`

1. Bekijk de velden voor een nieuwe rijschool.
2. Maak desgewenst een fictieve organisatie aan.
3. Open daarna de organisatie en doorloop beheerder, modules en activatie.

**Resultaat:** De rijschool wordt in de demo toegevoegd. Uitnodiging en activatie zijn gesimuleerd.

### 07. Mislukte verwerking opvolgen

**Doel:** Een technische fout moet zichtbaar en opnieuw uitvoerbaar zijn zonder onnodig leerlinggegevens te openen.

**Basisroute:** `/platform/operatie` · **ID:** `platform-operations`

1. Bekijk de melding over de lesherinnering.
2. Klik desgewenst Opnieuw proberen.
3. Controleer de nieuwe status en de activiteit.

**Resultaat:** De demomelding verandert naar afgehandeld. Een herhaling maakt geen tweede rijles.

**Let op:** Dit scherm is geen live infrastructuurmonitor.

### 08. Platformvoorkeuren

**Doel:** Hier staan algemene signaleringen en de onderhoudsmelding.

**Basisroute:** `/platform/instellingen` · **ID:** `platform-settings`

1. Bekijk de beschikbare V1-modules.
2. Wijzig eventueel de onderhoudsmelding.
3. Pas de voorkeuren toe en bekijk het effect in een andere omgeving.

**Resultaat:** De onderhoudsmelding is zichtbaar in de demo; zij blokkeert geen toegang.

### 09. Alle omgevingen verkennen

**Doel:** Het functieoverzicht verbindt de vier omgevingen. Gebruik het om een losse functie terug te vinden.

**Basisroute:** `/platform/ontdek` · **ID:** `platform-explore`

1. Filter op een rol.
2. Zoek bijvoorbeeld op RIS of factuur.
3. Open de gevonden functie.

**Resultaat:** De juiste pagina of detailflow opent met dezelfde demogegevens.

## Rijschoolbeheer — 27 stappen

### 10. De werkdag van de rijschool

**Doel:** Vandaag combineert planning, leerlingen, administratie en open opvolgacties.

**Basisroute:** `/beheer/vandaag` · **ID:** `beheer-home`

1. Bekijk de lessen van vandaag.
2. Open een lesrij voor de afspraakdetails.
3. Bekijk Slimme opvolging en recente gebeurtenissen.

**Resultaat:** Vanuit één overzicht bereik je het dossier, de planning en de volgende actie.

### 11. Een actielijst die meebeweegt

**Doel:** Open taken worden afgeleid uit de administratie: voorbereiding, intakes, aanvragen, locaties, reflecties en betalingen.

**Basisroute:** `/beheer/opvolging` · **ID:** `beheer-actions`

1. Filter op een soort actie.
2. Open een actie.
3. Voer de betreffende handeling uit en keer terug naar de lijst.

**Resultaat:** Een afgehandelde actie verdwijnt of krijgt de volgende relevante status.

**Let op:** Begrepen in deze tutorial betekent alleen dat je de uitleg hebt gelezen.

### 12. Intakes opvolgen

**Doel:** Een goede intake helpt de rijschool een passend traject te bespreken.

**Basisroute:** `/beheer/intakes` · **ID:** `beheer-intakes`

1. Bekijk de intakekaarten.
2. Open de samenvatting en gestructureerde voorkeuren.
3. Sla een contactactie op.
4. Koppel de intake aan een dossier en bevestig eventueel de inschrijving.

**Resultaat:** Contactgeschiedenis en leerlinggegevens blijven verbonden.

Dynamisch voorbeeld: `lead`; wordt uit de actuele demogegevens bepaald.

### 13. Proefles en inschrijving

**Doel:** Een proefles heeft een eigen afspraaktype en kan apart worden gefactureerd.

**Basisroute:** `/beheer/intakes` · **ID:** `beheer-trial`

1. Open het gekoppelde leerlingdossier vanuit een intake.
2. Bekijk Proeflesfactuur en Proefles plannen.
3. Controleer prijs, minuten en of het type tegoed verbruikt.
4. Volg de uitnodiging en inschrijving.

**Resultaat:** Een proefles krijgt een echte plek in de demoagenda en een herleidbare factuur.

**Let op:** Een annuleringsfactuur voegt geen lesminuten toe.

Dynamisch voorbeeld: `lead`; wordt uit de actuele demogegevens bepaald.

### 14. Leerlingen zoeken en beheren

**Doel:** Het overzicht geeft toegang tot contact, instructeur, opleiding en tegoed.

**Basisroute:** `/beheer/leerlingen` · **ID:** `beheer-students`

1. Zoek een leerling.
2. Open het dossier.
3. Bekijk de historie en actuele lesstand.
4. Gebruik gegevens aanpassen voor de juiste instructeur en locatie.

**Resultaat:** Het dossier vormt de gemeenschappelijke basis voor planning en leerlingapp.

### 15. Het complete leerlingdossier

**Doel:** In het dossier komen intake, beschikbaarheid, RIS, afspraken en financiën samen.

**Basisroute:** `/beheer/leerlingen` · **ID:** `beheer-dossier`

1. Bekijk Historie, Tegoed en Intake.
2. Open RIS-details en historie.
3. Bekijk of de leerlingomgeving actief is.
4. Open de leerlingapp via het dossier om beide perspectieven te vergelijken.

**Resultaat:** Je kunt dezelfde leerling van intake tot gepubliceerde leskaart volgen.

Dynamisch voorbeeld: `student`; wordt uit de actuele demogegevens bepaald.

### 16. Teamleden en toegang

**Doel:** Actieve instructeurs worden gedeeld door planning, leerlingtoewijzing en wagenpark.

**Basisroute:** `/beheer/team` · **ID:** `beheer-team`

1. Voeg desgewenst een fictief teamlid toe.
2. Accepteer de demo-uitnodiging.
3. Koppel een auto en leerling.
4. Controleer dat de instructeur beschikbaar is in de plankeuzes.

**Resultaat:** Het nieuwe teamlid wordt deel van de bestaande werkstromen.

**Let op:** Draag open afspraken en actieve ritten over vóór deactivatie.

### 17. Auto’s en toewijzingen

**Doel:** Eén auto kan meerdere instructeurs hebben; één instructeur kan meerdere auto’s gebruiken.

**Basisroute:** `/beheer/wagenpark` · **ID:** `beheer-fleet`

1. Bekijk kenteken, transmissie en kilometerstand.
2. Open een auto of voeg er één toe.
3. Selecteer de toegewezen instructeurs.
4. Leg APK, onderhoud en notities vast.

**Resultaat:** De planner biedt de toegewezen, beschikbare auto’s aan die bij de transmissie van de leerling passen.

### 18. Kilometers, correcties en schades

**Doel:** Overdracht tussen instructeurs moet verklaarbaar blijven, ook wanneer iemand een eindstand vergeet.

**Basisroute:** `/beheer/wagenpark` · **ID:** `beheer-fleet-audit`

1. Open de kilometerregistraties van een auto.
2. Bekijk een correctie met reden en het resterende verschil.
3. Controleer de opvolging voor een ontbrekende eindstand.
4. Bekijk schades en onderhoudsgegevens.

**Resultaat:** De actuele stand blijft bekend; een correctie wordt niet stilzwijgend als gereden rit geboekt.

**Let op:** Werk, privé en garage worden als aparte ritdelen bijgehouden.

### 19. Afspraaktypen en annuleringsredenen

**Doel:** De rijschool bepaalt de standaardinstellingen waar instructeurs mee plannen.

**Basisroute:** `/beheer/afspraaktypen` · **ID:** `beheer-types`

1. Bekijk welke typen een leerling en auto nodig hebben.
2. Stel standaardduur, buffer en instructeurstoegang in.
3. Bekijk de voorbereidingstermijn.
4. Beheer de annuleringsredenen en het maximum aan ophaalplekken.

**Resultaat:** Een nieuwe boeking neemt de instellingen over. De buffer wordt niet als lesminuten belast.

### 20. Werktijden en blokkades

**Doel:** Beschikbaarheid begrenst wat boekbaar is. Een blokkade reserveert een concreet tijdvak.

**Basisroute:** `/beheer/beschikbaarheid` · **ID:** `beheer-availability`

1. Selecteer een instructeur en bekijk werkdagen.
2. Bekijk begin- en eindtijd.
3. Open Blokkade of examen en kies een passend bloktype.
4. Controleer de blokkade vervolgens in het planbord.

**Resultaat:** Een botsende les kan niet door dezelfde middelen heen worden gepland.

**Let op:** Een feestdaglabel boven de agenda maakt die dag niet automatisch vrij.

### 21. Dag, week en maand

**Doel:** Het planbord gebruikt kwartierpunten en laat afspraken met hun bezette tijd zien.

**Basisroute:** `/beheer/planning` · **ID:** `beheer-planner`

1. Wissel tussen dag, week en maand.
2. Filter op instructeur en auto.
3. Navigeer naar een andere datum.
4. Klik een kwartier of sleep een afspraak om de wijzigingsflow te openen.

**Resultaat:** De gekozen datum en tijd worden meegenomen naar de afspraakflow.

**Let op:** Slepen vraagt bevestiging en controles; klikken is het alternatief.

### 22. Een afspraak plannen

**Doel:** De boekingsflow controleert leerling, tegoed, auto, beschikbaarheid en reistijd.

**Basisroute:** `/beheer/planning` · **ID:** `beheer-book`

1. Kies eerst een afspraaktype.
2. Controleer starttijd, duur van 10–300 minuten en buffer.
3. Selecteer instructeur, leerling en auto.
4. Controleer ophaal- en eindlocatie en bereken de reistijd.
5. Sla alleen op als je een demoafspraak wilt maken.

**Resultaat:** De afspraak, bevestigingen en voorbereidingstaak worden samen aangemaakt.

### 23. Reistijd aan beide kanten

**Doel:** Er moet genoeg tijd zijn om van de vorige afspraak naar deze afspraak en daarna verder te rijden.

**Basisroute:** `/beheer/planning` · **ID:** `beheer-travel`

1. Bekijk de beschikbare tijd vóór en na de afspraak.
2. Controleer de verwachte eindlocaties.
3. Start de planning- en reistijdcontrole.
4. Lees of het een ORS-route, demoschatting of handmatige beoordeling is.

**Resultaat:** Een onbekende route krijgt geen automatische goedkeuring.

**Let op:** Een verplaatsing controleert ook de verbinding die achterblijft.

Dynamisch voorbeeld: `booking`; wordt uit de actuele demogegevens bepaald.

### 24. Verplaatsen, annuleren en no-show

**Doel:** De afspraakdetails zijn het vertrekpunt voor wijzigingen en de financiële afhandeling.

**Basisroute:** `/beheer/planning` · **ID:** `beheer-change`

1. Open een geplande afspraak.
2. Bekijk Afspraak / ophaallocatie aanpassen.
3. Bekijk Annuleren / no-show afhandelen.
4. Kies bij annuleren een reden en bewust vrijgeven, minuten belasten of factureren.

**Resultaat:** De afspraakstatus, reservering, taak en leerlingmelding blijven op elkaar aansluiten.

**Let op:** Annuleren geeft geen RIS-beoordeling; interne notities blijven intern.

Dynamisch voorbeeld: `planned`; wordt uit de actuele demogegevens bepaald.

### 25. Ophaallocaties goedkeuren

**Doel:** Een extra adres is pas inzetbaar na goedkeuring. Een wijziging van een bestaande afspraak vraagt een aparte planningcontrole.

**Basisroute:** `/beheer/locaties` · **ID:** `beheer-locations`

1. Selecteer een leerling.
2. Beoordeel een nieuwe ophaallocatie met toelichting.
3. Open een wijzigingsverzoek voor een bestaande afspraak.
4. Controleer de reisruimte en bevestig of wijs af.

**Resultaat:** Het oorspronkelijke afspraakadres blijft geldig totdat de wijziging is bevestigd.

### 26. Lesaanvragen behandelen

**Doel:** Leerlingvoorkeuren zijn aanvragen totdat een medewerker een boekbare afspraak bevestigt.

**Basisroute:** `/beheer/aanvragen` · **ID:** `beheer-requests`

1. Bekijk open aanvragen.
2. Lees de voorkeur en toelichting.
3. Open passende momenten of plan handmatig.
4. Controleer de afhandeling na bevestiging.

**Resultaat:** De leerling ziet een bevestigde les en de aanvraag blijft herleidbaar.

### 27. Voorbereiding bewaken

**Doel:** Iedere relevante afspraak krijgt een voorbereidingstaak met een deadline.

**Basisroute:** `/beheer/taken` · **ID:** `beheer-tasks`

1. Filter op open, gereed of alle taken.
2. Open de voorbereiding bij een les.
3. Markeer deze voorbereid zonder de les te starten.
4. Heropen een voorbereiding wanneer dat nodig is.

**Resultaat:** De taakstatus en zichtbare voorbereiding blijven gekoppeld aan de afspraak.

### 28. Opleidingsbesluit en toetsdossier

**Doel:** Rijvaardigheid en praktisch geregelde zaken zijn twee verschillende vragen.

**Basisroute:** `/beheer/examens` · **ID:** `beheer-exams`

1. Selecteer een leerling.
2. Bekijk echte waarnemingen en reflecties.
3. Leg een gemotiveerd instructeursoordeel vast.
4. Open Toetsen & praktisch geregeld.

**Resultaat:** Een oordeel bewaart datum, auteur en de gebruikte leskaartrevisies. Er ontstaat geen automatische slagingskans.

### 29. Toetsen plannen en controleren

**Doel:** Moduletoets, proefexamen, RIS-toets, TTT en examen krijgen ieder een poging en passende checklist.

**Basisroute:** `/beheer/examens` · **ID:** `beheer-checklists`

1. Voeg een toets toe en plan die in de agenda.
2. Bekijk verantwoordelijke en deadline per checklistpunt.
3. Controleer externe starttijd naast het gereserveerde logistieke tijdvak.
4. Leg na afloop uitslag, feedback en eventuele vrijstelling vast.

**Resultaat:** De toets reserveert leerling, instructeur en auto. Oude checklistantwoorden gaan niet over naar een andere leerling.

### 30. Facturen en lestegoed

**Doel:** Geldbedragen en lesminuten worden afzonderlijk bijgehouden. Betalen, verbruiken en reserveren zijn verschillende handelingen.

**Basisroute:** `/beheer/financien` · **ID:** `beheer-finance`

1. Filter op openstaande of gecorrigeerde facturen.
2. Open een factuur.
3. Bekijk de nettofactuur en gekoppelde minuten.
4. Maak desgewenst een pakket of los product aan.

**Resultaat:** Een geslaagde demobetaling voegt de daarvoor bestemde minuten één keer toe.

### 31. Credits en terugbetalingen

**Doel:** Een correctie overschrijft de oorspronkelijke factuur niet. De reden en geld- en minuteneffecten blijven zichtbaar.

**Basisroute:** `/beheer/financien` · **ID:** `beheer-credit`

1. Open Factuur corrigeren.
2. Vul bedrag, terug te nemen minuten en reden in.
3. Bekijk het nieuwe nettobedrag.
4. Verwerk bij een betaalde credit eventueel een demoterugbetaling.

**Resultaat:** Credits, betalingen en terugbetalingen verschijnen in dezelfde historie.

**Let op:** Al verbruikte of gereserveerde minuten kunnen niet zomaar worden teruggenomen.

Dynamisch voorbeeld: `invoice`; wordt uit de actuele demogegevens bepaald.

### 32. Berichten en herhaalpogingen

**Doel:** Bevestigingen, leskaarten, betalingen en herinneringen krijgen een berichtregistratie.

**Basisroute:** `/beheer/communicatie` · **ID:** `beheer-messages`

1. Filter op afleverstatus.
2. Open de inhoud van een bericht.
3. Test eventueel een afleverfout en herhaal hetzelfde bericht.
4. Gebruik de demoklok om een lesherinnering te bekijken.

**Resultaat:** Een herhaalpoging verhoogt het aantal pogingen; zij maakt geen tweede afspraak.

**Let op:** Er worden geen echte berichten verstuurd. E-mail volgt school- en leerlingvoorkeuren.

### 33. Gegevens gecontroleerd overnemen

**Doel:** Import toont vóór het toevoegen welke leerlingen, beginsaldi en afspraken nieuw of ongeldig zijn.

**Basisroute:** `/beheer/import` · **ID:** `beheer-import`

1. Download het voorbeeldbestand.
2. Selecteer een CSV of JSON met fictieve gegevens.
3. Lees de voorvertoning en los fouten op.
4. Bevestig de gecontroleerde import.

**Resultaat:** Bestaande dossiers en saldi worden niet overschreven. Geïmporteerde afspraken krijgen een controletaak.

**Let op:** Onbekende adressen blijven te verifiëren; de import verzint geen coördinaten.

### 34. Export en privacyverzoeken

**Doel:** Een leerling kan inzage of correctie vragen. De rijschool legt vast wat zij daadwerkelijk heeft uitgevoerd.

**Basisroute:** `/beheer/privacy` · **ID:** `beheer-privacy`

1. Selecteer een leerling en download het dossier.
2. Open een ontvangen verzoek.
3. Kies een afhandeling en onderbouw die.
4. Bekijk de afhandelingshistorie.

**Resultaat:** De gedeelde export bevat geen interne instructeursnotities.

**Let op:** Archiveren en anonimiseren zijn bewuste handelingen. Probeer ze alleen op een zelfgemaakt testdossier.

### 35. De basis van de rijschool

**Doel:** Rijschoolgegevens, vestigingsadres, buffer, communicatie en beleid zijn op één plek bereikbaar.

**Basisroute:** `/beheer/instellingen` · **ID:** `beheer-settings`

1. Bekijk het vestigingsadres met adresselectie.
2. Bekijk de schoolbrede e-mail- en herinneringsinstellingen.
3. Pas desgewenst de basisgegevens aan en sla op.
4. Gebruik de snelkoppelingen naar team, afspraaktypen en privacy.

**Resultaat:** Nieuwe handelingen gebruiken de opgeslagen instellingen; bestaande afspraken blijven herleidbaar.

### 36. Elke V1-functie terugvinden

**Doel:** Zoeken in het functieoverzicht helpt bij functies die je niet dagelijks gebruikt.

**Basisroute:** `/beheer/ontdek` · **ID:** `beheer-explore`

1. Zoek op een onderwerp.
2. Filter op een omgeving.
3. Open een functie of keer terug naar de tutorial.

**Resultaat:** Je hoeft de navigatie niet uit je hoofd te leren.

## Instructeursapp — 27 stappen

### 37. Jouw werkdag begint hier

**Doel:** De instructeursapp geeft prioriteit aan de volgende les en zaken die nog aandacht vragen.

**Basisroute:** `/instructeur/vandaag` · **ID:** `instructor-home`

1. Bekijk de eerstvolgende leerling.
2. Open de leswerkruimte.
3. Bekijk de focusdoelen en open opvolging.
4. Controleer welke instructeur actief is onder Weergave.

**Resultaat:** Agenda, leerlingen en auto’s sluiten aan op de gekozen instructeur.

### 38. Je eigen planbord

**Doel:** De agenda gebruikt dezelfde boekingsregels als de rijschool.

**Basisroute:** `/instructeur/agenda` · **ID:** `instructor-agenda`

1. Wissel tussen dag, week en maand.
2. Klik op een vrij kwartier.
3. Bekijk welke afspraaktypen de rijschool voor jou heeft aangezet.
4. Open een bestaande afspraak.

**Resultaat:** Je plant met toegewezen leerlingen en beschikbare auto’s.

### 39. Afspraakdetails en wijziging

**Doel:** Vanuit de afspraak bereik je voorbereiding, verplaatsing, annulering en de route.

**Basisroute:** `/instructeur/agenda` · **ID:** `instructor-appointment`

1. Lees ophaallocatie, tijden en notities.
2. Open de leswerkruimte.
3. Bekijk de wijzigings- en annuleringsmogelijkheden.
4. Controleer dat interne en leerlingnotities herkenbaar gescheiden zijn.

**Resultaat:** Iedere ingang verwijst naar dezelfde afspraak en afhandeling.

Dynamisch voorbeeld: `planned`; wordt uit de actuele demogegevens bepaald.

### 40. Jouw leerlingen

**Doel:** Het overzicht toont leerlingen die aan de actieve instructeur gekoppeld zijn.

**Basisroute:** `/instructeur/leerlingen` · **ID:** `instructor-students`

1. Zoek een leerling.
2. Open de historie.
3. Bekijk beschikbare en gereserveerde minuten.
4. Open de volledige RIS-leskaart.

**Resultaat:** Je kunt snel terugvinden wat eerder is geoefend en wat nu nodig is.

### 41. Voorbereiden met een deadline

**Doel:** Een geplande les heeft een voorbereidingstaak; voorbereid is een andere status dan gestart.

**Basisroute:** `/instructeur/taken` · **ID:** `instructor-tasks`

1. Open een voorbereiding.
2. Bekijk de vorige les en leerlingwens.
3. Markeer voorbereid wanneer je plan klaarstaat.
4. Controleer of de taak uit de open lijst verdwijnt.

**Resultaat:** De les blijft gepland totdat je haar bewust start.

### 42. Twee of drie focusdoelen

**Doel:** De voorbereiding verbindt open leerdoelen, eigen reflectie en een leerwens voor deze afspraak.

**Basisroute:** `/instructeur/les` · **ID:** `instructor-prep`

1. Bekijk de vorige gepubliceerde leskaart.
2. Lees de leerlingwens.
3. Gebruik Slim voorstel overnemen of pas de doelen aan.
4. Markeer voorbereid wanneer de keuzes kloppen.

**Resultaat:** Dezelfde doelen worden bij de leerling zichtbaar. Eerdere scores worden niet opnieuw beoordeeld.

Dynamisch voorbeeld: `workspace`; wordt uit de actuele demogegevens bepaald.

### 43. Route en oefencontext

**Doel:** Een passende oefenopbouw helpt bij je lesvoorbereiding. De instructeur bepaalt de echte wegen en verkeerssituaties.

**Basisroute:** `/instructeur/les` · **ID:** `instructor-route`

1. Open Lesroute voorbereiden.
2. Bekijk de opbouwen Rust & ritme, Meer verkeersinzicht en Zelfstandig onderweg.
3. Bekijk welke oefenmomenten bij de gekozen opbouw horen.
4. Kies alleen een opbouw als je deze bij de demonstratieles wilt bewaren.

**Resultaat:** Je begrijpt het verschil tussen logistieke reiscontrole en een didactische oefenroute.

**Let op:** Dit is een regelgestuurde lesopbouw, geen live navigatie. Logistieke reistijdcontrole staat apart in de afspraakplanning.

Dynamisch voorbeeld: `workspace`; wordt uit de actuele demogegevens bepaald.

### 44. Beoordelen zonder dubbel werk

**Doel:** Per doel geef je bewust aan wat je vandaag hebt gezien. Een oude stap wordt niet automatisch een nieuwe waarneming.

**Basisroute:** `/instructeur/les` · **ID:** `instructor-assess`

1. Start de les alleen als je de demo wilt uitvoeren.
2. Kies per doel: beoordeeld, geoefend of niet behandeld.
3. Kies bij beoordeling de passende instructiestap.
4. Voeg alleen waar nodig context of een korte observatie toe.

**Resultaat:** De registratie onderscheidt nieuwe beoordeling en oefenen zonder nieuwe score.

Dynamisch voorbeeld: `workspace`; wordt uit de actuele demogegevens bepaald.

### 45. Een normale les snel afronden

**Doel:** De samenvatting wordt voorbereid vanuit je keuzes. De instructeur houdt de regie over wat wordt gedeeld.

**Basisroute:** `/instructeur/les` · **ID:** `instructor-finish`

1. Druk in de leswerkruimte op Afronden om de korte samenvatting uit je beoordelingen klaar te zetten.
2. Kies Bereikt, Deels bereikt of Meenemen per doel.
3. Controleer de feedback, reflectiestatus en volgende focus.
4. Bekijk het leerlingvoorbeeld en publiceer bewust.

**Resultaat:** Minuten worden eenmaal verwerkt; alleen de gepubliceerde leskaart gaat naar de leerling.

**Let op:** De flow is ontworpen voor circa 60 seconden bij een normale les met twee of drie doelen; dit vraagt nog een praktijktest.

Dynamisch voorbeeld: `workspace`; wordt uit de actuele demogegevens bepaald.

### 46. De volledige RIS-leskaart

**Doel:** De focuskaart is compact; de volledige kaart bewaart het overzicht over de hele opleiding.

**Basisroute:** `/instructeur/leerlingen` · **ID:** `instructor-ris`

1. Wissel tussen de vier modules.
2. Open een onderdeel voor de betekenis van N en stappen 1–8.
3. Bekijk datum, context en beoordelaar.
4. Leg zo nodig een gemotiveerd modulebesluit of uitzondering vast.

**Resultaat:** Een onbekende stap is geen onvoldoende en scores worden niet tot een slagingspercentage gemiddeld.

Dynamisch voorbeeld: `student`; wordt uit de actuele demogegevens bepaald.

### 47. Een gedeelde kaart corrigeren

**Doel:** Een gepubliceerde leskaart blijft herleidbaar wanneer later iets moet worden aangepast.

**Basisroute:** `/instructeur/les` · **ID:** `instructor-revision`

1. Open een gepubliceerde les.
2. Kies Corrigeren.
3. Controleer de nieuwe leerlingweergave en geef een reden.
4. Bekijk de vorige revisie in de historie.

**Resultaat:** Een revisie overschrijft de eerdere uitleg niet en verwerkt geen tweede lesverbruik.

Dynamisch voorbeeld: `reportWorkspace`; wordt uit de actuele demogegevens bepaald.

### 48. De volgende afspraak slim kiezen

**Doel:** Voorstellen combineren ritme, beschikbaarheid, tegoed, auto en reistijd.

**Basisroute:** `/instructeur/vandaag` · **ID:** `instructor-next`

1. Vergelijk de voorgestelde momenten en hun onderbouwing.
2. Bekijk duur, buffer en reisruimte.
3. Bevestig één passend moment of plan zelf.
4. Laat een moment zoeken wanneer er geen passend voorstel is.

**Resultaat:** Een bevestiging maakt een afspraak; een zoekverzoek komt in de actielijst.

Dynamisch voorbeeld: `student`; wordt uit de actuele demogegevens bepaald.

### 49. Aanvragen van je leerlingen

**Doel:** Een leerling kan voorkeuren of wijzigingen doorgeven zonder direct de agenda te veranderen.

**Basisroute:** `/instructeur/aanvragen` · **ID:** `instructor-requests`

1. Lees de aanvraag en toelichting.
2. Bekijk beschikbare lesmomenten.
3. Bevestig een boekbaar tijdvak.
4. Controleer de aanvraagstatus.

**Resultaat:** Aanvraag en uiteindelijke afspraak blijven aan elkaar gekoppeld.

### 50. Jouw toegewezen auto’s

**Doel:** Hier zie je de auto’s die je mag gebruiken, met technische gegevens en meldingen.

**Basisroute:** `/instructeur/autos` · **ID:** `instructor-cars`

1. Open een toegewezen auto.
2. Bekijk kenteken, transmissie en laatste kilometerstand.
3. Controleer APK, onderhoud en schades.
4. Start alleen een rit in de auto die je werkelijk gebruikt.

**Resultaat:** Planning en ritregistratie gebruiken dezelfde auto-identiteit.

### 51. Werk, privé en garage apart

**Doel:** Elke verandering van ritdoel begint een nieuw ritdeel met een eigen begin- en eindstand.

**Basisroute:** `/instructeur/autos` · **ID:** `instructor-mileage`

1. Begin bijvoorbeeld een zakelijke rit.
2. Eindig deze voordat je een privérit start.
3. Voer de eindstand in en controleer de berekende kilometers.
4. Start het volgende ritdeel met het juiste doel.

**Resultaat:** De dag bestaat uit afzonderlijk verklaarbare ritten.

**Let op:** Een actieve rit kan niet ongemerkt door een tweede bestuurder worden overgenomen.

### 52. Een afwijkende beginstand corrigeren

**Doel:** Wanneer de werkelijke tellerstand afwijkt, leg je het verschil en de reden expliciet vast.

**Basisroute:** `/instructeur/autos` · **ID:** `instructor-correction`

1. Vergelijk de getoonde stand met de teller.
2. Gebruik de correctieactie als die afwijkt.
3. Vul de werkelijke stand en verplichte reden in.
4. Bekijk het verzoek om de vorige rit alsnog af te ronden.

**Resultaat:** Een correctie bewaart het verschil zonder kilometers dubbel aan een bestuurder toe te wijzen.

**Let op:** Voorbeeld: 22.333 wordt 22.433; de 100 km blijven zichtbaar als te verklaren verschil.

### 53. Schade en onderhoud melden

**Doel:** Een voertuigmelding hoort bij de auto, zodat andere toegewezen instructeurs dezelfde informatie zien.

**Basisroute:** `/instructeur/autos` · **ID:** `instructor-damage`

1. Open de auto en bekijk bestaande schades.
2. Maak desgewenst een fictieve schademelding.
3. Beschrijf wat is waargenomen.
4. Controleer de melding in het wagenpark van de rijschool.

**Resultaat:** Rijschool en instructeur werken met dezelfde voertuigregistratie.

### 54. Ophaalverzoeken beoordelen

**Doel:** Een nieuw adres en een ander adres voor een bestaande afspraak hebben elk hun eigen controle.

**Basisroute:** `/instructeur/locaties` · **ID:** `instructor-locations`

1. Bekijk de aanvragen van je leerlingen.
2. Beoordeel een extra adres binnen het werkgebied.
3. Bereken bij een afspraakwijziging beide reisdelen.
4. Bevestig of motiveer waarom verplaatsen nodig is.

**Resultaat:** Na goedkeuring wordt de voorbereiding heropend en krijgt de leerling een bevestiging.

### 55. Examenrijpheid onderbouwen

**Doel:** Het professionele oordeel steunt op echte waarnemingen en open aandachtspunten.

**Basisroute:** `/instructeur/examens` · **ID:** `instructor-exams`

1. Bekijk de bewijsregels en reflecties.
2. Leg Verder oefenen, Beoordelingsrit plannen of Examenrijp volgens instructeur vast.
3. Open het toetsdossier.
4. Controleer checklistpunten en noteer uitslag en vervolg.

**Resultaat:** Oordelen en toetsresultaten bewaren auteur, datum en onderbouwing.

### 56. Niets vergeten tussen de lessen

**Doel:** De actielijst bundelt voorbereiding, leskaarten, reflecties en verzoeken die bij jouw leerlingen horen.

**Basisroute:** `/instructeur/opvolging` · **ID:** `instructor-actions`

1. Filter op een actiesoort.
2. Open een nog te delen leskaart.
3. Bekijk aanvragen of locatiecontroles.
4. Werk de actie op de bijbehorende pagina af.

**Resultaat:** De lijst verandert mee met de handelingen in de app.

### 57. Je werktijden beheren

**Doel:** Je werktijden en blokkades bepalen mede welke nieuwe afspraken mogelijk zijn.

**Basisroute:** `/instructeur/beschikbaarheid` · **ID:** `instructor-availability`

1. Bekijk de dagen en uren.
2. Sla een aanpassing op.
3. Voeg eventueel een privé- of vakantieblokkade toe.
4. Controleer het effect bij een nieuwe boeking.

**Resultaat:** Bestaande afspraken blijven bestaan; nieuwe boekingen volgen de beschikbaarheid.

### 58. Afspraakmeldingen teruglezen

**Doel:** In het berichtoverzicht kun je zien welke bevestigingen bij je afspraken horen.

**Basisroute:** `/instructeur/berichten` · **ID:** `instructor-messages`

1. Open een bericht.
2. Controleer de leerling, locatie en tijd.
3. Ga via Bekijk afspraak naar de actuele afspraak.

**Resultaat:** Een melding geeft context; de afspraakdetails tonen de huidige stand.

### 59. Voorkeuren en aflevering

**Doel:** De communicatiepagina bevat uitgebreide afleverstatussen en persoonlijke voorkeuren.

**Basisroute:** `/instructeur/communicatie` · **ID:** `instructor-communication`

1. Filter berichten op status.
2. Bekijk de inhoud en het aantal pogingen.
3. Bekijk e-mail- en herinneringsvoorkeuren.
4. Probeer desgewenst de demoklok.

**Resultaat:** De demo laat zien waarom een bericht is verstuurd, uitgeschakeld of opnieuw geprobeerd.

### 60. Alle extra functies bij de hand

**Doel:** Meer houdt de dagelijkse navigatie compact en maakt aanvullende onderdelen bereikbaar.

**Basisroute:** `/instructeur/meer` · **ID:** `instructor-more`

1. Bekijk de kaarten voor beschikbaarheid, locaties, toetsen en instellingen.
2. Open een kaart.
3. Keer terug via de appnavigatie.

**Resultaat:** Je vindt ook functies die niet in de onderste navigatiebalk passen.

### 61. Persoonlijke gegevens en instellingen

**Doel:** Je profiel en voorkeuren horen bij de actieve instructeur.

**Basisroute:** `/instructeur/instellingen` · **ID:** `instructor-settings`

1. Bekijk de notificatiekeuzes.
2. Open Profiel aanpassen.
3. Controleer je contactgegevens.
4. Sla alleen op wanneer je de demo wilt wijzigen.

**Resultaat:** De persoonlijke voorkeuren blijven onderscheiden van schoolbrede instellingen.

### 62. Inzage in leerlinggegevens

**Doel:** Je kunt de dossiers van toegewezen leerlingen bekijken en de relevante export gebruiken.

**Basisroute:** `/instructeur/privacy` · **ID:** `instructor-privacy`

1. Selecteer een eigen leerling.
2. Lees wat de export bevat.
3. Bekijk ontvangen privacyverzoeken.
4. Laat administratieve afhandeling bij de rijschool.

**Resultaat:** Interne notities worden niet opgenomen in de gedeelde leerlingexport.

### 63. Je functies opnieuw vinden

**Doel:** Het overzicht helpt je snel terug naar een lesfunctie, ritregistratie of slim voorstel.

**Basisroute:** `/instructeur/ontdek` · **ID:** `instructor-explore`

1. Filter op Instructeur.
2. Zoek op een onderwerp.
3. Open de functie die je wilt oefenen.

**Resultaat:** Iedere kaart brengt je naar een werkende pagina of detailflow.

## Leerlingapp — 16 stappen

### 64. Jouw rijopleiding in beeld

**Doel:** De leerlingapp zet de eerstvolgende les, leerdoelen en actuele voortgang voorop.

**Basisroute:** `/leerling/vandaag` · **ID:** `student-home`

1. Bekijk je volgende afspraak en instructeur.
2. Lees de focusdoelen.
3. Bekijk je beschikbare minuten.
4. Open je les voor de details.

**Resultaat:** Je ziet de gepubliceerde informatie die bij de geselecteerde leerling hoort.

### 65. Komende en eerdere lessen

**Doel:** Je lesoverzicht verbindt de agenda met terugblikken op eerdere lessen.

**Basisroute:** `/leerling/lessen` · **ID:** `student-lessons`

1. Bekijk komende lessen.
2. Open een afspraak.
3. Bekijk de historie en een gedeelde leskaart.
4. Vraag desgewenst een nieuwe les of wijziging aan.

**Resultaat:** Een verzoek verandert de bevestigde afspraak pas na afhandeling.

### 66. Vooraf vertellen wat je wilt oefenen

**Doel:** Een leerwens hoort bij een specifieke komende les en helpt je instructeur voorbereiden.

**Basisroute:** `/leerling/vandaag` · **ID:** `student-wish`

1. Kies de komende les.
2. Beschrijf kort wat je wilt oefenen.
3. Selecteer eventueel RIS-onderdelen.
4. Deel de leerwens.

**Resultaat:** De wens wordt zichtbaar in de voorbereiding van die afspraak.

### 67. Feedback lezen en zelf reflecteren

**Doel:** De instructeur deelt een leskaart; jouw eigen reflectie blijft als jouw antwoord herkenbaar.

**Basisroute:** `/leerling/lessen` · **ID:** `student-report`

1. Lees de samenvatting en besproken onderdelen.
2. Bekijk de volgende focus.
3. Geef aan hoe je de les hebt ervaren.
4. Voeg eventueel een aandachtspunt toe.

**Resultaat:** Reflectie en instructeursbeoordeling blijven naast elkaar zichtbaar.

Dynamisch voorbeeld: `report`; wordt uit de actuele demogegevens bepaald.

### 68. RIS begrijpen

**Doel:** De leskaart beschrijft hoe zelfstandig je onderdelen uitvoert. Een instructiestap is geen rapportcijfer.

**Basisroute:** `/leerling/voortgang` · **ID:** `student-progress`

1. Wissel van module.
2. Open een onderdeel.
3. Lees de betekenis van de huidige stap.
4. Bekijk de gepubliceerde geschiedenis.

**Resultaat:** Je begrijpt wat al is waargenomen en wat nog onbekend is.

### 69. Voorbereiden op een toets of examen

**Doel:** Je ziet het opleidingsadvies en praktische taken die bij jouw toets horen.

**Basisroute:** `/leerling/examens` · **ID:** `student-exams`

1. Lees de onderbouwing bij rijvaardigheid.
2. Open Toetsen & praktisch geregeld.
3. Bekijk taken waarvoor jij verantwoordelijk bent.
4. Geef aan dat je iets klaar hebt; je instructeur controleert.

**Resultaat:** Klaar voor controle en gecontroleerd blijven verschillende statussen.

**Let op:** De app vervangt geen officiële CBR-bevestiging.

### 70. Je vaste en extra ophaalplekken

**Doel:** Extra adressen vragen goedkeuring, zodat je opleiding praktisch planbaar blijft.

**Basisroute:** `/leerling/locaties` · **ID:** `student-locations`

1. Bekijk de vaste plek.
2. Voeg eventueel een extra plek toe met adresselectie.
3. Volg de goedkeuringsstatus.
4. Gebruik een goedgekeurde plek als standaard voor nieuwe afspraken.

**Resultaat:** Bestaande lessen behouden hun bevestigde adres.

### 71. Een andere plek voor één afspraak

**Doel:** Ook een goedgekeurd adres moet op dat specifieke moment in de planning passen.

**Basisroute:** `/leerling/lessen` · **ID:** `student-pickup`

1. Open een komende les.
2. Kies Ophaalplek wijzigen.
3. Selecteer een andere goedgekeurde locatie.
4. Verstuur het verzoek en bekijk de status.

**Resultaat:** Het oude adres blijft bevestigd totdat de instructeur de reisruimte heeft gecontroleerd.

Dynamisch voorbeeld: `planned`; wordt uit de actuele demogegevens bepaald.

### 72. Tegoed en betalingen volgen

**Doel:** Je ziet open facturen, credits en beschikbare minuten zonder zelf financiële correcties te kunnen maken.

**Basisroute:** `/leerling/financien` · **ID:** `student-finance`

1. Bekijk beschikbare, gereserveerde en gebruikte minuten.
2. Open een factuur.
3. Bekijk eventueel een mislukte demobetaling en probeer opnieuw.
4. Controleer het tegoed na een geslaagde demobetaling.

**Resultaat:** Een betaling wordt één keer verwerkt. Er wordt geen echt geld afgeschreven.

### 73. Wanneer kun jij lessen?

**Doel:** De rijschool gebruikt jouw voorkeuren bij slimme vervolgafspraken.

**Basisroute:** `/leerling/beschikbaarheid` · **ID:** `student-availability`

1. Kies beschikbare dagen.
2. Vul begin- en eindtijd in.
3. Sla op.
4. Vraag een les aan als je wilt dat er een moment wordt gezocht.

**Resultaat:** Beschikbaarheid is een voorkeur en nog geen bevestigde afspraak.

### 74. Alles over je afspraken teruglezen

**Doel:** Berichten laten zien wat de rijschool heeft bevestigd of gedeeld.

**Basisroute:** `/leerling/berichten` · **ID:** `student-messages`

1. Bekijk een afspraakbevestiging.
2. Lees een melding over een nieuwe leskaart.
3. Open de bijbehorende afspraak.

**Resultaat:** Je hebt de belangrijke informatie op één plek.

### 75. Jouw berichtvoorkeuren

**Doel:** Appmeldingen blijven bij je dossier; persoonlijke en schoolinstellingen bepalen de e-mailupdates.

**Basisroute:** `/leerling/communicatie` · **ID:** `student-communication`

1. Bekijk je berichtgeschiedenis.
2. Open de inhoud van een bericht.
3. Pas desgewenst e-mail- of herinneringsvoorkeuren aan.

**Resultaat:** De voorkeur hoort bij jouw leerlingprofiel.

### 76. Je gegevens en rechten

**Doel:** Je kunt je gedeelde dossier downloaden en een verzoek aan de rijschool indienen.

**Basisroute:** `/leerling/privacy` · **ID:** `student-privacy`

1. Lees de privacyvoorbeeldinformatie.
2. Download desgewenst je dossier.
3. Kies inzage, correctie of verwijderen.
4. Volg de status en toelichting van de rijschool.

**Resultaat:** Een verzoek wordt geregistreerd en vraagt inhoudelijke afhandeling.

**Let op:** Het prototype gebruikt voorbeeldbeleid, nog geen definitieve privacyverklaring.

### 77. Je profiel beheren

**Doel:** Contactgegevens en voorkeuren moeten kloppen zodat je rijschool je kan bereiken.

**Basisroute:** `/leerling/instellingen` · **ID:** `student-settings`

1. Open je profiel.
2. Controleer naam, e-mail en telefoon.
3. Bekijk de persoonlijke meldingsinstellingen.

**Resultaat:** Profielaanpassingen werken door naar hetzelfde leerlingdossier.

### 78. Meer mogelijkheden ontdekken

**Doel:** De aanvullende pagina’s blijven bereikbaar zonder de basisnavigatie vol te zetten.

**Basisroute:** `/leerling/meer` · **ID:** `student-more`

1. Bekijk de beschikbare kaarten.
2. Open bijvoorbeeld ophaalplekken, toetsen of privacy.
3. Keer terug naar Home.

**Resultaat:** Je kent de korte route naar de minder dagelijkse functies.

### 79. Een functie terugvinden

**Doel:** Gebruik dit overzicht als naslag naast de rondleiding.

**Basisroute:** `/leerling/ontdek` · **ID:** `student-explore`

1. Filter op Leerling.
2. Zoek bijvoorbeeld op RIS of tegoed.
3. Open een functie om deze nog eens te bekijken.

**Resultaat:** Je kunt zelfstandig terugvinden wat je nodig hebt.

## Werkplek en demo — 3 stappen

### 80. Huisstijl, donker en rollen

**Doel:** Met Weergave kun je dezelfde omgeving in beide huisstijlen en verschillende rollen bekijken.

**Basisroute:** `/beheer/vandaag` · **ID:** `shared-appearance`

1. Open Weergave rechtsboven.
2. Wissel NXTDRIVE en Van Dijk.
3. Probeer licht en donker.
4. Kies een andere demo-rol en eventueel een andere leerling of instructeur.

**Resultaat:** De inhoud blijft gelijk terwijl de presentatie en rolcontext veranderen.

**Let op:** De rolwissel is alleen een demofunctie, geen productieautorisatie.

### 81. Zoeken, profiel en meldingen

**Doel:** De header biedt vaste ingangen die op de verschillende pagina’s terugkomen.

**Basisroute:** `/beheer/vandaag` · **ID:** `shared-search`

1. Open de zoekfunctie of gebruik Ctrl/Cmd + K.
2. Zoek een leerling of pagina.
3. Open meldingen via de bel.
4. Bekijk je profiel via de avatar.

**Resultaat:** Veelgebruikte acties hebben op iedere pagina een herkenbare plek.

### 82. Wat de demo wel en niet doet

**Doel:** De demo bewaart je handelingen lokaal en verbindt de verschillende schermen. Voor productie komen serveropslag, echte autorisatie en echte koppelingen erbij.

**Basisroute:** `/beheer/vandaag` · **ID:** `shared-demo`

1. Open Over deze demo via Weergave.
2. Lees welke handelingen gesimuleerd zijn.
3. Gebruik fictieve gegevens bij het oefenen.
4. Herstel de demo alleen als je je lokale wijzigingen wilt verwijderen.

**Resultaat:** Je kunt uitgebreid oefenen en begrijpt welke onderdelen nog naar productie moeten worden vertaald.


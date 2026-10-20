# NXTDRIVE V1 — functionele specificatie

Dit document beschrijft de overeengekomen uitkomst voor de echte V1. Het prototype is de UI-referentie; de productie-implementatie moet dezelfde uitkomsten met echte persistentie, toegangscontrole en integraties leveren. Een zichtbaar demoscenario betekent niet automatisch dat de serverimplementatie al bestaat.

## Rollen en productgrens

| Omgeving | Verantwoordelijkheid | Toegangsgrens |
| --- | --- | --- |
| Platformadmin | Rijscholen, onboarding, modules/configuratie, operationele uitzonderingen | Platformrechten zijn expliciet; toegang tot tenantgegevens is begrensd en geaudit |
| Rijschoolbeheer | Leerlingen, team, planning, voertuigen, financiën, instellingen en opvolging | Alleen de eigen rijschool |
| Instructeur | Eigen agenda, toegewezen leerlingen/auto’s, lessen, beoordelingen, kilometerregistratie en meldingen | Alleen toegewezen gegevens en toegestane acties |
| Leerling | Eigen afspraken, leervragen, leskaarten, reflectie, locaties, tegoed en facturen | Eigen gepubliceerde gegevens; geen interne notities |

Eerste doelgroep: Nederlandse rijscholen met circa 1–10 instructeurs, rijbewijs B, schakel en automaat. Multi-tenant vanaf het begin. Eén operationele organisatiecontext per rijschool in V1; geen ingewikkelde franchise- of multi-vestigingsbediening. Een centrale rolwissel met voorbeeldpersonen hoort alleen bij de demo.

## De tien V1-werkstromen

Onderstaande indeling borgt de in de huidige prototypeversie aangevulde kern. Het is een functionele ordening, geen claim dat een eerder chatbericht precies deze tien koppen gebruikte.

### 1. Intake, opvolging, dossier en activatie

- Publieke intake: contact, schakel/automaat, eerdere ervaring, gewenste start/ritme, gestructureerde dagen/tijden en geselecteerde ophaallocatie.
- Adresinvoer geeft zoekresultaten op straat/postcode/plaats. Alleen een geselecteerd en gevalideerd resultaat heeft bruikbare coördinaten; losse tekst krijgt de status te verifiëren.
- Beheer ziet nieuwe aanvragen, contactnotities, opvolgdatum en actuele status. Eenzelfde intake wordt eenmaal omgezet naar één gekoppeld leerlingdossier, ook bij dubbel klikken of opnieuw proberen.
- Een proefles is een afzonderlijk afspraak-/financieel scenario; accountactivatie en inschrijving worden niet onbedoeld door het openen van een intake uitgevoerd.
- Het dossier bevat instructeur, transmissie, beschikbare tijden, ophaalplek, traject, toegang en relevante leerinformatie.
- Uitnodiging, verzending, activatie en ingelogde toegang zijn aparte gebeurtenissen. De productie-uitnodiging gebruikt een echte veilige activatieflow; geen openbare rolwissel of hardcoded leerling-ID.
- Dezelfde gegevens worden niet opnieuw gevraagd wanneer ze al geldig in intake/dossier staan.

### 2. Planning, beschikbaarheid en reiscontrole

- Dag-, week- en maandweergave voor rijschool en instructeur. 15-minutensnapping bij klikken en slepen. Een bruikbaar formulier is altijd beschikbaar als alternatief voor drag-and-drop, ook op touch en met toetsenbord.
- Klik op een leeg kwartier opent afspraak toevoegen met dat tijdstip vooraf ingevuld. Starttijd blijft wijzigbaar. Duurselectie: 10 t/m 300 minuten, stappen van 10.
- Beheer kan afspraaktypen toevoegen/bewerken, voor instructeurs aan/uit zetten, leerling verplicht/optioneel maken, standaardduur en buffer instellen. Voorbeelden: rijles, proefles, tussentijdse toets, examen, privé en onderhoud.
- Buffer is bezette tijd, geen lesduur en geen automatisch te verrekenen lestegoed. Toon bijvoorbeeld “08:15–09:05 afspraak; bezet tot 09:15”.
- Instructeur zoekt via autocomplete uitsluitend eigen leerlingen. Na selectie worden beschikbaar tegoed, goedgekeurde voorkeursophaalplek en relevante gegevens zichtbaar.
- Controleer overlappende instructeur, gedeelde auto, beschikbaarheid, type-/transmissiegeschiktheid, onderhoud/blokkades en leerlingplanning server-side. Een auto kan meerdere instructeurs toegewezen hebben maar niet tegelijk voor conflicterende afspraken beschikbaar zijn.
- Controleer vertrek en aankomst ten opzichte van de vorige én volgende activiteit, inclusief privéblokkades, eindlocaties en buffers. Bij verplaatsing controleer je ook het gat dat in de oude planning ontstaat en beide betrokken instructeurs/auto’s.
- Toon de berekening begrijpelijk: beschikbare reistijd, verwachte reistijd, marge, herkomst en ouderdom van de schatting. Gebruik nooit een successtatus wanneer coördinaten, route of actuele planning ontbreken.
- Een reiscontrole heeft een planningsversie/fingerprint. Als een buurafspraak verandert vóór opslaan, moet de server opnieuw controleren. Een eerder groen vinkje is geen blijvende boekingsgarantie.
- Afspraakdetails tonen leerling/type, middelen, tijd, buffer, locatie, voorbereidingsstatus en relevante acties. Verplaatsen werkt ook zonder slepen.
- Annuleren vereist een reden uit de door de rijschool beheerde lijst; een aanvullende interne notitie blijft intern. De beheerder kan redenen toevoegen/bewerken/deactiveren, met behoud van historische betekenis.
- Het formulier toont vóór bevestiging het financieel gevolg: reservering vrijgeven/terugboeken of duur in rekening brengen. Een proefles kan een geldfactuur krijgen zonder lesminuten te creëren.
- Nationale feestdagen staan als label boven de dag. Ze zijn niet automatisch een werkblokkade; beschikbaarheid bepaalt of lessen mogelijk zijn. Kalenderlogica en uitzonderingsregels worden met actuele officiële kalendergegevens gevalideerd.
- Bevestiging/verplaatsing/annulering leiden na commit tot de juiste leerlingmelding, e-mail en taakwijzigingen, zonder dubbele of tegenstrijdige berichten.

### 3. Locaties en wijzigingen van bestaande afspraken

- Eén vaste ophaallocatie en een beheersbaar aantal extra locaties per leerling. De rijschool bepaalt een limiet en beoordeelt afstand/werkgebied.
- Per locatie: label, canoniek adres, postcode/plaats, coördinaten, bron/provider-ID waar beschikbaar, verificatiestatus, goedkeuringsstatus en historie.
- Een leerling kan een extra locatie voorstellen. Rijschool of bevoegde instructeur keurt goed of wijst af met uitleg. Een nieuw voorstel wordt niet meteen de ophaalplek van een bestaande afspraak.
- Wijziging van het standaardadres beïnvloedt alleen toekomstige keuzes; bestaande afspraken behouden hun opgeslagen locatie.
- Voor een locatieaanpassing op een reeds geplande les ontstaat een afspraakgebonden verzoek. Controleer opnieuw beide reisdelen en actuele planning. Toon “past”, “past niet” of “nog niet te beoordelen”, met reden en waar nodig verplaatsvoorstel.
- Bij goedkeuring worden afspraak en bericht coherent aangepast; bij afwijzing blijft het oorspronkelijke adres intact. Een stale goedkeuring wordt geweigerd of opnieuw beoordeeld.
- Geocoding/routing is providerafhankelijk achter adapters. Bewaar voldoende gegevens om geen tekstadres telkens opnieuw te raden.

### 4. RIS 2.0: voorbereiding, uitvoering, publicatie en reflectie

De RIS-module is een leerproces, geen gemiddeld rapportcijfer of automatisch slagingspercentage. Gebruik de afgesproken catalogus en instructiestappen N/1–8; de exacte inhoud en het toegestane gebruik van lesmaterialen worden bij productie geverifieerd.

- Voorbereiding brengt vorige open doelen, de laatst gepubliceerde kaart, instructeursobservaties, leerlingreflectie en de nieuwe leervraag samen. Toon de herkomst van suggesties.
- De instructeur kiest meestal twee of drie doelen; een volledige catalogus blijft bereikbaar zonder dat die elke les moet worden ingevuld.
- Per onderdeel is het onderscheid verplicht: **beoordeeld met een gekozen stap**, **geoefend zonder nieuwe beoordeling**, **niet behandeld**. Niet behandeld is niet hetzelfde als onvoldoende of de RIS-status N.
- Historische niveaus mogen als context zichtbaar zijn, maar worden nooit gekopieerd als nieuwe waarneming. Een tik op “gelijk gebleven” telt alleen als expliciete nieuwe beoordeling wanneer dat de bewuste keuze van de instructeur is.
- Bij beoordeling kan context worden toegevoegd: verkeerssituatie, zelfstandigheid/hulp en een korte observatie. Maak context niet op alle onderdelen verplicht; houd de normale afronding snel.
- Doeluitkomst is een apart gegeven: bereikt, deels bereikt of meenemen. Leid een leesbare samenvatting en volgende focus af; de instructeur controleert en kan bewerken.
- Lesuitvoering en kaartpublicatie zijn aparte acties/statussen. Minuten worden eenmaal verwerkt. Een conceptkaart is niet zichtbaar voor de leerling.
- Publiceren vereist een geldige minimale kaart, bewuste reflectiestatus en gecontroleerde leerlingweergave. Een geannuleerde les kan niet alsnog worden uitgevoerd of gepubliceerd.
- De leerling ziet korte, ondersteunende feedback, behandelde doelen, concrete volgende stap en eigen zelfreflectie. Interne docentnotities worden niet via UI, export of API meegestuurd.
- Zelfreflectie wordt aan de juiste les/publicatierevisie gekoppeld. De afwezigheid ervan blokkeert de instructeur niet onnodig; de status is wel expliciet.
- Een gepubliceerde kaart is een versie. Een correctie krijgt reden, auteur, tijdstip en vorige versie; geen stil overschrijven. Maak zichtbaar of een reflectie bij een oudere versie hoort.
- Een didactische oefenopbouw in de demo is een vooruitblik. V1 vereist betrouwbare logistieke routes; generatieve routeplanning of gegarandeerde actuele lesomstandigheden is niet inbegrepen.

Minimale toestandscheiding:

| Proces | Voorbeeldstatussen | Cruciale regel |
| --- | --- | --- |
| Afspraak | gepland, gestart, uitgevoerd, geannuleerd | Geen terugweg die historie of saldo stil wijzigt |
| Leskaart | concept, gepubliceerd, gereviseerd | Alleen gepubliceerde versies naar leerling |
| Reflectie | nog niet gevraagd/open/ingevuld/niet van toepassing | Afzonderlijk van beoordeling |
| Minuten | reservering, verbruik, vrijgave, correctie | Elke zakelijke gebeurtenis maximaal eenmaal |
| Bericht | klaar, verzonden/afgeleverd, mislukt, opnieuw proberen | Bezorging verandert de afspraak niet |

### 5. Examenrijpheid, toetsen en examenvoorbereiding

- Toon onderliggend bewijs uit relevante recente leskaarten en context. Geen misleidend “93% examenklaar” op basis van een simpele scoreberekening.
- Het oordeel is een expliciet instructeursbesluit, met reden, datum en gebruikte leskaartversies. Onvoldoende bewijs blijft zichtbaar als onvoldoende informatie.
- Ondersteun moduletoetsen, tussentijdse toets en praktijkexamen als verschillende pogingen met eigen datum, tijd, locatie, feedback en resultaat.
- Houd het externe toetsmoment los van de totale agenda-/logistiekduur, bijvoorbeeld voor ophalen, voorbespreken en terugrijden. Neem geen duur uit het prototype als blijvend officiële CBR-regel aan.
- Checklists hebben eigenaar, deadline, status, eventuele notitie en een versie van het template. Denk aan documenten, machtiging/theorie indien relevant, auto, locatie, tijd, bijzonderheden en leerlingvoorbereiding. Bevestig formele vereisten tegen actuele officiële informatie vóór release.
- Wijzigen van leerling, soort toets of andere bepalende context zet afhankelijke checklist en feedback passend terug; een vinkje voor een andere leerling blijft niet gelden.
- Resultaat leidt tot een begrijpelijke volgende stap en waar nodig actie/afspraak. Een examen wijzigen of annuleren werkt door in gekoppelde agenda en communicatie.

### 6. Wagenpark, kilometers, schade en overdracht

- Beheer kan auto's toevoegen en wijzigen: kenteken, merk/model waar nuttig, transmissie, huidige kilometerstand, notities, APK-datum, onderhoudsdatum/status en schade.
- Toewijzing is veel-op-veel: meerdere instructeurs per auto en meerdere auto's per instructeur. Gebruik voertuig-ID als identiteit; modelnaam of kentekenweergave is geen relationele sleutel.
- Instructeur heeft een eigen overzicht van toegewezen auto's en kan relevante APK-/onderhouds-/schadegegevens inzien en een schademelding doen.
- Kilometerregistratie bestaat uit afzonderlijke ritsegmenten: werk/zakelijk, privé, garage/onderhoud en beheerde aanvullende categorieën. Een segment heeft bestuurder, auto, start/eindmoment, begin/eindstand en categorie. Een ritcategorie is niet automatisch fiscaal of juridisch gecertificeerd.
- Toon bij starten de laatst bekende stand van de auto. Een afwijkende beginstand wordt alleen via de correctieactie met verplichte reden vastgelegd. Behoud de vorige stand en de relatie met open/ontbrekende registratie.
- Voorbeeld: A start op 22.333 km en vergeet af te sluiten. B ziet 22.433 km, voert correctie + reden in en kan zijn werk vervolgen volgens de gekozen overdrachtsflow. De 100 km wordt zichtbaar als ontbrekende registratie/verschil, niet stil als privérit van B geboekt.
- A krijgt een opvolgtaak voor zijn echte eindstand. Later aanleveren kan het verschil geheel of gedeeltelijk verklaren. Verwerk kilometers eenmaal, wijzig B’s geldige beginstand niet terug en laat een resterend verschil afzonderlijk beoordelen.
- Stop zakelijk segment, begin privésegment, sluit dat af en begin opnieuw zakelijk. Dagen zijn geen beperking tot één rit; segmenten moeten chronologisch en qua standen consistent zijn.
- Bewaak dubbele actieve registraties en racecondities. Eindstand kan niet lager zijn dan beginstand; correctiehistorie wordt niet verwijderd om de cijfers passend te maken.
- Onderhoud blokkeert de auto voor alle toegewezen instructeurs. Een schademelding bevat minimaal voertuig, melder, moment, omschrijving en status; eventuele foto-upload blijft tenantgebonden en afgeschermd.

### 7. Tegoed, facturen, betalingen en correcties

- Product/pakket, factuur, betaling en minutenledger zijn afzonderlijke begrippen. Een factuurregel voor proefleskosten creëert geen lesminuten tenzij het verkochte product die werkelijk bevat.
- Toon aangekocht, verbruikt, gereserveerd en beschikbaar tegoed. Leg in de productspecificatie vast op welk moment betaalde/pending pakketten tegoed geven; voer die keuze overal consistent uit.
- Reservering voor een geplande les is geen definitief verbruik. Uitvoering of betaalde annulering boekt volgens expliciete regels. Vrijgave van een reservering verhoogt niet het aangekochte saldo.
- Bij annulering ziet de medewerker vooraf wat er met geld en minuten gebeurt. Bewaar reden, actor en oorspronkelijke mutaties. Corrigeren maakt een herleidbare tegenboeking.
- Betaalproviderwebhooks zijn idempotent en controleerbaar. Een providerretry of herhaald klikken kan geen tweede pakket of betaling opleveren.
- Creditfactuur, financiële restitutie en correctie van lesminuten zijn aparte gevolgen. Terugbetalen van niet ontvangen geld is niet mogelijk; toon betaald versus te crediteren bedrag duidelijk.
- Bewaar financiële geschiedenis. Verwijderen of anonimiseren van een leerling mag noodzakelijke financiële bewijsvoering niet stil vernietigen. Leg bewaartermijnen met de verantwoordelijke vast.
- V1 is geen volledige grootboek- of salarisadministratie; export en heldere factuurstatussen zijn voldoende binnen de overeengekomen flows.

### 8. Actielijst, taken en communicatie

- Eén actielijst bundelt intakeopvolging, lesvoorbereiding, locatieverzoeken, ontbrekende kilometerstanden, toetschecklists, publicatie en afleverproblemen. Elke actie heeft bron, eigenaar, deadline en duidelijke vervolghandeling.
- Afspraak aanmaken creëert eenmaal een voorbereidingstaak met typegebonden deadline. Verplaatsen herberekent deadline en heropent waar nodig de voorbereiding; annuleren sluit de relevante taak.
- E-mail en notificatie worden pas klaargezet nadat de zakelijke mutatie is gecommit. Outbox/retry kan bezorging opnieuw proberen zonder de afspraak opnieuw te maken.
- Berichten houden rekening met status, voorkeuren en vervallen gebeurtenissen. Stuur geen lesherinnering meer voor een inmiddels geannuleerde afspraak.
- Toon verzend-/afleverstatus en foutreden in begrijpelijke taal. Beperk interne integratiedetails tot beheer waar ze zinvol zijn.
- Uitgaande echte berichten worden getest met gecontroleerde testbestemmingen. Een demo die een aflevering simuleert is geen bewijs van werkende SendGrid/push.

### 9. Team, instellingen, import en privacy

- Teambeheer: uitnodigen, rol, actief/geblokkeerd, leerling-/voertuigtoewijzing en beschikbaarheid. Een ingetrokken recht moet server-side effectief zijn, ook bij een reeds geopend scherm.
- Schoolinstellingen beheren afspraaktypen, duur/buffer, annuleringsredenen/regels, berichtenvoorkeuren en andere afgesproken defaults. Historische afspraken behouden hun context waar nodig.
- Import werkt via preview/proefcontrole: mapping, vereiste velden, adressen, bestaande identificatie, dubbele records, tegoed en bestaande afspraken. Geen gedeeltelijk geslaagde import zonder expliciete rijstatus en herstelmogelijkheid.
- Geïmporteerde ongeverifieerde locaties krijgen een reviewstatus; onbekende coördinaten worden niet ingevuld met een willekeurige plek.
- Gegevensexport is rolgebonden. Leerlingexport bevat geen interne les-/afspraaknotities. Privacyverzoeken krijgen status, eigenaar en spoor van afhandeling.
- Anonimiseren/verwijderen moet afgeleide contactgegevens, berichtencontext en zoekindices meenemen, terwijl afgesproken bewaarplichten en noodzakelijke financiële audit overeind blijven. Bepaal exacte termijnen vóór echte uitrol; het prototype is hierin geen juridisch beleid.

### 10. Platformoperatie en begeleiding

- Platformadmin ziet rijscholen, onboardingstatus, relevante configuratie en operationele uitzonderingen. Duidelijke onderscheiding tussen platforminstelling en tenantinstelling.
- Health/readiness, foutafhandeling, taak- en berichtproblemen en integratiestatus moeten beheerbaar zijn zonder klantdata te lekken.
- Whitelabel blijft gebaseerd op semantische kleuren, logoassets en gedeelde componenten; geen kopie van de hele applicatie per rijschool.
- De tutorial beschrijft echte schermen en rolgebonden functies. Voortgang is apart van zakelijke data. Een uitlegstap kan een scherm openen, maar voert nooit ongemerkt een betaling, uitnodiging, publicatie of reset uit.
- Empty, loading, error, offline/verbindingsverlies, permissie geweigerd en gelijktijdige wijziging krijgen expliciete bruikbare toestanden.

## Na V1

Bewaar ideeën en bruikbare bron voor volgende releases. Prioriteit na een stabiele pilot: betere operationele rapportages, verdere agendaoptimalisatie, aanvullende imports/exports en gecontroleerde automatisering. Didactische routegeneratie, uitgebreidere theorie/leermiddelen, franchise-/vestigingsbeheer en brede AI-assistentie krijgen ieder een eigen bewijs- en releasecriterium. Voeg ze niet als verborgen scope aan de herbouw toe.

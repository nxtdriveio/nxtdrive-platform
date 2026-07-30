# RIS journeybot

De RIS journeybot is de uitvoerbare releaseproef voor de volledige RIS-lescyclus. Hij bedient de echte instructeurs- en leerlinginterface, leest de resulterende databasetoestand terug en legt per controle uit wat de eis is, waarom die eis bestaat, wat is waargenomen, welk bewijs is gebruikt en hoe een afwijking kan worden hersteld.

De bot vervangt geen inhoudelijke validatie door een RIS-deskundige. Hij bewijst wel dat de applicatie uitsluitend exact gevalideerde en gepubliceerde definities gebruikt.

## Reis en bewijs

De toestandsmachine controleert achtereenvolgens:

1. tenantmodus, actieve catalogus en uitgeschakelde AI;
2. vier modules, 46 actieve scripts en de waarden N plus stap 1–8;
3. contrafeitelijke readinessscenario's: N blijft ontbrekende dekking, stap 8 is geen mastery en een veiligheidsblokkade is niet compenseerbaar;
4. exacte expertvalidatie van curriculum, readinessbeleid en moduletoetsdefinities;
5. een actieve RIS 2.0-inschrijving en catalogusgebonden focusscript;
6. afzonderlijke opslag van instructiestap, prestatie, ondersteuning en veiligheid;
7. de invariant dat stap 8 niet automatisch toets- of examenrijp betekent;
8. herleidbaar auteurschap van de leerlingreflectie;
9. een negatieve privacytest: het concept is niet zichtbaar voor de leerling;
10. de expliciete publicatiestatus;
11. zichtbaarheid van exact de gepubliceerde reflectie en auteurschap;
12. koppeling van leerlingreactie en leerwens aan leerling, les en leskaart;
13. volledige afronding van de kaart;
14. een regelgebaseerd volgend lesvoorstel waarin de leerlingwens zichtbaar blijft;
15. auditevents voor publicatie en leerlingreactie.

Bewijs kan uit configuratie, database, gebruikersinterface, audittrail of een berekende invariant komen. Een kritieke controle faalt direct, waarna alle nog niet bereikbare controles expliciet `BLOCKED` worden gerapporteerd. Daardoor is het verschil zichtbaar tussen “getest en fout” en “niet uitvoerbaar door een eerdere blokkade”.

## Uitvoeren

Voor alleen de RIS-reis:

```bash
E2E_ENABLE_RIS_JOURNEY=1 \
pnpm --filter @workspace/scripts run e2e:ris-journey-bot
```

De bestaande authenticated business-flow-runner voert dezelfde journeybot uit wanneer `E2E_ENABLE_RIS_JOURNEY=1` staat:

```bash
pnpm --filter @workspace/scripts run e2e:business-flows
```

De gebruikelijke stagingvariabelen zijn vereist: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `E2E_BASE_URL`, `E2E_TENANT_ID` en de admin-, instructeur- en leerlingaccounts. De tenant moet een echte actieve, expert-gevalideerde RIS-catalogus en een afzonderlijke RIS-testleerling hebben. De bot fabriceert nooit een expertgoedkeuring.

## Rapportage

Iedere run schrijft naar `test-results/ris-journey/`:

- `ris-journey-report.json`: machineleesbaar rapport en baselinevergelijking;
- `ris-journey-report.md`: leesbaar release- en herstelrapport;
- `ris-journey-junit.xml`: JUnit XML voor CI-testweergave.

De checked-in baseline staat in `scripts/ris-journey-baseline.json`. Die vereist alle controles, 100% uitgevoerde successen, 100% verklaarbaarheid en bewaakt totale en controlespecifieke doorlooptijden. Een controle bevat alleen volledige verklaarbaarheid als verwachting, rationale, waarneming, hersteladvies en bewijs aanwezig zijn.

Voor vergelijking met een eerder JSON-rapport kan `E2E_RIS_PREVIOUS_REPORT` naar dat bestand wijzen. Het rapport onderscheidt dan regressies van herstelde controles. Zonder vorig rapport blijft de vaste baselinevergelijking actief.

## Privacy en opruimen

Geen persoonsgegevens, reflectieteksten, leerwensen, e-mailadressen of volledige database-id's worden in rapporten opgenomen. Naast gegevensarme waarnemingen past de rapportlaag centrale redactie toe op e-mailadressen en UUID's. Unieke invoer dient alleen als tijdelijke marker tijdens de browsercontrole. De bestaande E2E-cleanup verwijdert aangemaakte lessen, leskaarten, beoordelingen, reflecties en reacties en herstelt de eerdere RIS-voortgang van de testleerling.

Gebruik uitsluitend een aangewezen testtenant en testaccounts. De journeybot muteert normale gebruikersgegevens niet bewust en mag niet als productiejourney op echte leerlingdossiers worden gestart.

## CI

De workflow `.github/workflows/e2e-authenticated.yml` draait de reis op staging. Rapporten worden ook bij een mislukte run 30 dagen als artifact bewaard; browserdiagnostiek blijft bij fouten afzonderlijk beschikbaar. Een ontbrekend rapport is zelf een CI-fout.

De rapportlaag heeft daarnaast synthetische tests voor succesvolle runs, kritieke fouten, geblokkeerde vervolgcontroles, timingregressies, vergelijking met een eerdere run, alle drie outputformaten en baselinevalidatie:

```bash
pnpm --filter @workspace/scripts run test-ris-journey-bot
```

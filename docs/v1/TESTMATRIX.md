# V1-testmatrix

Datum: 21 oktober 2026. Volledige acceptatiedefinities: `overdracht/ACCEPTATIE-EN-RELEASE.md`.

## Uitgevoerd in deze fase

| Controle                                       | Resultaat          | Reikwijdte                                      |
| ---------------------------------------------- | ------------------ | ----------------------------------------------- |
| Negen SHA-256-pakketcontroles                  | Geslaagd           | Integriteit van documentatie                    |
| GitHub-heads/runner/environmentmetadata        | Opgehaald          | Geen secretwaarden of runtimebewijs             |
| Vijf archiefrefs onafhankelijk fetchen         | Geslaagd           | SHA en migratie-/infra-/doc-trees               |
| Sites-v12-bronidentiteit                       | Geslaagd           | Lokale HEAD en saved-version-SHA gelijk         |
| Oude werkbranch secretscan                     | Geslaagd           | 1.649 bestanden; geen historische auditclaim    |
| Inventarisatie-env voert geen shell uit        | Geslaagd           | Python unittest                                 |
| Database-URL-output bevat geen password/query  | Geslaagd           | Direct, pooler en ongeldige URL                 |
| Credentialvergelijking toont alleen booleans   | Geslaagd           | Geen waarden in serialisatie                    |
| Onbevestigde doelidentiteit opent geen DB      | Geslaagd           | Gemockte negatieve test                         |
| Projectref-parser                              | Geslaagd           | Provideridentiteit of onbekend                  |
| JavaScript-syntaxcontrole                      | Geslaagd           | `node --check scripts/v1/inventory-db.mjs`      |
| Runnerinventarisatie staging/production        | Twee runs geslaagd | Rapportage geslaagd; staging is ongezond        |
| Zes runtime/GitHub-vergelijkingen per omgeving | Gelijk             | Geen waarden gelogd                             |
| Production read-only transactie en decryptie   | Geslaagd           | `read_only=on`, twee secrets geldig ontsleuteld |
| Staging DNS/database                           | Mislukt            | API- en DB-host onoplosbaar; `ENOTFOUND`        |
| Production health/readiness                    | 200/200            | Huidige oude app; geen V1-acceptatie            |
| Staging health/readiness                       | 200/503            | Huidige oude app; database niet bereikbaar      |
| Back-up en echte restore                       | Niet uitgevoerd    | Tooling/herstelbestemming nog in te richten     |

Herhalen bij wijzigingen: `python3 -m unittest discover -s scripts/v1 -p 'test_*.py' -v`, `node --check scripts/v1/inventory-db.mjs`, secretscan en formattercheck op gewijzigde workflow/JS/documentatie. Geen appbuild voor alleen inventarisatiescripts en documentatie; dit is geen bewijs van een werkende V1-app.

## Functionele releasevoorwaarden

| Scenario's                                               | Status                   |
| -------------------------------------------------------- | ------------------------ |
| A01–A04: intake/activatie/rollen/tenants                 | Niet getest op nieuwe V1 |
| P01–P09: planning/concurrentie/reis/annulering/tijd      | Niet getest op nieuwe V1 |
| L01–L03: locaties/snapshots/stale verzoeken              | Niet getest op nieuwe V1 |
| R01–R08: voorbereiding/beoordeling/publicatie/reflectie  | Niet getest op nieuwe V1 |
| E01–E03: onderbouwd oordeel/toets/checklist              | Niet getest op nieuwe V1 |
| F01–F06: voertuigen/ritdelen/correcties/schade           | Niet getest op nieuwe V1 |
| M01–M03: webhooks/geld/minutenledger                     | Niet getest op nieuwe V1 |
| C01–C03: outbox/retries/voorkeuren/taken                 | Niet getest op nieuwe V1 |
| I01–I02: import/privacy                                  | Niet getest op nieuwe V1 |
| U01–U04: rollen/responsiviteit/toegankelijkheid/tutorial | Niet getest op nieuwe V1 |

De 36 prototypetests en oude releasechecks gelden niet als productieacceptatie. De 60-secondenflow vereist een representatieve gemeten praktijktest op telefoon en tablet; geen tijdclaim op basis van de hoeveelheid velden. Geen echte ontvangers/betalingen gebruiken voor tests zonder expliciete testbestemming.

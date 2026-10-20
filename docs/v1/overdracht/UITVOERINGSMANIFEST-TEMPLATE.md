# Uitvoeringsmanifest — vóór archiveren, reset en opruiming invullen

Dit is een template, geen reeds goedgekeurde concrete verwijderlijst. De gebruiker heeft de beoogde NXTDRIVE-herbouw, archivering, applicatiereset en opruiming geautoriseerd. De uitvoerder stelt onderstaande doelen vast en legt bewijs vast. Laat onbekende gegevens zichtbaar open; verzin geen host, project-ID of backupresultaat.

## Identiteit en scope

| Onderdeel | Staging/development | Productie/doel |
| --- | --- | --- |
| Werkelijke host-ID en hostname | NOG VAST TE STELLEN | NOG VAST TE STELLEN |
| Gedeeld met andere applicaties? | NOG VAST TE STELLEN | NOG VAST TE STELLEN |
| Eigenaar en toegangsmethode | NOG VAST TE STELLEN | NOG VAST TE STELLEN |
| Repositorybranch en actuele SHA | NOG VAST TE STELLEN | NOG VAST TE STELLEN |
| Actieve release en symlinkdoel | NOG VAST TE STELLEN | NOG VAST TE STELLEN |
| Supabase-project-ID / database-identiteit | NOG VAST TE STELLEN | NOG VAST TE STELLEN |
| Connectievariabelenaam, geen waarde | NOG VAST TE STELLEN | NOG VAST TE STELLEN |
| Controle API-projectref versus database | NOG VAST TE STELLEN | NOG VAST TE STELLEN |
| Beoogde V1-release-SHA/schema-versie | NOG VAST TE STELLEN | NOG VAST TE STELLEN |

## Archiefbewijs

- Vastgestelde main- en staging-heads:
- Gecontroleerde waardevolle lokale wijzigingen:
- Gepushte archiefbranch(es)/tag(s):
- Onafhankelijke fetch en SHA-controle:
- Domeinen die worden hergebruikt/herschreven/uitgesteld:
- Controle dat geen secrets/dumps/echte klantdata in het archiefcommit zijn toegevoegd:

## Configuratiebehoud

Registreer per credential **naam, bronlocatie, eigenaar/tenant, omgeving, afhankelijkheden en validatiestatus**, nooit waarde of volledige connectiestring.

| Bron | Aangetroffen | Privé veiliggesteld | Herstelmapping | Veilige validatie geslaagd |
| --- | --- | --- | --- | --- |
| GitHub Environment staging | OPEN | OPEN | OPEN | OPEN |
| GitHub Environment production | OPEN | OPEN | OPEN | OPEN |
| Repository-/environmentvariabelen | OPEN | OPEN | OPEN | OPEN |
| Staging `shared/.env` | OPEN | OPEN | OPEN | OPEN |
| Productie `shared/.env` | OPEN | OPEN | OPEN | OPEN |
| Caddy/env/TLS | OPEN | OPEN | OPEN | OPEN |
| `platform_secrets` en context | OPEN | OPEN | OPEN | OPEN |
| `platform_settings`, waaronder verzendadres | OPEN | OPEN | OPEN | OPEN |
| `tenant_secrets` en tenantmapping | OPEN | OPEN | OPEN | OPEN |
| Encryptiesleutel(s) | OPEN | OPEN | OPEN | OPEN |
| Push/mail/maps/payment/jobs | OPEN | OPEN | OPEN | OPEN |

## Database-resetlijst

Voor elk object/deelgebied: exacte naam, eigenaar, zakelijke functie, reden, afhankelijkheden, actie (behouden/exporteren/resetten/verwijderen), back-upreferentie en herstelactie. Maak onderscheid tussen app-tabellen, app-schema, migratieadministratie, managed schema’s, Auth, Storage, queues/jobs en integratieconfiguratie.

- Exacte objectlijst met actie:
- Behouden admin-/tenantconfiguratie en toegang:
- Afhandeling bestaande Auth-gebruikers en sessies:
- Afhandeling Storage-objecten en verwijzingen:
- Afhandeling geplande jobs/webhooks/outbox:
- Nieuwe migratiebaseline en runner:
- Beleid fictieve stagingdata versus minimale productiebootstrap:
- Controle zonder wijzigingen uitgevoerd en beoordeeld:
- Reset uitgevoerd op geverifieerd doel (tijd, actor, resultaat):
- Post-resetvalidatie en credentialherstel:

## VPS-verwijderlijst

| Exact absoluut pad | Werkelijke resolved path | Eigenaar | Actief gebruikt? | Archief/back-up | Reden | Actie/resultaat |
| --- | --- | --- | --- | --- | --- | --- |
| NOG VAST TE STELLEN | NOG VAST TE STELLEN | OPEN | OPEN | OPEN | OPEN | NIET UITVOEREN |

Te beschermen: shared env, actieve release, benodigde rollbackreleases, Caddy/TLS, systemd, runner, SSH/netwerk, secrets, back-ups en andere applicaties. Controleer symlinks; verwijder geen parentdirectory op basis van de naam van één oude submap.

## Backup, herstel en omschakeling

- Private back-upreferentie en toegangseigenaar, geen publieke URL:
- Back-uptijd/schema/configuratieversie:
- Aantoonbare hersteltest:
- Verwacht herstelpunt en hersteltijd:
- Welke oude deploys/jobs tijdelijk zijn gepauzeerd:
- Schrijfpauze en afhandeling nieuwe writes:
- Readiness- en functionele controle na release:
- Criteria en stappen voor herstel van code + database + configuratie:
- Wanneer oude releases/back-ups niet meer nodig zijn:

## Uitvoeringsstatus

| Stap | Resultaat | Bewijs | Open blokkade |
| --- | --- | --- | --- |
| Doelidentiteit bevestigd | OPEN | — | — |
| Archief terughaalbaar | OPEN | — | — |
| Credentials behouden | OPEN | — | — |
| Backup/herstel bewezen | OPEN | — | — |
| Staging V1 geaccepteerd | OPEN | — | — |
| Productiecutover afgerond | OPEN | — | — |
| Opruiming afgerond | OPEN | — | — |

Voer geen destructieve stap uit zolang de noodzakelijke doelidentiteit of herstel-/credentialinformatie daarvoor ontbreekt. Dit is een inhoudelijke uitvoeringsvoorwaarde, geen verzoek om de reeds gegeven algemene toestemming te herhalen.

# NXTDRIVE V1 — uitvoeringsstatus

Bijgewerkt: 21 oktober 2026. Werkbranch: `codex/v1-inventory-20261021`.

De herbouw is **niet gereed**. Dit is de inventarisatie- en behoudfase; de bestaande applicatie draait nog. Geen database-reset of V1-deployment uitgevoerd.

## Aantoonbaar uitgevoerd

- Alle negen documenten uit de overdracht gelezen; negen SHA-256-controles geslaagd. Originele documenten staan ongewijzigd in `docs/v1/overdracht/`.
- Actuele GitHub-heads gecontroleerd: main en staging op `ebebfdf02a7bf945a198a82ffaf276f73cafdc0b`. Lokale werkbranch stond op `065562adb390741b825cd8b92d623d5cb882676a`, zonder lokale wijzigingen.
- Vijf archiefbranches gepusht en via een aparte bare repository teruggehaald. Commitidentiteit, migraties, infrastructuur en kennisdocumentatie gecontroleerd. Zie het behoudmanifest.
- Sites-project `appgprj_6ac6143202e88191acb29da9ee6c9e85` is toegankelijk. De bron is opgehaald naar `/home/codex/repos/nxtdrive-v1-prototype`; HEAD is `53472e3a18a1974532965bf06214d9db7398b514`, gelijk aan gepubliceerde versie 12. Niet opnieuw gepubliceerd of gewijzigd.
- GitHub heeft environments staging en production en één online runner `nxtdrive` met labels `self-hosted`, `Linux`, `X64`, `nxtdrive-vps`.
- Secretnamen geïnventariseerd: staging heeft negen en production zes environmentsecrets. Repositorysecrets en repository-/environmentvariabelen zijn leeg. Aanwezigheid van een naam bewijst geen geldige waarde.
- Developmenthost `codex-worker-01` had ongeveer 597 MB vrij op een volle rootpartitie. Vier oude webpack-caches van Fieldgrid zijn na pad-/eigenaarschap-/procescontrole verwijderd: 2.628.538.368 bytes vrijgemaakt; direct daarna 3.225.747.456 bytes vrij. Broncode, Git-metadata en configuratie behouden.
- Read-only runnerinventarisatie toegevoegd met vijf veiligheidstests: geen shelluitvoering uit env, geen wachtwoord/querystring in output, alleen aanwezigheid/vergelijking van secrets, en geen databaseverbinding bij onbevestigde identiteit.
- Twee inventarisatieruns op de self-hosted runner geslaagd: [eerste run](https://github.com/nxtdriveio/nxtdrive-platform/actions/runs/39517016452), [DNS/toolingdiagnose](https://github.com/nxtdriveio/nxtdrive-platform/actions/runs/39517236011). Dit betekent dat de inventarisatie werkte, niet dat alle afhankelijkheden gezond zijn.
- Live doelhost voor beide omgevingen: `nxtdrive`. API-projectref, databaseprojectref en GitHub-projectref komen per omgeving overeen. Alle zes gecontroleerde runtimecredentials zijn aanwezig en gelijk aan de betreffende GitHub-environmentsecrets; waarden zijn niet gelogd of veranderd.
- Staging: project `kulyguiszfsxzlhlyyeo`, runtime-SHA `ebebfdf02a7bf945a198a82ffaf276f73cafdc0b`, health 200, readiness 503. Zowel API-host als directe databasehost lossen niet op in DNS. Databaseverbinding faalt tijdens connect met `ENOTFOUND`. Geen SQL of reset uitgevoerd op staging.
- Production: project `hhhdgfmsgbkfkmoqzhif`, runtime-SHA `065562adb390741b825cd8b92d623d5cb882676a`, health/readiness 200. Databaseleestransactie bevestigt `read_only=on`, PostgreSQL 17.6. Twee platformsecrets ontsleuteld, nul fouten; geen tenant-secretrecords. SendGrid-verzendinstelling is aanwezig. Dit bewijst geen externe aflevering of providercredentialgeldigheid.
- Production heeft 17 Auth-accounts, twee Storage-buckets en 174 geregistreerde oude migraties. Accounts/buckets zijn alleen geteld en niet gewijzigd.

## Nog te bewijzen

| Stap                                                | Status               | Volgend bewijs                                      |
| --------------------------------------------------- | -------------------- | --------------------------------------------------- |
| Live doelhost en runtime-release-identiteit         | Bevestigd via runner | Zie live bewijs en behoudmanifest                   |
| API-/databaseproject en runtime/GitHub-consistentie | Bevestigd via runner | Zes vergelijkingen per omgeving gelijk              |
| Integratierecords en bestaande decryptiesleutel     | Production bevestigd | Staging pas na herstel van het bestaande project    |
| Private configuratie-/databaseback-up en restore    | Niet uitgevoerd      | Versleutelde privéopslag en geïsoleerde hersteltest |
| Nieuwe baseline, app en verticale kernreis          | Niet geïmplementeerd | Reviewbare V1-bron en ketentests                    |
| Ondersteunende V1-domeinen                          | Niet geïmplementeerd | Acceptatiematrix                                    |
| Telefoon/tablet/tutorial/60 seconden                | Niet getest          | Browser- en representatieve praktijktests           |
| Productiecutover                                    | Niet uitgevoerd      | Alle releasevoorwaarden en herstelbewijs            |

## Concrete blokkades en vervolg

1. Het bestaande stagingproject is via API- en database-DNS onbereikbaar. Supabase MCP toont geen NXTDRIVE-projecten; een gerichte projectopvraag is geweigerd wegens ontbrekende rechten. De eigenaar moet het bestaande project in de juiste account controleren/hervatten of die account verbinden. Niet vastgesteld of het project gepauzeerd, verwijderd of anderszins onbeschikbaar is. Geen nieuwe omgeving of credential aangemaakt.
2. De doelserver heeft geen `pg_dump`, `pg_restore`, `psql`, PostgreSQL-toolchain of Docker. Een volledige back-up en geïsoleerde restore zijn nog niet uitgevoerd; compatibele tooling en een private herstelbestemming moeten eerst worden ingericht.
3. De runner kan `/etc/caddy/caddy.env` niet lezen. De bestaande root/Caddy-toegangsgrens blijft behouden. Dat bestand is nog niet geback-upt; TLS-configuratie blijft onaangeraakt.

Voor een reset moeten naast de geteste codearchieven ook versleutelde private configuratie-/databaseback-ups en een echt herstelpad bestaan. De nieuwe baseline en apps zijn nog niet gebouwd. De eerstvolgende uitvoeringsstap blijft behoud/herstel, gevolgd door de schone V1-opbouw.

GitHub meldt bij recente geplande hosted jobs: “The job was not started because your account is locked due to a billing issue.” De self-hosted inventarisatiejobs werken wel. De huidige deployworkflow gebruikt eerst de hosted quality-gate; de CI-route moet vóór deployment aantoonbaar werken. De oude jobs zijn niet gewijzigd of gepauzeerd; er vindt nog geen cutover plaats.

Zie `docs/v1/BESLISLOG.md`, `docs/v1/BEHOUD-EN-VERWIJDERMANIFEST.md` en `docs/v1/TESTMATRIX.md`.

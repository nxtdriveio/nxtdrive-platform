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

## Nog te bewijzen

| Stap                                                | Status                          | Volgend bewijs                                      |
| --------------------------------------------------- | ------------------------------- | --------------------------------------------------- |
| Live doelhost en release-identiteit                 | Runnerinventarisatie voorbereid | Jobresultaat voor beide omgevingen                  |
| API-/databaseproject en runtime/GitHub-consistentie | Niet live bevestigd             | Vergelijkingsresultaten zonder waarden              |
| Integratierecords en bestaande decryptiesleutel     | Niet live bevestigd             | Aantallen en decryptieresultaat, geen inhoud        |
| Private configuratie-/databaseback-up en restore    | Niet uitgevoerd                 | Versleutelde privéopslag en geïsoleerde hersteltest |
| Nieuwe baseline, app en verticale kernreis          | Niet geïmplementeerd            | Reviewbare V1-bron en ketentests                    |
| Ondersteunende V1-domeinen                          | Niet geïmplementeerd            | Acceptatiematrix                                    |
| Telefoon/tablet/tutorial/60 seconden                | Niet getest                     | Browser- en representatieve praktijktests           |
| Productiecutover                                    | Niet uitgevoerd                 | Alle releasevoorwaarden en herstelbewijs            |

Supabase MCP toont geen NXTDRIVE-projecten. Dit blokkeert niet de runnerroute: de bestaande repository gebruikt runtimeconfiguratie en GitHub-environmentsecrets op de self-hosted runner. Er is geen nieuwe omgeving of credential aangevraagd.

De recente geplande monitor-/reminderjobs falen vóór runner-toewijzing; dit is nog geen bewijs dat de applicatie zelf onbereikbaar is. De laatst aangetroffen stagingdeployment van de overdrachtscommit is succesvol. De oude jobs zijn niet gewijzigd of gepauzeerd; er vindt nog geen cutover plaats.

Zie `docs/v1/BESLISLOG.md`, `docs/v1/BEHOUD-EN-VERWIJDERMANIFEST.md` en `docs/v1/TESTMATRIX.md`.

# NXTDRIVE — overdracht voor de echte V1

Datum: 20 oktober 2026. Referentie: prototype **versie 12**.

Open de [interactieve rondleiding](https://nxtdrive-v1-studio.dgwebserv.chatgpt.site/tutorial). Deze bevat 82 stappen door de vier applicaties en de publieke intake/activatie. De tutorial is gepubliceerd. In deze overdrachtsronde zijn **geen GitHub-productiebranches, VPS’en, echte databases of secrets gewijzigd**.

## Zo gebruik je dit pakket

1. Pak het volledige ZIP-bestand uit in de werkomgeving van Codex.
2. Geef Codex toegang tot `nxtdriveio/nxtdrive-platform`, de bestaande operationele documentatie en de bedoelde VPS’en. Geef credentials via de bestaande veilige configuratie; plak ze niet in de chat.
3. Plak de volledige inhoud van `CODEX-OVERDRACHTSPROMPT.md` als opdracht. De losse `.txt` die bij dit pakket is geleverd bevat dezelfde prompt.
4. Laat Codex beginnen met bron- en infrastructuurinventarisatie. De toestemmingen voor archiveren, opruimen en leegmaken staan in de prompt; concrete doelhosts en objecten moeten eerst worden vastgesteld.
5. Bouw en bewijs de complete V1 op staging. Productie volgt pas via de beschreven omschakeling met gecontroleerd herstelpad.

## Bestanden

| Bestand | Gebruik |
| --- | --- |
| CODEX-OVERDRACHTSPROMPT.md | Zelfstandig te gebruiken hoofdopdracht, inclusief autorisatie en fasering |
| V1-FUNCTIONELE-SPECIFICATIE.md | Functionele afspraken en belangrijkste bedrijfsregels |
| UI-UX-REFERENTIE.md | Premium vormgeving, mobiel/tablet, snelle beoordeling en bronverwijzingen |
| INFRA-EN-CONFIGURATIE.md | In de repository aangetroffen deployment en credentialnamen; geen secretwaarden |
| ACCEPTATIE-EN-RELEASE.md | Testscenario’s, releasevoorwaarden en terugval |
| PAGINAS-EN-TUTORIAL.md | Alle bestaande rolpagina’s en alle 82 tutorialstappen |
| UITVOERINGSMANIFEST-TEMPLATE.md | In te vullen doelen, behoudlijst, verwijderlijst en bewijs |
| BRONNEN-EN-STATUS.md | Wat daadwerkelijk is onderzocht, wat nog niet en waar de broncode staat |
| SHA256SUMS.txt | Integriteit van de documenten in dit pakket |

Dit is een uitvoerbare overdracht, geen bewijs dat de echte V1 al is gebouwd. Het prototype gebruikt demonstratiegegevens en vervangt geen authenticatie, tenantisolatie, transacties of echte integratietests. De broncode blijft in de bestaande Git- en Sites-repositories; dit pakket bevat documentatie en bronverwijzingen, geen kopie van secrets, databasedumps of runtimebestanden.

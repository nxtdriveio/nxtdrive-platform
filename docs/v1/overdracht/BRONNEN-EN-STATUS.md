# Bronnen, status en beperkingen

Samengesteld op 20 oktober 2026.

## Productreferentie

- Prototype: https://nxtdrive-v1-studio.dgwebserv.chatgpt.site
- Tutorial: https://nxtdrive-v1-studio.dgwebserv.chatgpt.site/tutorial
- Sites-project: `appgprj_6ac6143202e88191acb29da9ee6c9e85`
- Gepubliceerde versie: **12**
- Broncommit: `53472e3a18a1974532965bf06214d9db7398b514`
- Tutorial: 82 stappen; inhoud en routeafhandeling in `components/nxtdrive/tutorial/`.
- Bestaande functionele rolpagina’s: 54, plus publieke intake en activatie. Toegevoegd: centrale tutorial en tutorialingang binnen elk van de vier rollen.
- Tijdens deze ronde: succesvolle typecheck, build en 36 modeltests; publicatiestatus geslaagd.

Het prototype gebruikt lokale demonstratiegegevens. Het oefent samenhangende interacties, maar is geen productieauthenticatie of transactieserver. De demo-datum is 7 oktober 2026. Verwar die vaste voorbeelddatum niet met de huidige datum of productieplanning.

De nieuwe tutorial opent de echte schermen met uitleg, heeft volledige en rolgerichte routes, zoekfunctie, leesvoortgang, overslaan/hervatten en een compacte modalcoach. De uitleg opent geen echte betaling of berichtverzending. Bewuste gebruikershandelingen in de demo kunnen wel voorbeeldgegevens veranderen.

De huidige Sites-bron blijft via het Sites-project bewaard. Het werkpad in deze sessie was `/workspace/sites/nxtdrive-v1-prototype`; een volgende uitvoerder moet de bron in zijn eigen omgeving ophalen. Dit pakket bevat geen tweede kopie van de Git-repository of build-runtime.

## Bestaande echte repository

- Repository: https://github.com/nxtdriveio/nxtdrive-platform
- Onderzochte main-SHA: `ebebfdf02a7bf945a198a82ffaf276f73cafdc0b`
- Commitomschrijving bij inspectie: `test(visual): approve interactive agenda baseline`.
- De deployment- en configuratiebevindingen in dit pakket komen uit de repository op deze head; actuele heads opnieuw controleren bij uitvoering.

Belangrijke bronpaden:

- `.github/workflows/deploy-staging.yml`
- `.github/workflows/deploy-production.yml`
- `.github/workflows/rollback.yml`
- `infra/README.md`
- `docs/INFRA_DEPLOYMENT.md`
- `scripts/src/apply-migrations.ts`
- `scripts/src/lib/db-env.ts`
- `supabase/migrations/`
- `artifacts/nxtdrive/lib/email/platform-config.ts`
- `artifacts/nxtdrive/lib/ai/platform-config.ts`
- `artifacts/nxtdrive/lib/mollie/secrets.ts`
- `artifacts/nxtdrive/lib/crypto/aead.ts`
- `artifacts/nxtdrive/domains/maps/`

## Eerdere productbesluiten

De overdracht sluit aan op het vastgelegde V1-/releaseplan van 7 oktober 2026 en de RIS-uitwerking van 8 oktober 2026, aangevuld met de latere wensen en de uitgebreide prototypeversie. De belangrijkste richtingen zijn behouden: een afgebakende kernreis, uitlegbare slimme functies, bewuste RIS-waarnemingen, publicatieprivacy, betrouwbare planning en een snelle mobiele instructeursflow.

De laatste gebruikersopdracht voegt expliciete toestemming toe om voor de echte herbouw oude code te archiveren, overbodige NXTDRIVE-serverbestanden te verwijderen en de bedoelde applicatiedatabases te legen, met behoud van bestaande staging- en productiecredentials. Deze opdracht gaat voor afwijkende oudere infrastructuuradviezen.

## Niet uitgevoerd of niet bewezen

- Geen GitHub-archiefbranch voor `nxtdriveio/nxtdrive-platform` aangemaakt in deze ronde.
- Geen echte VPS opgeschoond, database geleegd of productieconfiguratie veranderd.
- Geen secretwaarden opgehaald of in dit pakket opgenomen.
- Geen live verificatie van database-inhoud, runner, DNS, provideraccounts, backups of actuele VPS-releases.
- Geen browser-/toestelcontrole van de nieuw toegevoegde tutorial in deze ronde. De beschikbare Sites-werkwijze bood hier geen bruikbare browsercontrole; de verplichte handmatige releasecontrole staat in de acceptatiematrix.
- De 60-secondenbeoordeling is een expliciet ontwerpdoel, nog geen gemeten productieclaim.
- De productie-equivalenten van betalingen, berichten, routes, authenticatie en tenantisolatie moeten nog worden gerealiseerd en bewezen.

De toekomstige Codex-uitvoerder moet deze grenzen behouden in zijn rapportage en aantoonbaar bewijs verzamelen. Een ontbrekende verificatie mag niet als voltooid worden afgevinkt.

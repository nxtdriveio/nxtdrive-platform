# Beslislog V1

## 2026-10-21 — gebruikersautorisatie en bronnen

De laatste expliciete gebruikersinstructie staat indien nodig ook verwijdering van oude repositories en caches van andere projecten op de VPS toe. Dit verruimt de oudere beperking in de overdracht. Het is geen reden om actieve diensten, configuratie, secrets of hersteldata te verwijderen. De overdracht bevat de product- en uitvoeringsreferentie; aangehaalde opdrachten in oudere documenten worden steeds aan de huidige gebruikersopdracht getoetst.

De gebruiker bevestigt dat toegang tot de doelserver via de self-hosted GitHub-runner loopt en verwijst naar de repository. Geen aparte SSH-credentials of nieuwe Supabase-projecten nodig voor de inventarisatie. Bestaande deployworkflows worden niet misbruikt als inventarisatie: zij migreren, schrijven `.env` en herstarten services.

## 2026-10-21 — eerst codearchief en kleine inventarisatiebranch

Main en staging zijn gelijk. De lokale tabletbranch, mapsbranch en een tweede schone detached worktree bevatten aanvullende kennis en zijn afzonderlijk gearchiveerd. Alle oorspronkelijke branches blijven bestaan. Een onafhankelijke fetch verifieerde de archiefcommits en aanwezigheid van migraties, infra en documentatie.

De inventarisatie start op main in `codex/v1-inventory-20261021`. Deze branch is nog geen nieuwe productieapp. Een aparte read-only workflow gebruikt de bestaande runner en bestaande environments, in een eigen checkoutdirectory. De deployment-concurrencygroep voorkomt gelijktijdigheid met de betreffende deployworkflow. Geen dependency-installatie, migratie, serviceherstart of runtime-env-write in de inventarisatie.

## 2026-10-21 — schijfruimte

De developmenthost had minder dan 600 MB vrij. Vier exacte oude webpack-cachepaden zijn onderzocht. Zij bevatten alleen gegenereerde `.pack`-bestanden van september, hebben dezelfde eigenaar, geen symlinks en geen aangetroffen verwijzingen in leesbare procesmetadata. Alleen die webpack-submappen zijn verwijderd. De Fieldgrid-worktreeadministratie is beschadigd/ontbreekt; daarom is geen claim over een geldige Git-status gedaan en zijn die repositories zelf behouden. Caches worden bij een volgende Next.js-build opnieuw aangemaakt.

## 2026-10-21 — prototype en infrastructuur gescheiden

Sites-versie 12 en broncommit zijn bevestigd en de bron is lokaal beschikbaar. De UI en assets zijn referentie; Vinext/Cloudflare Workers, demo-rolwissels en demonstratiestore worden geen VPS-backend. De bestaande pnpm/Node 24/Next-structuur wordt eerst geïnventariseerd voordat versie- of structuurwijzigingen worden gekozen.

Voor database-inventarisatie worden API-projectref, databaseprojectref en GitHub-configuratie vergeleken. Alleen bij overeenstemming en een release onder het verwachte releasepad wordt een bestaande `pg`-dependency gebruikt. SQL draait in een expliciete read-only transactie. Integratiegegevens worden uitsluitend in geheugen ontsleuteld en als aantallen gerapporteerd. Dit is geen back-up of hersteltest.

Geraadpleegde actuele bronnen: [Supabase changelog](https://supabase.com/changelog.md) en [databaseverbindingen](https://supabase.com/docs/guides/database/connecting-to-postgres). De bestaande providerhost en verbindingsvorm worden overgenomen, niet uit regio of projectnaam geconstrueerd. TLS-/Postgreswijzigingen worden bij de daadwerkelijke versiekeuze opnieuw beoordeeld.

## 2026-10-21 — live inventarisatie en behoudvoorwaarden

De runner bevestigt host `nxtdrive` voor beide environments. Stagingproject `kulyguiszfsxzlhlyyeo` is onbereikbaar via zowel API- als database-DNS (`ENOTFOUND`); productieproject `hhhdgfmsgbkfkmoqzhif` is bereikbaar. Alle zes runtime-/GitHub-vergelijkingen per omgeving zijn gelijk. Productieruntime meldt de tabletcommit, terwijl staging de main-commit meldt; de beide codeversies zijn gearchiveerd.

Productie is read-only onderzocht: PostgreSQL 17.6, twee succesvol ontsleutelde platformsecrets, geen tenant-secretrecords, één platformsetting met verzendadres, 17 Auth-accounts en twee Storage-buckets. Dit bewijs is geen back-up, restore of functionele providerproef. Geen credentials vervangen of zakelijke data gewijzigd.

De inventarisatieworkflow selecteert secrets rechtstreeks via een vaste environmentprefix. Een ontbrekend stagingsecret krijgt geen productie-fallback. De doelserver mist dump-/restoretools en Docker, en de runner kan Caddy-secrets niet lezen. De gebruiker is gericht gevraagd het bestaande stagingproject te hervatten of de juiste Supabase-account te koppelen. Een projectopvraag via de huidige MCP-account is wegens ontbrekende rechten geweigerd. De reden van de ontbrekende DNS is nog niet vastgesteld.

Eerst de ontbrekende toegang en private herstelvoorziening regelen; geen database-reset of vervanging van de oude productieapp zolang het noodzakelijke herstelbewijs ontbreekt. De app- en baselineherbouw blijft open. De self-hosted inventarisatie werkt ondanks een billingblokkade die de bestaande hosted GitHub-jobs al vóór runner-toewijzing laat falen.

# Behoud- en verwijdermanifest

Status 21 oktober 2026: codearchief geverifieerd; lokale cacheopruiming uitgevoerd; geen applicatiedatabase gereset. Dit manifest verleent geen resetvrijgave.

## Codearchief

Repository: `https://github.com/nxtdriveio/nxtdrive-platform`.

| Archiefbranch                                            | Volledige commit                           |
| -------------------------------------------------------- | ------------------------------------------ |
| `archive/pre-v1-rebuild-20261021-main-ebebfdf`           | `ebebfdf02a7bf945a198a82ffaf276f73cafdc0b` |
| `archive/pre-v1-rebuild-20261021-staging-ebebfdf`        | `ebebfdf02a7bf945a198a82ffaf276f73cafdc0b` |
| `archive/pre-v1-rebuild-20261021-tablet-065562a`         | `065562adb390741b825cd8b92d623d5cb882676a` |
| `archive/pre-v1-rebuild-20261021-maps-f03e9b8`           | `f03e9b8770c64cd854af3fdf2f89b1b21c10f13d` |
| `archive/pre-v1-rebuild-20261021-local-worktree-33dba92` | `33dba92d92c780d74eb22820cb9de99d9792c389` |

Atomic push geslaagd. Onafhankelijke fetch naar `/home/codex/.codex/nxtdrive-v1-archive-verification.git`; elke commit en de trees `supabase/migrations`, `infra`, `docs` geverifieerd. De bestaande secretscanner slaagde vóór archivering voor de 1.649 bestanden van de werkbranch. Geen lokale bronwijzigingen in beide worktrees. De archieven bevatten reeds bestaande Git-geschiedenis; een scanner op de huidige tree bewijst niet dat iedere historische blob is onderzocht.

## Development-VPS: uitgevoerde cacheverwijdering

Host: `codex-worker-01`. Eigenaar UID 1001. Alle paden zijn absolute resolved paths zonder symlink; alleen gegenereerde webpack `.pack`-bestanden ouder dan zeven dagen. Geen verwijzing gevonden in leesbare `/proc` cwd/exe/fd/maps. Geen uitspraak over onleesbare procesmetadata. De geraakte cachebestanden dateren van 8 en 19 september 2026.

| Verwijderd exact pad                                                                             | Toegewezen bytes | Resultaat  |
| ------------------------------------------------------------------------------------------------ | ---------------: | ---------- |
| `/home/codex/repos/fieldgrid-root-rotation-20260908/artifacts/backoffice/.next/cache/webpack`    |        910176256 | Verwijderd |
| `/home/codex/repos/fieldgrid-policy-repair/artifacts/backoffice/.next/cache/webpack`             |        911884288 | Verwijderd |
| `/home/codex/repos/fieldgrid-root-rotation-20260908/artifacts/personeel-pwa/.next/cache/webpack` |        402513920 | Verwijderd |
| `/home/codex/repos/fieldgrid-policy-repair/artifacts/personeel-pwa/.next/cache/webpack`          |        403963904 | Verwijderd |

Vrij vóór: 597213184 bytes; direct erna: 3225747456 bytes. Cacheherstel: volgende Next.js-build van het betreffende package. Broncode, overige buildoutput, dependencies, configuratie, Git-metadata, databases en back-ups behouden. Lokaal uitvoeringsbewijs: `/home/codex/.codex/cleanup-nxtdrive-20261021.json`, modus 0600.

## Staging en productie: inventarisatie vóór enig resetbesluit

| Onderdeel                  | Staging                                 | Production                                 |
| -------------------------- | --------------------------------------- | ------------------------------------------ |
| Transport/toegang          | Self-hosted runner `nxtdrive-vps`       | Dezelfde geregistreerde runnerlabels       |
| Live host/project-ID       | Nog door runner te bevestigen           | Nog door runner te bevestigen              |
| Verwacht basispad uit bron | `/var/www/nxtdrive/staging`             | `/var/www/nxtdrive/production`             |
| Verwacht runtimebestand    | `/var/www/nxtdrive/staging/shared/.env` | `/var/www/nxtdrive/production/shared/.env` |
| GitHub-connectionnaam      | `STAGING_DATABASE_URL`                  | `PRODUCTION_DATABASE_URL`                  |
| Actuele release-SHA        | Nog live te bevestigen                  | Nog live te bevestigen                     |
| Exacte resetobjecten       | Geen vrijgegeven                        | Geen vrijgegeven                           |
| Private back-upreferentie  | Nog niet gemaakt                        | Nog niet gemaakt                           |
| Getest herstelpunt/-pad    | Nog niet bewezen                        | Nog niet bewezen                           |
| Doelserververwijderpaden   | Geen vrijgegeven                        | Geen vrijgegeven                           |

Te behouden: alle bestaande environment-/integratiecredentials, env-fallbacks, encrypted records met tenant/eigenaarcontext, `platform_settings`, Auth-accounttoegang, Storage, Vault, Caddy/TLS, runners, systemd, SSH/netwerk en hersteldata. Zakelijke applicatiedata blijft staan totdat de objectlijst en het samenhangende code/database/configuratieherstel zijn bewezen.

Auth: accountaantallen eerst inventariseren; toegang van bestaande productiegebruikers expliciet naar V1 mappen. Geen accountverwijdering of generiek CASCADE toegestaan door dit manifest. Storage: geen buckets of objecten verwijderen. Migraties: oude runner niet als V1-baseline uitvoeren; een nieuwe procedure moet de oude `public._migrations` bewust behandelen.

Oude deploys/cronjobs zijn nog niet gepauzeerd omdat geen reset/cutover plaatsvindt. Voor reset: exact opsommen en pauzeren, writes veiligstellen, versleutelde private back-up maken, restore testen, configuratieherstel en decryptie bewijzen. Symlinkrollback alleen is onvoldoende na een schemareset.

## Domeinbeslissingen voor de schone opbouw

| Bestaand domein                             | Behandeling                                                                  |
| ------------------------------------------- | ---------------------------------------------------------------------------- |
| Infra, pnpm, Node 24, releasepaden          | Behouden en compatibiliteit toetsen                                          |
| Identiteit, tenants, toegangsregels         | Domeinkennis behouden; nieuwe serverautorisatie/RLS bewijzen                 |
| Intake, planning, beschikbaarheid, locaties | Regels en geteste adapters evalueren; nieuwe V1-acties                       |
| RIS/catalogus/publicatie                    | Canon en catalogus behouden; toestanden en versiegrenzen expliciet herbouwen |
| Toetsen, wagenpark, kilometers              | Domeinkennis hergebruiken; transactie-/correctieflows toetsen                |
| Minuten, facturen, Mollie                   | Integratiecredentials behouden; ledger/idempotentie expliciet bewijzen       |
| Communicatie, taken                         | Providers behouden; outbox/retries in nieuwe transacties                     |
| Import, privacy, platformbeheer             | Gecontroleerde flows met audit herbouwen                                     |
| Thema, assets en tutorial                   | Sites-v12-UI/merkassets behouden, productiecontext apart                     |
| Demo-store, vrije rol-/tenantwissel         | Uitsluitend referentie; niet overnemen als productiebackend                  |
| Oude migratiereeks                          | Archief; geen automatische nieuwe baseline                                   |
| Franchise/AI-lesroutes/uitgebreide theorie  | Archief en backlog, buiten V1                                                |

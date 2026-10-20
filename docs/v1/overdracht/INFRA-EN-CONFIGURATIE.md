# Infrastructuur en configuratie — aangetroffen basis

Onderzocht: `nxtdriveio/nxtdrive-platform`, main-commit `ebebfdf02a7bf945a198a82ffaf276f73cafdc0b`. Dit zijn bevindingen uit broncode en documentatie, **geen verificatie van de huidige live servers of secretwaarden**. Controleer ze opnieuw vóór uitvoering.

## Deployment die in de repository staat

| Aspect | Staging | Productie |
| --- | --- | --- |
| Branchtrigger | `staging` | `main` |
| GitHub Environment | `staging` | `production` |
| Workflow | `.github/workflows/deploy-staging.yml` | `.github/workflows/deploy-production.yml` |
| Runnerlabels | `self-hosted`, `nxtdrive-vps` | `self-hosted`, `nxtdrive-vps` |
| Basisdirectory | `/var/www/nxtdrive/staging` | `/var/www/nxtdrive/production` |
| Runtime-env | `shared/.env` onder basisdirectory | `shared/.env` onder basisdirectory |
| Releases | `releases/<tijdstempel>` met `current`-symlink | idem |
| systemd-service | `nxtdrive-staging` | `nxtdrive-production` |
| Poort | 5000 | 5001 |
| Domein | `https://staging.nxtdrive.io` | `https://nxtdrive.io` |

De huidige workflows bouwen op een self-hosted VPS-runner en publiceren lokaal met rsync. Dit is geen SSH-transport vanaf een hosted runner en geen Dockerdeployment. Caddy verzorgt TLS/proxying naar de lokale poorten. De bestaande documentatie noemt één Hetzner CPX41 met Ubuntu 24.04; de gebruiker noemt een development-VPS en doel-VPS. Dat verschil moet worden geïnventariseerd, niet ingevuld met een aanname.

De workflowketen omvat install/typecheck/build, migraties, runtime-env schrijven, nieuwe release, symlinkwissel, systemd-herstart en healthcheck; productie heeft aanvullende smokechecks. De bestaande opruimlogica bewaart vijf releases. Behoud of wijzig dit bewust op basis van het nieuwe herstelplan.

`/api/health` is het eenvoudige controlepunt. `/api/health/ready` controleert tevens configuratie en een databaseleesactie. Een HTTP 200 op een marketingpagina bewijst geen werkende app.

De bestaande `rollback.yml` zet de applicatierelease terug. **Dit herstelt geen database**. Na een incompatibele schemareset moet code, configuratie en database als samenhangende set kunnen worden hersteld.

## Bestaande stack en herbruikbare kennis

- pnpm-monorepo met `artifacts/*`, `lib/*`, `lib/integrations/*` en `scripts`.
- Applicatie `artifacts/nxtdrive`, package `@workspace/nxtdrive`.
- Rootconfiguratie: pnpm 10.26.1, Node `>=24 <25`, TypeScript circa 5.9.3.
- Aangetroffen appversies: Next 15.5.22, React 19.1, Tailwind 4.1.14, framer-motion 12.38, Supabase JS 2.105.4, `@supabase/ssr` 0.5.2.
- Relevante aanwezige bouwstenen: dnd-kit, Tiptap, Recharts, pdf-lib, web-push en OpenAI SDK.
- Mogelijk herbruikbaar: `lib/leads-analysis`, `lib/leskaart`, `artifacts/nxtdrive/domains/maps`. Beoordeel herbruikbaarheid met tests; aanwezigheid is geen kwaliteitsgarantie.
- Belangrijke operationele bronnen: `infra/README.md`, `docs/INFRA_DEPLOYMENT.md` en de workflows. Er was bij inspectie geen root-README.

Deze versies zijn een geïnventariseerde uitgangssituatie, geen advies om verouderde of onveilige versies vast te houden. Controleer actuele compatibiliteit en beveiligingsupdates bij implementatie; maak upgrades klein en toetsbaar.

## Credentialnamen uit deployment

| Staging-secret | Production-secret | Runtimegebruik |
| --- | --- | --- |
| `STAGING_SUPABASE_URL` | `PRODUCTION_SUPABASE_URL` | `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_URL` |
| `STAGING_SUPABASE_ANON_KEY` | `PRODUCTION_SUPABASE_ANON_KEY` | `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_ANON_KEY` |
| `STAGING_SUPABASE_SERVICE_ROLE_KEY` | `PRODUCTION_SUPABASE_SERVICE_ROLE_KEY` | `SUPABASE_SERVICE_ROLE_KEY` — uitsluitend server |
| `STAGING_SESSION_SECRET` | `PRODUCTION_SESSION_SECRET` | `SESSION_SECRET` |
| `STAGING_DATABASE_URL` | `PRODUCTION_DATABASE_URL` | `DATABASE_URL` |
| `MOLLIE_KEY_ENCRYPTION_SECRET` in stagingomgeving | `MOLLIE_KEY_ENCRYPTION_SECRET` in productieomgeving | sleutel voor versleutelde integratieconfiguratie |

Niet-geheime releasegegevens die de workflow opbouwt: `NODE_ENV`, `PORT`, `NEXT_PUBLIC_APP_VERSION`, `NEXT_PUBLIC_APP_URL`, `GIT_SHA`, `BUILD_TIMESTAMP`, `DATABASE_MIGRATION_VERSION`.

De aanwezigheid van een naam in een workflow bewijst niet dat de waarde is ingesteld, actueel is of bereikbaar is voor de runner. Registreer per omgeving een status zonder waarde: aanwezig, bron vastgesteld, referentie klopt, veilig functioneel gecontroleerd of ontbrekend.

## Overige configuratiereferenties

| Namen | Doel en aandachtspunt |
| --- | --- |
| `SENDGRID_API_KEY`, `SENDGRID_FROM_EMAIL` | Mail; ook databaseconfiguratie onderzoeken |
| `OPENAI_API_KEY` | Bestaande optionele AI-configuratie behouden; geen vereiste om V1 generatief te maken |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Push; private key nooit naar client |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | Publieke browserkey met juiste beperkingen |
| `GOOGLE_PLACES_API_KEY`, `GOOGLE_ROUTES_API_KEY`, `GOOGLE_ADDRESS_VALIDATION_API_KEY`, `GOOGLE_GEOCODING_API_KEY` | Serverintegratie/providerkeuze en beperkingen controleren |
| `CLOUDFLARE_API_TOKEN` | Caddy/TLS-configuratie; aangetroffen verwijzing naar `/etc/caddy/caddy.env` |
| `CRON_SECRET` | Beveiliging van geplande taken |
| `NXTDRIVE_STAGING_URL`, `NXTDRIVE_PROD_URL` | GitHub-variabelen voor omgevings-URL’s |
| `SMOKE_TENANT_HOST`, `SMOKE_CUSTOM_DOMAIN_HOST` | Eventuele hostvarianten in tests |
| `SMOKE_STUDENT_EMAIL`, `SMOKE_STUDENT_PASSWORD`, `SMOKE_INSTRUCTOR_EMAIL`, `SMOKE_INSTRUCTOR_PASSWORD` | Gecontroleerde testaccounts, geen echte leerlingen gebruiken |
| `SMOKE_ALLOW_DEGRADED_READY` | Uitzondering voor tests mag normale productie-readiness niet verhullen |
| `E2E_TENANT_HOST`, `E2E_CUSTOM_DOMAIN_HOST`, `E2E_ENABLE_PAYMENT_REDIRECT` | E2E-configuratie |

Dit is geen gegarandeerd volledige live inventaris. Voeg aangetroffen namen toe aan het uitvoeringsmanifest. De oude deployment schrijft een vaste set env-variabelen; zorg dat een nieuwe deployment optionele maar gebruikte variabelen niet per ongeluk wegschrijft.

## Databaseconfiguratie die behouden moet blijven

| Bronbestand | Aangetroffen opslag | Wat behouden moet blijven |
| --- | --- | --- |
| `artifacts/nxtdrive/lib/email/platform-config.ts` | `platform_secrets`: `sendgrid_api_key` | Versleutelde key, context en decryptiesleutel |
| `artifacts/nxtdrive/lib/email/platform-config.ts` | `platform_settings`: `sendgrid_from_email` als JSON met `email` | Verzendadres en overige benodigde instellingen; eventuele env-fallback behouden |
| `artifacts/nxtdrive/lib/ai/platform-config.ts` | `platform_secrets`, waaronder `openai_api_key` | Bestaande optionele configuratie; niet onbedoeld vervangen |
| `artifacts/nxtdrive/lib/mollie/secrets.ts` | `tenant_secrets`, waaronder `mollie_api_key` | Ciphertext, tenant/eigenaarrelatie en sleutel |
| `artifacts/nxtdrive/lib/crypto/aead.ts` | AES-256-GCM met bestaande `MOLLIE_KEY_ENCRYPTION_SECRET` | Bestaand sleutelformaat en veilige compatibiliteit |

Bij inspectie verwacht de bestaande crypto-implementatie een sleutel van 64 hextekens. Laat dit door de aanwezige code valideren; toon de waarde niet. Neem niet aan dat een ciphertext zonder bijbehorende tenant-ID of decryptiesleutel bruikbaar blijft. De bewaar-/herstelprocedure moet bestaande configuratie naar de nieuwe structuur mappen en daarna een veilige controle uitvoeren.

## Migraties en reset

De oude migraties staan onder `supabase/migrations`. `scripts/src/apply-migrations.ts` houdt de toegepaste bestandsnamen bij in `public._migrations`. Aangetroffen aanroep:

```text
pnpm --filter @workspace/scripts run db:migrate -- --env=staging
pnpm --filter @workspace/scripts run db:migrate -- --env=production
```

Dit zijn bronverwijzingen, geen opdracht om de oude reeks nu uit te voeren. De nieuwe V1-baseline krijgt een bewuste procedure.

`scripts/src/lib/db-env.ts` verlangt voor productie `PRODUCTION_DATABASE_URL`; staging gebruikt `STAGING_DATABASE_URL` met een `DATABASE_URL`-fallback. De code controleert de relatie tussen API-URL en databaseprojectref. Behoud of verbeter dit veiligheidsmechanisme. Een verkeerde omgevingsfallback mag nooit een productie-reset veroorzaken.

Scheiding bij reset: zakelijke applicatiedata/schema’s, integratieconfiguratie, Auth, Storage, cron/jobs en Supabase-beheerobjecten. Bescherm standaard de beheerde schema’s en benodigde infrastructuur. Pas niet blind `DROP DATABASE`, `DROP SCHEMA ... CASCADE` of een brede truncate toe. Genereer de definitieve resetprocedure pas nadat de objectlijst en afhankelijkheden bekend zijn.

## Tegenstrijdigheden die expliciet moeten worden opgelost

1. Oud infra-advies over nieuwe Supabase-projecten/keys: overschreven door de gebruikersopdracht tot hergebruik.
2. Oude documentatie over één VPS versus development- en doel-VPS: live inventarisatie is leidend.
3. Google in echte bron versus openrouteservice in oorspronkelijk productidee/prototype: behoud bestaande credentials, kies een passende adapter en leg de keuze vast.
4. Oude redirectverwijzing naar `rijschool.nxtdrive.io` versus aangetroffen canonieke Caddyconfiguratie rond `nxtdrive.io`: controleer daadwerkelijke DNS, Caddy en Auth-callbacks.
5. Documentatie over verwijderen van oude SSH-secrets: niet blind uitvoeren; verifieer afhankelijkheden en gebruikersopdracht.
6. Oude rollback van alleen applicatiecode: uitbreiden tot passend code/schema/configuratieherstel vóór de reset.

Niet gecontroleerd in deze overdrachtsronde: werkelijke live hosts, actieve releases, database-inhoud, secretwaarden, DNS, runnergezondheid, bestaande back-ups, branchbescherming en provideraccounts. Die controles vormen fase 1 van de uitvoering.

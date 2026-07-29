# NXTDRIVE Production Runbook

Status: active runbook
Owner: product / engineering / operations
Last updated: 2026-06-15

## Doel

Dit runbook beschrijft de minimale productiehandelingen voor deploy verificatie,
smoke tests, incident triage en rollback. Het is bedoeld als praktische checklist
voor `nxtdrive.io` en later exact hetzelfde voor staging.

## Endpoints

| Endpoint | Doel | Verwachte status |
|---|---|---|
| `/api/health` | Proces-health: Next.js draait en serveert requests. | `200` |
| `/api/health/ready` | Readiness: runtime secrets aanwezig en Supabase bereikbaar via service role. | `200` |

Gebruik `/api/health` voor de snelle GitHub deploy health gate.
Gebruik `/api/health/ready` voor externe monitoring en handmatige release checks.

Deploy workflows draaien nu na restart ook een `Deploy-integrated smoke`-pass
tegen de live URL. Die gebruikt `SMOKE_BROWSER_MODE=off`, zodat iedere deploy
ten minste health, readiness, manifests en hosted login shells opnieuw verifieert.

## Deploy verificatie

Na iedere productie-deploy:

1. Controleer GitHub Actions: `Deploy production` moet groen zijn.
2. Controleer proces-health:

```bash
curl -fsS https://nxtdrive.io/api/health
```

3. Controleer readiness:

```bash
curl -fsS https://nxtdrive.io/api/health/ready
```

4. Controleer beveiligingsheaders:

```bash
curl -I https://nxtdrive.io/login
```

Minimaal verwacht:

- `strict-transport-security`
- `x-content-type-options`
- `referrer-policy`
- `x-frame-options`

5. Open handmatig:

- `/login`
- `/student`
- `/instructor`
- `/backoffice`
- `/admin`

## Smoke tests

Zonder testaccounts controleert de smoke-runner health, readiness, PWA manifests
en de loginpagina:

```bash
SMOKE_BASE_URL=https://nxtdrive.io \
  pnpm --filter @workspace/scripts run smoke:production
```

Met testaccounts controleert hij ook echte student- en instructeur-login:

```bash
SMOKE_BASE_URL=https://nxtdrive.io \
SMOKE_STUDENT_EMAIL="student@example.com" \
SMOKE_STUDENT_PASSWORD="..." \
SMOKE_INSTRUCTOR_EMAIL="instructor@example.com" \
SMOKE_INSTRUCTOR_PASSWORD="..." \
  pnpm --filter @workspace/scripts run smoke:production
```

Gebruik `SMOKE_ALLOW_DEGRADED_READY=1` alleen lokaal of in tijdelijke staging
waar runtime secrets bewust incompleet zijn. Niet gebruiken als productie-gate.

Wanneer subdomain/custom-domain login shells expliciet mee moeten in de smoke:

```bash
SMOKE_BASE_URL=https://nxtdrive.io \
SMOKE_TENANT_HOST=https://test.nxtdrive.io \
SMOKE_CUSTOM_DOMAIN_HOST=https://rijschool.example.nl \
  pnpm --filter @workspace/scripts run smoke:production
```

`SMOKE_TENANT_HOST` en `SMOKE_CUSTOM_DOMAIN_HOST` controleren alleen of de
hosted `/login` shell via HTTPS laadt en de auth-form rendert.

Voor deploy-integrated smoke in GitHub Actions worden dezelfde environment
host secret names gebruikt:

- `SMOKE_TENANT_HOST`
- `SMOKE_CUSTOM_DOMAIN_HOST`

De geplande monitor-workflow gebruikt daarnaast ook de browser-login secrets:

- `SMOKE_STUDENT_EMAIL`
- `SMOKE_STUDENT_PASSWORD`
- `SMOKE_INSTRUCTOR_EMAIL`
- `SMOKE_INSTRUCTOR_PASSWORD`

## E2E business flows

De smoke-runner is bewust licht. Voor echte regressiedekking op de kritieke
productflows is er daarnaast een browsergedreven suite:

```bash
pnpm --filter @workspace/scripts run e2e:business-flows
pnpm --filter @workspace/scripts run e2e:business-flows -- --env=production
```

De suite dekt:

- tenant admin, instructor en student login + sessieherstel;
- verificatie van persistente auth cookies / session retention;
- lead -> proefles -> leerling conversie;
- les plannen -> starten -> afronden;
- chat tussen leerling en instructeur;
- branch-scope isolatie in de backoffice;
- white-label host resolution op subdomain en optioneel custom domain;
- student factuurweergave en optioneel de checkout-entrypoint.

Belangrijk:

- de suite verwacht scenario-accounts, of expliciete `E2E_*` credentials;
- `E2E_TENANT_HOST` is nodig wanneer tenant-subdomains niet automatisch uit de
  target origin afgeleid kunnen worden;
- `E2E_CUSTOM_DOMAIN_HOST` is optioneel voor verified custom-domain routing;
- `E2E_ENABLE_PAYMENT_REDIRECT=1` volgt de externe PSP redirect echt door.
  Zonder deze flag blijft de check binnen de app boundary.
- white-label subdomain-validatie voor `*.nxtdrive.io` slaagt alleen als de
  wildcard TLS-setup echt actief is in Caddy. Een geldige DNS A-record alleen
  is niet genoeg; zonder het wildcard-certificaat faalt de browser-run met
  `ERR_SSL_PROTOCOL_ERROR`.

Actuele productiestatus:

- de wildcard subdomain check voor `https://test.nxtdrive.io/login` is nu
  groen in production;
- de business-flow suite is groen voor production op login/session reuse, lead
  -> proefles -> leerling, lesson completion, messaging, branch isolation,
  white-label subdomain shell, student payments entrypoint en session retention;
- alleen optionele checks blijven afhankelijk van configuratie:
  `E2E_CUSTOM_DOMAIN_HOST` en `E2E_ENABLE_PAYMENT_REDIRECT=1`.

## Route performance budgets

Voor livegang moet de routegrootte meetbaar bewaakt blijven. Gebruik daarom:

```bash
pnpm --filter @workspace/scripts run check-route-performance
```

Deze budgetcheck draait een production build en bewaakt minimaal:

- `/account/wachtwoord-wijzigen`
- `/student`
- `/instructor`
- `/backoffice`
- de notification-template editors
- `First Load JS shared by all`
- middleware bundle grootte

Actuele winst uit deze pass:

- `/account/wachtwoord-wijzigen` daalde van `570 kB` naar `180 kB` first load
  door lazy password-strength loading;
- notification template editors daalden van `256 kB` naar `108 kB` first load
  door de Tiptap editor pas na interactie in te laden.

Gebruik deze budgetcheck vóór brede productie-livegang en na iedere grotere
frontend-sprint die student, instructor, admin of backoffice shells raakt.

## RIS release gate

Voordat RIS voor een tenant op productie wordt geactiveerd, moet deze release
gate groen zijn:

```bash
pnpm --filter @workspace/scripts run test-ris-foundation
pnpm --filter @workspace/scripts run test-ris-instructor-mode
pnpm --filter @workspace/scripts run test-ris-publication-flow
pnpm --filter @workspace/scripts run test-ris-student-view
pnpm --filter @workspace/scripts run test-ris-backoffice-overview
pnpm --filter @workspace/scripts run test-ris-module-tests-cbr
pnpm --filter @workspace/scripts run test-ris-ai-reporting
pnpm --filter @workspace/scripts run test-ris-migration-rollout
pnpm --filter @workspace/scripts run test-ris-release-hardening
pnpm --filter @workspace/scripts run check-route-performance
```

Minimale handmatige RIS-smoke na deploy:

1. Open `/backoffice/ris` als tenant admin.
2. Controleer de migratiepreflight. Activeer echte historische data alleen als
   de checklist groen is. Gaat het aantoonbaar om mock-data, gebruik dan
   `SCHOON STARTEN` om alleen legacy scoretabellen te wissen en RIS te
   activeren.
3. Open een instructeurles en bevestig dat RIS-scorekaart zichtbaar is voor een
   RIS-tenant en legacy scoring zichtbaar blijft voor een legacy-tenant.
4. Leg minimaal een conceptscore en begeleide reflectie vast.
5. Publiceer de RIS-leskaart.
6. Rond de les af.
7. Open `/student/voortgang` als leerling en controleer dat alleen
   gepubliceerde, leerlingvriendelijke RIS-feedback zichtbaar is.
8. Open `/backoffice/ris` en controleer aandachtspunten, conceptkaarten,
   moduletoetsen en rapportagesignalen.

RIS rollback:

- Zet de tenant terug naar legacy door `lesson_card_mode = legacy` via de
  RIS-instellingen/RPC te herstellen.
- Bestaande RIS-publicaties blijven in de database bewaard, maar de student- en
  instructeurflows vallen terug op de legacy-leskaart.
- Maak geen handmatige deletes op `ris_lesson_cards`,
  `ris_script_assessments` of `student_ris_progress` tijdens rollback; dat
  maakt audit en support lastiger.
- Bij RLS-incidenten: controleer eerst `ris_lesson_cards`,
  `ris_script_assessments`, `student_ris_progress` en
  `ris_guided_reflections` policies. Concepts en interne observaties mogen
  nooit zichtbaar zijn voor leerlingen.

## Wildcard TLS enablement op de VPS

Voor `*.nxtdrive.io` is naast DNS ook een expliciete Caddy one-time setup nodig.
Gebruik op de VPS bij voorkeur het meegeleverde script:

```bash
cd /root/nxtdrive-platform
sudo WILDCARD_TEST_HOST=test.nxtdrive.io ./infra/enable-wildcard-tls.sh
```

Dit script:

- controleert of de Caddy binary de `dns.providers.cloudflare` module bevat;
- controleert of `CLOUDFLARE_API_TOKEN` in `/etc/caddy/caddy.env` staat;
- installeert `infra/Caddyfile.wildcard` naar `/etc/caddy/sites-enabled/wildcard`;
- valideert de Caddy-config;
- herstart Caddy;
- verifieert `https://<subdomain>.nxtdrive.io/login`.

Als de Cloudflare DNS plugin ontbreekt, voer eerst uit:

```bash
sudo caddy add-package github.com/caddy-dns/cloudflare
```

## Monitoring

Minimale externe monitoring:

- uptime probe op `https://nxtdrive.io/api/health`;
- readiness probe op `https://nxtdrive.io/api/health/ready`;
- alert bij 2 opeenvolgende readiness-failures;
- alert bij GitHub Actions deploy failure;
- alert bij Caddy 5xx stijging;
- alert bij Supabase degraded status;
- alert bij mislukte webhook/job retries zodra het ops center bestaat.

Aanbevolen externe tooling:

- Better Stack of UptimeRobot voor uptime/readiness;
- Sentry voor frontend/server exceptions;
- Supabase logs/advisors voor database en auth;
- VPS metrics voor CPU, memory, disk en systemd restarts.

## Monitor smoke and alerts

Er draait nu ook een GitHub Actions monitor-workflow:

- workflow: `Monitor smoke and alerts`
- frequentie: iedere 30 minuten plus handmatige `workflow_dispatch`
- targets: production en staging
- uitvoering: browser-smoke met Playwright op GitHub-hosted runners

Alerting gedrag:

- bij een smoke failure opent of update de workflow een GitHub issue:
  - `[ops] Production smoke monitor failing`
  - `[ops] Staging smoke monitor failing`
- zodra de omgeving weer groen is, plaatst dezelfde workflow een herstelcomment
  en sluit het openstaande alert issue automatisch.

Dit vervangt geen externe uptime tooling of Sentry, maar geeft wel direct
repo-native alerting op deploy-regressies en publiek bereikbare smoke-fouten.

## Incident triage

Gebruik deze volgorde bij productieproblemen:

1. Is de app bereikbaar?

```bash
curl -i https://nxtdrive.io/api/health
```

2. Is de runtime klaar?

```bash
curl -i https://nxtdrive.io/api/health/ready
```

3. Controleer systemd:

```bash
sudo systemctl status nxtdrive-production --no-pager -l
sudo journalctl -u nxtdrive-production -n 200 --no-pager
```

4. Controleer Caddy:

```bash
sudo systemctl status caddy --no-pager -l
sudo tail -n 200 /var/log/caddy/nxtdrive.io.log
```

5. Controleer GitHub Actions deploy logs.
6. Controleer Supabase status, auth logs en API logs.
7. Controleer betaalprovider/webhook logs als betalingen of credits geraakt zijn.

## Rollback

Gebruik de GitHub Actions `Rollback` workflow:

1. Kies environment: `production`.
2. Laat `release` leeg voor vorige release, of vul een bekende timestamp in.
3. Start workflow.
4. Controleer `/api/health`.
5. Controleer `/api/health/ready`.
6. Draai de smoke tests.

Let op: database-migraties zijn forward-only. Als een rollback een oude schema
verwacht, moet de database apart en bewust gecorrigeerd worden. Niet blind
terugdraaien zonder dat te controleren.

## Performance budget

Voor productie geldt voorlopig:

- `/login`: eerste render binnen 1 seconde warm cache;
- `/student`: bruikbaar binnen 2 seconden warm cache op mobiel;
- `/instructor`: bruikbaar binnen 2 seconden warm cache op tablet landscape;
- `/backoffice`: bruikbaar binnen 2.5 seconden warm cache op laptop;
- route JS groeit niet zonder bewuste review;
- grote client-only widgets moeten lazy geladen worden.

Bekende aandachtspunten:

- `/account/wachtwoord-wijzigen` is een bundle-hotspot en moet later apart
  gesplitst worden.
- Student en instructor PWA's hebben route-level loading states, maar nog geen
  volledige RUM/meting.
- Externe error monitoring is nog niet gekoppeld.

## Release checklist

Voor broad production:

- `pnpm run typecheck` groen;
- `pnpm --filter @workspace/nxtdrive run build` groen;
- operations guardrail groen;
- deploy-integrated smoke groen in de deploy workflow;
- monitor-workflow groen voor production en staging;
- smoke-runner groen tegen productie;
- business-flow E2E groen tegen staging of productie;
- wildcard/subdomain TLS gevalideerd voor `*.nxtdrive.io` wanneer white-label
  subdomains onderdeel zijn van de livegang;
- rollback dry-run minimaal op staging getest;
- testaccounts bestaan en worden periodiek gevalideerd;
- runbook is bijgewerkt bij relevante infrastructuurwijzigingen.

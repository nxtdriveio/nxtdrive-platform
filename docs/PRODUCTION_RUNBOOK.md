# NXTDRIVE Production Runbook

Status: active runbook
Owner: product / engineering / operations
Last updated: 2026-06-14

## Doel

Dit runbook beschrijft de minimale productiehandelingen voor deploy verificatie,
smoke tests, incident triage en rollback. Het is bedoeld als praktische checklist
voor `app.nxtdrive.io` en later exact hetzelfde voor staging.

## Endpoints

| Endpoint | Doel | Verwachte status |
|---|---|---|
| `/api/health` | Proces-health: Next.js draait en serveert requests. | `200` |
| `/api/health/ready` | Readiness: runtime secrets aanwezig en Supabase bereikbaar via service role. | `200` |

Gebruik `/api/health` voor de snelle GitHub deploy health gate.
Gebruik `/api/health/ready` voor externe monitoring en handmatige release checks.

## Deploy verificatie

Na iedere productie-deploy:

1. Controleer GitHub Actions: `Deploy production` moet groen zijn.
2. Controleer proces-health:

```bash
curl -fsS https://app.nxtdrive.io/api/health
```

3. Controleer readiness:

```bash
curl -fsS https://app.nxtdrive.io/api/health/ready
```

4. Controleer beveiligingsheaders:

```bash
curl -I https://app.nxtdrive.io/login
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
SMOKE_BASE_URL=https://app.nxtdrive.io \
  pnpm --filter @workspace/scripts run smoke:production
```

Met testaccounts controleert hij ook echte student- en instructeur-login:

```bash
SMOKE_BASE_URL=https://app.nxtdrive.io \
SMOKE_STUDENT_EMAIL="student@example.com" \
SMOKE_STUDENT_PASSWORD="..." \
SMOKE_INSTRUCTOR_EMAIL="instructor@example.com" \
SMOKE_INSTRUCTOR_PASSWORD="..." \
  pnpm --filter @workspace/scripts run smoke:production
```

Gebruik `SMOKE_ALLOW_DEGRADED_READY=1` alleen lokaal of in tijdelijke staging
waar runtime secrets bewust incompleet zijn. Niet gebruiken als productie-gate.

## Monitoring

Minimale externe monitoring:

- uptime probe op `https://app.nxtdrive.io/api/health`;
- readiness probe op `https://app.nxtdrive.io/api/health/ready`;
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

## Incident triage

Gebruik deze volgorde bij productieproblemen:

1. Is de app bereikbaar?

```bash
curl -i https://app.nxtdrive.io/api/health
```

2. Is de runtime klaar?

```bash
curl -i https://app.nxtdrive.io/api/health/ready
```

3. Controleer systemd:

```bash
sudo systemctl status nxtdrive-production --no-pager -l
sudo journalctl -u nxtdrive-production -n 200 --no-pager
```

4. Controleer Caddy:

```bash
sudo systemctl status caddy --no-pager -l
sudo tail -n 200 /var/log/caddy/app.nxtdrive.io.log
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
- smoke-runner groen tegen productie;
- rollback dry-run minimaal op staging getest;
- testaccounts bestaan en worden periodiek gevalideerd;
- runbook is bijgewerkt bij relevante infrastructuurwijzigingen.

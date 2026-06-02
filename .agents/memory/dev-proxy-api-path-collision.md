---
name: Dev-proxy /api path collision (Next.js vs Express)
description: Why Next.js /api/* routes are unreachable via the shared proxy in the Replit dev environment, and how to verify them.
---

In this monorepo the shared reverse proxy (`localhost:80`) routes the `/api` path
prefix to the Express **api-server** artifact (its `artifact.toml` declares
`paths = ["/api"]`). The Next.js **nxtdrive** app owns `/` (previewPath `/`,
no basePath), so its own route handlers also live under `/api/...` (e.g.
`app/api/jobs/lesson-reminders/route.ts`).

**Consequence:** a request to `localhost:80/api/jobs/lesson-reminders` is matched
most-specific-first and goes to the **Express** server, which returns a 404
("Cannot POST ...") — it never reaches Next.js. Any HTTP verification of a
Next.js `/api/*` route from the dev shell must hit the app's **own port
directly**, bypassing the proxy.

**How to apply:**
- Find the port in `artifacts/nxtdrive/.replit-artifact/artifact.toml`
  (`localPort` / `PORT`).
- Curl/test against `http://localhost:<port>/api/...`, not `localhost:80/api/...`.
- The `db:test-notifications-send` script honors `APP_BASE_URL` — set it to
  `http://localhost:<port>` for cron-route e2e tests.

**Why this is fine in production:** on the VPS, Caddy routes
`app.nxtdrive.io` directly to the Next.js app (the Express api-server is "not the
main app" per replit.md), so `app.nxtdrive.io/api/...` reaches Next.js normally.
The GitHub Actions cron therefore targets the public domain, not the dev proxy.

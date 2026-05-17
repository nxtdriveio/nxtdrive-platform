import { headers } from "next/headers";

/**
 * Resolves the public origin of this app (scheme + host, no trailing slash).
 *
 * Priority:
 *  1. `NEXT_PUBLIC_APP_URL` — explicit override, used in production (VPS).
 *  2. `REPLIT_DOMAINS` — first entry, set in Replit autoscale deployments.
 *  3. `REPLIT_DEV_DOMAIN` — set in Replit dev previews.
 *  4. Request headers (`x-forwarded-host` / `host`) — local dev fallback.
 *
 * Headers are unreliable inside Replit's deployment proxy because the upstream
 * passes the internal bind address (e.g. `0.0.0.0:22557`) as the host. Env
 * vars are the source of truth there.
 */
export async function getPublicOrigin(): Promise<string> {
  const override = process.env.NEXT_PUBLIC_APP_URL;
  if (override) return override.replace(/\/+$/, "");

  const deployed = process.env.REPLIT_DOMAINS?.split(",")[0]?.trim();
  if (deployed) return `https://${deployed}`;

  const dev = process.env.REPLIT_DEV_DOMAIN;
  if (dev) return `https://${dev}`;

  const hdrs = await headers();
  const host = hdrs.get("x-forwarded-host") ?? hdrs.get("host") ?? "localhost:3000";
  const proto = hdrs.get("x-forwarded-proto") ?? "https";
  return `${proto}://${host}`;
}

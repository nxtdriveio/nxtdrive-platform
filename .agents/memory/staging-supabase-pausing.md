---
name: Staging Supabase pausing
description: Diagnosing the recurring "staging DB unreachable" symptom in NXTDRIVE.
---

Symptom: `db:migrate` / any DB access fails with the Supabase pooler reporting
`tenant/user postgres.<ref> not found` (FATAL), and the project's REST host
`<ref>.supabase.co` does not resolve in DNS — while general internet/DNS works.

**Cause:** the staging Supabase project was paused (free-tier projects pause on
inactivity). Pausing takes the whole project offline, not just the DB URL.

**Why it matters:** this looks like a stale/wrong connection string but usually is not —
the secrets are fine; the project just needs to be unpaused from the Supabase dashboard
(a user action). Once unpaused, REST returns 200 and the pooler accepts connections again.

**How to apply:** when DB is unreachable, first probe REST reachability from bash
(`curl $SUPABASE_URL/rest/v1/...` status only) and DNS (`getent hosts`). If REST host has
no DNS and the pooler says tenant-not-found, suspect a paused project before touching
secrets. Resolution is unpause (user), not a secret change.

---
name: Supabase RPC grant lockdown
description: SECURITY DEFINER RPCs that trust caller-supplied actor must revoke execute from anon AND authenticated, not just PUBLIC.
---

# Supabase RPC grant lockdown

When a migration creates a `SECURITY DEFINER` function in the `public` schema,
Supabase automatically grants `EXECUTE` on it to the `anon` and `authenticated`
roles, in addition to PUBLIC.

**Rule:** For any service-role-only RPC (especially ones that trust a
caller-supplied actor id like `p_actor`), `revoke ... from public` is NOT enough.
You must also:

```sql
revoke execute on function public.<name>(<arg types>) from anon, authenticated;
grant  execute on function public.<name>(<arg types>) to service_role;
```

**Why:** These RPCs run as the definer (bypass RLS) and trust `p_actor` for
authorization. If `authenticated` retains execute, any logged-in client can call
the RPC directly and forge a privileged actor, bypassing the server-side
service-role boundary. This is a cross-tenant / privilege-escalation hole.

**How to apply:** The canonical pattern lives in `0031_exam_readiness_inputs.sql`.
Every new mutating RPC migration must follow it. Verify after applying by
querying `pg_proc` + `aclexplode(proacl)` and asserting no `anon`/`authenticated`
EXECUTE grants remain. The migration runner (`apply-migrations.ts`) tracks
applied files by **filename only** (no checksum), so to fix already-applied
migrations, add a NEW forward migration with idempotent `revoke` statements —
editing the original file will not re-run on existing environments.

---
name: Parent portal dual-role child resolution
description: Why /ouder must use getActiveStudent({ preferGuardianChildren }) instead of the default own-row-wins behaviour.
---

`getActiveStudent` resolves the "active student" for a PWA user. By default the
user's OWN `students` row (matched by `user_id`) always wins, then falls back to
guardian-linked children. The `/student` PWA relies on this.

**Rule:** the parent portal (`/ouder`) must call `getActiveStudent(..., { preferGuardianChildren: true })`.
This SKIPS the own-row short-circuit and resolves from guardian-linked children
(cookie + picker). Apply it in BOTH the portal context loader and the `/ouder`
layout — they each call getActiveStudent independently.

**Why:** a single account can be both a student AND a parent in the same tenant
(solo-style memberships allow multiple roles). Without `preferGuardianChildren`,
such a user is pinned to their own student row and can never view their linked
child in the parent portal. The flag keeps `/student` (own row wins) and `/ouder`
(child wins) correct from one shared resolver.

**How to apply:** any new parent-portal entry point that needs the active child
must pass `preferGuardianChildren: true`; never re-add an own-row preference into
the `/ouder` path.

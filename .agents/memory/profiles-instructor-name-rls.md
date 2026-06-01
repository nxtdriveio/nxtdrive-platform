---
name: Tenant-wide reads of profiles & instructor lists
description: Why backoffice features that show OTHER users' names/instructor lists can't use the RLS client, and what to use instead.
---

# Resolving instructor (and other member) display names tenant-wide

Two RLS policies routinely break tenant-wide backoffice features and both fail
*silently* (you get generic fallbacks / short lists, not an error):

- `profiles` select policy is `id = auth.uid() OR is_platform_admin()`. A
  tenant_admin/instructor can therefore only read **their own** profile row.
  Reading other instructors' names via the RLS client yields nothing → callers
  fall back to a placeholder like "Instructeur".
- `memberships` select policy is self-or-tenant_admin. An **instructor** can only
  read their own membership row, so a tenant-wide instructor list built from
  memberships is incomplete for instructor users.

**How to apply (backoffice, tenant_admin/instructor-only pages):**
- To resolve member display names (instructors, staff), do a **service-role read
  of `profiles` by id**, where the ids are already tenant-bounded (e.g. taken
  from this tenant's `lessons.instructor_id`). This is the established pattern —
  see the backoffice agenda page and `lib/reports/quality-overview.ts`. Safe
  because the page is staff-only and the ids can't reference another tenant.
- To enumerate instructors tenant-wide, derive ids from `lessons.instructor_id`
  (lessons `*_select_members` RLS is readable by every tenant_admin/instructor),
  not from `memberships`. Trade-off: instructors with zero lessons won't appear —
  acceptable for activity/progress views.

**Why:** these are under-visibility (not over-exposure) failures, so typecheck
and a "does the page render" smoke test both pass while names quietly show the
fallback. Tests must assert a real name appears, not just absence of errors.

The score/cbr/students/lessons tables DO expose full tenant rows to
admin/instructor via their `*_select_members` policies, so the RLS server client
(plus an explicit `tenant_id` filter for defense in depth) is correct for those —
only `profiles`/`memberships` need the elevated path.

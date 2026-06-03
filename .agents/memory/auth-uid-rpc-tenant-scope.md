---
name: auth.uid()-keyed RPCs are NOT tenant-scoped
description: SECURITY DEFINER helper RPCs keyed on auth.uid() span all the user's tenants; never use them as a tenant-scoped picker source.
---

# auth.uid()-keyed helper RPCs leak across tenants

`my_lesson_instructors()` (and similar SECURITY DEFINER helpers defined off
`students.user_id` / `student_guardians.user_id`) resolve rows for **every**
student/guardian row the auth user owns — across **all** tenants. They are
intrinsically user-scoped, NOT tenant-scoped.

**Rule:** when a feature needs "the X for the active tenant" (e.g. the instructor
picker in student chat), do not call an auth.uid()-wide RPC. Query the underlying
tenant-scoped table filtered by `tenant_id` + the active `student_id`
(ownership already established via `getActiveStudent`), then resolve names.

**Why:** a user who is a student in two tenants (or a leerling+ouder across
schools) would otherwise see another rijschool's instructors in the current
tenant context, and selecting one makes the locked RPC reject the conversation
(broken UX + cross-tenant name exposure). Caught in code review for the Berichten
chat feature.

**How to apply:** any "list the things this user can act on within tenant T"
data path must filter by `tenant_id` (and the tenant-scoped subject row), never
rely on an auth.uid()-only RPC for tenant isolation. Add a regression test that
puts the same user in two tenants and asserts only tenant-T rows appear.

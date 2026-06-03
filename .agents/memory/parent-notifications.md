---
name: Parent notification fan-out & gating
description: Rules for notifying linked guardians (parents) of a child's events.
---

# Parent notifications (factuur / les)

Parent-facing notification types (e.g. `parent_invoice_ready`,
`parent_lesson_scheduled`) reuse the standard dispatch layer but fan out to
every linked guardian of the affected child.

**Rules:**
- Resolve guardians from `student_guardians` (by tenant_id+student_id), then read
  their email/name from `profiles` via the **service-role** client — profiles RLS
  only exposes the caller's own row, so an anon/RLS read returns nothing.
- One dispatch per guardian; the dedupe key MUST embed the guardian user id
  (`...:guardian:${userId}`) so each guardian gets exactly one email + in-app per
  source event, and a later-added guardian still receives their own.
- In-app link points to `/ouder` (parent portal), not `/student`.
- **Gate on `parent_portal_visibility`** (Task #96, `lib/parent-portal/visibility.ts`):
  if the tenant hid the relevant section, send NO parent notification. Mapping:
  invoice → `facturen`, scheduled lesson → `planning`. Visibility read defaults to
  visible and never throws, so a settings error can't silently suppress mail.

**Why:** parents opted into a read-only portal; notifying them about a section the
school deliberately disabled would leak/confuse. Per-guardian dedupe mirrors the
partial-unique-index idempotency used elsewhere.

**How to apply:** when adding a new parent notification, mirror
`notifyParentsInvoiceReady`/`notifyParentsLessonScheduled` in `dispatch.ts`, pick
the matching `ParentPortalSection`, and add the type to the notification_log /
notification_templates CHECK via a new forward migration.

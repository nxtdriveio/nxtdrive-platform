---
name: Student review/social-media consent
description: Privacy-by-default consent flag on students and who may change it
---

# Student review / social-media consent

`students.review_consent` is a tenant-scoped flag for "may we use this student
for reviews / social media". It is `NOT NULL DEFAULT false` — **privacy by
default, no consent until explicitly granted**.

**Rule:** only tenant_admin (or platform admin) may change it; the write goes
through the guarded `set_student_review_consent` RPC (service_role only, audited
as `student.review_consent_set`). The UI card must be gated on `isAdmin` so
non-admins never see or trigger it.

**Why:** AVG/GDPR — consent for marketing use must be opt-in and explicit, and
changing it is a privacy decision reserved for tenant owners. Contrast with
`update_student_notes`, which admin AND instructor may edit (operational, not a
consent decision).

**How to apply:** never flip this default to true anywhere, never expose the
consent toggle to instructors, and keep both notes/consent mutations server-side
via their RPCs (never client RLS writes).

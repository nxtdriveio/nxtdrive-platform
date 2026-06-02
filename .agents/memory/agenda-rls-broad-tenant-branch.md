---
name: my_tenant_ids broad RLS branch over-exposes non-staff roles
description: Why a tenant-wide RLS SELECT branch keyed on my_tenant_ids() leaks data to parents/students who have a membership row
---

A SELECT RLS policy whose first branch is `tenant_id in (select public.my_tenant_ids())`
grants read to EVERY caller that has ANY `memberships` row in that tenant —
regardless of role. `my_tenant_ids()` does not filter by role.

**Why it bites:** parents are provisioned with a `'parent'` membership row, so a
broad `my_tenant_ids()` branch lets a parent read the whole tenant's rows
(e.g. all `agenda_appointments`, not just their linked child's). This is
over-exposure, the opposite of the read-only/child-scoped parent-portal contract.
The same risk applies to any non-staff role that carries a membership row.

**How to apply:** for any table that parents/students must see only a scoped
slice of, do NOT use the bare `my_tenant_ids()` branch. Mirror the
invoices/documents pattern instead:
- staff branch: explicit `exists (... memberships m where m.role in ('tenant_admin','instructor'))`
- the subject's own branch: `students.user_id = auth.uid()`
- guardian branch: `student_guardians g where g.user_id = auth.uid()` (tenant-joined)

Always add an RLS test that asserts a parent sees ONLY the linked child's rows
(rows=1 of two seeded children) — a guardian branch alone passes a "can read own
child" test while a leftover broad branch still silently over-exposes.

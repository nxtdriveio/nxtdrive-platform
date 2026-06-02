-- 0059_parent_portal_documents.sql
--
-- Task #96 follow-up — let a linked parent (guardian) READ the documents of
-- their child in the read-only Ouderportaal (/ouder).
--
-- Migration 0053 introduced `student_documents` as staff-read-only and
-- explicitly left the parent portal out of scope. The parent portal now needs a
-- "documenten" section, so we extend the SELECT policy with a guardian branch
-- that mirrors the invoices guardian branch from 0058: a parent linked via
-- `student_guardians` may read the metadata rows of their child's documents.
--
-- This grants READ of metadata only. Files live in a private Storage bucket and
-- are still reached exclusively through short-lived, server-generated signed
-- URLs (a parent download route verifies the guardian link with the service
-- role before signing). No write path is added — uploads/deletes remain
-- service-role-only via the existing SECURITY DEFINER RPCs.
--
-- Forward-only: we DROP and recreate the existing select policy (the runner
-- tracks applied files by name; 0053 stays untouched).

drop policy if exists student_documents_select_staff on public.student_documents;
create policy student_documents_select_staff on public.student_documents
  for select
  using (
    public.is_platform_admin()
    or exists (
      select 1
        from public.memberships m
       where m.user_id   = auth.uid()
         and m.tenant_id = student_documents.tenant_id
         and m.role in ('tenant_admin', 'instructor')
    )
    -- Parent / guardian branch: documents of a linked child (read-only).
    or student_id in (
      select g.student_id
        from public.student_guardians g
        join public.students s
          on s.id = g.student_id and s.tenant_id = student_documents.tenant_id
       where g.user_id = auth.uid()
    )
  );

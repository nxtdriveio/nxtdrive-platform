-- 0058_parent_portal.sql
-- Module 10 — dedicated desktop Ouderportaal (/ouder).
--
-- Parents (role 'parent') are already admitted to the student-facing surface and
-- RLS on students / lessons / credit_ledger already exposes their linked
-- child(ren) via `student_guardians`. Two gaps remain for a read-only parent
-- portal, both closed here:
--
--   1. invoices + invoice_lines had NO guardian branch — only `students.user_id`
--      (the student themselves). Parents could not see their child's invoices.
--      We extend both SELECT policies with a guardian branch that mirrors the
--      existing student branch exactly: drafts stay hidden, tenant-scoped.
--
--   2. Guardian links could only be created by seed/back-end scripts. The
--      backoffice now manages them, so we add guarded link/unlink RPCs with an
--      audit trail. Writes are service-role only (the server action resolves /
--      provisions the parent auth user first, then calls these).
--
-- No insert/update/delete policies are added to invoices/invoice_lines — those
-- stay service-role only. The portal is strictly read-only.

-- ------------------------------------------------------------------------
-- 1. Invoices: add guardian SELECT branch (mirrors the student branch).
-- ------------------------------------------------------------------------
drop policy if exists invoices_select_members on public.invoices;
create policy invoices_select_members on public.invoices
  for select
  using (
    public.is_platform_admin()
    or exists (
      select 1
        from public.memberships m
       where m.user_id   = auth.uid()
         and m.tenant_id = invoices.tenant_id
         and m.role in ('tenant_admin', 'instructor')
    )
    or (
      status <> 'draft'
      and student_id in (
        select s.id
          from public.students s
         where s.user_id   = auth.uid()
           and s.tenant_id = invoices.tenant_id
      )
    )
    -- Parent / guardian branch: non-draft invoices of a linked child.
    or (
      status <> 'draft'
      and student_id in (
        select g.student_id
          from public.student_guardians g
          join public.students s
            on s.id = g.student_id and s.tenant_id = invoices.tenant_id
         where g.user_id = auth.uid()
      )
    )
  );

-- ------------------------------------------------------------------------
-- 2. Invoice lines: same visibility as the parent invoice.
-- ------------------------------------------------------------------------
drop policy if exists invoice_lines_select_members on public.invoice_lines;
create policy invoice_lines_select_members on public.invoice_lines
  for select
  using (
    public.is_platform_admin()
    or exists (
      select 1
        from public.memberships m
       where m.user_id   = auth.uid()
         and m.tenant_id = invoice_lines.tenant_id
         and m.role in ('tenant_admin', 'instructor')
    )
    or exists (
      select 1
        from public.invoices i
        join public.students s
          on s.id = i.student_id and s.tenant_id = i.tenant_id
       where i.id = invoice_lines.invoice_id
         and i.tenant_id = invoice_lines.tenant_id
         and i.status <> 'draft'
         and s.user_id = auth.uid()
    )
    -- Parent / guardian branch.
    or exists (
      select 1
        from public.invoices i
        join public.student_guardians g
          on g.student_id = i.student_id
       where i.id = invoice_lines.invoice_id
         and i.tenant_id = invoice_lines.tenant_id
         and i.status <> 'draft'
         and g.user_id = auth.uid()
    )
  );

-- ------------------------------------------------------------------------
-- 3. link_student_guardian — link an (already provisioned) parent auth user
--    to a student. Idempotent on the UNIQUE(student_id, user_id) constraint:
--    a re-link updates the relation label. Always audited. Admin only is
--    enforced at the action layer; this RPC is service-role only so it can
--    never be reached by a logged-in client.
-- ------------------------------------------------------------------------
create or replace function public.link_student_guardian(
  p_tenant_id  uuid,
  p_actor      uuid,
  p_student_id uuid,
  p_user_id    uuid,
  p_relation   text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not exists (
    select 1 from public.memberships m
     where m.user_id   = p_actor
       and m.tenant_id = p_tenant_id
       and m.role      = 'tenant_admin'
  ) and not exists (
    select 1 from public.profiles p
     where p.id = p_actor and p.is_platform_admin = true
  ) then
    raise exception 'actor % not authorized (admin only) for tenant %', p_actor, p_tenant_id;
  end if;

  -- The student must belong to this tenant.
  if not exists (
    select 1 from public.students s
     where s.id = p_student_id and s.tenant_id = p_tenant_id
  ) then
    raise exception 'student % not found in tenant %', p_student_id, p_tenant_id;
  end if;

  insert into public.student_guardians (tenant_id, student_id, user_id, relation)
  values (
    p_tenant_id,
    p_student_id,
    p_user_id,
    nullif(btrim(coalesce(p_relation, '')), '')
  )
  on conflict (student_id, user_id)
  do update set relation = excluded.relation
  returning id into v_id;

  insert into public.audit_log (
    actor_user_id, tenant_id, action, target_type, target_id, payload
  ) values (
    p_actor, p_tenant_id, 'student.guardian_linked', 'student', p_student_id::text,
    jsonb_build_object('guardian_user_id', p_user_id, 'relation', nullif(btrim(coalesce(p_relation, '')), ''))
  );

  return v_id;
end;
$$;

-- ------------------------------------------------------------------------
-- 4. unlink_student_guardian — remove a guardian link by its row id.
--    The auth user / membership is intentionally left intact (the parent may
--    still guard other children). Always audited.
-- ------------------------------------------------------------------------
create or replace function public.unlink_student_guardian(
  p_tenant_id uuid,
  p_actor     uuid,
  p_guardian_id uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student_id uuid;
  v_user_id    uuid;
begin
  if not exists (
    select 1 from public.memberships m
     where m.user_id   = p_actor
       and m.tenant_id = p_tenant_id
       and m.role      = 'tenant_admin'
  ) and not exists (
    select 1 from public.profiles p
     where p.id = p_actor and p.is_platform_admin = true
  ) then
    raise exception 'actor % not authorized (admin only) for tenant %', p_actor, p_tenant_id;
  end if;

  delete from public.student_guardians g
   where g.id = p_guardian_id and g.tenant_id = p_tenant_id
  returning g.student_id, g.user_id into v_student_id, v_user_id;
  if not found then
    raise exception 'guardian link % not found in tenant %', p_guardian_id, p_tenant_id;
  end if;

  insert into public.audit_log (
    actor_user_id, tenant_id, action, target_type, target_id, payload
  ) values (
    p_actor, p_tenant_id, 'student.guardian_unlinked', 'student', v_student_id::text,
    jsonb_build_object('guardian_user_id', v_user_id)
  );
end;
$$;

-- ------------------------------------------------------------------------
-- Grant lockdown — Supabase auto-grants EXECUTE on new public functions to
-- anon/authenticated; revoking PUBLIC alone is not enough. Service role only.
-- ------------------------------------------------------------------------
revoke all     on function public.link_student_guardian(uuid, uuid, uuid, uuid, text) from public;
revoke execute on function public.link_student_guardian(uuid, uuid, uuid, uuid, text) from anon, authenticated;
grant  execute on function public.link_student_guardian(uuid, uuid, uuid, uuid, text) to service_role;

revoke all     on function public.unlink_student_guardian(uuid, uuid, uuid) from public;
revoke execute on function public.unlink_student_guardian(uuid, uuid, uuid) from anon, authenticated;
grant  execute on function public.unlink_student_guardian(uuid, uuid, uuid) to service_role;

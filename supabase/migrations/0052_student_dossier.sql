-- 0052_student_dossier.sql
-- Module 2 verdieping — 360° leerling-dossier (backoffice student detail).
--
-- The dossier page is mostly aggregation of data that already exists. It adds
-- exactly two NEW data capabilities, both with a guarded write RPC + audit
-- trail (writes are service-role only, reads stay RLS-enforced):
--
--   1. update_student_notes — edit the internal note on a student. The `notes`
--      column already exists (0011); this only adds the guarded mutation.
--      Admin OR instructor may edit (mirrors _lesson_actor_authorized).
--
--   2. review_consent — a tenant-scoped consent flag for using a student for
--      reviews / social media. Privacy by default: NOT NULL DEFAULT false (no
--      consent). Editing is tenant_admin (or platform admin) only.
--
-- Mirrors the rest of the schema: every write goes through a SECURITY DEFINER
-- RPC callable by service_role only; the audit_log is insert-only.

-- review consent column ------------------------------------------------------
alter table public.students
  add column if not exists review_consent     boolean not null default false,
  add column if not exists review_consent_at  timestamptz,
  add column if not exists review_consent_by  uuid references auth.users(id) on delete set null;

comment on column public.students.review_consent is
  'Tenant-scoped consent to use the student for reviews / social media. Default false = no consent (privacy by default).';

-- update_student_notes -------------------------------------------------------
-- Admin or instructor may edit the internal note. Always audited. Empty input
-- clears the note (stored as NULL).
create or replace function public.update_student_notes(
  p_student_id uuid,
  p_tenant_id  uuid,
  p_actor      uuid,
  p_notes      text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public._lesson_actor_authorized(p_actor, p_tenant_id) then
    raise exception 'actor % not authorized for tenant %', p_actor, p_tenant_id;
  end if;

  update public.students
     set notes = nullif(btrim(coalesce(p_notes, '')), '')
   where id = p_student_id and tenant_id = p_tenant_id;
  if not found then
    raise exception 'student % not found in tenant %', p_student_id, p_tenant_id;
  end if;

  insert into public.audit_log (
    actor_user_id, tenant_id, action, target_type, target_id, payload
  ) values (
    p_actor, p_tenant_id, 'student.notes_updated', 'student', p_student_id::text,
    jsonb_build_object('length', char_length(coalesce(btrim(p_notes), '')))
  );
end;
$$;

-- set_student_review_consent -------------------------------------------------
-- Privacy-sensitive: tenant_admin (or platform admin) only. Always audited.
create or replace function public.set_student_review_consent(
  p_student_id uuid,
  p_tenant_id  uuid,
  p_actor      uuid,
  p_consent    boolean
) returns void
language plpgsql
security definer
set search_path = public
as $$
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

  update public.students
     set review_consent    = coalesce(p_consent, false),
         review_consent_at = now(),
         review_consent_by = p_actor
   where id = p_student_id and tenant_id = p_tenant_id;
  if not found then
    raise exception 'student % not found in tenant %', p_student_id, p_tenant_id;
  end if;

  insert into public.audit_log (
    actor_user_id, tenant_id, action, target_type, target_id, payload
  ) values (
    p_actor, p_tenant_id, 'student.review_consent_set', 'student', p_student_id::text,
    jsonb_build_object('consent', coalesce(p_consent, false))
  );
end;
$$;

-- Grant lockdown -------------------------------------------------------------
-- Supabase auto-grants EXECUTE on new public functions to anon/authenticated;
-- revoking PUBLIC alone is not enough (see 0023/0031). Service role only.
revoke all     on function public.update_student_notes(uuid, uuid, uuid, text) from public;
revoke execute on function public.update_student_notes(uuid, uuid, uuid, text) from anon, authenticated;
grant  execute on function public.update_student_notes(uuid, uuid, uuid, text) to service_role;

revoke all     on function public.set_student_review_consent(uuid, uuid, uuid, boolean) from public;
revoke execute on function public.set_student_review_consent(uuid, uuid, uuid, boolean) from anon, authenticated;
grant  execute on function public.set_student_review_consent(uuid, uuid, uuid, boolean) to service_role;

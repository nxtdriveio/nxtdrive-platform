-- 0053_student_documents.sql
-- Module 2 — Leerlingdocumenten (bestandsopslag).
--
-- Adds secure, tenant-scoped document storage per student:
--   * a PRIVATE Supabase Storage bucket `student-documents` (never public);
--     files are only ever reached via short-lived signed URLs generated
--     server-side with the service role. Clients never touch storage directly.
--   * a tenant-scoped metadata table `student_documents` (RLS: staff-read only),
--     mirroring the rest of the schema (writes via SECURITY DEFINER RPC, service
--     role only; every mutation is audited; audit_log stays insert-only).
--
-- Object path convention (enforced in the app, not the DB):
--   {tenant_id}/{student_id}/{uuid}-{safe_filename}

-- Private storage bucket -----------------------------------------------------
-- public=false → no anonymous/authenticated direct access; downloads go through
-- server-generated signed URLs only.
insert into storage.buckets (id, name, public)
values ('student-documents', 'student-documents', false)
on conflict (id) do nothing;

-- Metadata table -------------------------------------------------------------
create table if not exists public.student_documents (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  student_id    uuid not null,
  -- Full object path inside the `student-documents` bucket.
  storage_path  text not null unique,
  file_name     text not null,
  category      text not null default 'other',
  mime_type     text not null,
  size_bytes    bigint not null,
  uploaded_by   uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  check (char_length(file_name) between 1 and 300),
  check (category in ('id_copy', 'authorization', 'health_declaration', 'terms', 'other')),
  check (size_bytes >= 0),
  -- Tenant-consistent FK: a document's student must belong to the same tenant.
  constraint student_documents_student_tenant_fk
    foreign key (student_id, tenant_id)
    references public.students (id, tenant_id) on delete cascade
);

create index if not exists idx_student_documents_tenant_student_created
  on public.student_documents (tenant_id, student_id, created_at desc);

-- RLS ------------------------------------------------------------------------
alter table public.student_documents enable row level security;

-- Staff-read only. Students/parents do NOT see documents (out of scope for the
-- student PWA / parent portal). No INSERT/UPDATE/DELETE policies — all writes
-- go through the service role via the guarded RPCs below.
drop policy if exists student_documents_select_staff on public.student_documents;
create policy student_documents_select_staff on public.student_documents
  for select
  using (
    public.has_role(tenant_id, 'tenant_admin')
    or public.has_role(tenant_id, 'instructor')
    or public.is_platform_admin()
  );

-- record_student_document ----------------------------------------------------
-- Inserts a metadata row after the file has been uploaded to storage. Admin OR
-- instructor may upload (mirrors _lesson_actor_authorized). Always audited.
create or replace function public.record_student_document(
  p_student_id   uuid,
  p_tenant_id    uuid,
  p_actor        uuid,
  p_storage_path text,
  p_file_name    text,
  p_category     text,
  p_mime_type    text,
  p_size_bytes   bigint
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not public._lesson_actor_authorized(p_actor, p_tenant_id) then
    raise exception 'actor % not authorized for tenant %', p_actor, p_tenant_id;
  end if;

  -- Guard: the student must exist in this tenant (the FK also enforces this,
  -- but a clear error is friendlier than a constraint violation).
  if not exists (
    select 1 from public.students
     where id = p_student_id and tenant_id = p_tenant_id
  ) then
    raise exception 'student % not found in tenant %', p_student_id, p_tenant_id;
  end if;

  insert into public.student_documents (
    tenant_id, student_id, storage_path, file_name, category,
    mime_type, size_bytes, uploaded_by
  ) values (
    p_tenant_id, p_student_id, p_storage_path, p_file_name,
    coalesce(nullif(btrim(p_category), ''), 'other'),
    p_mime_type, p_size_bytes, p_actor
  )
  returning id into v_id;

  insert into public.audit_log (
    actor_user_id, tenant_id, action, target_type, target_id, payload
  ) values (
    p_actor, p_tenant_id, 'student.document_uploaded', 'student_document', v_id::text,
    jsonb_build_object(
      'student_id', p_student_id,
      'file_name', p_file_name,
      'category', coalesce(nullif(btrim(p_category), ''), 'other'),
      'mime_type', p_mime_type,
      'size_bytes', p_size_bytes
    )
  );

  return v_id;
end;
$$;

-- delete_student_document ----------------------------------------------------
-- Removes the metadata row and returns its storage_path so the caller can
-- delete the object from storage. Admin OR instructor. Always audited
-- (audit_log is insert-only — the delete is recorded, never silent).
create or replace function public.delete_student_document(
  p_document_id uuid,
  p_tenant_id   uuid,
  p_actor       uuid
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_path       text;
  v_student_id uuid;
  v_file_name  text;
begin
  if not public._lesson_actor_authorized(p_actor, p_tenant_id) then
    raise exception 'actor % not authorized for tenant %', p_actor, p_tenant_id;
  end if;

  delete from public.student_documents
   where id = p_document_id and tenant_id = p_tenant_id
   returning storage_path, student_id, file_name
        into v_path, v_student_id, v_file_name;
  if not found then
    raise exception 'document % not found in tenant %', p_document_id, p_tenant_id;
  end if;

  insert into public.audit_log (
    actor_user_id, tenant_id, action, target_type, target_id, payload
  ) values (
    p_actor, p_tenant_id, 'student.document_deleted', 'student_document', p_document_id::text,
    jsonb_build_object(
      'student_id', v_student_id,
      'file_name', v_file_name,
      'storage_path', v_path
    )
  );

  return v_path;
end;
$$;

-- Grant lockdown -------------------------------------------------------------
-- Supabase auto-grants EXECUTE on new public functions to anon/authenticated;
-- revoking PUBLIC alone is not enough (see 0023/0031/0052). Service role only.
revoke all     on function public.record_student_document(uuid, uuid, uuid, text, text, text, text, bigint) from public;
revoke execute on function public.record_student_document(uuid, uuid, uuid, text, text, text, text, bigint) from anon, authenticated;
grant  execute on function public.record_student_document(uuid, uuid, uuid, text, text, text, text, bigint) to service_role;

revoke all     on function public.delete_student_document(uuid, uuid, uuid) from public;
revoke execute on function public.delete_student_document(uuid, uuid, uuid) from anon, authenticated;
grant  execute on function public.delete_student_document(uuid, uuid, uuid) to service_role;

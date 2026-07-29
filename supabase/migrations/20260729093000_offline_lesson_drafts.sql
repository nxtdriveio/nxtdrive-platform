-- Conflict-aware, idempotent server counterpart for encrypted offline drafts.

create table if not exists public.offline_lesson_drafts (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references public.tenants(id) on delete cascade,
  lesson_id           uuid not null references public.lessons(id) on delete cascade,
  actor_user_id       uuid not null references auth.users(id) on delete cascade,
  revision            integer not null default 1 check (revision > 0),
  last_idempotency_key text not null,
  status              text not null default 'ACTIVE' check (
    status in ('ACTIVE', 'SYNCED', 'CONFLICT', 'EXPIRED')
  ),
  payload             jsonb not null,
  expires_at          timestamptz not null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (tenant_id, lesson_id, actor_user_id),
  unique (tenant_id, last_idempotency_key),
  check (jsonb_typeof(payload) = 'object')
);

create index if not exists offline_lesson_drafts_expiry_idx
  on public.offline_lesson_drafts (expires_at)
  where status in ('ACTIVE', 'SYNCED', 'CONFLICT');

alter table public.offline_lesson_drafts enable row level security;

create policy offline_lesson_drafts_actor_read
  on public.offline_lesson_drafts for select
  using (
    actor_user_id = auth.uid()
    or public.has_role(tenant_id, 'tenant_admin')
    or public.is_platform_admin()
  );

revoke insert, update, delete on public.offline_lesson_drafts
  from anon, authenticated;

create or replace function public.sync_offline_lesson_draft(
  p_tenant_id uuid,
  p_lesson_id uuid,
  p_actor uuid,
  p_idempotency_key text,
  p_expected_server_revision integer,
  p_payload jsonb,
  p_expires_at timestamptz
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current public.offline_lesson_drafts%rowtype;
  v_authorized boolean;
begin
  if p_idempotency_key is null
     or p_idempotency_key !~ '^[A-Za-z0-9._:-]{8,128}$'
     or jsonb_typeof(p_payload) <> 'object'
     or octet_length(p_payload::text) > 1048576
     or p_expires_at <= now() then
    raise exception 'invalid offline draft payload';
  end if;

  select exists (
    select 1
      from public.lessons l
     where l.id = p_lesson_id
       and l.tenant_id = p_tenant_id
       and (
         l.instructor_id = p_actor
         or exists (
           select 1 from public.memberships m
            where m.user_id = p_actor
              and m.tenant_id = p_tenant_id
              and m.role = 'tenant_admin'
         )
         or exists (
           select 1 from public.profiles p
            where p.id = p_actor and p.is_platform_admin = true
         )
       )
  ) into v_authorized;
  if not v_authorized then
    raise exception 'actor is not authorized for lesson draft';
  end if;

  select * into v_current
    from public.offline_lesson_drafts
   where tenant_id = p_tenant_id
     and last_idempotency_key = p_idempotency_key;
  if found then
    return jsonb_build_object(
      'status', 'SYNCED',
      'revision', v_current.revision,
      'idempotentReplay', true
    );
  end if;

  select * into v_current
    from public.offline_lesson_drafts
   where tenant_id = p_tenant_id
     and lesson_id = p_lesson_id
     and actor_user_id = p_actor
   for update;

  if not found then
    if coalesce(p_expected_server_revision, 0) <> 0 then
      return jsonb_build_object(
        'status', 'CONFLICT',
        'revision', 0,
        'serverPayload', null,
        'reason', 'SERVER_DRAFT_MISSING'
      );
    end if;
    insert into public.offline_lesson_drafts (
      tenant_id, lesson_id, actor_user_id, revision,
      last_idempotency_key, status, payload, expires_at
    ) values (
      p_tenant_id, p_lesson_id, p_actor, 1,
      p_idempotency_key, 'SYNCED', p_payload, p_expires_at
    ) returning * into v_current;
  elsif v_current.revision <> coalesce(p_expected_server_revision, 0) then
    update public.offline_lesson_drafts
       set status = 'CONFLICT', updated_at = now()
     where id = v_current.id;
    insert into public.audit_log (
      actor_user_id, tenant_id, action, target_type, target_id, payload
    ) values (
      p_actor, p_tenant_id, 'offline_draft.conflict',
      'lesson', p_lesson_id::text,
      jsonb_build_object(
        'serverRevision', v_current.revision,
        'expectedRevision', p_expected_server_revision
      )
    );
    return jsonb_build_object(
      'status', 'CONFLICT',
      'revision', v_current.revision,
      'serverPayload', v_current.payload,
      'reason', 'REVISION_MISMATCH'
    );
  else
    update public.offline_lesson_drafts
       set revision = revision + 1,
           last_idempotency_key = p_idempotency_key,
           status = 'SYNCED',
           payload = p_payload,
           expires_at = p_expires_at,
           updated_at = now()
     where id = v_current.id
     returning * into v_current;
  end if;

  insert into public.audit_log (
    actor_user_id, tenant_id, action, target_type, target_id, payload
  ) values (
    p_actor, p_tenant_id, 'offline_draft.synced',
    'lesson', p_lesson_id::text,
    jsonb_build_object('revision', v_current.revision)
  );

  return jsonb_build_object(
    'status', 'SYNCED',
    'revision', v_current.revision,
    'idempotentReplay', false
  );
end;
$$;

revoke all on function public.sync_offline_lesson_draft(
  uuid, uuid, uuid, text, integer, jsonb, timestamptz
) from public;
revoke execute on function public.sync_offline_lesson_draft(
  uuid, uuid, uuid, text, integer, jsonb, timestamptz
) from anon, authenticated;
grant execute on function public.sync_offline_lesson_draft(
  uuid, uuid, uuid, text, integer, jsonb, timestamptz
) to service_role;

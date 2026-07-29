-- Security, privacy self-service and retention policy foundation.
-- Legal retention periods intentionally remain unset until owner/legal review.

create table if not exists public.rate_limit_buckets (
  bucket_key         text primary key,
  purpose            text not null,
  window_started_at  timestamptz not null,
  counter            integer not null check (counter >= 0),
  updated_at         timestamptz not null default now()
);

alter table public.rate_limit_buckets enable row level security;
revoke all on public.rate_limit_buckets from anon, authenticated;

create or replace function public.consume_rate_limit(
  p_bucket_key text,
  p_purpose text,
  p_limit integer,
  p_window_seconds integer
) returns table (
  allowed boolean,
  remaining integer,
  retry_after_seconds integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_window_start timestamptz;
  v_counter integer;
begin
  if p_bucket_key is null or length(p_bucket_key) < 32
     or p_limit < 1 or p_limit > 10000
     or p_window_seconds < 1 or p_window_seconds > 86400 then
    raise exception 'invalid rate limit configuration';
  end if;

  v_window_start := to_timestamp(
    floor(extract(epoch from v_now) / p_window_seconds) * p_window_seconds
  );

  insert into public.rate_limit_buckets (
    bucket_key, purpose, window_started_at, counter, updated_at
  ) values (
    p_bucket_key, left(coalesce(p_purpose, 'unknown'), 100),
    v_window_start, 1, v_now
  )
  on conflict (bucket_key) do update
    set purpose = excluded.purpose,
        counter = case
          when rate_limit_buckets.window_started_at < v_window_start then 1
          else rate_limit_buckets.counter + 1
        end,
        window_started_at = case
          when rate_limit_buckets.window_started_at < v_window_start
            then v_window_start
          else rate_limit_buckets.window_started_at
        end,
        updated_at = v_now
  returning rate_limit_buckets.counter into v_counter;

  return query select
    v_counter <= p_limit,
    greatest(p_limit - v_counter, 0),
    case
      when v_counter <= p_limit then 0
      else greatest(
        1,
        ceil(
          extract(epoch from (v_window_start
            + make_interval(secs => p_window_seconds) - v_now))
        )::integer
      )
    end;
end;
$$;

revoke all on function public.consume_rate_limit(text, text, integer, integer)
  from public;
revoke execute on function public.consume_rate_limit(text, text, integer, integer)
  from anon, authenticated;
grant execute on function public.consume_rate_limit(text, text, integer, integer)
  to service_role;

create table if not exists public.privacy_requests (
  id                   uuid primary key default gen_random_uuid(),
  tenant_id            uuid not null references public.tenants(id) on delete restrict,
  request_type         text not null check (
    request_type in ('DATA_EXPORT', 'ACCOUNT_DELETION', 'STUDENT_DELETION')
  ),
  status               text not null default 'requested' check (
    status in (
      'requested', 'validating', 'processing', 'ready', 'downloaded',
      'expired', 'blocked_legal_hold', 'completed', 'rejected'
    )
  ),
  subject_user_id      uuid references auth.users(id) on delete set null,
  subject_student_id   uuid references public.students(id) on delete set null,
  requested_by         uuid not null references auth.users(id) on delete restrict,
  idempotency_key      text not null,
  export_storage_path  text,
  export_expires_at    timestamptz,
  rejection_reason     text,
  completion_report    jsonb,
  requested_at         timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  completed_at         timestamptz,
  unique (tenant_id, idempotency_key),
  check (subject_user_id is not null or subject_student_id is not null)
);

create index if not exists privacy_requests_subject_user_idx
  on public.privacy_requests (subject_user_id, requested_at desc);
create index if not exists privacy_requests_tenant_status_idx
  on public.privacy_requests (tenant_id, status, requested_at);

create table if not exists public.privacy_legal_holds (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references public.tenants(id) on delete restrict,
  subject_user_id     uuid references auth.users(id) on delete set null,
  subject_student_id  uuid references public.students(id) on delete set null,
  reason_reference    text not null,
  created_by          uuid not null references auth.users(id) on delete restrict,
  created_at          timestamptz not null default now(),
  released_by         uuid references auth.users(id) on delete restrict,
  released_at         timestamptz,
  check (subject_user_id is not null or subject_student_id is not null),
  check ((released_at is null) = (released_by is null))
);

create index if not exists privacy_legal_holds_open_idx
  on public.privacy_legal_holds (tenant_id, subject_user_id, subject_student_id)
  where released_at is null;

create table if not exists public.retention_policy_versions (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references public.tenants(id) on delete restrict,
  version          integer not null check (version > 0),
  approval_status  text not null default 'DRAFT' check (
    approval_status in ('DRAFT', 'LEGAL_REVIEW', 'APPROVED')
  ),
  rules            jsonb not null default '[]'::jsonb,
  content_hash     text not null,
  created_by       uuid not null references auth.users(id) on delete restrict,
  created_at       timestamptz not null default now(),
  approved_by      uuid references auth.users(id) on delete restrict,
  approved_at      timestamptz,
  unique (tenant_id, version),
  check (jsonb_typeof(rules) = 'array'),
  check (
    approval_status <> 'APPROVED'
    or (approved_by is not null and approved_at is not null)
  )
);

create table if not exists public.retention_runs (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references public.tenants(id) on delete restrict,
  policy_version_id  uuid not null references public.retention_policy_versions(id) on delete restrict,
  mode               text not null check (mode in ('DRY_RUN', 'EXECUTE')),
  status             text not null default 'PLANNED' check (
    status in ('PLANNED', 'RUNNING', 'COMPLETED', 'FAILED')
  ),
  summary            jsonb not null default '{}'::jsonb,
  started_by         uuid not null references auth.users(id) on delete restrict,
  started_at         timestamptz not null default now(),
  completed_at       timestamptz
);

create table if not exists public.privacy_audit_events (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants(id) on delete restrict,
  request_id      uuid references public.privacy_requests(id) on delete restrict,
  actor_user_id   uuid references auth.users(id) on delete set null,
  event_type      text not null,
  metadata        jsonb not null default '{}'::jsonb,
  occurred_at     timestamptz not null default now()
);

alter table public.privacy_requests enable row level security;
alter table public.privacy_legal_holds enable row level security;
alter table public.retention_policy_versions enable row level security;
alter table public.retention_runs enable row level security;
alter table public.privacy_audit_events enable row level security;

create policy privacy_requests_subject_or_tenant_staff
  on public.privacy_requests for select
  using (
    subject_user_id = auth.uid()
    or tenant_id in (select public.my_tenant_ids())
    or public.is_platform_admin()
  );

create policy privacy_legal_holds_tenant_staff
  on public.privacy_legal_holds for select
  using (
    tenant_id in (select public.my_tenant_ids())
    or public.is_platform_admin()
  );

create policy retention_policy_tenant_staff
  on public.retention_policy_versions for select
  using (
    tenant_id in (select public.my_tenant_ids())
    or public.is_platform_admin()
  );

create policy retention_runs_tenant_staff
  on public.retention_runs for select
  using (
    tenant_id in (select public.my_tenant_ids())
    or public.is_platform_admin()
  );

create policy privacy_audit_tenant_staff_or_subject
  on public.privacy_audit_events for select
  using (
    tenant_id in (select public.my_tenant_ids())
    or public.is_platform_admin()
    or exists (
      select 1
        from public.privacy_requests pr
       where pr.id = request_id
         and pr.subject_user_id = auth.uid()
    )
  );

revoke insert, update, delete on public.privacy_requests
  from anon, authenticated;
revoke insert, update, delete on public.privacy_legal_holds
  from anon, authenticated;
revoke insert, update, delete on public.retention_policy_versions
  from anon, authenticated;
revoke insert, update, delete on public.retention_runs
  from anon, authenticated;
revoke insert, update, delete on public.privacy_audit_events
  from anon, authenticated;

insert into storage.buckets (id, name, public)
values ('privacy-exports', 'privacy-exports', false)
on conflict (id) do update set public = false;

drop policy if exists privacy_exports_no_direct_access on storage.objects;
create policy privacy_exports_no_direct_access
  on storage.objects for select
  using (false);

create or replace function public.execute_student_anonymization(
  p_request_id uuid,
  p_actor uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.privacy_requests%rowtype;
  v_report jsonb;
begin
  select * into v_request
    from public.privacy_requests
   where id = p_request_id
   for update;

  if not found or v_request.request_type not in (
    'ACCOUNT_DELETION', 'STUDENT_DELETION'
  ) then
    raise exception 'eligible deletion request not found';
  end if;
  if v_request.status <> 'processing' then
    raise exception 'deletion request is not in processing status';
  end if;
  if not public._tenant_staff_authorized(p_actor, v_request.tenant_id)
     and p_actor <> v_request.subject_user_id then
    raise exception 'actor is not authorized for deletion request';
  end if;
  if exists (
    select 1 from public.privacy_legal_holds h
     where h.tenant_id = v_request.tenant_id
       and h.released_at is null
       and (
         h.subject_user_id = v_request.subject_user_id
         or h.subject_student_id = v_request.subject_student_id
       )
  ) then
    update public.privacy_requests
       set status = 'blocked_legal_hold', updated_at = now()
     where id = p_request_id;
    raise exception 'deletion is blocked by legal hold';
  end if;

  update public.students
     set full_name = 'Verwijderde leerling ' || left(id::text, 8),
         email = null,
         phone = null,
         postcode = null,
         notes = null,
         user_id = null,
         active = false,
         updated_at = now()
   where tenant_id = v_request.tenant_id
     and (
       id = v_request.subject_student_id
       or user_id = v_request.subject_user_id
     );

  v_report := jsonb_build_object(
    'studentProfile', 'ANONYMIZED',
    'financialRecords', 'PRESERVED',
    'auditRecords', 'PRESERVED',
    'directIdentifiersRemoved', true
  );

  update public.privacy_requests
     set status = 'completed',
         completion_report = v_report,
         completed_at = now(),
         updated_at = now()
   where id = p_request_id;

  insert into public.privacy_audit_events (
    tenant_id, request_id, actor_user_id, event_type, metadata
  ) values (
    v_request.tenant_id, p_request_id, p_actor,
    'privacy.student_anonymized', v_report
  );

  return v_report;
end;
$$;

revoke all on function public.execute_student_anonymization(uuid, uuid)
  from public;
revoke execute on function public.execute_student_anonymization(uuid, uuid)
  from anon, authenticated;
grant execute on function public.execute_student_anonymization(uuid, uuid)
  to service_role;

comment on table public.retention_policy_versions is
  'Versioned retention policy. Periods stay null and status DRAFT/LEGAL_REVIEW until legal approval.';

-- ============================================================================
-- 0026_notifications.sql
--
-- Tenant-scoped notification foundation: per-tenant template overrides + an
-- email/notification send log, plus the idempotent enqueue/status RPCs the
-- app uses to send payment confirmations and lesson reminders.
--
-- Invariants (mirrors the rest of the schema):
--   * Every row is tenant-scoped (tenant_id) with RLS + indexes from day one.
--   * The log is insert + delivery-status update only. No destructive rewrites
--     of history: there is no DELETE policy, updates touch only delivery
--     fields via the RPC, and a 'sent' row is never overwritten.
--   * All writes go through SECURITY DEFINER RPCs callable by service_role
--     only — never directly by anon/authenticated.
--   * Idempotency is enforced by UNIQUE (tenant_id, dedupe_key): a given
--     invoice-paid / lesson-reminder produces exactly one log row, so webhook
--     replays and repeated cron runs never double-send.
-- ============================================================================

do $$ begin
  create type public.notification_status as enum (
    'queued',
    'sent',
    'failed',
    'skipped'
  );
exception when duplicate_object then null; end $$;

-- notification_templates: optional per-tenant overrides of the built-in
-- (code-default) email copy. A row here lets a school customise subject/body
-- without a code change; absence means "use the built-in template".
create table if not exists public.notification_templates (
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  key         text not null,
  channel     text not null default 'email',
  subject     text,
  body_html   text,
  body_text   text,
  enabled     boolean not null default true,
  updated_at  timestamptz not null default now(),
  primary key (tenant_id, key, channel),
  check (key in ('payment_confirmation', 'lesson_reminder')),
  check (channel in ('email'))
);

drop trigger if exists notification_templates_set_updated_at on public.notification_templates;
create trigger notification_templates_set_updated_at
  before update on public.notification_templates
  for each row execute function public.set_updated_at();

-- notification_log: one row per (tenant, dedupe_key). Records every send
-- attempt and its delivery status for support/debugging.
create table if not exists public.notification_log (
  id                   uuid primary key default gen_random_uuid(),
  tenant_id            uuid not null references public.tenants(id) on delete cascade,
  channel              text not null default 'email',
  type                 text not null,
  recipient_email      text not null default '',
  subject              text not null default '',
  status               public.notification_status not null default 'queued',
  dedupe_key           text not null,
  related_type         text,
  related_id           text,
  provider             text,
  provider_message_id  text,
  error                text,
  payload              jsonb not null default '{}'::jsonb,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  sent_at              timestamptz,
  check (type in ('payment_confirmation', 'lesson_reminder')),
  check (channel in ('email')),
  constraint notification_log_dedupe_unique unique (tenant_id, dedupe_key)
);

drop trigger if exists notification_log_set_updated_at on public.notification_log;
create trigger notification_log_set_updated_at
  before update on public.notification_log
  for each row execute function public.set_updated_at();

create index if not exists idx_notification_log_tenant_created
  on public.notification_log (tenant_id, created_at desc);
create index if not exists idx_notification_log_tenant_type_status
  on public.notification_log (tenant_id, type, status);
create index if not exists idx_notification_log_tenant_status
  on public.notification_log (tenant_id, status);

-- RLS ----------------------------------------------------------------------
alter table public.notification_templates enable row level security;
alter table public.notification_log enable row level security;

-- Members of the tenant (and platform admins) may READ both tables — the log
-- powers a support/debugging view in the backoffice. Writes go exclusively
-- through the RPCs below (service role), so there are deliberately no
-- INSERT/UPDATE/DELETE policies.
drop policy if exists notification_templates_select_members on public.notification_templates;
create policy notification_templates_select_members on public.notification_templates
  for select
  using (
    tenant_id in (select public.my_tenant_ids())
    or public.is_platform_admin()
  );

drop policy if exists notification_log_select_members on public.notification_log;
create policy notification_log_select_members on public.notification_log
  for select
  using (
    tenant_id in (select public.my_tenant_ids())
    or public.is_platform_admin()
  );

-- RPCs ---------------------------------------------------------------------

-- enqueue_notification: idempotently create a 'queued' log row. On a repeated
-- (tenant_id, dedupe_key) the existing row is returned untouched, so callers
-- can safely re-run (webhook replay, cron re-run). Returns the row id, its
-- current status, and whether this call created it.
create or replace function public.enqueue_notification(
  p_tenant_id       uuid,
  p_channel         text,
  p_type            text,
  p_recipient_email text,
  p_subject         text,
  p_dedupe_key      text,
  p_related_type    text,
  p_related_id      text,
  p_payload         jsonb
)
returns table (id uuid, status public.notification_status, was_created boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id      uuid;
  v_status  public.notification_status;
  v_created boolean := false;
begin
  if p_tenant_id is null or p_type is null or p_dedupe_key is null then
    raise exception 'tenant_id, type and dedupe_key are required';
  end if;

  insert into public.notification_log (
    tenant_id, channel, type, recipient_email, subject,
    status, dedupe_key, related_type, related_id, payload
  ) values (
    p_tenant_id, coalesce(p_channel, 'email'), p_type,
    coalesce(p_recipient_email, ''), coalesce(p_subject, ''),
    'queued', p_dedupe_key, p_related_type, p_related_id,
    coalesce(p_payload, '{}'::jsonb)
  )
  on conflict (tenant_id, dedupe_key) do nothing
  returning notification_log.id, notification_log.status
    into v_id, v_status;

  if v_id is not null then
    v_created := true;
  else
    select nl.id, nl.status
      into v_id, v_status
      from public.notification_log nl
     where nl.tenant_id = p_tenant_id
       and nl.dedupe_key = p_dedupe_key;
  end if;

  if v_created then
    insert into public.audit_log (
      actor_user_id, tenant_id, action, target_type, target_id, payload
    ) values (
      null, p_tenant_id, 'notification.enqueued', 'notification', v_id::text,
      jsonb_build_object('type', p_type, 'dedupe_key', p_dedupe_key)
    );
  end if;

  return query select v_id, v_status, v_created;
end;
$$;

-- mark_notification_status: record the delivery outcome of a previously
-- enqueued row. Touches only delivery fields. A row already 'sent' is never
-- overwritten (no destructive history rewrite, idempotent on send retries).
create or replace function public.mark_notification_status(
  p_id                  uuid,
  p_tenant_id           uuid,
  p_status              public.notification_status,
  p_provider            text,
  p_provider_message_id text,
  p_error               text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prev public.notification_status;
begin
  if p_id is null or p_tenant_id is null or p_status is null then
    raise exception 'id, tenant_id and status are required';
  end if;

  select status into v_prev
    from public.notification_log
   where id = p_id and tenant_id = p_tenant_id
   for update;
  if not found then
    raise exception 'notification % not found in tenant %', p_id, p_tenant_id;
  end if;

  -- Terminal: a delivered email is never re-marked.
  if v_prev = 'sent' then
    return;
  end if;

  update public.notification_log
     set status              = p_status,
         provider            = coalesce(p_provider, provider),
         provider_message_id = coalesce(p_provider_message_id, provider_message_id),
         error               = case when p_status = 'failed' then p_error else null end,
         sent_at             = case when p_status = 'sent' then now() else sent_at end
   where id = p_id and tenant_id = p_tenant_id;

  insert into public.audit_log (
    actor_user_id, tenant_id, action, target_type, target_id, payload
  ) values (
    null, p_tenant_id,
    case p_status
      when 'sent'    then 'notification.sent'
      when 'failed'  then 'notification.failed'
      when 'skipped' then 'notification.skipped'
      else 'notification.updated'
    end,
    'notification', p_id::text,
    jsonb_build_object('status', p_status, 'provider', p_provider, 'error', p_error)
  );
end;
$$;

-- Grant lockdown: Supabase default privileges auto-grant EXECUTE on new
-- public functions to anon/authenticated. Revoke and re-grant to service_role
-- only (see 0023 for the rationale).
revoke all on function public.enqueue_notification(uuid, text, text, text, text, text, text, text, jsonb) from public;
revoke execute on function public.enqueue_notification(uuid, text, text, text, text, text, text, text, jsonb) from anon, authenticated;
grant execute on function public.enqueue_notification(uuid, text, text, text, text, text, text, text, jsonb) to service_role;

revoke all on function public.mark_notification_status(uuid, uuid, public.notification_status, text, text, text) from public;
revoke execute on function public.mark_notification_status(uuid, uuid, public.notification_status, text, text, text) from anon, authenticated;
grant execute on function public.mark_notification_status(uuid, uuid, public.notification_status, text, text, text) to service_role;

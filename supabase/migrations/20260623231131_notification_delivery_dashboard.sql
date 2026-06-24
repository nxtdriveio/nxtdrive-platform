-- Delivery dashboard for tenant notifications.
--
-- The original notification_log was sufficient for idempotent send status, but
-- not for operations: admins need to see delivered/opened/failed rows and retry
-- a failed e-mail without reconstructing the original template context. From
-- this migration onward the dispatcher stores the rendered body on the log row.

alter table public.notification_log
  add column if not exists body_html text,
  add column if not exists body_text text,
  add column if not exists opened_at timestamptz,
  add column if not exists retry_count integer not null default 0,
  add column if not exists last_retry_at timestamptz,
  add column if not exists last_retry_error text;

create index if not exists idx_notification_log_tenant_status_created
  on public.notification_log (tenant_id, status, created_at desc);

create index if not exists idx_notification_log_tenant_opened
  on public.notification_log (tenant_id, opened_at desc)
  where opened_at is not null;

-- New enqueue RPC that preserves the rendered body for exact delivery retries.
-- The original enqueue_notification RPC remains available for compatibility.
create or replace function public.enqueue_notification_v2(
  p_tenant_id       uuid,
  p_channel         text,
  p_type            text,
  p_recipient_email text,
  p_subject         text,
  p_dedupe_key      text,
  p_related_type    text,
  p_related_id      text,
  p_payload         jsonb,
  p_body_html       text,
  p_body_text       text
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
    status, dedupe_key, related_type, related_id, payload,
    body_html, body_text
  ) values (
    p_tenant_id, coalesce(p_channel, 'email'), p_type,
    coalesce(p_recipient_email, ''), coalesce(p_subject, ''),
    'queued', p_dedupe_key, p_related_type, p_related_id,
    coalesce(p_payload, '{}'::jsonb),
    p_body_html, p_body_text
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
       and nl.dedupe_key = p_dedupe_key
     for update;

    -- Backfill retry-critical content for older failed/queued rows without
    -- rewriting delivered mail history.
    if v_id is not null and v_status <> 'sent' then
      update public.notification_log
         set subject   = coalesce(nullif(subject, ''), coalesce(p_subject, '')),
             body_html = coalesce(body_html, p_body_html),
             body_text = coalesce(body_text, p_body_text),
             updated_at = now()
       where notification_log.id = v_id
         and notification_log.tenant_id = p_tenant_id;
    end if;
  end if;

  if v_created then
    insert into public.audit_log (
      actor_user_id, tenant_id, action, target_type, target_id, payload
    ) values (
      null, p_tenant_id, 'notification.enqueued', 'notification', v_id::text,
      jsonb_build_object('type', p_type, 'dedupe_key', p_dedupe_key, 'channel', coalesce(p_channel, 'email'))
    );
  end if;

  return query select v_id, v_status, v_created;
end;
$$;

-- Mark a delivered notification as opened/read. E-mail opens can call this from
-- a webhook/tracking route; in-app read state remains stored on app_notifications.
create or replace function public.mark_notification_opened(
  p_id        uuid,
  p_tenant_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_id is null or p_tenant_id is null then
    raise exception 'id and tenant_id are required';
  end if;

  update public.notification_log
     set opened_at = coalesce(opened_at, now()),
         updated_at = now()
   where id = p_id
     and tenant_id = p_tenant_id
     and opened_at is null;

  if found then
    insert into public.audit_log (
      actor_user_id, tenant_id, action, target_type, target_id, payload
    ) values (
      null, p_tenant_id, 'notification.opened', 'notification', p_id::text, '{}'::jsonb
    );
  end if;
end;
$$;

-- Atomically reserve a failed row for retry. The application sends the stored
-- body immediately after this call and then records the final outcome through
-- mark_notification_status.
create or replace function public.start_notification_retry(
  p_id            uuid,
  p_tenant_id     uuid,
  p_actor_user_id uuid
)
returns table (id uuid, retry_count integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prev public.notification_status;
  v_retry_count integer;
begin
  if p_id is null or p_tenant_id is null then
    raise exception 'id and tenant_id are required';
  end if;

  select status
    into v_prev
    from public.notification_log
   where notification_log.id = p_id
     and notification_log.tenant_id = p_tenant_id
   for update;

  if not found then
    raise exception 'notification % not found in tenant %', p_id, p_tenant_id;
  end if;

  if v_prev = 'sent' then
    raise exception 'sent notifications cannot be retried';
  end if;

  if v_prev <> 'failed' then
    raise exception 'only failed notifications can be retried';
  end if;

  update public.notification_log
     set status = 'queued',
         retry_count = coalesce(notification_log.retry_count, 0) + 1,
         last_retry_at = now(),
         last_retry_error = null,
         error = null,
         provider_message_id = null,
         updated_at = now()
   where notification_log.id = p_id
     and notification_log.tenant_id = p_tenant_id
   returning notification_log.retry_count into v_retry_count;

  insert into public.audit_log (
    actor_user_id, tenant_id, action, target_type, target_id, payload
  ) values (
    p_actor_user_id, p_tenant_id, 'notification.retry_requested', 'notification', p_id::text,
    jsonb_build_object('previous_status', v_prev, 'retry_count', v_retry_count)
  );

  return query select p_id, v_retry_count;
end;
$$;

-- Extend the existing status RPC so retry errors are also visible in the
-- dashboard while preserving the terminal "sent is never overwritten" rule.
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

  if v_prev = 'sent' then
    return;
  end if;

  update public.notification_log
     set status              = p_status,
         provider            = coalesce(p_provider, provider),
         provider_message_id = coalesce(p_provider_message_id, provider_message_id),
         error               = case when p_status = 'failed' then p_error else null end,
         last_retry_error    = case when p_status = 'failed' then p_error else last_retry_error end,
         sent_at             = case when p_status = 'sent' then now() else sent_at end,
         updated_at          = now()
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
    jsonb_build_object('status', p_status, 'provider', p_provider, 'error', p_error, 'previous_status', v_prev)
  );
end;
$$;

revoke all on function public.enqueue_notification_v2(uuid, text, text, text, text, text, text, text, jsonb, text, text) from public;
revoke execute on function public.enqueue_notification_v2(uuid, text, text, text, text, text, text, text, jsonb, text, text) from anon, authenticated;
grant execute on function public.enqueue_notification_v2(uuid, text, text, text, text, text, text, text, jsonb, text, text) to service_role;

revoke all on function public.mark_notification_opened(uuid, uuid) from public;
revoke execute on function public.mark_notification_opened(uuid, uuid) from anon, authenticated;
grant execute on function public.mark_notification_opened(uuid, uuid) to service_role;

revoke all on function public.start_notification_retry(uuid, uuid, uuid) from public;
revoke execute on function public.start_notification_retry(uuid, uuid, uuid) from anon, authenticated;
grant execute on function public.start_notification_retry(uuid, uuid, uuid) to service_role;

revoke all on function public.mark_notification_status(uuid, uuid, public.notification_status, text, text, text) from public;
revoke execute on function public.mark_notification_status(uuid, uuid, public.notification_status, text, text, text) from anon, authenticated;
grant execute on function public.mark_notification_status(uuid, uuid, public.notification_status, text, text, text) to service_role;

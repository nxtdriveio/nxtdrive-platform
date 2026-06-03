-- ============================================================================
-- 0073_in_app_notifications.sql
--
-- Task #108 — In-app meldingen (notificatiebel + communicatiecentrum).
--
-- Voegt een tweede, in-app notificatiekanaal toe NAAST het bestaande e-mail-
-- kanaal (`notification_log`). Waar `notification_log` op e-mailontvanger is
-- gekateniseerd, is een in-app melding gebonden aan een ingelogde gebruiker
-- (`recipient_user_id` → auth.users). Zo verschijnt een sleutelgebeurtenis als
-- melding in de notificatiebel van de juiste leerling/instructeur/staf.
--
-- Invarianten (spiegelt 0026 + de rest van het schema):
--   * Elke rij is tenant-scoped (tenant_id) met RLS + indexes vanaf dag één.
--   * RLS: een gebruiker ziet UITSLUITEND zijn eigen meldingen
--     (recipient_user_id = auth.uid()). Geen brede tenant-tak, geen platform-
--     admin-override — strikte per-gebruiker-isolatie.
--   * Alle schrijfacties lopen via SECURITY DEFINER RPC's die alleen voor
--     service_role uitvoerbaar zijn (anon/authenticated revoked). Er zijn
--     bewust geen INSERT/UPDATE/DELETE policies.
--   * Idempotentie via UNIQUE (tenant_id, dedupe_key): één gebeurtenis levert
--     exact één in-app melding op, ook bij herhaalde dispatch-calls / cron-runs.
--   * Markeer-als-gelezen raakt uitsluitend `read_at`; geen destructieve
--     herschrijving van historie, geen DELETE.
-- ============================================================================

create table if not exists public.app_notifications (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references public.tenants(id) on delete cascade,
  recipient_user_id uuid not null references auth.users(id) on delete cascade,
  type              text not null,
  title             text not null,
  body              text not null default '',
  link              text,
  related_type      text,
  related_id        text,
  dedupe_key        text not null,
  payload           jsonb not null default '{}'::jsonb,
  read_at           timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint app_notifications_dedupe_unique unique (tenant_id, dedupe_key)
);

drop trigger if exists app_notifications_set_updated_at on public.app_notifications;
create trigger app_notifications_set_updated_at
  before update on public.app_notifications
  for each row execute function public.set_updated_at();

-- Bel-query: snelste pad is "mijn ongelezen / recente meldingen, nieuw eerst".
create index if not exists idx_app_notifications_recipient_created
  on public.app_notifications (recipient_user_id, created_at desc);
-- Ongelezen-teller per gebruiker (partieel = klein + snel).
create index if not exists idx_app_notifications_recipient_unread
  on public.app_notifications (recipient_user_id)
  where read_at is null;
create index if not exists idx_app_notifications_tenant_created
  on public.app_notifications (tenant_id, created_at desc);

-- RLS ----------------------------------------------------------------------
alter table public.app_notifications enable row level security;

-- Een gebruiker leest UITSLUITEND zijn eigen meldingen. Geen tenant-brede tak
-- (die zou meldingen van andere leden lekken). Schrijven gaat exclusief via de
-- RPC's hieronder (service role), dus geen INSERT/UPDATE/DELETE policies.
drop policy if exists app_notifications_select_own on public.app_notifications;
create policy app_notifications_select_own on public.app_notifications
  for select
  using (recipient_user_id = auth.uid());

-- RPCs ---------------------------------------------------------------------

-- enqueue_app_notification: idempotent een in-app melding aanmaken. Bij een
-- herhaalde (tenant_id, dedupe_key) wordt de bestaande rij teruggegeven en
-- ongemoeid gelaten, zodat dispatch-retries / cron-runs nooit dubbel melden.
create or replace function public.enqueue_app_notification(
  p_tenant_id         uuid,
  p_recipient_user_id uuid,
  p_type              text,
  p_title             text,
  p_body              text,
  p_link              text,
  p_dedupe_key        text,
  p_related_type      text,
  p_related_id        text,
  p_payload           jsonb
)
returns table (id uuid, was_created boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id      uuid;
  v_created boolean := false;
begin
  if p_tenant_id is null
     or p_recipient_user_id is null
     or p_type is null
     or p_dedupe_key is null then
    raise exception 'tenant_id, recipient_user_id, type and dedupe_key are required';
  end if;

  insert into public.app_notifications (
    tenant_id, recipient_user_id, type, title, body, link,
    dedupe_key, related_type, related_id, payload
  ) values (
    p_tenant_id, p_recipient_user_id, p_type,
    coalesce(p_title, ''), coalesce(p_body, ''), p_link,
    p_dedupe_key, p_related_type, p_related_id,
    coalesce(p_payload, '{}'::jsonb)
  )
  on conflict (tenant_id, dedupe_key) do nothing
  returning app_notifications.id into v_id;

  if v_id is not null then
    v_created := true;
    insert into public.audit_log (
      actor_user_id, tenant_id, action, target_type, target_id, payload
    ) values (
      null, p_tenant_id, 'app_notification.created', 'app_notification', v_id::text,
      jsonb_build_object('type', p_type, 'dedupe_key', p_dedupe_key,
                         'recipient_user_id', p_recipient_user_id)
    );
  else
    select an.id into v_id
      from public.app_notifications an
     where an.tenant_id = p_tenant_id
       and an.dedupe_key = p_dedupe_key;
  end if;

  return query select v_id, v_created;
end;
$$;

-- mark_app_notification_read: markeer één melding van de ACTOR als gelezen.
-- Re-valideert eigenaarschap (recipient_user_id = p_actor); idempotent (een al
-- gelezen melding blijft op zijn read_at staan). Een melding van een andere
-- gebruiker of tenant wordt geweigerd (not found).
create or replace function public.mark_app_notification_read(
  p_id        uuid,
  p_tenant_id uuid,
  p_actor     uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
begin
  if p_id is null or p_tenant_id is null or p_actor is null then
    raise exception 'id, tenant_id and actor are required';
  end if;

  select recipient_user_id into v_owner
    from public.app_notifications
   where id = p_id and tenant_id = p_tenant_id
   for update;
  if not found then
    raise exception 'app_notification % not found in tenant %', p_id, p_tenant_id;
  end if;
  if v_owner <> p_actor then
    raise exception 'app_notification % does not belong to actor', p_id;
  end if;

  update public.app_notifications
     set read_at = coalesce(read_at, now())
   where id = p_id and tenant_id = p_tenant_id;
end;
$$;

-- mark_all_app_notifications_read: markeer ALLE ongelezen meldingen van de actor
-- (binnen de tenant) als gelezen. Retourneert het aantal bijgewerkte rijen.
create or replace function public.mark_all_app_notifications_read(
  p_tenant_id uuid,
  p_actor     uuid
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if p_tenant_id is null or p_actor is null then
    raise exception 'tenant_id and actor are required';
  end if;

  update public.app_notifications
     set read_at = now()
   where tenant_id = p_tenant_id
     and recipient_user_id = p_actor
     and read_at is null;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Grant lockdown: Supabase auto-grant EXECUTE op nieuwe public functies aan
-- anon/authenticated. Trek in en her-grant uitsluitend aan service_role
-- (zelfde patroon als 0023/0026).
revoke all on function public.enqueue_app_notification(uuid, uuid, text, text, text, text, text, text, text, jsonb) from public;
revoke execute on function public.enqueue_app_notification(uuid, uuid, text, text, text, text, text, text, text, jsonb) from anon, authenticated;
grant execute on function public.enqueue_app_notification(uuid, uuid, text, text, text, text, text, text, text, jsonb) to service_role;

revoke all on function public.mark_app_notification_read(uuid, uuid, uuid) from public;
revoke execute on function public.mark_app_notification_read(uuid, uuid, uuid) from anon, authenticated;
grant execute on function public.mark_app_notification_read(uuid, uuid, uuid) to service_role;

revoke all on function public.mark_all_app_notifications_read(uuid, uuid) from public;
revoke execute on function public.mark_all_app_notifications_read(uuid, uuid) from anon, authenticated;
grant execute on function public.mark_all_app_notifications_read(uuid, uuid) to service_role;

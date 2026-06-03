-- ============================================================================
-- 0074_web_push.sql
--
-- Task #110 — Push-meldingen (web push).
--
-- Voegt web-push toe BOVENOP het bestaande in-app kanaal (`app_notifications`,
-- 0073). Een in-app melding is gebonden aan een ingelogde gebruiker; web push
-- levert diezelfde melding ook af als browser/PWA-pushnotificatie op de door de
-- gebruiker geabonneerde apparaten.
--
-- Deze migratie bewaart enkel de push-ABONNEMENTEN (één rij per browser/apparaat
-- + ingelogde gebruiker). De feitelijke verzending gebeurt server-side met de
-- VAPID-config; er wordt hier geen verzendlog bijgehouden (dat is het bestaande
-- notification/app_notification-spoor al).
--
-- Invarianten (spiegelt 0026 + 0073 + de rest van het schema):
--   * Elke rij is tenant-scoped (tenant_id) met RLS + indexes vanaf dag één.
--   * RLS: een gebruiker ziet/raakt UITSLUITEND zijn eigen abonnementen
--     (recipient_user_id = auth.uid()). Geen brede tenant-tak, geen platform-
--     admin-override — strikte per-gebruiker-isolatie.
--   * Alle schrijfacties lopen via SECURITY DEFINER RPC's die alleen voor
--     service_role uitvoerbaar zijn (anon/authenticated revoked). Er zijn
--     bewust geen INSERT/UPDATE/DELETE policies.
--   * Een push-endpoint is globaal uniek (één fysiek apparaat/browser). Opnieuw
--     abonneren is idempotent via UNIQUE (endpoint): de bestaande rij wordt
--     ge-upsert naar de huidige gebruiker/tenant (bv. na uitloggen + ander
--     account op hetzelfde apparaat).
-- ============================================================================

create table if not exists public.push_subscriptions (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references public.tenants(id) on delete cascade,
  recipient_user_id uuid not null references auth.users(id) on delete cascade,
  endpoint          text not null,
  p256dh            text not null,
  auth              text not null,
  user_agent        text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  last_used_at      timestamptz,
  constraint push_subscriptions_endpoint_unique unique (endpoint)
);

drop trigger if exists push_subscriptions_set_updated_at on public.push_subscriptions;
create trigger push_subscriptions_set_updated_at
  before update on public.push_subscriptions
  for each row execute function public.set_updated_at();

-- Verzend-query: "alle abonnementen van DEZE gebruiker" (per-tenant gescoped in
-- de app-laag). Endpoint heeft al een unieke index voor upsert/prune.
create index if not exists idx_push_subscriptions_recipient
  on public.push_subscriptions (recipient_user_id);
create index if not exists idx_push_subscriptions_tenant
  on public.push_subscriptions (tenant_id);

-- RLS ----------------------------------------------------------------------
alter table public.push_subscriptions enable row level security;

-- Een gebruiker leest UITSLUITEND zijn eigen abonnementen. Schrijven gaat
-- exclusief via de RPC's hieronder (service role), dus geen INSERT/UPDATE/DELETE
-- policies.
drop policy if exists push_subscriptions_select_own on public.push_subscriptions;
create policy push_subscriptions_select_own on public.push_subscriptions
  for select
  using (recipient_user_id = auth.uid());

-- RPCs ---------------------------------------------------------------------

-- upsert_push_subscription: idempotent een abonnement opslaan. Het endpoint is
-- globaal uniek; opnieuw abonneren (zelfde browser) werkt de sleutels +
-- eigenaar bij. Zo wordt na uitloggen + ander account op hetzelfde apparaat het
-- abonnement correct naar de nieuwe gebruiker overgezet (nooit een dubbele rij,
-- nooit push naar de vorige gebruiker).
create or replace function public.upsert_push_subscription(
  p_tenant_id         uuid,
  p_recipient_user_id uuid,
  p_endpoint          text,
  p_p256dh            text,
  p_auth              text,
  p_user_agent        text
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
     or p_endpoint is null
     or p_p256dh is null
     or p_auth is null then
    raise exception 'tenant_id, recipient_user_id, endpoint, p256dh and auth are required';
  end if;

  insert into public.push_subscriptions (
    tenant_id, recipient_user_id, endpoint, p256dh, auth, user_agent, last_used_at
  ) values (
    p_tenant_id, p_recipient_user_id, p_endpoint, p_p256dh, p_auth, p_user_agent, now()
  )
  on conflict (endpoint) do update
     set tenant_id         = excluded.tenant_id,
         recipient_user_id = excluded.recipient_user_id,
         p256dh            = excluded.p256dh,
         auth              = excluded.auth,
         user_agent        = excluded.user_agent
   returning push_subscriptions.id,
             (push_subscriptions.created_at = push_subscriptions.updated_at)
     into v_id, v_created;

  if v_created then
    insert into public.audit_log (
      actor_user_id, tenant_id, action, target_type, target_id, payload
    ) values (
      p_recipient_user_id, p_tenant_id, 'push_subscription.created',
      'push_subscription', v_id::text,
      jsonb_build_object('recipient_user_id', p_recipient_user_id)
    );
  end if;

  return query select v_id, v_created;
end;
$$;

-- delete_push_subscription: verwijder het abonnement van de ACTOR voor één
-- endpoint (uitschakelen door de gebruiker). Re-valideert eigenaarschap; een
-- endpoint van een andere gebruiker wordt niet geraakt (no-op).
create or replace function public.delete_push_subscription(
  p_tenant_id uuid,
  p_actor     uuid,
  p_endpoint  text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_tenant_id is null or p_actor is null or p_endpoint is null then
    raise exception 'tenant_id, actor and endpoint are required';
  end if;

  delete from public.push_subscriptions
   where endpoint = p_endpoint
     and tenant_id = p_tenant_id
     and recipient_user_id = p_actor;
end;
$$;

-- prune_push_subscription: verwijder een dood/verlopen abonnement op endpoint
-- (na een 404/410 van de push-service). Geen actor-check: het endpoint is
-- globaal uniek en de push-service heeft al bevestigd dat het ongeldig is.
-- Alleen service_role kan dit aanroepen.
create or replace function public.prune_push_subscription(
  p_endpoint text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_endpoint is null then
    raise exception 'endpoint is required';
  end if;

  delete from public.push_subscriptions
   where endpoint = p_endpoint;
end;
$$;

-- Grant lockdown: Supabase auto-grant EXECUTE op nieuwe public functies aan
-- anon/authenticated. Trek in en her-grant uitsluitend aan service_role
-- (zelfde patroon als 0023/0026/0073).
revoke all on function public.upsert_push_subscription(uuid, uuid, text, text, text, text) from public;
revoke execute on function public.upsert_push_subscription(uuid, uuid, text, text, text, text) from anon, authenticated;
grant execute on function public.upsert_push_subscription(uuid, uuid, text, text, text, text) to service_role;

revoke all on function public.delete_push_subscription(uuid, uuid, text) from public;
revoke execute on function public.delete_push_subscription(uuid, uuid, text) from anon, authenticated;
grant execute on function public.delete_push_subscription(uuid, uuid, text) to service_role;

revoke all on function public.prune_push_subscription(text) from public;
revoke execute on function public.prune_push_subscription(text) from anon, authenticated;
grant execute on function public.prune_push_subscription(text) to service_role;

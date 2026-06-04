-- ============================================================================
-- 0089_notification_preferences.sql
--
-- Opslaan van meldingsvoorkeuren per gebruiker per tenant, zodat de voorkeur
-- voor pushmeldingen synchroniseert over meerdere apparaten.
--
-- Eén rij per (user_id, tenant_id) — niet per rol, want voorkeuren gelden
-- voor de persoon, niet voor de specifieke rol die hij/zij heeft binnen een
-- tenant. Fysieke apparaatabonnementen blijven in push_subscriptions; deze
-- tabel slaat alleen de intentie ("wil ik push ontvangen?") op.
-- ============================================================================

create table if not exists public.notification_preferences (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null references auth.users(id) on delete cascade,
  tenant_id   uuid        not null references public.tenants(id) on delete cascade,
  push_enabled boolean    not null default false,
  updated_at  timestamptz not null default now(),
  unique (user_id, tenant_id)
);

-- Indexes
create index if not exists notification_preferences_user_tenant_idx
  on public.notification_preferences (user_id, tenant_id);

-- Updated-at trigger
create or replace function public.set_notification_preferences_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_notification_preferences_updated_at
  before update on public.notification_preferences
  for each row execute function public.set_notification_preferences_updated_at();

-- ============================================================================
-- RLS
-- ============================================================================
alter table public.notification_preferences enable row level security;

-- Users may read their own preference row
create policy "notification_preferences_select_own"
  on public.notification_preferences
  for select
  using (user_id = auth.uid());

-- Users may insert their own preference row
create policy "notification_preferences_insert_own"
  on public.notification_preferences
  for insert
  with check (user_id = auth.uid());

-- Users may update their own preference row
create policy "notification_preferences_update_own"
  on public.notification_preferences
  for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- No direct deletes from the client — row is kept but push_enabled set false
-- Service role can bypass RLS as usual for admin/migration purposes.

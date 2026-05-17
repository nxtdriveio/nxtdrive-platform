-- 0008_leads_rls.sql
-- RLS for leads + lead_events.
-- Public intake INSERTs ALWAYS go through the service role (server action).
-- Authenticated members can read + update leads in their own tenant.

-- leads --------------------------------------------------------------------
alter table public.leads enable row level security;

drop policy if exists leads_select_members on public.leads;
create policy leads_select_members on public.leads
  for select
  using (
    tenant_id in (select public.my_tenant_ids())
    or public.is_platform_admin()
  );

drop policy if exists leads_update_members on public.leads;
create policy leads_update_members on public.leads
  for update
  using (
    public.has_role(tenant_id, 'tenant_admin')
    or public.has_role(tenant_id, 'instructor')
    or public.is_platform_admin()
  )
  with check (
    public.has_role(tenant_id, 'tenant_admin')
    or public.has_role(tenant_id, 'instructor')
    or public.is_platform_admin()
  );

-- No INSERT/DELETE policies — service role only.

-- lead_events --------------------------------------------------------------
alter table public.lead_events enable row level security;

drop policy if exists lead_events_select_members on public.lead_events;
create policy lead_events_select_members on public.lead_events
  for select
  using (
    tenant_id in (select public.my_tenant_ids())
    or public.is_platform_admin()
  );

-- No INSERT/UPDATE/DELETE policies — service role writes only.

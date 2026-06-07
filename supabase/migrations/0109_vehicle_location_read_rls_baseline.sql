-- Sprint 4F: permissive read baseline for shared operational assets.
--
-- The restrictive policies in 0107 are an extra branch-scope layer. These
-- permissive policies provide the tenant-member read baseline for vehicles and
-- locations in case the module did not already have authenticated read RLS.

drop policy if exists "tenant members can read vehicles" on public.vehicles;
create policy "tenant members can read vehicles"
  on public.vehicles
  for select
  to authenticated
  using (
    exists (
      select 1
        from public.profiles p
       where p.id = auth.uid()
         and coalesce(p.is_platform_admin, false) = true
    )
    or exists (
      select 1
        from public.memberships m
       where m.user_id = auth.uid()
         and m.tenant_id = vehicles.tenant_id
    )
  );

drop policy if exists "tenant members can read locations" on public.locations;
create policy "tenant members can read locations"
  on public.locations
  for select
  to authenticated
  using (
    exists (
      select 1
        from public.profiles p
       where p.id = auth.uid()
         and coalesce(p.is_platform_admin, false) = true
    )
    or exists (
      select 1
        from public.memberships m
       where m.user_id = auth.uid()
         and m.tenant_id = locations.tenant_id
    )
  );

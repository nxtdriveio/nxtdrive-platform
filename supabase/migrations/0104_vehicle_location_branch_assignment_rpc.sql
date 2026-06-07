-- Sprint 4B: focused branch-assignment RPCs for vehicles and locations.
--
-- Existing create/toggle RPC signatures stay unchanged. These RPCs only assign
-- the operational branch, with `null` meaning shared across the organization.

create or replace function public.assign_vehicle_branch(
  p_tenant_id uuid,
  p_actor uuid,
  p_id uuid,
  p_branch_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_branch_id is not null and not exists (
    select 1
    from public.branches b
    where b.id = p_branch_id
      and b.tenant_id = p_tenant_id
  ) then
    raise exception 'branch_id must belong to the same tenant';
  end if;

  update public.vehicles
     set branch_id = p_branch_id,
         updated_at = now()
   where id = p_id
     and tenant_id = p_tenant_id;

  if not found then
    raise exception 'vehicle not found';
  end if;

  perform p_actor;
end;
$$;

create or replace function public.assign_location_branch(
  p_tenant_id uuid,
  p_actor uuid,
  p_id uuid,
  p_branch_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_branch_id is not null and not exists (
    select 1
    from public.branches b
    where b.id = p_branch_id
      and b.tenant_id = p_tenant_id
  ) then
    raise exception 'branch_id must belong to the same tenant';
  end if;

  update public.locations
     set branch_id = p_branch_id,
         updated_at = now()
   where id = p_id
     and tenant_id = p_tenant_id;

  if not found then
    raise exception 'location not found';
  end if;

  perform p_actor;
end;
$$;

revoke all on function public.assign_vehicle_branch(uuid, uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.assign_location_branch(uuid, uuid, uuid, uuid) from public, anon, authenticated;

grant execute on function public.assign_vehicle_branch(uuid, uuid, uuid, uuid) to service_role;
grant execute on function public.assign_location_branch(uuid, uuid, uuid, uuid) to service_role;

comment on function public.assign_vehicle_branch(uuid, uuid, uuid, uuid) is
  'Assigns a vehicle to a branch. Null branch means shared organization asset. Service-role only; app code must authorize vehicle:manage first.';

comment on function public.assign_location_branch(uuid, uuid, uuid, uuid) is
  'Assigns a location to a branch. Null branch means shared organization asset. Service-role only; app code must authorize vehicle:manage first.';

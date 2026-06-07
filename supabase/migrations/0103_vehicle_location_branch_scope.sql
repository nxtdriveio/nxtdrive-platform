-- Sprint 4A: branch-aware vehicles and locations.
--
-- `branch_id = null` means the asset is shared across the organization.
-- Branch-scoped views can include shared rows plus rows from their allowed
-- branches. Mutations stay behind the existing service-role RPCs.

alter table public.vehicles
  add column if not exists branch_id uuid null references public.branches(id) on delete set null;

alter table public.locations
  add column if not exists branch_id uuid null references public.branches(id) on delete set null;

create index if not exists idx_vehicles_tenant_branch
  on public.vehicles (tenant_id, branch_id)
  where branch_id is not null;

create index if not exists idx_locations_tenant_branch
  on public.locations (tenant_id, branch_id)
  where branch_id is not null;

create or replace function public.ensure_vehicle_location_branch_tenant()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.branch_id is null then
    return new;
  end if;

  if not exists (
    select 1
    from public.branches b
    where b.id = new.branch_id
      and b.tenant_id = new.tenant_id
  ) then
    raise exception 'branch_id must belong to the same tenant';
  end if;

  return new;
end;
$$;

drop trigger if exists vehicles_branch_tenant_guard on public.vehicles;
create trigger vehicles_branch_tenant_guard
  before insert or update of tenant_id, branch_id on public.vehicles
  for each row
  execute function public.ensure_vehicle_location_branch_tenant();

drop trigger if exists locations_branch_tenant_guard on public.locations;
create trigger locations_branch_tenant_guard
  before insert or update of tenant_id, branch_id on public.locations
  for each row
  execute function public.ensure_vehicle_location_branch_tenant();

comment on column public.vehicles.branch_id is
  'Optional operational branch assignment. Null means shared across the organization.';

comment on column public.locations.branch_id is
  'Optional operational branch assignment. Null means shared across the organization.';

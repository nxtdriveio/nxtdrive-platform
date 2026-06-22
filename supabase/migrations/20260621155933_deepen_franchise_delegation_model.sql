-- Deepen franchise operational delegation from boolean flags into governed,
-- scoped, time-bound permissions with row-level provenance and automatic audit.

alter table public.franchise_operations_permissions
  add column if not exists scope_type text not null default 'tenant',
  add column if not exists scope_refs jsonb not null default '[]'::jsonb,
  add column if not exists valid_from timestamptz not null default now(),
  add column if not exists valid_until timestamptz,
  add column if not exists grant_reason text,
  add column if not exists granted_by uuid references auth.users(id) on delete set null,
  add column if not exists revoked_at timestamptz,
  add column if not exists revoked_by uuid references auth.users(id) on delete set null,
  add column if not exists revoke_reason text;

update public.franchise_operations_permissions
   set scope_type = coalesce(nullif(scope_type, ''), 'tenant'),
       scope_refs = case
         when jsonb_typeof(scope_refs) = 'array' then scope_refs
         else '[]'::jsonb
       end,
       valid_from = coalesce(valid_from, created_at, now()),
       grant_reason = coalesce(nullif(grant_reason, ''), 'Legacy delegatie overgenomen bij migratie.')
 where scope_type is null
    or scope_type = ''
    or scope_refs is null
    or valid_from is null
    or grant_reason is null
    or grant_reason = '';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'franchise_operations_permissions_scope_type_check'
      and conrelid = 'public.franchise_operations_permissions'::regclass
  ) then
    alter table public.franchise_operations_permissions
      add constraint franchise_operations_permissions_scope_type_check
      check (scope_type in ('tenant', 'branches', 'rayons', 'capabilities', 'custom'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'franchise_operations_permissions_scope_refs_array_check'
      and conrelid = 'public.franchise_operations_permissions'::regclass
  ) then
    alter table public.franchise_operations_permissions
      add constraint franchise_operations_permissions_scope_refs_array_check
      check (jsonb_typeof(scope_refs) = 'array');
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'franchise_operations_permissions_valid_window_check'
      and conrelid = 'public.franchise_operations_permissions'::regclass
  ) then
    alter table public.franchise_operations_permissions
      add constraint franchise_operations_permissions_valid_window_check
      check (valid_until is null or valid_until > valid_from);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'franchise_operations_permissions_revoke_reason_check'
      and conrelid = 'public.franchise_operations_permissions'::regclass
  ) then
    alter table public.franchise_operations_permissions
      add constraint franchise_operations_permissions_revoke_reason_check
      check (revoked_at is null or nullif(btrim(coalesce(revoke_reason, '')), '') is not null);
  end if;
end $$;

create index if not exists idx_franchise_operations_permissions_active
  on public.franchise_operations_permissions (
    franchise_root_tenant_id,
    franchisee_tenant_id,
    valid_from,
    valid_until
  )
  where revoked_at is null;

create index if not exists idx_franchise_operations_permissions_revoked
  on public.franchise_operations_permissions (franchise_root_tenant_id, revoked_at desc)
  where revoked_at is not null;

comment on column public.franchise_operations_permissions.scope_type is
  'Delegation boundary: tenant-wide, branches, rayons, capabilities, or custom.';
comment on column public.franchise_operations_permissions.scope_refs is
  'JSON array with optional scoped identifiers or labels; empty means the whole selected scope.';
comment on column public.franchise_operations_permissions.valid_from is
  'Start timestamp for the delegated rights.';
comment on column public.franchise_operations_permissions.valid_until is
  'Optional expiry timestamp for the delegated rights.';
comment on column public.franchise_operations_permissions.grant_reason is
  'Business reason recorded when delegation is granted or changed.';
comment on column public.franchise_operations_permissions.granted_by is
  'User who granted or last changed the delegation.';
comment on column public.franchise_operations_permissions.revoked_at is
  'Soft-revoke timestamp. Revoked rows remain for governance and audit history.';
comment on column public.franchise_operations_permissions.revoked_by is
  'User who revoked the delegation.';
comment on column public.franchise_operations_permissions.revoke_reason is
  'Business reason recorded when delegation is revoked.';

create or replace function public.audit_franchise_operations_permissions()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_action text;
  v_actor uuid;
  v_root uuid;
  v_franchisee uuid;
  v_payload jsonb;
begin
  if tg_op = 'INSERT' then
    v_action := 'franchise.delegation.created';
    v_actor := new.granted_by;
    v_root := new.franchise_root_tenant_id;
    v_franchisee := new.franchisee_tenant_id;
    v_payload := jsonb_build_object('new', to_jsonb(new));
  elsif tg_op = 'DELETE' then
    v_action := 'franchise.delegation.deleted';
    v_actor := coalesce(old.revoked_by, old.granted_by);
    v_root := old.franchise_root_tenant_id;
    v_franchisee := old.franchisee_tenant_id;
    v_payload := jsonb_build_object('old', to_jsonb(old));
  else
    if old.revoked_at is null and new.revoked_at is not null then
      v_action := 'franchise.delegation.revoked';
      v_actor := coalesce(new.revoked_by, new.granted_by, old.granted_by);
    elsif old.revoked_at is not null and new.revoked_at is null then
      v_action := 'franchise.delegation.reactivated';
      v_actor := coalesce(new.granted_by, old.granted_by);
    else
      v_action := 'franchise.delegation.updated';
      v_actor := coalesce(new.granted_by, old.granted_by);
    end if;
    v_root := new.franchise_root_tenant_id;
    v_franchisee := new.franchisee_tenant_id;
    v_payload := jsonb_build_object('old', to_jsonb(old), 'new', to_jsonb(new));
  end if;

  insert into public.audit_log (
    actor_user_id,
    tenant_id,
    action,
    target_type,
    target_id,
    payload
  )
  values (
    v_actor,
    v_root,
    v_action,
    'franchise_operations_permission',
    v_franchisee::text,
    v_payload
  );

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

revoke all on function public.audit_franchise_operations_permissions() from public;
revoke all on function public.audit_franchise_operations_permissions() from anon;
revoke all on function public.audit_franchise_operations_permissions() from authenticated;

drop trigger if exists franchise_operations_permissions_audit on public.franchise_operations_permissions;
create trigger franchise_operations_permissions_audit
  after insert or update or delete on public.franchise_operations_permissions
  for each row execute function public.audit_franchise_operations_permissions();

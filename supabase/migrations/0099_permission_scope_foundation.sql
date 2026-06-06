-- ============================================================================
-- 0099_permission_scope_foundation.sql
--
-- Sprint 3: permissions and scope v2 foundation.
--
-- Existing behavior before this migration:
--   * rows in membership_branches limit a membership to specific branches
--   * no rows in membership_branches means organization-wide branch access
--
-- This migration preserves that behavior, but stores it explicitly on
-- memberships.branch_scope_type so application code and future RLS policies do
-- not need to infer all-access from an empty mapping table.
-- ============================================================================

alter table public.memberships
  add column if not exists branch_scope_type text not null default 'all';

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'memberships_branch_scope_type_check'
       and conrelid = 'public.memberships'::regclass
  ) then
    alter table public.memberships
      add constraint memberships_branch_scope_type_check
      check (branch_scope_type in ('all', 'branches'));
  end if;
end $$;

comment on column public.memberships.branch_scope_type is
  'Explicit branch access scope. all = all branches in the tenant; branches = limited by membership_branches rows.';

create or replace function public.refresh_membership_branch_scope(
  p_membership_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.memberships m
     set branch_scope_type = case
       when exists (
         select 1
           from public.membership_branches mb
          where mb.membership_id = p_membership_id
       ) then 'branches'
       else 'all'
     end
   where m.id = p_membership_id;
end;
$$;

revoke all on function public.refresh_membership_branch_scope(uuid) from public;
revoke all on function public.refresh_membership_branch_scope(uuid) from anon;
revoke all on function public.refresh_membership_branch_scope(uuid) from authenticated;
grant execute on function public.refresh_membership_branch_scope(uuid) to service_role;

create or replace function public.membership_branches_sync_scope()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    perform public.refresh_membership_branch_scope(old.membership_id);
    return old;
  end if;

  if tg_op = 'UPDATE' and old.membership_id is distinct from new.membership_id then
    perform public.refresh_membership_branch_scope(old.membership_id);
  end if;

  perform public.refresh_membership_branch_scope(new.membership_id);
  return new;
end;
$$;

revoke all on function public.membership_branches_sync_scope() from public;
revoke all on function public.membership_branches_sync_scope() from anon;
revoke all on function public.membership_branches_sync_scope() from authenticated;

drop trigger if exists membership_branches_sync_scope on public.membership_branches;
create trigger membership_branches_sync_scope
  after insert or update or delete on public.membership_branches
  for each row execute function public.membership_branches_sync_scope();

update public.memberships m
   set branch_scope_type = case
     when exists (
       select 1
         from public.membership_branches mb
        where mb.membership_id = m.id
     ) then 'branches'
     else 'all'
   end;

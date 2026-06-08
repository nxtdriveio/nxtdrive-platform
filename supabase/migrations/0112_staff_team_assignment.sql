-- Sprint 5C: assign staff memberships to organization teams.
--
-- This RPC sets all team assignments for one staff membership. It preserves the
-- separation between structure and authorization: teams are operational groups,
-- while roles and branch scope remain the permission source of truth.

create or replace function public.set_membership_organization_teams(
  p_membership_id uuid,
  p_tenant_id uuid,
  p_actor uuid,
  p_team_ids uuid[] default array[]::uuid[]
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_distinct_count integer;
  v_valid_count integer;
  v_branch_mismatch_count integer;
begin
  if not public.actor_can_manage_organization_team(p_actor, p_tenant_id) then
    raise exception 'niet geautoriseerd: teams beheren vereist organisatiebeheer';
  end if;

  if not exists (
    select 1
      from public.memberships m
     where m.id = p_membership_id
       and m.tenant_id = p_tenant_id
       and m.role not in ('student', 'parent')
  ) then
    raise exception 'medewerker niet gevonden binnen deze organisatie';
  end if;

  select count(distinct ids.team_id)
    into v_distinct_count
    from unnest(coalesce(p_team_ids, array[]::uuid[])) as ids(team_id);

  select count(distinct t.id)
    into v_valid_count
    from public.organization_teams t
   where t.tenant_id = p_tenant_id
     and t.id = any(coalesce(p_team_ids, array[]::uuid[]));

  if coalesce(v_distinct_count, 0) <> coalesce(v_valid_count, 0) then
    raise exception 'een of meer teams horen niet bij deze organisatie';
  end if;

  select count(*)
    into v_branch_mismatch_count
    from public.organization_teams t
    join public.memberships m
      on m.id = p_membership_id
     and m.tenant_id = p_tenant_id
   where t.tenant_id = p_tenant_id
     and t.id = any(coalesce(p_team_ids, array[]::uuid[]))
     and t.branch_id is not null
     and coalesce(m.branch_scope_type, 'all') = 'branches'
     and not exists (
       select 1
         from public.membership_branches mb
        where mb.membership_id = p_membership_id
          and mb.branch_id = t.branch_id
     );

  if coalesce(v_branch_mismatch_count, 0) > 0 then
    raise exception 'een of meer teams vallen buiten de vestigingstoegang van deze medewerker';
  end if;

  delete from public.organization_team_members
   where membership_id = p_membership_id
     and tenant_id = p_tenant_id;

  insert into public.organization_team_members (
    tenant_id,
    team_id,
    membership_id,
    created_by
  )
  select p_tenant_id, ids.team_id, p_membership_id, p_actor
    from (
      select distinct ids.team_id
        from unnest(coalesce(p_team_ids, array[]::uuid[])) as ids(team_id)
    ) ids;

  insert into public.audit_log
    (actor_user_id, tenant_id, action, target_type, target_id, payload)
  values (
    p_actor,
    p_tenant_id,
    'organization_team.membership_teams_set',
    'membership',
    p_membership_id::text,
    jsonb_build_object('team_count', coalesce(v_valid_count, 0))
  );
end;
$$;

revoke all on function public.set_membership_organization_teams(uuid, uuid, uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.set_membership_organization_teams(uuid, uuid, uuid, uuid[]) to service_role;

comment on function public.set_membership_organization_teams(uuid, uuid, uuid, uuid[]) is
  'Sets all organization team assignments for one staff membership while preserving tenant and branch-scope safety.';

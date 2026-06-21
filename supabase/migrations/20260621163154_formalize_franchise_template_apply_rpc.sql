-- Formalize franchisegever-driven template application as a single guarded,
-- idempotent database operation. The application layer should no longer
-- perform distribute -> package insert -> activation update -> audit manually.

create or replace function public.apply_franchise_template_as_franchisegever(
  p_template_id uuid,
  p_franchisee_tenant_id uuid,
  p_actor uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_template public.franchise_templates%rowtype;
  v_distribution public.franchise_template_activations%rowtype;
  v_distribution_created boolean := false;
  v_inserted_count integer := 0;
  v_package_id uuid;
  v_credits_text text;
  v_price_text text;
  v_valid_days_text text;
  v_credits_total integer;
  v_price_cents integer;
  v_valid_days integer;
begin
  if p_template_id is null or p_franchisee_tenant_id is null or p_actor is null then
    raise exception 'template, franchisee en actor zijn verplicht';
  end if;

  select *
    into v_template
    from public.franchise_templates
   where id = p_template_id
     and is_active = true;

  if v_template.id is null then
    raise exception 'template niet gevonden of niet actief';
  end if;

  if v_template.template_type <> 'package' then
    raise exception 'alleen package-templates kunnen worden toegepast';
  end if;

  if not (
    exists (
      select 1
      from public.memberships m
      where m.user_id = p_actor
        and m.tenant_id = v_template.tenant_id
        and m.role in ('tenant_admin', 'franchise_admin')
    )
    or coalesce((select is_platform_admin from public.profiles where id = p_actor), false)
  ) then
    raise exception 'niet geautoriseerd: franchise_admin of tenant_admin vereist';
  end if;

  if not exists (
    select 1
    from public.tenants t
    where t.id = p_franchisee_tenant_id
      and t.parent_tenant_id = v_template.tenant_id
  ) then
    raise exception 'franchisee hoort niet bij deze franchisegever';
  end if;

  if not exists (
    select 1
    from public.franchise_operations_permissions fop
    where fop.franchise_root_tenant_id = v_template.tenant_id
      and fop.franchisee_tenant_id = p_franchisee_tenant_id
      and fop.can_manage_templates = true
      and fop.revoked_at is null
      and fop.valid_from <= now()
      and (fop.valid_until is null or fop.valid_until > now())
  ) then
    raise exception 'template-delegatie is vereist of niet meer geldig';
  end if;

  v_credits_text := nullif(btrim(v_template.config ->> 'credits_total'), '');
  v_price_text := nullif(btrim(v_template.config ->> 'price_cents'), '');
  v_valid_days_text := nullif(btrim(v_template.config ->> 'valid_days'), '');

  if v_credits_text is null then
    v_credits_total := 60;
  elsif v_credits_text ~ '^[0-9]+$' and v_credits_text::integer > 0 then
    v_credits_total := v_credits_text::integer;
  else
    raise exception 'template credits_total is ongeldig';
  end if;

  if v_price_text is null then
    v_price_cents := 0;
  elsif v_price_text ~ '^[0-9]+$' and v_price_text::integer >= 0 then
    v_price_cents := v_price_text::integer;
  else
    raise exception 'template price_cents is ongeldig';
  end if;

  if v_valid_days_text is null then
    v_valid_days := null;
  elsif v_valid_days_text ~ '^[0-9]+$' and v_valid_days_text::integer > 0 then
    v_valid_days := v_valid_days_text::integer;
  else
    raise exception 'template valid_days is ongeldig';
  end if;

  insert into public.franchise_template_activations (
    franchise_template_id,
    franchisee_tenant_id,
    activated_by
  )
  values (
    p_template_id,
    p_franchisee_tenant_id,
    p_actor
  )
  on conflict (franchise_template_id, franchisee_tenant_id) do nothing;

  get diagnostics v_inserted_count = row_count;
  v_distribution_created := v_inserted_count > 0;

  select *
    into v_distribution
    from public.franchise_template_activations
   where franchise_template_id = p_template_id
     and franchisee_tenant_id = p_franchisee_tenant_id
   for update;

  if v_distribution.id is null then
    raise exception 'template-distributie kon niet worden vastgesteld';
  end if;

  if v_distribution_created then
    insert into public.audit_log (
      actor_user_id,
      tenant_id,
      action,
      target_type,
      target_id,
      payload
    )
    values (
      p_actor,
      v_template.tenant_id,
      'franchise_template.distributed',
      'franchise_template',
      p_template_id::text,
      jsonb_build_object(
        'franchisee_tenant_id', p_franchisee_tenant_id,
        'distribution_id', v_distribution.id,
        'source', 'apply_franchise_template_as_franchisegever'
      )
    );
  end if;

  if v_distribution.resulting_package_id is not null then
    return v_distribution.id;
  end if;

  insert into public.packages (
    tenant_id,
    name,
    credits_total,
    price_cents,
    valid_days,
    active,
    category,
    visible_in_app,
    visible_on_website
  )
  values (
    p_franchisee_tenant_id,
    v_template.name,
    v_credits_total,
    v_price_cents,
    v_valid_days,
    true,
    'pakket',
    true,
    false
  )
  returning id into v_package_id;

  update public.franchise_template_activations
     set resulting_package_id = v_package_id,
         activated_at = now(),
         activated_by = p_actor
   where id = v_distribution.id;

  insert into public.audit_log (
    actor_user_id,
    tenant_id,
    action,
    target_type,
    target_id,
    payload
  )
  values (
    p_actor,
    p_franchisee_tenant_id,
    'franchise_template.applied_by_franchisegever',
    'package',
    v_package_id::text,
    jsonb_build_object(
      'template_id', p_template_id,
      'franchise_root_tenant_id', v_template.tenant_id,
      'franchisee_tenant_id', p_franchisee_tenant_id,
      'distribution_id', v_distribution.id,
      'credits_total', v_credits_total,
      'price_cents', v_price_cents,
      'valid_days', v_valid_days
    )
  );

  return v_distribution.id;
end;
$$;

revoke all on function public.apply_franchise_template_as_franchisegever(uuid, uuid, uuid) from public;
revoke all on function public.apply_franchise_template_as_franchisegever(uuid, uuid, uuid) from anon;
revoke all on function public.apply_franchise_template_as_franchisegever(uuid, uuid, uuid) from authenticated;
grant execute on function public.apply_franchise_template_as_franchisegever(uuid, uuid, uuid) to service_role;

-- Review workspace for the versioned RIS 2.0 catalog.
--
-- The catalog stays unpublished until a real platform administrator records a
-- named expert review. The review is bound to a database-generated canonical
-- snapshot and SHA-256 hash, so later content changes invalidate the approval.

create or replace function public._ris_catalog_validation_document(
  p_ris_version_id uuid
) returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_version public.ris_versions%rowtype;
  v_modules jsonb;
  v_steps jsonb;
begin
  select *
    into v_version
    from public.ris_versions
   where id = p_ris_version_id;

  if v_version.id is null then
    raise exception 'RIS catalog version not found';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'moduleNumber', module_row.module_number,
        'title', module_row.title,
        'description', module_row.description,
        'sortOrder', module_row.sort_order,
        'categories', coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'title', category_row.title,
              'sortOrder', category_row.sort_order,
              'scripts', coalesce((
                select jsonb_agg(
                  jsonb_build_object(
                    'scriptNumber', script_row.script_number,
                    'code', script_row.code,
                    'title', script_row.title,
                    'descriptionShort', script_row.description_short,
                    'sortOrder', script_row.sort_order,
                    'variants', coalesce((
                      select jsonb_agg(
                        jsonb_build_object(
                          'code', variant_row.code,
                          'title', variant_row.title,
                          'sortOrder', variant_row.sort_order
                        )
                        order by variant_row.sort_order, variant_row.code
                      )
                        from public.ris_script_variants variant_row
                       where variant_row.script_id = script_row.id
                         and variant_row.is_active
                    ), '[]'::jsonb)
                  )
                  order by script_row.sort_order, script_row.script_number, script_row.code
                )
                  from public.ris_scripts script_row
                 where script_row.ris_version_id = p_ris_version_id
                   and script_row.module_id = module_row.id
                   and script_row.category_id = category_row.id
                   and script_row.is_active
              ), '[]'::jsonb)
            )
            order by category_row.sort_order, category_row.title
          )
            from public.ris_categories category_row
           where category_row.ris_module_id = module_row.id
        ), '[]'::jsonb)
      )
      order by module_row.sort_order, module_row.module_number
    ),
    '[]'::jsonb
  )
    into v_modules
    from public.ris_modules module_row
   where module_row.ris_version_id = p_ris_version_id;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'stepValue', step_row.step_value,
        'instructorLabel', step_row.instructor_label,
        'studentLabel', step_row.student_label,
        'explanation', step_row.explanation,
        'phase', step_row.phase,
        'sortOrder', step_row.sort_order
      )
      order by step_row.sort_order, step_row.step_value
    ),
    '[]'::jsonb
  )
    into v_steps
    from public.ris_step_definitions step_row
   where step_row.ris_version_id = p_ris_version_id;

  return jsonb_build_object(
    'schemaVersion', 'ris-catalog.v1',
    'sourceRisVersionId', v_version.id,
    'name', v_version.name,
    'description', v_version.description,
    'activeFrom', v_version.active_from,
    'modules', v_modules,
    'steps', v_steps
  );
end;
$$;

create or replace function public.get_ris_catalog_validation_snapshot(
  p_ris_version_id uuid
) returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_document jsonb;
begin
  v_document := public._ris_catalog_validation_document(p_ris_version_id);
  return jsonb_build_object(
    'document', v_document,
    'contentHash', encode(
      extensions.digest(convert_to(v_document::text, 'UTF8'), 'sha256'),
      'hex'
    )
  );
end;
$$;

create or replace function public.review_ris_catalog(
  p_ris_version_id uuid,
  p_actor uuid,
  p_expected_content_hash text,
  p_decision text,
  p_reviewer_credentials text,
  p_scenario_results jsonb,
  p_limitation_note text,
  p_change_note text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_snapshot jsonb;
  v_document jsonb;
  v_content_hash text;
  v_curriculum public.curriculum_versions%rowtype;
  v_validation public.expert_validation_records%rowtype;
  v_decision text := upper(trim(coalesce(p_decision, '')));
  v_now timestamptz := timezone('utc', now());
  v_required_scenarios text[] := array[
    'catalog_structure',
    'script_content',
    'step_content',
    'module_test_logic',
    'source_rights'
  ];
  v_scenario text;
begin
  if not coalesce(
    (select profile.is_platform_admin from public.profiles profile where profile.id = p_actor),
    false
  ) then
    raise exception 'only platform administrators may record RIS expert reviews';
  end if;

  if v_decision not in ('IN_REVIEW', 'CHANGES_REQUIRED', 'APPROVED') then
    raise exception 'invalid RIS catalog review decision';
  end if;
  if jsonb_typeof(coalesce(p_scenario_results, '[]'::jsonb)) <> 'array' then
    raise exception 'scenario results must be an array';
  end if;

  v_snapshot := public.get_ris_catalog_validation_snapshot(p_ris_version_id);
  v_document := v_snapshot -> 'document';
  v_content_hash := v_snapshot ->> 'contentHash';
  if nullif(trim(coalesce(p_expected_content_hash, '')), '') is null
     or p_expected_content_hash <> v_content_hash then
    raise exception 'RIS catalog changed since the review screen was opened; reload and review the new hash';
  end if;

  select *
    into v_curriculum
    from public.curriculum_versions
   where source_ris_version_id = p_ris_version_id
   for update;
  if v_curriculum.id is null then
    raise exception 'curriculum version for RIS catalog not found';
  end if;
  if v_curriculum.status in ('PUBLISHED', 'RETIRED')
     and v_curriculum.content_hash <> v_content_hash then
    raise exception 'published curriculum is immutable; create a new RIS catalog version';
  end if;

  if v_decision = 'APPROVED' then
    if nullif(trim(coalesce(p_reviewer_credentials, '')), '') is null then
      raise exception 'expert credentials are required for approval';
    end if;
    if jsonb_array_length(coalesce(p_scenario_results, '[]'::jsonb)) < 5 then
      raise exception 'all expert validation scenarios must be recorded';
    end if;
    foreach v_scenario in array v_required_scenarios loop
      if not exists (
        select 1
          from jsonb_array_elements(p_scenario_results) result
         where result ->> 'key' = v_scenario
           and coalesce((result ->> 'passed')::boolean, false)
      ) then
        raise exception 'expert validation scenario % has not passed', v_scenario;
      end if;
    end loop;
  elsif v_decision = 'CHANGES_REQUIRED'
        and nullif(trim(coalesce(p_limitation_note, '')), '') is null then
    raise exception 'describe the required catalog changes';
  end if;

  select *
    into v_validation
    from public.expert_validation_records
   where target_type = 'CURRICULUM'
     and target_id = v_curriculum.id
     and content_hash = v_content_hash
   for update;

  if v_validation.id is null then
    insert into public.expert_validation_records (
      tenant_id,
      target_type,
      target_id,
      status,
      content_hash,
      reviewer_user_id,
      reviewer_credentials,
      scenario_results,
      limitation_note,
      signed_at,
      created_by
    ) values (
      null,
      'CURRICULUM',
      v_curriculum.id,
      v_decision,
      v_content_hash,
      case when v_decision = 'IN_REVIEW' then null else p_actor end,
      nullif(trim(coalesce(p_reviewer_credentials, '')), ''),
      coalesce(p_scenario_results, '[]'::jsonb),
      nullif(trim(coalesce(p_limitation_note, '')), ''),
      case when v_decision = 'APPROVED' then v_now else null end,
      p_actor
    )
    returning * into v_validation;
  else
    if v_validation.status = 'APPROVED' then
      return v_validation.id;
    end if;
    update public.expert_validation_records
       set status = v_decision,
           reviewer_user_id = case when v_decision = 'IN_REVIEW' then reviewer_user_id else p_actor end,
           reviewer_credentials = nullif(trim(coalesce(p_reviewer_credentials, '')), ''),
           scenario_results = coalesce(p_scenario_results, '[]'::jsonb),
           limitation_note = nullif(trim(coalesce(p_limitation_note, '')), ''),
           signed_at = case when v_decision = 'APPROVED' then v_now else null end
     where id = v_validation.id
     returning * into v_validation;
  end if;

  if v_curriculum.status not in ('PUBLISHED', 'RETIRED') then
    update public.curriculum_versions
       set content_document = v_document,
           content_hash = v_content_hash,
           status = 'AWAITING_EXPERT_VALIDATION',
           expert_validation_record_id = case
             when v_decision = 'APPROVED' then v_validation.id
             else null
           end,
           reviewed_by = case
             when v_decision = 'APPROVED' then p_actor
             else null
           end,
           change_note = coalesce(
             nullif(trim(coalesce(p_change_note, '')), ''),
             'RIS catalog expert review'
           )
     where id = v_curriculum.id;
  end if;

  insert into public.audit_log (
    actor_user_id,
    tenant_id,
    action,
    target_type,
    target_id,
    payload
  ) values (
    p_actor,
    null,
    'ris.catalog_reviewed',
    'curriculum_version',
    v_curriculum.id::text,
    jsonb_build_object(
      'ris_version_id', p_ris_version_id,
      'decision', v_decision,
      'content_hash', v_content_hash,
      'validation_record_id', v_validation.id
    )
  );

  return v_validation.id;
end;
$$;

-- Approved records must also be complete when inserted directly. The original
-- trigger guarded updates/deletes only.
drop trigger if exists expert_validation_records_guard
  on public.expert_validation_records;
create trigger expert_validation_records_guard
  before insert or update or delete on public.expert_validation_records
  for each row execute function public._guard_expert_validation_record();

-- Activating RIS is a release operation. Keep every tenant on legacy until the
-- selected catalog, its expert hash and a readiness policy are published.
create or replace function public.set_tenant_ris_settings(
  p_tenant_id uuid,
  p_actor uuid,
  p_lesson_card_mode text,
  p_active_ris_version_id uuid,
  p_ai_assist_enabled boolean
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mode text := coalesce(nullif(trim(p_lesson_card_mode), ''), 'legacy');
  v_version uuid;
  v_curriculum public.curriculum_versions%rowtype;
begin
  if not public._tenant_admin_authorized(p_actor, p_tenant_id) then
    raise exception 'actor % not authorized to manage RIS settings for tenant %', p_actor, p_tenant_id;
  end if;
  if v_mode not in ('legacy', 'ris') then
    raise exception 'invalid lesson_card_mode %', v_mode;
  end if;

  v_version := coalesce(p_active_ris_version_id, public._insert_default_ris_taxonomy());
  if not exists (
    select 1 from public.ris_versions
     where id = v_version and is_active = true
  ) then
    raise exception 'RIS version % not found or inactive', v_version;
  end if;

  if v_mode = 'ris' then
    select *
      into v_curriculum
      from public.curriculum_versions
     where source_ris_version_id = v_version;
    if v_curriculum.id is null
       or v_curriculum.status <> 'PUBLISHED'
       or not public._approved_validation_matches(
         v_curriculum.expert_validation_record_id,
         'CURRICULUM',
         v_curriculum.id,
         v_curriculum.content_hash
       ) then
      raise exception 'RIS activation requires a published catalog with current expert validation';
    end if;
    if not exists (
      select 1
        from public.readiness_policies policy
       where policy.curriculum_version_id = v_curriculum.id
         and policy.status = 'PUBLISHED'
         and (policy.tenant_id is null or policy.tenant_id = p_tenant_id)
    ) then
      raise exception 'RIS activation requires a published readiness policy';
    end if;
  end if;

  insert into public.tenant_ris_settings (
    tenant_id,
    lesson_card_mode,
    active_ris_version_id,
    ai_assist_enabled,
    updated_by
  ) values (
    p_tenant_id,
    v_mode,
    v_version,
    false,
    p_actor
  )
  on conflict (tenant_id) do update
    set lesson_card_mode = excluded.lesson_card_mode,
        active_ris_version_id = excluded.active_ris_version_id,
        ai_assist_enabled = false,
        updated_by = p_actor;

  insert into public.tenant_settings (tenant_id, key, value)
  values (p_tenant_id, 'lesson_card_mode', jsonb_build_object('mode', v_mode))
  on conflict (tenant_id, key) do update
    set value = excluded.value;

  insert into public.audit_log (
    actor_user_id,
    tenant_id,
    action,
    target_type,
    target_id,
    payload
  ) values (
    p_actor,
    p_tenant_id,
    'ris.settings_set',
    'tenant',
    p_tenant_id::text,
    jsonb_build_object(
      'lesson_card_mode', v_mode,
      'active_ris_version_id', v_version,
      'ai_assist_enabled', false
    )
  );
end;
$$;

revoke all on function public._ris_catalog_validation_document(uuid) from public;
revoke all on function public.get_ris_catalog_validation_snapshot(uuid) from public;
revoke all on function public.review_ris_catalog(
  uuid, uuid, text, text, text, jsonb, text, text
) from public;

revoke execute on function public._ris_catalog_validation_document(uuid)
  from anon, authenticated;
revoke execute on function public.get_ris_catalog_validation_snapshot(uuid)
  from anon, authenticated;
revoke execute on function public.review_ris_catalog(
  uuid, uuid, text, text, text, jsonb, text, text
) from anon, authenticated;

grant execute on function public.get_ris_catalog_validation_snapshot(uuid)
  to service_role;
grant execute on function public.review_ris_catalog(
  uuid, uuid, text, text, text, jsonb, text, text
) to service_role;

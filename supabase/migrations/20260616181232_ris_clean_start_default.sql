-- RIS clean-start defaults:
-- New tenants should start on the RIS-native lesson card. Existing tenants can
-- still explicitly switch back to legacy through tenant_ris_settings, and the
-- UI provides a tenant-admin-only clean-start action for mock legacy scores.

alter table public.tenant_ris_settings
  alter column lesson_card_mode set default 'ris';

create or replace function public._provision_ris_settings_for_tenant()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_version_id uuid;
begin
  v_version_id := public._insert_default_ris_taxonomy();
  insert into public.tenant_ris_settings (tenant_id, lesson_card_mode, active_ris_version_id)
  values (new.id, 'ris', v_version_id)
  on conflict (tenant_id) do nothing;

  insert into public.tenant_settings (tenant_id, key, value)
  values (new.id, 'lesson_card_mode', jsonb_build_object('mode', 'ris'))
  on conflict (tenant_id, key) do nothing;
  return new;
end;
$$;

do $$
declare
  v_version_id uuid;
begin
  v_version_id := public._insert_default_ris_taxonomy();
  insert into public.tenant_ris_settings (tenant_id, lesson_card_mode, active_ris_version_id)
  select id, 'ris', v_version_id from public.tenants
  on conflict (tenant_id) do nothing;

  insert into public.tenant_settings (tenant_id, key, value)
  select id, 'lesson_card_mode', jsonb_build_object('mode', 'ris') from public.tenants
  on conflict (tenant_id, key) do nothing;
end $$;

create or replace function public._ensure_ris_lesson_card(
  p_tenant_id uuid,
  p_lesson_id uuid,
  p_actor uuid
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_settings public.tenant_ris_settings%rowtype;
  v_lesson public.lessons%rowtype;
  v_card_id uuid;
begin
  select * into v_settings
    from public.tenant_ris_settings
   where tenant_id = p_tenant_id;
  if v_settings.tenant_id is null then
    insert into public.tenant_ris_settings (tenant_id, lesson_card_mode)
    values (p_tenant_id, 'ris')
    returning * into v_settings;
  end if;

  if coalesce(v_settings.lesson_card_mode, 'ris') <> 'ris' then
    raise exception 'RIS lesson card mode is not enabled for tenant %', p_tenant_id;
  end if;

  if v_settings.active_ris_version_id is null then
    v_settings.active_ris_version_id := public._insert_default_ris_taxonomy();
    update public.tenant_ris_settings
       set active_ris_version_id = v_settings.active_ris_version_id,
           updated_at = timezone('utc', now())
     where tenant_id = p_tenant_id;
  end if;

  select * into v_lesson
    from public.lessons
   where id = p_lesson_id
     and tenant_id = p_tenant_id;
  if v_lesson.id is null then
    raise exception 'lesson % not found for tenant %', p_lesson_id, p_tenant_id;
  end if;

  if not public._tenant_staff_authorized(p_actor, p_tenant_id) then
    raise exception 'actor % not authorized to manage RIS lesson card for tenant %', p_actor, p_tenant_id;
  end if;

  insert into public.ris_lesson_cards (
    tenant_id, lesson_id, student_id, instructor_id, ris_version_id, created_by
  ) values (
    p_tenant_id, p_lesson_id, v_lesson.student_id, v_lesson.instructor_id,
    v_settings.active_ris_version_id, p_actor
  )
  on conflict (tenant_id, lesson_id) do update
    set updated_at = timezone('utc', now())
  returning id into v_card_id;

  return v_card_id;
end;
$$;

create or replace function public.activate_ris_clean_start(
  p_tenant_id uuid,
  p_actor uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_version_id uuid;
  v_lesson_score_rows integer := 0;
  v_student_rollup_rows integer := 0;
begin
  if not public._tenant_admin_authorized(p_actor, p_tenant_id) then
    raise exception 'actor % not authorized to clean-start RIS for tenant %', p_actor, p_tenant_id;
  end if;

  v_version_id := public._insert_default_ris_taxonomy();

  select count(*) into v_lesson_score_rows
    from public.lesson_skill_scores
   where tenant_id = p_tenant_id;
  select count(*) into v_student_rollup_rows
    from public.student_skill_scores
   where tenant_id = p_tenant_id;

  delete from public.lesson_skill_scores
   where tenant_id = p_tenant_id;
  delete from public.student_skill_scores
   where tenant_id = p_tenant_id;

  insert into public.tenant_ris_settings (
    tenant_id, lesson_card_mode, active_ris_version_id, ai_assist_enabled, updated_by
  ) values (
    p_tenant_id, 'ris', v_version_id, true, p_actor
  )
  on conflict (tenant_id) do update
    set lesson_card_mode = 'ris',
        active_ris_version_id = excluded.active_ris_version_id,
        ai_assist_enabled = true,
        updated_by = p_actor;

  insert into public.tenant_settings (tenant_id, key, value)
  values (p_tenant_id, 'lesson_card_mode', jsonb_build_object('mode', 'ris'))
  on conflict (tenant_id, key) do update
    set value = excluded.value;

  insert into public.audit_log (actor_user_id, tenant_id, action, target_type, target_id, payload)
  values (
    p_actor,
    p_tenant_id,
    'ris.clean_start_activated',
    'tenant',
    p_tenant_id::text,
    jsonb_build_object(
      'legacy_score_rows_deleted', v_lesson_score_rows,
      'legacy_rollup_rows_deleted', v_student_rollup_rows,
      'reason', 'tenant_admin_clean_start'
    )
  );

  return jsonb_build_object(
    'legacy_score_rows_deleted', v_lesson_score_rows,
    'legacy_rollup_rows_deleted', v_student_rollup_rows,
    'lesson_card_mode', 'ris',
    'active_ris_version_id', v_version_id
  );
end;
$$;

revoke all on function public._provision_ris_settings_for_tenant() from public;
revoke execute on function public._provision_ris_settings_for_tenant() from anon, authenticated;
grant execute on function public._provision_ris_settings_for_tenant() to service_role;

revoke all on function public._ensure_ris_lesson_card(uuid, uuid, uuid) from public;
revoke execute on function public._ensure_ris_lesson_card(uuid, uuid, uuid) from anon, authenticated;
grant execute on function public._ensure_ris_lesson_card(uuid, uuid, uuid) to service_role;

revoke all on function public.activate_ris_clean_start(uuid, uuid) from public;
revoke execute on function public.activate_ris_clean_start(uuid, uuid) from anon, authenticated;
grant execute on function public.activate_ris_clean_start(uuid, uuid) to service_role;

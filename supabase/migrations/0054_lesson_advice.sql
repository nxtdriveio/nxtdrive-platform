-- 0054 — Per-les advies (Leskaart L4).
--
-- Adds a free-text "advies" field per lesson, written by the instructor and
-- VISIBLE TO THE STUDENT (stored on public.lessons alongside student_note /
-- attention_points, NOT in the staff-only lesson_internal table). RLS on
-- lessons already exposes the student's own lesson rows (0018), so no extra
-- policy is needed for read access.
--
-- The locked set_lesson_context RPC gains a p_advies parameter. Adding a
-- parameter changes the function signature, so the old 9-arg overload is
-- dropped first and the new 10-arg version is recreated, then re-granted to
-- service_role only (revoking execute from public, anon and authenticated to
-- preserve the service-role-only mutation boundary — see 0034).

alter table public.lessons
  add column if not exists advice text;

-- Drop the previous signature so we don't leave an ambiguous overload behind.
drop function if exists public.set_lesson_context(
  uuid, uuid, uuid, uuid, uuid, text, text, text, uuid[]
);

create or replace function public.set_lesson_context(
  p_lesson_id        uuid,
  p_tenant_id        uuid,
  p_actor            uuid,
  p_vehicle_id       uuid,
  p_location_id      uuid,
  p_student_note     text,
  p_internal_note    text,
  p_attention_points text,
  p_advies           text,
  p_topic_skill_ids  uuid[]
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student_id uuid;
  v_student    text;
  v_internal   text;
  v_attention  text;
  v_advies     text;
  v_skill      uuid;
  v_level      smallint;
  v_active     boolean;
  v_topic_count integer := 0;
begin
  if not public._lesson_actor_authorized(p_actor, p_tenant_id) then
    raise exception 'actor % not authorized for tenant %', p_actor, p_tenant_id;
  end if;

  select student_id into v_student_id
    from public.lessons
   where id = p_lesson_id and tenant_id = p_tenant_id
   for update;
  if v_student_id is null then
    raise exception 'lesson % not found in tenant %', p_lesson_id, p_tenant_id;
  end if;

  -- Validate vehicle/location belong to the tenant when provided.
  if p_vehicle_id is not null and not exists (
    select 1 from public.vehicles v
     where v.id = p_vehicle_id and v.tenant_id = p_tenant_id
  ) then
    raise exception 'vehicle % not found in tenant %', p_vehicle_id, p_tenant_id;
  end if;
  if p_location_id is not null and not exists (
    select 1 from public.locations l
     where l.id = p_location_id and l.tenant_id = p_tenant_id
  ) then
    raise exception 'location % not found in tenant %', p_location_id, p_tenant_id;
  end if;

  v_student   := nullif(trim(coalesce(p_student_note, '')), '');
  v_internal  := nullif(trim(coalesce(p_internal_note, '')), '');
  v_attention := nullif(trim(coalesce(p_attention_points, '')), '');
  v_advies    := nullif(trim(coalesce(p_advies, '')), '');
  if v_student is not null and char_length(v_student) > 4000 then
    raise exception 'student note too long (max 4000)';
  end if;
  if v_internal is not null and char_length(v_internal) > 4000 then
    raise exception 'internal note too long (max 4000)';
  end if;
  if v_attention is not null and char_length(v_attention) > 4000 then
    raise exception 'attention points too long (max 4000)';
  end if;
  if v_advies is not null and char_length(v_advies) > 4000 then
    raise exception 'advies too long (max 4000)';
  end if;

  update public.lessons
     set vehicle_id       = p_vehicle_id,
         location_id      = p_location_id,
         student_note     = v_student,
         attention_points = v_attention,
         advice           = v_advies
   where id = p_lesson_id and tenant_id = p_tenant_id;

  -- Interne notitie: upsert of verwijder als leeg.
  if v_internal is null then
    delete from public.lesson_internal where lesson_id = p_lesson_id;
  else
    insert into public.lesson_internal (lesson_id, tenant_id, internal_note, updated_by)
    values (p_lesson_id, p_tenant_id, v_internal, p_actor)
    on conflict (lesson_id) do update
      set internal_note = excluded.internal_note,
          updated_by    = excluded.updated_by;
  end if;

  -- Behandelde onderdelen: vervang de volledige set.
  delete from public.lesson_topics where lesson_id = p_lesson_id;
  if p_topic_skill_ids is not null then
    foreach v_skill in array p_topic_skill_ids loop
      select level, active into v_level, v_active
        from public.skill_taxonomy
       where id = v_skill and tenant_id = p_tenant_id;
      if v_level is null then
        raise exception 'skill % not found in tenant %', v_skill, p_tenant_id;
      end if;
      if v_level <> 3 then
        raise exception 'skill % is not a gradable leaf (level=%)', v_skill, v_level;
      end if;
      if v_active is not true then
        raise exception 'skill % is not active', v_skill;
      end if;
      insert into public.lesson_topics (lesson_id, tenant_id, student_id, skill_id, created_by)
      values (p_lesson_id, p_tenant_id, v_student_id, v_skill, p_actor)
      on conflict (lesson_id, skill_id) do nothing;
      v_topic_count := v_topic_count + 1;
    end loop;
  end if;

  insert into public.audit_log (
    actor_user_id, tenant_id, action, target_type, target_id, payload
  ) values (
    p_actor, p_tenant_id, 'lesson.context_set', 'lesson', p_lesson_id::text,
    jsonb_build_object(
      'vehicle_id',  p_vehicle_id,
      'location_id', p_location_id,
      'has_student_note',  v_student is not null,
      'has_internal_note', v_internal is not null,
      'has_attention',     v_attention is not null,
      'has_advies',        v_advies is not null,
      'topic_count',       v_topic_count
    )
  );
end;
$$;

revoke all on function public.set_lesson_context(
  uuid, uuid, uuid, uuid, uuid, text, text, text, text, uuid[]
) from public;
revoke execute on function public.set_lesson_context(
  uuid, uuid, uuid, uuid, uuid, text, text, text, text, uuid[]
) from anon, authenticated;
grant execute on function public.set_lesson_context(
  uuid, uuid, uuid, uuid, uuid, text, text, text, text, uuid[]
) to service_role;

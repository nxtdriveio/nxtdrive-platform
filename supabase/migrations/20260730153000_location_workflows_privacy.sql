-- Audited location workflows, lead conversion parity and privacy handling.

create or replace function public.upsert_student_location(
  p_tenant_id uuid,
  p_student_id uuid,
  p_actor uuid,
  p_role text,
  p_label text,
  p_formatted_address text,
  p_street text default null,
  p_house_number text default null,
  p_house_number_addition text default null,
  p_postal_code text default null,
  p_city text default null,
  p_region text default null,
  p_country_code text default 'NL',
  p_latitude double precision default null,
  p_longitude double precision default null,
  p_source text default 'USER_ENTERED',
  p_provider text default null,
  p_provider_place_id text default null,
  p_validation_status text default 'UNVALIDATED',
  p_change_reason text default null,
  p_location_record_id uuid default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_location_record_id uuid;
  v_location_version_id uuid;
  v_version_number integer;
  v_student_user_id uuid;
  v_existing_link public.entity_location_links%rowtype;
begin
  select user_id into v_student_user_id
    from public.students
   where id = p_student_id
     and tenant_id = p_tenant_id;
  if not found then
    raise exception 'student not found in tenant';
  end if;
  if not public._tenant_staff_authorized(p_actor, p_tenant_id)
     and v_student_user_id is distinct from p_actor then
    raise exception 'actor is not authorized for student location';
  end if;
  if p_role not in (
    'STUDENT_HOME',
    'STUDENT_PICKUP_DEFAULT',
    'STUDENT_DROPOFF_DEFAULT',
    'STUDENT_FAVORITE'
  ) then
    raise exception 'invalid student location role';
  end if;
  if (p_latitude is null) <> (p_longitude is null)
     or (p_latitude is not null and p_latitude not between -90 and 90)
     or (p_longitude is not null and p_longitude not between -180 and 180) then
    raise exception 'invalid coordinate pair';
  end if;
  if nullif(btrim(coalesce(p_formatted_address, '')), '') is null then
    raise exception 'formatted address is required';
  end if;

  if p_location_record_id is not null then
    select link.* into v_existing_link
      from public.entity_location_links link
     where link.tenant_id = p_tenant_id
       and link.student_id = p_student_id
       and link.location_record_id = p_location_record_id
       and link.valid_until is null
     limit 1
     for update;
    if v_existing_link.id is null then
      raise exception 'location is not linked to student';
    end if;
    v_location_record_id := p_location_record_id;
    select coalesce(max(version_number), 0) + 1
      into v_version_number
      from public.location_versions
     where tenant_id = p_tenant_id
       and location_record_id = v_location_record_id;
  else
    insert into public.location_records (
      tenant_id, status, created_by
    ) values (
      p_tenant_id, 'ACTIVE', p_actor
    )
    returning id into v_location_record_id;
    v_version_number := 1;
  end if;

  insert into public.location_versions (
    tenant_id, location_record_id, version_number, label, formatted_address,
    street, house_number, house_number_addition, postal_code, city, region,
    country_code, latitude, longitude, source, provider, provider_place_id,
    validation_status, provider_obtained_at, user_confirmed_at, confirmed_by,
    change_reason, created_by
  ) values (
    p_tenant_id, v_location_record_id, v_version_number,
    btrim(p_label), btrim(p_formatted_address),
    nullif(btrim(coalesce(p_street, '')), ''),
    nullif(btrim(coalesce(p_house_number, '')), ''),
    nullif(btrim(coalesce(p_house_number_addition, '')), ''),
    nullif(upper(btrim(coalesce(p_postal_code, ''))), ''),
    nullif(btrim(coalesce(p_city, '')), ''),
    nullif(btrim(coalesce(p_region, '')), ''),
    upper(coalesce(nullif(btrim(p_country_code), ''), 'NL')),
    p_latitude, p_longitude, p_source, p_provider,
    nullif(btrim(coalesce(p_provider_place_id, '')), ''),
    p_validation_status,
    case when p_provider is not null then now() else null end,
    case when p_validation_status = 'MANUALLY_CONFIRMED' then now() else null end,
    case when p_validation_status = 'MANUALLY_CONFIRMED' then p_actor else null end,
    nullif(btrim(coalesce(p_change_reason, '')), ''),
    p_actor
  )
  returning id into v_location_version_id;

  update public.location_records
     set canonical_version_id = v_location_version_id
   where id = v_location_record_id
     and tenant_id = p_tenant_id;

  if p_location_record_id is null then
    if p_role <> 'STUDENT_FAVORITE' then
      update public.entity_location_links
         set valid_until = greatest(
           clock_timestamp(),
           valid_from + interval '1 microsecond'
         )
       where tenant_id = p_tenant_id
         and student_id = p_student_id
         and role = p_role
         and valid_until is null;
    end if;
    insert into public.entity_location_links (
      tenant_id, location_record_id, role, student_id, label, is_default,
      created_by
    ) values (
      p_tenant_id, v_location_record_id, p_role, p_student_id,
      btrim(p_label),
      p_role in ('STUDENT_PICKUP_DEFAULT', 'STUDENT_DROPOFF_DEFAULT'),
      p_actor
    );
  elsif v_existing_link.role <> p_role or v_existing_link.label <> btrim(p_label) then
    update public.entity_location_links
       set valid_until = greatest(
         clock_timestamp(),
         valid_from + interval '1 microsecond'
       )
     where id = v_existing_link.id;
    insert into public.entity_location_links (
      tenant_id, location_record_id, role, student_id, label, is_default,
      created_by
    ) values (
      p_tenant_id, v_location_record_id, p_role, p_student_id,
      btrim(p_label),
      p_role in ('STUDENT_PICKUP_DEFAULT', 'STUDENT_DROPOFF_DEFAULT'),
      p_actor
    );
  end if;

  insert into public.audit_log (
    actor_user_id, tenant_id, action, target_type, target_id, payload
  ) values (
    p_actor, p_tenant_id, 'location.student_version_created',
    'location_record', v_location_record_id::text,
    jsonb_build_object(
      'student_id', p_student_id,
      'role', p_role,
      'version_number', v_version_number,
      'source', p_source,
      'provider', p_provider,
      'validation_status', p_validation_status,
      'has_coordinates', p_latitude is not null
    )
  );

  return v_location_record_id;
end;
$$;

revoke all on function public.upsert_student_location(
  uuid, uuid, uuid, text, text, text, text, text, text, text, text, text,
  text, double precision, double precision, text, text, text, text, text, uuid
) from public, anon, authenticated;
grant execute on function public.upsert_student_location(
  uuid, uuid, uuid, text, text, text, text, text, text, text, text, text,
  text, double precision, double precision, text, text, text, text, text, uuid
) to service_role;

create or replace function public.publish_appointment_stop(
  p_tenant_id uuid,
  p_actor uuid,
  p_appointment_type text,
  p_appointment_id uuid,
  p_stop_type text,
  p_sequence_number integer,
  p_location_record_id uuid,
  p_location_version_id uuid
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_version public.location_versions%rowtype;
  v_stop_id uuid;
  v_lesson_id uuid;
  v_trial_id uuid;
  v_agenda_id uuid;
  v_module_test_id uuid;
begin
  if not public._tenant_staff_authorized(p_actor, p_tenant_id) then
    raise exception 'tenant staff authorization required';
  end if;

  select * into v_version
    from public.location_versions
   where id = p_location_version_id
     and tenant_id = p_tenant_id
     and location_record_id = p_location_record_id;
  if not found then
    raise exception 'location version not found in tenant';
  end if;

  case p_appointment_type
    when 'LESSON' then v_lesson_id := p_appointment_id;
    when 'TRIAL_LESSON' then v_trial_id := p_appointment_id;
    when 'AGENDA_APPOINTMENT' then v_agenda_id := p_appointment_id;
    when 'EXAM' then v_agenda_id := p_appointment_id;
    when 'MODULE_TEST' then v_module_test_id := p_appointment_id;
    else raise exception 'unsupported appointment type';
  end case;

  update public.appointment_stops
     set publication_status = 'SUPERSEDED',
         superseded_at = now()
   where tenant_id = p_tenant_id
     and appointment_type = p_appointment_type
     and appointment_id = p_appointment_id
     and stop_type = p_stop_type
     and sequence_number = p_sequence_number
     and publication_status = 'PUBLISHED';

  delete from public.appointment_stops
   where tenant_id = p_tenant_id
     and appointment_type = p_appointment_type
     and appointment_id = p_appointment_id
     and stop_type = p_stop_type
     and sequence_number = p_sequence_number
     and publication_status = 'DRAFT';

  insert into public.appointment_stops (
    tenant_id, appointment_type, appointment_id, lesson_id, trial_lesson_id,
    agenda_appointment_id, module_test_id, stop_type, sequence_number,
    source_location_record_id, source_location_version_id,
    label_snapshot, formatted_address_snapshot,
    latitude_snapshot, longitude_snapshot, publication_status, published_at,
    created_by
  ) values (
    p_tenant_id, p_appointment_type, p_appointment_id, v_lesson_id, v_trial_id,
    v_agenda_id, v_module_test_id, p_stop_type, p_sequence_number,
    p_location_record_id, p_location_version_id,
    v_version.label, v_version.formatted_address,
    v_version.latitude, v_version.longitude, 'PUBLISHED', now(), p_actor
  )
  returning id into v_stop_id;

  insert into public.audit_log (
    actor_user_id, tenant_id, action, target_type, target_id, payload
  ) values (
    p_actor, p_tenant_id, 'location.appointment_stop_published',
    'appointment_stop', v_stop_id::text,
    jsonb_build_object(
      'appointment_type', p_appointment_type,
      'appointment_id', p_appointment_id,
      'stop_type', p_stop_type,
      'sequence_number', p_sequence_number,
      'location_version_id', p_location_version_id
    )
  );
  return v_stop_id;
end;
$$;

revoke all on function public.publish_appointment_stop(
  uuid, uuid, text, uuid, text, integer, uuid, uuid
) from public, anon, authenticated;
grant execute on function public.publish_appointment_stop(
  uuid, uuid, text, uuid, text, integer, uuid, uuid
) to service_role;

create or replace function public.propose_appointment_location_change(
  p_tenant_id uuid,
  p_actor uuid,
  p_student_id uuid,
  p_appointment_stop_id uuid,
  p_location_record_id uuid,
  p_location_version_id uuid,
  p_explanation text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student_user_id uuid;
  v_proposal_id uuid;
begin
  select user_id into v_student_user_id
    from public.students
   where id = p_student_id and tenant_id = p_tenant_id;
  if not found
     or (
       v_student_user_id is distinct from p_actor
       and not public._tenant_staff_authorized(p_actor, p_tenant_id)
     ) then
    raise exception 'actor is not authorized for location proposal';
  end if;
  if not exists (
    select 1 from public.appointment_stops stop
     where stop.id = p_appointment_stop_id
       and stop.tenant_id = p_tenant_id
       and stop.publication_status = 'PUBLISHED'
  ) then
    raise exception 'published appointment stop not found';
  end if;
  if not exists (
    select 1
      from public.entity_location_links link
     where link.tenant_id = p_tenant_id
       and link.student_id = p_student_id
       and link.location_record_id = p_location_record_id
       and link.valid_until is null
  ) then
    raise exception 'proposed location is not linked to student';
  end if;
  if not exists (
    select 1 from public.location_versions version
     where version.id = p_location_version_id
       and version.tenant_id = p_tenant_id
       and version.location_record_id = p_location_record_id
  ) then
    raise exception 'proposed location version not found';
  end if;

  insert into public.location_change_proposals (
    tenant_id, appointment_stop_id, student_id,
    proposed_location_record_id, proposed_location_version_id,
    status, explanation, expires_at, created_by
  ) values (
    p_tenant_id, p_appointment_stop_id, p_student_id,
    p_location_record_id, p_location_version_id,
    'PROPOSED', nullif(btrim(coalesce(p_explanation, '')), ''),
    now() + interval '7 days', p_actor
  )
  on conflict (appointment_stop_id, student_id)
    where status in ('PROPOSED', 'UNDER_REVIEW')
  do update set
    proposed_location_record_id = excluded.proposed_location_record_id,
    proposed_location_version_id = excluded.proposed_location_version_id,
    status = 'PROPOSED',
    explanation = excluded.explanation,
    expires_at = excluded.expires_at,
    created_by = excluded.created_by,
    created_at = now()
  returning id into v_proposal_id;

  insert into public.audit_log (
    actor_user_id, tenant_id, action, target_type, target_id, payload
  ) values (
    p_actor, p_tenant_id, 'location.change_proposed',
    'location_change_proposal', v_proposal_id::text,
    jsonb_build_object(
      'student_id', p_student_id,
      'appointment_stop_id', p_appointment_stop_id
    )
  );
  return v_proposal_id;
end;
$$;

revoke all on function public.propose_appointment_location_change(
  uuid, uuid, uuid, uuid, uuid, uuid, text
) from public, anon, authenticated;
grant execute on function public.propose_appointment_location_change(
  uuid, uuid, uuid, uuid, uuid, uuid, text
) to service_role;

create or replace function public.preview_location_migration(p_tenant_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'tenantId', p_tenant_id,
    'students', (
      select count(*) from public.students where tenant_id = p_tenant_id
    ),
    'studentsWithAddress', (
      select count(*) from public.students
       where tenant_id = p_tenant_id
         and nullif(btrim(coalesce(address_line, '')), '') is not null
    ),
    'studentsWithPickup', (
      select count(*) from public.students
       where tenant_id = p_tenant_id
         and nullif(btrim(coalesce(pickup_address, '')), '') is not null
    ),
    'canonicalLocations', (
      select count(*) from public.location_records where tenant_id = p_tenant_id
    ),
    'halfCoordinatePairs', (
      (select count(*) from public.booking_requests
        where tenant_id = p_tenant_id
          and (pickup_lat is null) <> (pickup_lng is null))
      +
      (select count(*) from public.booking_candidates
        where tenant_id = p_tenant_id
          and (pickup_lat is null) <> (pickup_lng is null))
      +
      (select count(*) from public.lesson_refill_invitations
        where tenant_id = p_tenant_id
          and (location_lat is null) <> (location_lng is null))
    ),
    'orphanCanonicalLocations', (
      select count(*)
        from public.location_records record
       where record.tenant_id = p_tenant_id
         and not exists (
           select 1 from public.entity_location_links link
            where link.location_record_id = record.id
              and link.valid_until is null
         )
         and not exists (
           select 1 from public.appointment_stops stop
            where stop.source_location_record_id = record.id
         )
    ),
    'possibleDuplicateAddresses', (
      select count(*)
        from (
          select lower(regexp_replace(formatted_address, '\s+', ' ', 'g'))
            from public.location_versions version
           where version.tenant_id = p_tenant_id
           group by lower(regexp_replace(formatted_address, '\s+', ' ', 'g'))
          having count(distinct location_record_id) > 1
        ) duplicates
    )
  )
$$;

revoke all on function public.preview_location_migration(uuid)
  from public, anon, authenticated;
grant execute on function public.preview_location_migration(uuid)
  to service_role;

-- Lead conversion keeps structured intake and creates an idempotent canonical
-- pickup location. The Google Place id remains provenance, never the business id.
create or replace function public.convert_lead_to_student(
  p_lead_id uuid,
  p_tenant_id uuid,
  p_actor uuid,
  p_package_id uuid
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead record;
  v_intake record;
  v_student_id uuid;
  v_location_record_id uuid;
  v_location_version_id uuid;
  v_was_created boolean := false;
  v_pickup_address text;
begin
  select id, status, full_name, email, phone, postcode
    into v_lead
    from public.leads
   where id = p_lead_id and tenant_id = p_tenant_id
   for update;
  if v_lead.id is null then
    raise exception 'lead not found in tenant';
  end if;

  select
    city, pickup_location, pickup_lat, pickup_lng, pickup_place_id,
    pickup_formatted_address
    into v_intake
    from public.lead_intake_details
   where lead_id = p_lead_id
     and tenant_id = p_tenant_id
   limit 1;

  select id into v_student_id
    from public.students
   where tenant_id = p_tenant_id and lead_id = p_lead_id
   limit 1
   for update;

  v_pickup_address := coalesce(
    nullif(btrim(coalesce(v_intake.pickup_formatted_address, '')), ''),
    nullif(btrim(coalesce(v_intake.pickup_location, '')), '')
  );

  if v_student_id is null then
    insert into public.students (
      tenant_id, lead_id, full_name, email, phone, postcode, city,
      pickup_address
    ) values (
      p_tenant_id, v_lead.id, v_lead.full_name, v_lead.email, v_lead.phone,
      v_lead.postcode,
      nullif(btrim(coalesce(v_intake.city, '')), ''),
      v_pickup_address
    )
    returning id into v_student_id;
    v_was_created := true;
  else
    update public.students
       set city = coalesce(city, nullif(btrim(coalesce(v_intake.city, '')), '')),
           pickup_address = coalesce(pickup_address, v_pickup_address)
     where id = v_student_id and tenant_id = p_tenant_id;
  end if;

  if v_pickup_address is not null and not exists (
    select 1 from public.entity_location_links
     where tenant_id = p_tenant_id
       and student_id = v_student_id
       and role = 'STUDENT_PICKUP_DEFAULT'
       and valid_until is null
  ) then
    insert into public.location_records (tenant_id, status, created_by)
    values (p_tenant_id, 'ACTIVE', p_actor)
    returning id into v_location_record_id;

    insert into public.location_versions (
      tenant_id, location_record_id, version_number, label,
      formatted_address, city, postal_code, country_code,
      latitude, longitude, source, provider, provider_place_id,
      validation_status, provider_obtained_at, change_reason, created_by
    ) values (
      p_tenant_id, v_location_record_id, 1, 'Standaard ophaalpunt',
      v_pickup_address,
      nullif(btrim(coalesce(v_intake.city, '')), ''),
      nullif(upper(btrim(coalesce(v_lead.postcode, ''))), ''),
      'NL',
      v_intake.pickup_lat, v_intake.pickup_lng,
      'LEGACY_MIGRATION',
      case when v_intake.pickup_place_id is not null then 'GOOGLE' else null end,
      v_intake.pickup_place_id,
      case
        when v_intake.pickup_place_id is not null then 'PARTIAL'
        else 'UNVALIDATED'
      end,
      case when v_intake.pickup_place_id is not null then now() else null end,
      'Leadconversie', p_actor
    )
    returning id into v_location_version_id;

    update public.location_records
       set canonical_version_id = v_location_version_id
     where id = v_location_record_id;

    insert into public.entity_location_links (
      tenant_id, location_record_id, role, student_id, label, is_default,
      created_by
    ) values (
      p_tenant_id, v_location_record_id, 'STUDENT_PICKUP_DEFAULT',
      v_student_id, 'Standaard ophaalpunt', true, p_actor
    );
  end if;

  if v_lead.status <> 'converted' then
    update public.leads
       set status = 'converted',
           action_status = 'closed',
           next_action_at = null,
           converted_to_student_at = coalesce(converted_to_student_at, now())
     where id = p_lead_id and tenant_id = p_tenant_id;

    insert into public.lead_events (
      lead_id, tenant_id, actor_user_id, event_type, payload
    ) values (
      p_lead_id, p_tenant_id, p_actor, 'status_changed',
      jsonb_build_object(
        'from', v_lead.status::text,
        'to', 'converted',
        'student_id', v_student_id
      )
    );
  end if;

  insert into public.audit_log (
    actor_user_id, tenant_id, action, target_type, target_id, payload
  ) values (
    p_actor, p_tenant_id, 'lead.converted', 'lead', p_lead_id::text,
    jsonb_build_object(
      'student_id', v_student_id,
      'package_id', p_package_id,
      'student_created', v_was_created,
      'structured_city_used', v_intake.city is not null,
      'pickup_used', v_pickup_address is not null,
      'provider_provenance_used', v_intake.pickup_place_id is not null,
      'canonical_location_created', v_location_record_id is not null
    )
  );

  if p_package_id is not null and v_was_created then
    perform public.grant_package(
      v_student_id, p_tenant_id, p_actor, p_package_id
    );
  end if;
  return v_student_id;
end;
$$;

revoke all on function public.convert_lead_to_student(uuid, uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.convert_lead_to_student(uuid, uuid, uuid, uuid)
  to service_role;

create or replace function public.execute_student_anonymization(
  p_request_id uuid,
  p_actor uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.privacy_requests%rowtype;
  v_report jsonb;
  v_location_ids uuid[];
  v_removed_locations integer := 0;
  v_preserved_stops integer := 0;
  v_cache_rows integer := 0;
begin
  select * into v_request
    from public.privacy_requests
   where id = p_request_id
   for update;

  if not found or v_request.request_type not in (
    'ACCOUNT_DELETION', 'STUDENT_DELETION'
  ) then
    raise exception 'eligible deletion request not found';
  end if;
  if v_request.status <> 'processing' then
    raise exception 'deletion request is not in processing status';
  end if;
  if not public._tenant_staff_authorized(p_actor, v_request.tenant_id)
     and p_actor <> v_request.subject_user_id then
    raise exception 'actor is not authorized for deletion request';
  end if;
  if exists (
    select 1 from public.privacy_legal_holds legal_hold
     where legal_hold.tenant_id = v_request.tenant_id
       and legal_hold.released_at is null
       and (
         legal_hold.subject_user_id = v_request.subject_user_id
         or legal_hold.subject_student_id = v_request.subject_student_id
       )
  ) then
    update public.privacy_requests
       set status = 'blocked_legal_hold', updated_at = now()
     where id = p_request_id;
    raise exception 'deletion is blocked by legal hold';
  end if;

  select array_agg(distinct link.location_record_id)
    into v_location_ids
    from public.entity_location_links link
   where link.tenant_id = v_request.tenant_id
     and link.student_id = v_request.subject_student_id;

  select count(*) into v_preserved_stops
    from public.appointment_stops stop
    join public.lessons lesson on lesson.id = stop.lesson_id
   where stop.tenant_id = v_request.tenant_id
     and lesson.student_id = v_request.subject_student_id
     and stop.publication_status <> 'DRAFT';

  delete from public.location_change_proposals
   where tenant_id = v_request.tenant_id
     and student_id = v_request.subject_student_id;
  delete from public.appointment_stop_confirmations
   where tenant_id = v_request.tenant_id
     and student_id = v_request.subject_student_id;
  delete from public.entity_location_links
   where tenant_id = v_request.tenant_id
     and student_id = v_request.subject_student_id;

  if v_location_ids is not null then
    delete from public.location_records record
     where record.tenant_id = v_request.tenant_id
       and record.id = any(v_location_ids)
       and not exists (
         select 1 from public.entity_location_links remaining_link
          where remaining_link.location_record_id = record.id
            and remaining_link.valid_until is null
       );
    get diagnostics v_removed_locations = row_count;
  end if;

  delete from public.maps_route_cache_entries
   where tenant_id = v_request.tenant_id;
  get diagnostics v_cache_rows = row_count;

  update public.students
     set full_name = 'Verwijderde leerling ' || left(id::text, 8),
         email = null,
         phone = null,
         postcode = null,
         birth_date = null,
         address_line = null,
         city = null,
         pickup_address = null,
         notes = null,
         user_id = null,
         active = false,
         updated_at = now()
   where tenant_id = v_request.tenant_id
     and (
       id = v_request.subject_student_id
       or user_id = v_request.subject_user_id
     );

  v_report := jsonb_build_object(
    'studentProfile', 'ANONYMIZED',
    'directProfileIdentifiersRemoved', true,
    'studentLocationLinksRemoved', true,
    'appointmentStopConfirmationsRemoved', true,
    'orphanLocationRecordsRemoved', v_removed_locations,
    'providerReferencesRemovedWithOrphans', true,
    'routeCacheEntriesInvalidated', v_cache_rows,
    'historicalPublishedStops', 'PRESERVED_UNDER_RETENTION_POLICY',
    'historicalPublishedStopCount', v_preserved_stops,
    'allLocationHistoryDeleted', false,
    'financialRecords', 'PRESERVED',
    'auditRecords', 'PRESERVED'
  );

  update public.privacy_requests
     set status = 'completed',
         completion_report = v_report,
         completed_at = now(),
         updated_at = now()
   where id = p_request_id;

  insert into public.privacy_audit_events (
    tenant_id, request_id, actor_user_id, event_type, metadata
  ) values (
    v_request.tenant_id, p_request_id, p_actor,
    'privacy.student_anonymized', v_report
  );
  return v_report;
end;
$$;

revoke all on function public.execute_student_anonymization(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.execute_student_anonymization(uuid, uuid)
  to service_role;

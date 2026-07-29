-- Structured contact/NAW fields and one audited admin-only mutation. Historical
-- free-form notes remain untouched; new edits no longer need to encode address
-- data into notes.

alter table public.students
  add column if not exists birth_date date,
  add column if not exists address_line text,
  add column if not exists city text,
  add column if not exists pickup_address text;

alter table public.students
  drop constraint if exists students_address_line_length,
  add constraint students_address_line_length
    check (address_line is null or char_length(address_line) <= 240),
  drop constraint if exists students_city_length,
  add constraint students_city_length
    check (city is null or char_length(city) <= 160),
  drop constraint if exists students_pickup_address_length,
  add constraint students_pickup_address_length
    check (pickup_address is null or char_length(pickup_address) <= 240);

create or replace function public.update_student_contact_profile(
  p_student_id uuid,
  p_tenant_id uuid,
  p_actor uuid,
  p_full_name text,
  p_email text,
  p_phone text,
  p_postcode text,
  p_birth_date date,
  p_address_line text,
  p_city text,
  p_pickup_address text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_email text := nullif(lower(btrim(coalesce(p_email, ''))), '');
  v_full_name text := btrim(coalesce(p_full_name, ''));
begin
  if not public._tenant_admin_authorized(p_actor, p_tenant_id) then
    raise exception 'tenant admin authorization required';
  end if;
  if char_length(v_full_name) < 1 or char_length(v_full_name) > 200 then
    raise exception 'student name must contain 1 to 200 characters';
  end if;

  select user_id into v_user_id
    from public.students
   where id = p_student_id
     and tenant_id = p_tenant_id
   for update;
  if not found then
    raise exception 'student not found in tenant';
  end if;
  if v_user_id is not null and v_email is null then
    raise exception 'a student with a portal account requires an email address';
  end if;
  if v_email is not null and exists (
    select 1
      from public.students
     where tenant_id = p_tenant_id
       and id <> p_student_id
       and lower(email) = v_email
  ) then
    raise exception 'email address already belongs to another student';
  end if;

  update public.students
     set full_name = v_full_name,
         email = v_email,
         phone = nullif(btrim(coalesce(p_phone, '')), ''),
         postcode = nullif(upper(btrim(coalesce(p_postcode, ''))), ''),
         birth_date = p_birth_date,
         address_line = nullif(btrim(coalesce(p_address_line, '')), ''),
         city = nullif(btrim(coalesce(p_city, '')), ''),
         pickup_address = nullif(btrim(coalesce(p_pickup_address, '')), '')
   where id = p_student_id
     and tenant_id = p_tenant_id;

  if v_user_id is not null then
    update public.profiles
       set full_name = v_full_name,
           email = v_email
     where id = v_user_id;
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
    p_tenant_id,
    'student.contact_profile_updated',
    'student',
    p_student_id::text,
    jsonb_build_object(
      'has_email', v_email is not null,
      'has_phone', nullif(btrim(coalesce(p_phone, '')), '') is not null,
      'has_address', nullif(btrim(coalesce(p_address_line, '')), '') is not null,
      'has_pickup_address', nullif(btrim(coalesce(p_pickup_address, '')), '') is not null
    )
  );
end;
$$;

revoke all on function public.update_student_contact_profile(
  uuid,
  uuid,
  uuid,
  text,
  text,
  text,
  text,
  date,
  text,
  text,
  text
) from public, anon, authenticated;
grant execute on function public.update_student_contact_profile(
  uuid,
  uuid,
  uuid,
  text,
  text,
  text,
  text,
  date,
  text,
  text,
  text
) to service_role;

comment on function public.update_student_contact_profile(
  uuid,
  uuid,
  uuid,
  text,
  text,
  text,
  text,
  date,
  text,
  text,
  text
) is
  'Atomically updates a student contact profile and linked public profile. Service-role only; tenant-admin authorized and audited.';

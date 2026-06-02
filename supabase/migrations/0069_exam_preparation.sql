-- ===========================================================================
-- 0069 — Examenflow A: examenvoorbereiding (detail) + 'niet verschenen' uitslag
--
-- Verrijkt een gepland examenmoment (agenda_appointments type 'exam'/'interim_test')
-- met praktische voorbereidingsinfo die taak B/C tonen:
--   * ophaaltijd + ophaallocatie
--   * benodigde documenten als afvinkbare lijst (status per document)
--   * vrije aandachtspunten voor de examendag
--
-- En vult de uitslagregistratie aan met 'niet verschenen' (no_show) naast
-- geslaagd/gezakt (0067).
--
-- Volgt exact het bestaande beveiligingspatroon (0049/0067/0068):
--   * select-only RLS; alle writes via SECURITY DEFINER RPC's (service_role).
--   * execute herroepen voor public, anon én authenticated; alleen service_role.
--   * tenant-consistente FK voorkomt cross-tenant koppels.
--   * audit-spoor op elke write.
-- De examenstandaarden (default documentenlijst + tips voor de examendag) zijn
-- tenant-configureerbaar via tenant_settings (key 'exam_preparation_policy');
-- nooit hardcoded per rijschool. De applicatielaag (lib/exam/policy.ts) levert
-- veilige defaults voor tenants zonder eigen instelling.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. 'niet verschenen' toevoegen aan de uitslag-enum
-- ---------------------------------------------------------------------------
-- ADD VALUE mag in een transactie (PG12+); de nieuwe waarde wordt in deze
-- migratie nergens gebruikt (de RPC hieronder cast 'no_show' pas bij uitvoering,
-- niet bij definitie), dus dit is veilig.
alter type public.agenda_appointment_result add value if not exists 'no_show';

-- ---------------------------------------------------------------------------
-- 2. Tenant-consistente unieke sleutel op agenda_appointments
-- ---------------------------------------------------------------------------
-- Nodig zodat exam_appointment_details een samengestelde FK (appointment_id,
-- tenant_id) kan leggen die cross-tenant koppels onmogelijk maakt. id is al
-- uniek (PK), dus dit voegt geen nieuwe beperking toe behalve de referentie.
create unique index if not exists uq_agenda_appointments_id_tenant
  on public.agenda_appointments (id, tenant_id);

-- ---------------------------------------------------------------------------
-- 3. exam_appointment_details — voorbereidingsdetail per examenmoment
-- ---------------------------------------------------------------------------
create table if not exists public.exam_appointment_details (
  appointment_id     uuid primary key
    references public.agenda_appointments(id) on delete cascade,
  tenant_id          uuid not null references public.tenants(id) on delete cascade,
  pickup_at          timestamptz,
  pickup_location    text,
  -- Afvinkbare documentenlijst: [{ "code": "id", "label": "...", "checked": true }]
  required_documents jsonb not null default '[]'::jsonb,
  exam_day_notes     text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  updated_by         uuid references auth.users(id) on delete set null,
  -- Tenant-consistente koppeling naar de afspraak (voorkomt cross-tenant koppels).
  constraint exam_appointment_details_appt_tenant_fk
    foreign key (appointment_id, tenant_id)
    references public.agenda_appointments (id, tenant_id)
    on delete cascade
);

create index if not exists idx_exam_appt_details_tenant
  on public.exam_appointment_details (tenant_id);

drop trigger if exists exam_appointment_details_set_updated_at
  on public.exam_appointment_details;
create trigger exam_appointment_details_set_updated_at
  before update on public.exam_appointment_details
  for each row execute function public.set_updated_at();

-- RLS: alleen lezen. Staf ziet alle voorbereidingsdetails in de tenant; de
-- gekoppelde leerling of voogd ziet uitsluitend het detail van de eigen
-- afspraak. Schrijven gaat altijd via de RPC hieronder (service_role).
-- Bewust GEEN brede `tenant_id in (my_tenant_ids())`-tak: die zou ook leerlingen
-- /ouders alle examens van de rijschool laten zien.
alter table public.exam_appointment_details enable row level security;

drop policy if exists exam_appt_details_select on public.exam_appointment_details;
create policy exam_appt_details_select on public.exam_appointment_details
  for select
  using (
    public.is_platform_admin()
    or exists (
      select 1 from public.memberships m
       where m.user_id = auth.uid()
         and m.tenant_id = exam_appointment_details.tenant_id
         and m.role in ('tenant_admin', 'instructor')
    )
    or exists (
      select 1
        from public.agenda_appointments a
        join public.students s on s.id = a.student_id
       where a.id = exam_appointment_details.appointment_id
         and s.user_id = auth.uid()
    )
    or exists (
      select 1
        from public.agenda_appointments a
        join public.student_guardians g on g.student_id = a.student_id
       where a.id = exam_appointment_details.appointment_id
         and g.user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- 4. RPC: examenvoorbereiding vastleggen (staf)
-- ---------------------------------------------------------------------------
-- Upsert van ophaaltijd/-locatie, afvinkbare documentenlijst en aandachtspunten
-- op een examen of tussentijdse toets. Staf-only via _lesson_actor_authorized;
-- altijd een audit-spoor. Idempotent: opnieuw vastleggen overschrijft.
create or replace function public.set_exam_appointment_details(
  p_appointment_id     uuid,
  p_tenant_id          uuid,
  p_actor              uuid,
  p_pickup_at          timestamptz default null,
  p_pickup_location    text default null,
  p_required_documents jsonb default null,
  p_exam_day_notes     text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_appt record;
  v_docs jsonb;
  v_loc  text;
  v_note text;
begin
  if not public._lesson_actor_authorized(p_actor, p_tenant_id) then
    raise exception 'actor % not authorized for tenant %', p_actor, p_tenant_id;
  end if;

  select * into v_appt
    from public.agenda_appointments
   where id = p_appointment_id and tenant_id = p_tenant_id
   for update;
  if v_appt.id is null then
    raise exception 'afspraak % niet gevonden in tenant %', p_appointment_id, p_tenant_id;
  end if;
  if v_appt.type not in ('exam', 'interim_test') then
    raise exception 'examenvoorbereiding alleen mogelijk voor examen of tussentijdse toets (type=%)', v_appt.type;
  end if;

  -- Documenten moeten een json-array zijn, anders leeg. (De applicatielaag
  -- saneert de structuur {code,label,checked}; hier dwingen we het arraytype af.)
  if p_required_documents is null or jsonb_typeof(p_required_documents) <> 'array' then
    v_docs := '[]'::jsonb;
  else
    v_docs := p_required_documents;
  end if;

  v_loc := nullif(btrim(coalesce(p_pickup_location, '')), '');
  if v_loc is not null then
    v_loc := left(v_loc, 500);
  end if;
  v_note := nullif(btrim(coalesce(p_exam_day_notes, '')), '');
  if v_note is not null then
    v_note := left(v_note, 2000);
  end if;

  insert into public.exam_appointment_details (
    appointment_id, tenant_id,
    pickup_at, pickup_location, required_documents, exam_day_notes,
    updated_at, updated_by
  ) values (
    p_appointment_id, p_tenant_id,
    p_pickup_at, v_loc, v_docs, v_note,
    now(), p_actor
  )
  on conflict (appointment_id) do update
    set pickup_at          = excluded.pickup_at,
        pickup_location    = excluded.pickup_location,
        required_documents = excluded.required_documents,
        exam_day_notes     = excluded.exam_day_notes,
        updated_at         = now(),
        updated_by         = p_actor;

  insert into public.audit_log (
    actor_user_id, tenant_id, action, target_type, target_id, payload
  ) values (
    p_actor, p_tenant_id, 'agenda_appointment.exam_details_set',
    'agenda_appointment', p_appointment_id::text,
    jsonb_build_object(
      'type',            v_appt.type,
      'pickup_at',       p_pickup_at,
      'pickup_location', v_loc,
      'document_count',  jsonb_array_length(v_docs),
      'has_notes',       (v_note is not null)
    )
  );
end;
$$;
revoke all on function public.set_exam_appointment_details(uuid, uuid, uuid, timestamptz, text, jsonb, text) from public;
revoke execute on function public.set_exam_appointment_details(uuid, uuid, uuid, timestamptz, text, jsonb, text) from anon, authenticated;
grant execute on function public.set_exam_appointment_details(uuid, uuid, uuid, timestamptz, text, jsonb, text) to service_role;

-- ---------------------------------------------------------------------------
-- 5. set_appointment_result herdefiniëren met 'niet verschenen'
-- ---------------------------------------------------------------------------
-- Identiek aan 0067, maar accepteert nu ook 'no_show'. Idempotent, zet de
-- afspraak op 'completed', staf-only, audit-spoor. result_recorded_at fungeert
-- als registratiedatum; de examendatum zelf is de afspraak (starts_at).
create or replace function public.set_appointment_result(
  p_appointment_id uuid,
  p_tenant_id      uuid,
  p_actor          uuid,
  p_result         text,
  p_note           text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_appt   record;
  v_result public.agenda_appointment_result;
  v_note   text;
begin
  if not public._lesson_actor_authorized(p_actor, p_tenant_id) then
    raise exception 'actor % not authorized for tenant %', p_actor, p_tenant_id;
  end if;

  if p_result is null or p_result not in ('passed', 'failed', 'no_show') then
    raise exception 'invalid result: %', p_result;
  end if;
  v_result := p_result::public.agenda_appointment_result;
  v_note := nullif(btrim(coalesce(p_note, '')), '');
  if v_note is not null then
    v_note := left(v_note, 1000);
  end if;

  select * into v_appt
    from public.agenda_appointments
   where id = p_appointment_id and tenant_id = p_tenant_id
   for update;
  if v_appt.id is null then
    raise exception 'afspraak % niet gevonden in tenant %', p_appointment_id, p_tenant_id;
  end if;
  if v_appt.type not in ('exam', 'interim_test') then
    raise exception 'uitslag alleen mogelijk voor examen of tussentijdse toets (type=%)', v_appt.type;
  end if;

  update public.agenda_appointments
     set result             = v_result,
         result_note        = v_note,
         result_recorded_at = now(),
         result_recorded_by = p_actor,
         status             = 'completed'
   where id = p_appointment_id and tenant_id = p_tenant_id;

  insert into public.audit_log (
    actor_user_id, tenant_id, action, target_type, target_id, payload
  ) values (
    p_actor, p_tenant_id, 'agenda_appointment.result_set', 'agenda_appointment', p_appointment_id::text,
    jsonb_build_object(
      'type',   v_appt.type,
      'result', v_result,
      'note',   v_note
    )
  );
end;
$$;
revoke all on function public.set_appointment_result(uuid, uuid, uuid, text, text) from public;
revoke execute on function public.set_appointment_result(uuid, uuid, uuid, text, text) from anon, authenticated;
grant execute on function public.set_appointment_result(uuid, uuid, uuid, text, text) to service_role;

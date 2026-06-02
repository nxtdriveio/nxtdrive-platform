-- 0067_cbr_status_fase1.sql
-- Module 13 — CBR-statusbeheer Fase 1 (handmatig).
--
-- Maakt het handmatige CBR-proces compleet:
--
--  1. Machtiging als 3-staps-status (nog_nodig -> aangevraagd -> ontvangen)
--     i.p.v. één boolean. De bestaande boolean `machtiging_geregeld` blijft
--     bestaan als afgeleide spiegel (= status 'ontvangen') zodat alle bestaande
--     lezers (examenrijpheid-engine, rapportages, ouderportaal, statusbalk)
--     ongewijzigd blijven werken. De RPC houdt beide consistent.
--
--  2. Examen-/toetsuitslag op agenda_appointments (geslaagd/gezakt) met een
--     optioneel vervolgadvies. Vastleggen gebeurt server-side via een
--     SECURITY DEFINER RPC met audit-spoor; de afgeleide CBR-statussen
--     (examen gepland, geslaagd, gezakt, herexamen nodig) worden in de
--     applicatielaag berekend uit afspraken + uitslag (lib/cbr/derive.ts).
--
-- Alle writes blijven service-role only: execute wordt op anon én authenticated
-- ingetrokken (revoke PUBLIC alleen is niet genoeg — matcht 0023/0030/0049).

-- ---------------------------------------------------------------------------
-- 1. Machtiging 3-staps-status
-- ---------------------------------------------------------------------------

do $$ begin
  create type public.cbr_machtiging_status as enum (
    'nog_nodig',   -- machtiging moet nog aangevraagd worden
    'aangevraagd', -- machtiging aangevraagd, nog niet binnen
    'ontvangen'    -- machtiging ontvangen (== oude machtiging_geregeld = true)
  );
exception when duplicate_object then null; end $$;

alter table public.student_cbr_status
  add column if not exists machtiging_status public.cbr_machtiging_status
    not null default 'nog_nodig';

-- Backfill uit de bestaande boolean: alleen een reeds geregelde machtiging
-- wordt 'ontvangen'; al het andere blijft 'nog_nodig' (geen fabricage van een
-- tussenstap die nooit is vastgelegd).
update public.student_cbr_status
   set machtiging_status = 'ontvangen'
 where machtiging_geregeld = true
   and machtiging_status <> 'ontvangen';

-- set_student_cbr_status herdefiniëren met een 3-staps machtiging-parameter.
-- De oude boolean-signatuur moet eerst verwijderd worden, anders blijft die
-- als overload aanroepbaar (beveiligingsrisico: omzeilt de nieuwe validatie).
drop function if exists public.set_student_cbr_status(
  uuid, uuid, uuid, boolean, boolean, boolean, boolean
);

create or replace function public.set_student_cbr_status(
  p_student_id                      uuid,
  p_tenant_id                       uuid,
  p_actor                           uuid,
  p_theorie_behaald                 boolean,
  p_machtiging_status               text,
  p_gezondheidsverklaring_vereist   boolean,
  p_gezondheidsverklaring_geregeld  boolean
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status     public.cbr_machtiging_status;
  v_geregeld   boolean;
begin
  if not public._lesson_actor_authorized(p_actor, p_tenant_id) then
    raise exception 'actor % not authorized for tenant %', p_actor, p_tenant_id;
  end if;

  if not exists (
    select 1 from public.students
     where id = p_student_id and tenant_id = p_tenant_id
  ) then
    raise exception 'student % not found in tenant %', p_student_id, p_tenant_id;
  end if;

  -- Valideer en normaliseer de machtiging-status.
  if p_machtiging_status is null then
    v_status := 'nog_nodig';
  elsif p_machtiging_status in ('nog_nodig', 'aangevraagd', 'ontvangen') then
    v_status := p_machtiging_status::public.cbr_machtiging_status;
  else
    raise exception 'invalid machtiging_status: %', p_machtiging_status;
  end if;
  -- Spiegel-boolean voor bestaande lezers (engine/rapportage/portaal).
  v_geregeld := (v_status = 'ontvangen');

  insert into public.student_cbr_status (
    student_id, tenant_id,
    theorie_behaald, machtiging_status, machtiging_geregeld,
    gezondheidsverklaring_vereist, gezondheidsverklaring_geregeld,
    updated_at, updated_by
  ) values (
    p_student_id, p_tenant_id,
    coalesce(p_theorie_behaald, false),
    v_status, v_geregeld,
    coalesce(p_gezondheidsverklaring_vereist, true),
    coalesce(p_gezondheidsverklaring_geregeld, false),
    now(), p_actor
  )
  on conflict (student_id) do update
    set theorie_behaald                = excluded.theorie_behaald,
        machtiging_status              = excluded.machtiging_status,
        machtiging_geregeld            = excluded.machtiging_geregeld,
        gezondheidsverklaring_vereist  = excluded.gezondheidsverklaring_vereist,
        gezondheidsverklaring_geregeld = excluded.gezondheidsverklaring_geregeld,
        updated_at                     = now(),
        updated_by                     = p_actor;

  insert into public.audit_log (
    actor_user_id, tenant_id, action, target_type, target_id, payload
  ) values (
    p_actor, p_tenant_id, 'cbr.status_set', 'student', p_student_id::text,
    jsonb_build_object(
      'theorie_behaald',                coalesce(p_theorie_behaald, false),
      'machtiging_status',              v_status,
      'machtiging_geregeld',            v_geregeld,
      'gezondheidsverklaring_vereist',  coalesce(p_gezondheidsverklaring_vereist, true),
      'gezondheidsverklaring_geregeld', coalesce(p_gezondheidsverklaring_geregeld, false)
    )
  );
end;
$$;
revoke all on function public.set_student_cbr_status(uuid, uuid, uuid, boolean, text, boolean, boolean) from public;
revoke execute on function public.set_student_cbr_status(uuid, uuid, uuid, boolean, text, boolean, boolean) from anon, authenticated;
grant execute on function public.set_student_cbr_status(uuid, uuid, uuid, boolean, text, boolean, boolean) to service_role;

-- ---------------------------------------------------------------------------
-- 2. Examen-/toetsuitslag op agenda_appointments
-- ---------------------------------------------------------------------------

do $$ begin
  create type public.agenda_appointment_result as enum (
    'passed', -- geslaagd
    'failed'  -- gezakt
  );
exception when duplicate_object then null; end $$;

alter table public.agenda_appointments
  add column if not exists result            public.agenda_appointment_result,
  add column if not exists result_note       text,
  add column if not exists result_recorded_at timestamptz,
  add column if not exists result_recorded_by uuid references auth.users(id) on delete set null;

-- set_appointment_result: legt de uitslag (geslaagd/gezakt) van een examen of
-- tussentijdse toets vast, met optioneel vervolgadvies. Zet de afspraak op
-- 'completed'. Idempotent: opnieuw vastleggen overschrijft (corrigeert) de
-- uitslag. Staf-only via _lesson_actor_authorized; audit-spoor altijd.
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

  if p_result is null or p_result not in ('passed', 'failed') then
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

-- ===========================================================================
-- 0068 — Examenmoment uitnodigen met één klik (Task #102)
--
-- Een rijschool nodigt met één klik een geschikte leerling uit voor een open
-- examenmoment (agenda_appointments: type 'exam'/'interim_test', status
-- 'planned', result NULL, student_id IS NULL). De leerling bevestigt of wijst af
-- in de leerling-PWA. Bij bevestiging wordt UITSLUITEND de leerling aan de
-- afspraak gekoppeld (agenda_appointments.student_id) — een examen verbruikt geen
-- tegoed, dus er komt GEEN credit_ledger-, lessons- of saldomutatie aan te pas.
-- De CBR-status volgt automatisch ('examen_gepland') via lib/cbr/derive.ts; die
-- wordt afgeleid uit de afspraak en niet apart opgeslagen.
--
-- Spiegelt het wachtlijst/herbezet-patroon (0050 + 0051-hardening):
--   * select-only RLS; alle mutaties via SECURITY DEFINER RPC's (service_role).
--   * lazy-expiry stopt HARD vóór enige mutatie (geen 'expired'-schrijf/audit).
--   * RPC execute herroepen voor public, anon én authenticated; alleen service_role.
--   * idempotente dubbel-guard die ALLE openstaande rijen telt (matcht de partial
--     unique index), plus race-veilige advisory lock op de afspraak.
-- ===========================================================================

-- 1. Status-enum -------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'exam_invitation_status') then
    create type public.exam_invitation_status as enum (
      'invited',    -- uitgenodigd, wacht op reactie
      'confirmed',  -- leerling heeft bevestigd; gekoppeld aan de afspraak
      'declined',   -- leerling heeft afgewezen
      'expired',    -- verlopen (afgeleid; lees-filters sluiten dit uit op expires_at)
      'cancelled'   -- ingetrokken door staf of vervallen na bevestiging van een ander
    );
  end if;
end $$;

-- 2. Tabel -------------------------------------------------------------------
create table if not exists public.exam_invitations (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  appointment_id  uuid not null references public.agenda_appointments(id) on delete cascade,
  student_id      uuid not null,
  status          public.exam_invitation_status not null default 'invited',
  expires_at      timestamptz not null,
  score           integer not null default 0,
  reason          text,
  created_by      uuid references auth.users(id) on delete set null,
  responded_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  -- Tenant-consistente koppeling naar de leerling (voorkomt cross-tenant koppels).
  constraint exam_invitations_student_tenant_fk
    foreign key (student_id, tenant_id)
    references public.students (id, tenant_id)
    on delete cascade
);

drop trigger if exists exam_invitations_set_updated_at on public.exam_invitations;
create trigger exam_invitations_set_updated_at
  before update on public.exam_invitations
  for each row execute function public.set_updated_at();

create index if not exists idx_exam_inv_tenant_status
  on public.exam_invitations (tenant_id, status);
create index if not exists idx_exam_inv_student_status
  on public.exam_invitations (student_id, status, expires_at);
create index if not exists idx_exam_inv_appointment_status
  on public.exam_invitations (appointment_id, status);

-- Eén openstaande ('invited') uitnodiging per (afspraak, leerling).
create unique index if not exists uq_exam_inv_invited_per_appointment_student
  on public.exam_invitations (appointment_id, student_id)
  where status = 'invited';

-- RLS: alleen lezen. Staf ziet alle uitnodigingen in de tenant; een leerling of
-- gekoppelde voogd ziet uitsluitend de eigen uitnodigingen. Schrijven gaat
-- altijd via de RPC's hieronder (service_role).
alter table public.exam_invitations enable row level security;

drop policy if exists exam_inv_select on public.exam_invitations;
create policy exam_inv_select on public.exam_invitations
  for select
  using (
    public.is_platform_admin()
    or exists (
      select 1 from public.memberships m
       where m.user_id = auth.uid()
         and m.tenant_id = exam_invitations.tenant_id
         and m.role in ('tenant_admin', 'instructor')
    )
    or exists (
      select 1 from public.students s
       where s.id = exam_invitations.student_id
         and s.user_id = auth.uid()
    )
    or exists (
      select 1 from public.student_guardians g
       where g.student_id = exam_invitations.student_id
         and g.user_id = auth.uid()
    )
  );

-- ===========================================================================
-- 3. RPC: uitnodiging aanmaken (staf)
-- ===========================================================================
-- Staf nodigt een leerling uit voor een specifiek open examenmoment. Dwingt de
-- tenant-regels af die door de applicatielaag worden meegegeven (al gesanitiseerd
-- + geklemd): aan/uit, geldigheidsduur, max. gelijktijdige kandidaten per moment.
create or replace function public.create_exam_invitation(
  p_tenant_id      uuid,
  p_actor          uuid,
  p_appointment_id uuid,
  p_student_id     uuid,
  p_enabled        boolean,
  p_valid_minutes  integer,
  p_max_candidates integer,
  p_score          integer default 0,
  p_reason         text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id    uuid;
  v_appt  public.agenda_appointments;
  v_valid integer;
  v_max   integer;
  v_open  integer;
begin
  if not public._lesson_actor_authorized(p_actor, p_tenant_id) then
    raise exception 'actor % not authorized for tenant %', p_actor, p_tenant_id;
  end if;
  if not coalesce(p_enabled, true) then
    raise exception 'examenuitnodigingen staan uit voor deze rijschool';
  end if;

  v_valid := greatest(coalesce(p_valid_minutes, 2880), 1);
  v_max   := greatest(coalesce(p_max_candidates, 3), 1);

  -- Serialiseer gelijktijdige creates/bevestigingen voor exact hetzelfde
  -- examenmoment, zodat de max-kandidaten-telling en de open-check race-veilig
  -- zijn. De lock geldt enkel binnen deze transactie.
  perform pg_advisory_xact_lock(
    hashtextextended(p_tenant_id::text || ':exam_invite:' || p_appointment_id::text, 0)
  );

  -- Het examenmoment moet bestaan, in de tenant zitten en nog open zijn.
  select * into v_appt
    from public.agenda_appointments
   where id = p_appointment_id and tenant_id = p_tenant_id
   for update;
  if v_appt.id is null then
    raise exception 'examenmoment % niet gevonden in tenant %', p_appointment_id, p_tenant_id;
  end if;
  if v_appt.type not in ('exam', 'interim_test') then
    raise exception 'afspraak % is geen examen of tussentijdse toets', p_appointment_id;
  end if;
  if v_appt.status <> 'planned' then
    raise exception 'examenmoment % is niet gepland (status=%)', p_appointment_id, v_appt.status;
  end if;
  if v_appt.result is not null then
    raise exception 'examenmoment % heeft al een uitslag', p_appointment_id;
  end if;
  if v_appt.student_id is not null then
    raise exception 'examenmoment % is al aan een leerling gekoppeld', p_appointment_id;
  end if;

  -- Leerling moet in de tenant bestaan.
  if not exists (
    select 1 from public.students s
     where s.id = p_student_id and s.tenant_id = p_tenant_id
  ) then
    raise exception 'leerling % niet gevonden in tenant %', p_student_id, p_tenant_id;
  end if;

  -- Geen dubbele openstaande uitnodiging voor dezelfde leerling + hetzelfde
  -- moment. We tellen ALLE 'invited'-rijen (ook reeds verlopen-maar-nog-invited),
  -- zodat dit exact overeenkomt met de partial unique index
  -- uq_exam_inv_invited_per_appointment_student en een nette NL-fout geeft i.p.v.
  -- een rauwe unique-violation.
  if exists (
    select 1 from public.exam_invitations i
     where i.tenant_id = p_tenant_id
       and i.appointment_id = p_appointment_id
       and i.student_id = p_student_id
       and i.status = 'invited'
  ) then
    raise exception 'er staat al een openstaande uitnodiging voor deze leerling op dit moment';
  end if;

  -- Max. gelijktijdige openstaande (niet-verlopen) kandidaten voor dit moment.
  select count(*) into v_open
    from public.exam_invitations i
   where i.tenant_id = p_tenant_id
     and i.appointment_id = p_appointment_id
     and i.status = 'invited'
     and i.expires_at > now();
  if v_open >= v_max then
    raise exception 'maximaal aantal gelijktijdige kandidaten (%) voor dit moment bereikt', v_max;
  end if;

  insert into public.exam_invitations (
    tenant_id, appointment_id, student_id,
    status, expires_at, score, reason, created_by
  ) values (
    p_tenant_id, p_appointment_id, p_student_id,
    'invited', now() + make_interval(mins => v_valid), coalesce(p_score, 0), p_reason, p_actor
  )
  returning id into v_id;

  insert into public.audit_log (
    actor_user_id, tenant_id, action, target_type, target_id, payload
  ) values (
    p_actor, p_tenant_id, 'exam_invitation.invited', 'exam_invitation', v_id::text,
    jsonb_build_object(
      'appointment_id', p_appointment_id,
      'student_id',     p_student_id,
      'appointment_type', v_appt.type,
      'starts_at',      v_appt.starts_at,
      'valid_minutes',  v_valid
    )
  );

  return v_id;
end;
$$;
revoke all on function public.create_exam_invitation(uuid, uuid, uuid, uuid, boolean, integer, integer, integer, text) from public;
revoke execute on function public.create_exam_invitation(uuid, uuid, uuid, uuid, boolean, integer, integer, integer, text) from anon, authenticated;
grant execute on function public.create_exam_invitation(uuid, uuid, uuid, uuid, boolean, integer, integer, integer, text) to service_role;

-- ===========================================================================
-- 4. RPC: reageren op uitnodiging (leerling/voogd of staf)
-- ===========================================================================
-- Weigeren werkt de status bij; het moment blijft open. Bevestigen koppelt de
-- leerling aan de afspraak NA her-validatie dat het moment nog open is — er wordt
-- bewust GEEN tegoed verrekend en GEEN les geboekt (een examen verbruikt geen
-- tegoed). Overige openstaande uitnodigingen voor hetzelfde moment vervallen.
create or replace function public.respond_exam_invitation(
  p_invitation_id uuid,
  p_tenant_id     uuid,
  p_actor         uuid,
  p_accept        boolean
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inv        public.exam_invitations;
  v_appt       public.agenda_appointments;
  v_authorized boolean;
begin
  select * into v_inv
    from public.exam_invitations
   where id = p_invitation_id and tenant_id = p_tenant_id
   for update;
  if v_inv.id is null then
    raise exception 'uitnodiging % niet gevonden in tenant %', p_invitation_id, p_tenant_id;
  end if;

  -- Autorisatie: staf, of de leerling zelf, of een gekoppelde voogd.
  v_authorized := public._lesson_actor_authorized(p_actor, p_tenant_id)
    or exists (
      select 1 from public.students s
       where s.id = v_inv.student_id and s.user_id = p_actor
    )
    or exists (
      select 1 from public.student_guardians g
       where g.student_id = v_inv.student_id and g.user_id = p_actor
    );
  if not v_authorized then
    raise exception 'actor % not authorized to respond to invitation %', p_actor, p_invitation_id;
  end if;

  if v_inv.status <> 'invited' then
    raise exception 'uitnodiging % is niet meer open (status=%)', p_invitation_id, v_inv.status;
  end if;

  -- Lazy-expiry: verlopen → hard stoppen vóór enige mutatie (koppelt nooit). We
  -- schrijven hier bewust geen 'expired'-status: een raise rolt die toch terug.
  -- De lees-filters sluiten verlopen uitnodigingen al uit op expires_at.
  if v_inv.expires_at <= now() then
    raise exception 'uitnodiging % is verlopen', p_invitation_id;
  end if;

  -- Weigeren: status bijwerken, moment blijft open.
  if not coalesce(p_accept, false) then
    update public.exam_invitations
       set status = 'declined', responded_at = now()
     where id = v_inv.id;
    insert into public.audit_log (
      actor_user_id, tenant_id, action, target_type, target_id, payload
    ) values (
      p_actor, p_tenant_id, 'exam_invitation.declined', 'exam_invitation', v_inv.id::text,
      jsonb_build_object('student_id', v_inv.student_id, 'appointment_id', v_inv.appointment_id)
    );
    return null;
  end if;

  -- ---- Bevestigen: leerling aan het examenmoment koppelen ------------------
  -- Examenmoment vergrendelen en her-valideren dat het nog open is (een ander
  -- kan ondertussen bevestigd hebben → geen dubbelboeking).
  select * into v_appt
    from public.agenda_appointments
   where id = v_inv.appointment_id and tenant_id = p_tenant_id
   for update;
  if v_appt.id is null then
    raise exception 'examenmoment % niet gevonden in tenant %', v_inv.appointment_id, p_tenant_id;
  end if;
  if v_appt.type not in ('exam', 'interim_test') then
    raise exception 'afspraak % is geen examen of tussentijdse toets', v_inv.appointment_id;
  end if;
  if v_appt.status <> 'planned' or v_appt.result is not null then
    raise exception 'het examenmoment is niet meer beschikbaar';
  end if;
  if v_appt.student_id is not null then
    raise exception 'het examenmoment is al aan een leerling gekoppeld';
  end if;

  -- Geen tegoed/les/saldomutatie: alleen koppelen.
  update public.agenda_appointments
     set student_id = v_inv.student_id
   where id = v_appt.id
     and student_id is null;
  if not found then
    raise exception 'het examenmoment is al aan een leerling gekoppeld';
  end if;

  insert into public.audit_log (
    actor_user_id, tenant_id, action, target_type, target_id, payload
  ) values (
    p_actor, p_tenant_id, 'agenda_appointment.student_assigned', 'agenda_appointment', v_appt.id::text,
    jsonb_build_object(
      'student_id',  v_inv.student_id,
      'starts_at',   v_appt.starts_at,
      'source',      'exam_invitation'
    )
  );

  -- Uitnodiging bevestigen.
  update public.exam_invitations
     set status = 'confirmed', responded_at = now()
   where id = v_inv.id;

  insert into public.audit_log (
    actor_user_id, tenant_id, action, target_type, target_id, payload
  ) values (
    p_actor, p_tenant_id, 'exam_invitation.confirmed', 'exam_invitation', v_inv.id::text,
    jsonb_build_object('student_id', v_inv.student_id, 'appointment_id', v_inv.appointment_id)
  );

  -- Overige openstaande uitnodigingen voor hetzelfde moment vervallen.
  update public.exam_invitations
     set status = 'cancelled', responded_at = now()
   where tenant_id = p_tenant_id
     and appointment_id = v_inv.appointment_id
     and id <> v_inv.id
     and status = 'invited';

  return v_appt.id;
end;
$$;
revoke all on function public.respond_exam_invitation(uuid, uuid, uuid, boolean) from public;
revoke execute on function public.respond_exam_invitation(uuid, uuid, uuid, boolean) from anon, authenticated;
grant execute on function public.respond_exam_invitation(uuid, uuid, uuid, boolean) to service_role;

-- ===========================================================================
-- 5. RPC: uitnodiging intrekken (staf)
-- ===========================================================================
create or replace function public.cancel_exam_invitation(
  p_invitation_id uuid,
  p_tenant_id     uuid,
  p_actor         uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inv public.exam_invitations;
begin
  if not public._lesson_actor_authorized(p_actor, p_tenant_id) then
    raise exception 'actor % not authorized for tenant %', p_actor, p_tenant_id;
  end if;

  select * into v_inv
    from public.exam_invitations
   where id = p_invitation_id and tenant_id = p_tenant_id
   for update;
  if v_inv.id is null then
    raise exception 'uitnodiging % niet gevonden in tenant %', p_invitation_id, p_tenant_id;
  end if;
  if v_inv.status <> 'invited' then
    raise exception 'uitnodiging % is niet meer open (status=%)', p_invitation_id, v_inv.status;
  end if;

  update public.exam_invitations
     set status = 'cancelled', responded_at = now()
   where id = v_inv.id;

  insert into public.audit_log (
    actor_user_id, tenant_id, action, target_type, target_id, payload
  ) values (
    p_actor, p_tenant_id, 'exam_invitation.cancelled', 'exam_invitation', v_inv.id::text,
    jsonb_build_object('student_id', v_inv.student_id, 'appointment_id', v_inv.appointment_id)
  );
end;
$$;
revoke all on function public.cancel_exam_invitation(uuid, uuid, uuid) from public;
revoke execute on function public.cancel_exam_invitation(uuid, uuid, uuid) from anon, authenticated;
grant execute on function public.cancel_exam_invitation(uuid, uuid, uuid) to service_role;

-- ===========================================================================
-- 6. Notificatietypes: examenuitnodiging + bevestiging
-- ===========================================================================
-- Zelfde drop-by-definitie-patroon als 0045/0050/0062: de huidige CHECKs zijn
-- auto-/named; we vinden ze op definitie en vervangen door named CHECKs met de
-- twee nieuwe types erbij. Volledige lijst behouden om bestaande types niet te
-- breken.
do $$
declare r record;
begin
  for r in
    select conname, conrelid::regclass::text as tbl
      from pg_constraint
     where contype = 'c'
       and conrelid in (
         'public.notification_log'::regclass,
         'public.notification_templates'::regclass
       )
       and pg_get_constraintdef(oid) ilike '%payment_confirmation%'
  loop
    execute format('alter table %s drop constraint %I', r.tbl, r.conname);
  end loop;
end $$;

alter table public.notification_log
  add constraint notification_log_type_check
  check (type in (
    'payment_confirmation',
    'lesson_reminder',
    'task_assigned',
    'trial_lesson_received',
    'trial_lesson_confirmed',
    'lesson_refill_invitation',
    'lesson_refill_confirmed',
    'payment_reminder',
    'exam_invitation',
    'exam_confirmed'
  ));

alter table public.notification_templates
  add constraint notification_templates_key_check
  check (key in (
    'payment_confirmation',
    'lesson_reminder',
    'task_assigned',
    'trial_lesson_received',
    'trial_lesson_confirmed',
    'lesson_refill_invitation',
    'lesson_refill_confirmed',
    'payment_reminder',
    'exam_invitation',
    'exam_confirmed'
  ));

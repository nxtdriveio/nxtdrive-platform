-- ===========================================================================
-- 0076 — Review- & referralflow (groei)
--
-- Drie samenhangende uitbreidingen, alle op beproefde patronen:
--
--   1. 'review_request' toevoegen aan de notification_log/notification_templates
--      CHECK-constraints, zodat de bestaande (white-label-bewuste, idempotente)
--      dispatch-laag een reviewverzoek-mail + in-app melding kan versturen.
--      Zelfde drop-then-readd patroon als 0071/0072.
--
--   2. referral_codes: één persoonlijke, deelbare code per leerling. Een lead die
--      via die code binnenkomt wordt geattribueerd aan de verwijzende leerling.
--      Tenant-scoped, RLS (eigen leerling / voogd / staf), schrijven uitsluitend
--      via SECURITY DEFINER RPC's (service_role; anon/authenticated revoked).
--
--   3. leads-attributie + handmatige beloning: referred_by_student_id koppelt de
--      lead aan de verwijzer; referral_reward_handled_at/_by leggen vast dat een
--      beloning handmatig is afgehandeld. GEEN automatische beloningsengine —
--      de canon schrijft handmatig markeren voor.
--
-- Alle mutaties zijn server-side (service_role) en geaudit. Idempotent waar
-- relevant. Nooit hardcoded per rijschool.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. 'review_request' toevoegen aan de notificatie-CHECK-constraints
-- ---------------------------------------------------------------------------
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
    'exam_confirmed',
    'exam_planned',
    'exam_passed',
    'exam_failed',
    'intake_received',
    'lesson_cancelled',
    'invoice_created',
    'cbr_authorization_needed',
    'credit_low',
    'installment_due',
    'exam_day_reminder',
    'review_request'
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
    'exam_confirmed',
    'exam_planned',
    'exam_passed',
    'exam_failed',
    'intake_received',
    'lesson_cancelled',
    'invoice_created',
    'cbr_authorization_needed',
    'credit_low',
    'installment_due',
    'exam_day_reminder',
    'review_request'
  ));

-- ---------------------------------------------------------------------------
-- 2. referral_codes — één deelbare code per leerling
-- ---------------------------------------------------------------------------
create table if not exists public.referral_codes (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  student_id  uuid not null references public.students(id) on delete cascade,
  code        text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  -- Eén code per leerling binnen de tenant (idempotente ensure).
  constraint referral_codes_student_unique unique (tenant_id, student_id),
  -- Globaal uniek: een publieke ?ref=-code resolved naar exact één leerling.
  constraint referral_codes_code_unique unique (code),
  constraint referral_codes_code_len check (char_length(code) between 4 and 32)
);

drop trigger if exists referral_codes_set_updated_at on public.referral_codes;
create trigger referral_codes_set_updated_at
  before update on public.referral_codes
  for each row execute function public.set_updated_at();

create index if not exists idx_referral_codes_tenant
  on public.referral_codes (tenant_id);

alter table public.referral_codes enable row level security;

-- SELECT: staf (tenant_admin/instructor) ziet de hele tenant; een leerling ziet
-- de eigen code; een voogd ziet de code van een gekoppeld kind. Geen brede
-- my_tenant_ids()-tak (die zou lekken naar elke membershiprol). Schrijven gaat
-- uitsluitend via de RPC's hieronder (service role) — geen write-policies.
drop policy if exists referral_codes_select on public.referral_codes;
create policy referral_codes_select on public.referral_codes
  for select
  using (
    public.is_platform_admin()
    or exists (
      select 1
        from public.memberships m
       where m.user_id   = auth.uid()
         and m.tenant_id = referral_codes.tenant_id
         and m.role in ('tenant_admin', 'instructor')
    )
    or student_id in (
      select s.id
        from public.students s
       where s.user_id   = auth.uid()
         and s.tenant_id = referral_codes.tenant_id
    )
    or student_id in (
      select g.student_id
        from public.student_guardians g
        join public.students s
          on s.id = g.student_id and s.tenant_id = referral_codes.tenant_id
       where g.user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- 3. leads — referral-attributie + handmatige beloning
-- ---------------------------------------------------------------------------
alter table public.leads
  add column if not exists referred_by_student_id uuid
    references public.students(id) on delete set null,
  add column if not exists referral_reward_handled_at timestamptz,
  add column if not exists referral_reward_handled_by uuid
    references auth.users(id) on delete set null;

comment on column public.leads.referred_by_student_id is
  'De leerling die deze lead heeft aangebracht (referral). NULL = geen referral.';
comment on column public.leads.referral_reward_handled_at is
  'Wanneer de referral-beloning HANDMATIG is afgehandeld. Geen automatische engine.';

create index if not exists idx_leads_referred_by
  on public.leads (tenant_id, referred_by_student_id)
  where referred_by_student_id is not null;

-- ---------------------------------------------------------------------------
-- RPC: ensure_student_referral_code — idempotent een code aanmaken/teruggeven
-- ---------------------------------------------------------------------------
-- Autorisatie: de leerling zelf, een gekoppelde voogd, of staf (tenant_admin/
-- instructor)/platform-admin. Idempotent: bestaat er al een code, dan wordt die
-- ongemoeid teruggegeven. Geaudit bij aanmaak.
create or replace function public.ensure_student_referral_code(
  p_student_id uuid,
  p_tenant_id  uuid,
  p_actor      uuid
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code      text;
  v_candidate text;
  v_tries     int := 0;
begin
  if p_actor is null then
    raise exception 'actor is required';
  end if;

  -- Autorisatie: leerling-zelf OF voogd OF staf/platform-admin.
  if not exists (
    select 1 from public.students s
     where s.id = p_student_id and s.tenant_id = p_tenant_id and s.user_id = p_actor
  ) and not exists (
    select 1 from public.student_guardians g
     where g.student_id = p_student_id and g.tenant_id = p_tenant_id and g.user_id = p_actor
  ) and not exists (
    select 1 from public.memberships m
     where m.user_id = p_actor and m.tenant_id = p_tenant_id
       and m.role in ('tenant_admin', 'instructor')
  ) and not exists (
    select 1 from public.profiles p where p.id = p_actor and p.is_platform_admin = true
  ) then
    raise exception 'actor % not authorized for student % in tenant %',
      p_actor, p_student_id, p_tenant_id;
  end if;

  -- Leerling moet in de tenant bestaan.
  if not exists (
    select 1 from public.students s where s.id = p_student_id and s.tenant_id = p_tenant_id
  ) then
    raise exception 'student % not found in tenant %', p_student_id, p_tenant_id;
  end if;

  -- Idempotent: bestaande code teruggeven.
  select code into v_code
    from public.referral_codes
   where tenant_id = p_tenant_id and student_id = p_student_id;
  if v_code is not null then
    return v_code;
  end if;

  -- Genereer een globaal unieke code (kort, hoofdletters/cijfers).
  loop
    v_tries := v_tries + 1;
    v_candidate := upper(substr(md5(gen_random_uuid()::text || clock_timestamp()::text), 1, 8));
    begin
      insert into public.referral_codes (tenant_id, student_id, code)
      values (p_tenant_id, p_student_id, v_candidate);
      v_code := v_candidate;
      exit;
    exception
      when unique_violation then
        -- Race: een andere call maakte ondertussen de leerlingcode aan, of de
        -- code botste. Bij leerling-conflict: lees de bestaande terug.
        select code into v_code
          from public.referral_codes
         where tenant_id = p_tenant_id and student_id = p_student_id;
        if v_code is not null then
          exit;
        end if;
        if v_tries >= 5 then
          raise exception 'could not generate unique referral code after % tries', v_tries;
        end if;
    end;
  end loop;

  insert into public.audit_log (
    actor_user_id, tenant_id, action, target_type, target_id, payload
  ) values (
    p_actor, p_tenant_id, 'referral_code.created', 'student', p_student_id::text,
    jsonb_build_object('code', v_code)
  );

  return v_code;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: set_lead_referral — koppel een lead aan een verwijzer via referral-code
-- ---------------------------------------------------------------------------
-- Aangeroepen vanuit de publieke intake server action (service role). Resolved de
-- code binnen DEZELFDE tenant; een onbekende code is een no-op (false) en mag de
-- intake nooit breken. Idempotent en niet-overschrijvend: alleen als de lead nog
-- geen verwijzer heeft. Zet source='referral'. Geaudit. Retourneert of er is
-- geattribueerd.
create or replace function public.set_lead_referral(
  p_lead_id   uuid,
  p_tenant_id uuid,
  p_code      text
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student_id uuid;
  v_existing   uuid;
begin
  if p_lead_id is null or p_tenant_id is null or p_code is null or btrim(p_code) = '' then
    return false;
  end if;

  -- Resolve de code binnen deze tenant.
  select student_id into v_student_id
    from public.referral_codes
   where tenant_id = p_tenant_id and code = upper(btrim(p_code));
  if v_student_id is null then
    return false;  -- onbekende code: stilletjes negeren
  end if;

  -- Lead moet bestaan in deze tenant; niet overschrijven.
  select referred_by_student_id into v_existing
    from public.leads
   where id = p_lead_id and tenant_id = p_tenant_id
   for update;
  if not found then
    return false;
  end if;
  if v_existing is not null then
    return false;  -- al geattribueerd: idempotent no-op
  end if;

  update public.leads
     set referred_by_student_id = v_student_id,
         source = 'referral'
   where id = p_lead_id and tenant_id = p_tenant_id;

  insert into public.audit_log (
    actor_user_id, tenant_id, action, target_type, target_id, payload
  ) values (
    null, p_tenant_id, 'lead.referral_attributed', 'lead', p_lead_id::text,
    jsonb_build_object('referred_by_student_id', v_student_id, 'code', upper(btrim(p_code)))
  );

  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: mark_referral_reward_handled — handmatig de beloning (af)markeren
-- ---------------------------------------------------------------------------
-- Admin-only (tenant_admin of platform-admin). GEEN automatische beloning: een
-- mens markeert dat de beloning is afgehandeld. Idempotent en geaudit. p_handled
-- false maakt de markering ongedaan.
create or replace function public.mark_referral_reward_handled(
  p_lead_id   uuid,
  p_tenant_id uuid,
  p_actor     uuid,
  p_handled   boolean
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_referrer uuid;
begin
  if p_actor is null then
    raise exception 'actor is required';
  end if;

  if not exists (
    select 1 from public.memberships m
     where m.user_id = p_actor and m.tenant_id = p_tenant_id and m.role = 'tenant_admin'
  ) and not exists (
    select 1 from public.profiles p where p.id = p_actor and p.is_platform_admin = true
  ) then
    raise exception 'actor % not authorized (admin only) for tenant %', p_actor, p_tenant_id;
  end if;

  select referred_by_student_id into v_referrer
    from public.leads
   where id = p_lead_id and tenant_id = p_tenant_id;
  if not found then
    raise exception 'lead % not found in tenant %', p_lead_id, p_tenant_id;
  end if;
  if v_referrer is null then
    raise exception 'lead % is not a referral', p_lead_id;
  end if;

  update public.leads
     set referral_reward_handled_at = case when p_handled then now() else null end,
         referral_reward_handled_by = case when p_handled then p_actor else null end
   where id = p_lead_id and tenant_id = p_tenant_id;

  insert into public.audit_log (
    actor_user_id, tenant_id, action, target_type, target_id, payload
  ) values (
    p_actor, p_tenant_id, 'lead.referral_reward_handled', 'lead', p_lead_id::text,
    jsonb_build_object('handled', coalesce(p_handled, false))
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Grant lockdown — service_role only (anon/authenticated revoked).
-- ---------------------------------------------------------------------------
revoke all     on function public.ensure_student_referral_code(uuid, uuid, uuid) from public;
revoke execute on function public.ensure_student_referral_code(uuid, uuid, uuid) from anon, authenticated;
grant  execute on function public.ensure_student_referral_code(uuid, uuid, uuid) to service_role;

revoke all     on function public.set_lead_referral(uuid, uuid, text) from public;
revoke execute on function public.set_lead_referral(uuid, uuid, text) from anon, authenticated;
grant  execute on function public.set_lead_referral(uuid, uuid, text) to service_role;

revoke all     on function public.mark_referral_reward_handled(uuid, uuid, uuid, boolean) from public;
revoke execute on function public.mark_referral_reward_handled(uuid, uuid, uuid, boolean) from anon, authenticated;
grant  execute on function public.mark_referral_reward_handled(uuid, uuid, uuid, boolean) to service_role;

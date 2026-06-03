-- 0075_installment_credit_release.sql
-- Task #112 — Termijn-tegoed: gefaseerde tegoed-vrijgave per betaalde termijn.
--
-- Builds the link between an installment payment (#97 / 0061) and tegoed
-- (credit) release. Two tenant-configurable release policies, never hardcoded:
--
--   * immediate        — the package's full tegoed is released the moment the
--                        termijn-schema is created (one ledger row).
--   * per_installment   — each paid termijn releases its proportional share of
--                        the package tegoed; the sum over all termijnen equals
--                        the package total EXACTLY (deterministic rounding,
--                        the last termijn settles the remainder). This is the
--                        platform default: tegoed never runs ahead of payment.
--
-- The policy is read from tenant_settings key `installment_credit_release`
-- (value {"mode": ...}) and SNAPSHOT onto the plan at creation, so flipping the
-- tenant setting never retro-changes existing plans.
--
-- Every release writes a credit_ledger row (reason 'package_purchase', so the
-- released tegoed behaves exactly like a normal package grant for balance,
-- breakdown and FIFO expiry) PLUS an audit_log row, and is idempotent via the
-- installment_credit_releases tracking table (partial unique indexes). All
-- mutations stay service-role only via SECURITY DEFINER RPCs; clients get
-- read-only RLS. No new credit_reason enum value is needed.

-- ===========================================================================
-- 1. Plan snapshot columns: the policy + package tegoed in effect at creation.
-- ===========================================================================
alter table public.installment_plans
  add column if not exists credit_release_policy text not null default 'per_installment',
  add column if not exists package_credit_minutes integer;

alter table public.installment_plans
  drop constraint if exists installment_plans_credit_policy_check;
alter table public.installment_plans
  add constraint installment_plans_credit_policy_check
    check (credit_release_policy in ('immediate', 'per_installment'));

alter table public.installment_plans
  drop constraint if exists installment_plans_package_minutes_check;
alter table public.installment_plans
  add constraint installment_plans_package_minutes_check
    check (package_credit_minutes is null or package_credit_minutes >= 0);

-- ===========================================================================
-- 2. installment_credit_releases — one row per tegoed-release event.
--    invoice_id null  => the single 'immediate' full release at plan creation.
--    invoice_id set   => a per-installment release when that termijn was paid.
-- ===========================================================================
create table if not exists public.installment_credit_releases (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references public.tenants(id) on delete cascade,
  plan_id          uuid not null,
  invoice_id       uuid,
  installment_no   integer,
  minutes          integer not null,
  credit_ledger_id uuid references public.credit_ledger(id),
  created_at       timestamptz not null default now(),
  check (minutes >= 0),
  check (installment_no is null or installment_no >= 1),
  constraint installment_credit_releases_plan_tenant_fkey
    foreign key (plan_id, tenant_id)
    references public.installment_plans (id, tenant_id)
    on delete cascade,
  constraint installment_credit_releases_invoice_tenant_fkey
    foreign key (invoice_id, tenant_id)
    references public.invoices (id, tenant_id)
    on delete set null
);

-- Idempotency: at most one release per paid installment invoice, and at most
-- one immediate full release per plan.
create unique index if not exists uq_installment_credit_release_invoice
  on public.installment_credit_releases (tenant_id, invoice_id)
  where invoice_id is not null;
create unique index if not exists uq_installment_credit_release_immediate
  on public.installment_credit_releases (plan_id)
  where invoice_id is null;

create index if not exists idx_installment_credit_releases_tenant
  on public.installment_credit_releases (tenant_id);
create index if not exists idx_installment_credit_releases_plan
  on public.installment_credit_releases (plan_id);

-- ===========================================================================
-- 3. RLS — read-only, mirrors installment_plans visibility (staff + own
--    student + guardian). No insert/update/delete policies: service role only.
-- ===========================================================================
alter table public.installment_credit_releases enable row level security;

drop policy if exists installment_credit_releases_select on public.installment_credit_releases;
create policy installment_credit_releases_select on public.installment_credit_releases
  for select
  using (
    public.is_platform_admin()
    or exists (
      select 1
        from public.memberships m
       where m.user_id   = auth.uid()
         and m.tenant_id = installment_credit_releases.tenant_id
         and m.role in ('tenant_admin', 'instructor')
    )
    or exists (
      select 1
        from public.installment_plans p
        join public.students s
          on s.id = p.student_id and s.tenant_id = p.tenant_id
       where p.id        = installment_credit_releases.plan_id
         and p.tenant_id = installment_credit_releases.tenant_id
         and s.user_id   = auth.uid()
    )
    or exists (
      select 1
        from public.installment_plans p
        join public.students s
          on s.id = p.student_id and s.tenant_id = p.tenant_id
        join public.student_guardians g
          on g.student_id = p.student_id
       where p.id        = installment_credit_releases.plan_id
         and p.tenant_id = installment_credit_releases.tenant_id
         and g.user_id   = auth.uid()
    )
  );

-- ===========================================================================
-- 4. Per-plan credit-status view (security_invoker so caller RLS applies).
--    Convenience read surface for backoffice + student PWA.
-- ===========================================================================
create or replace view public.installment_plan_credit_status
with (security_invoker = true) as
select
  p.id                                   as plan_id,
  p.tenant_id                            as tenant_id,
  p.student_id                           as student_id,
  p.credit_release_policy                as credit_release_policy,
  p.package_credit_minutes               as package_credit_minutes,
  coalesce(sum(r.minutes), 0)::integer   as released_minutes,
  greatest(
    coalesce(p.package_credit_minutes, 0) - coalesce(sum(r.minutes), 0),
    0
  )::integer                             as pending_minutes
from public.installment_plans p
left join public.installment_credit_releases r
  on r.plan_id = p.id and r.tenant_id = p.tenant_id
group by
  p.id, p.tenant_id, p.student_id, p.credit_release_policy,
  p.package_credit_minutes;

comment on view public.installment_plan_credit_status is
  'Per termijn-schema: gekozen vrijgavebeleid + pakket-tegoed (minuten), reeds vrijgegeven en nog vrij te geven. available tegoed leeft in credit_ledger.';

grant select on public.installment_plan_credit_status to anon, authenticated, service_role;

-- ===========================================================================
-- 5. RPC: release_installment_credit — release one paid termijn's tegoed-deel.
--    Idempotent (tracking-table unique index + invoice row-lock serialisation).
--    No-op unless: the invoice is a per_installment plan installment, is paid,
--    and the plan carries a package tegoed. Called internally on the paid
--    transition (set_invoice_status / confirm_mollie_payment); also callable
--    directly by the service role.
-- ===========================================================================
create or replace function public.release_installment_credit(
  p_tenant_id  uuid,
  p_actor      uuid,
  p_invoice_id uuid
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan_id  uuid;
  v_no       integer;
  v_count    integer;
  v_status   public.invoice_status;
  v_student  uuid;
  v_policy   text;
  v_pkg      integer;
  v_package  uuid;
  v_share    integer;
  v_ledger   uuid;
  v_existing uuid;
  v_release  uuid;
begin
  select installment_plan_id, installment_no, installment_count, status, student_id
    into v_plan_id, v_no, v_count, v_status, v_student
    from public.invoices
   where id = p_invoice_id and tenant_id = p_tenant_id
   for update;
  -- Not an installment invoice (or not found) / not yet paid → nothing to do.
  if v_plan_id is null or v_no is null or v_count is null then
    return null;
  end if;
  if v_status <> 'paid' then
    return null;
  end if;

  select credit_release_policy, package_credit_minutes, related_package_id
    into v_policy, v_pkg, v_package
    from public.installment_plans
   where id = v_plan_id and tenant_id = p_tenant_id;
  -- Immediate plans released their full tegoed at creation; nothing per-termijn.
  if v_policy is distinct from 'per_installment' then
    return null;
  end if;
  -- No linked package tegoed → this is a pure money-only termijn schema.
  if v_pkg is null or v_pkg <= 0 or v_package is null then
    return null;
  end if;

  -- Idempotency: this installment already released its share.
  select id into v_existing
    from public.installment_credit_releases
   where tenant_id = p_tenant_id and invoice_id = p_invoice_id;
  if found then
    return v_existing;
  end if;

  -- Deterministic split: share(i) = round(total*i/N) - round(total*(i-1)/N).
  -- The cumulative targets telescope so the sum over all N termijnen equals the
  -- package total EXACTLY, and the last termijn settles any remainder.
  v_share := (
    round(v_pkg::numeric * v_no / v_count)
    - round(v_pkg::numeric * (v_no - 1) / v_count)
  )::integer;

  -- credit_ledger forbids delta = 0; skip the ledger row but still record the
  -- (zero-minute) release so the installment is marked processed.
  if v_share > 0 then
    insert into public.credit_ledger (
      tenant_id, student_id, delta, reason, related_type, related_id, note, actor_user_id
    ) values (
      p_tenant_id, v_student, v_share, 'package_purchase', 'package', v_package,
      'Tegoed vrijgegeven: termijn ' || v_no || ' van ' || v_count, p_actor
    )
    returning id into v_ledger;
  end if;

  insert into public.installment_credit_releases (
    tenant_id, plan_id, invoice_id, installment_no, minutes, credit_ledger_id
  ) values (
    p_tenant_id, v_plan_id, p_invoice_id, v_no, greatest(v_share, 0), v_ledger
  )
  on conflict (tenant_id, invoice_id) where invoice_id is not null do nothing
  returning id into v_release;

  -- Defensive: lost a race (the invoice row-lock above normally serialises us).
  if v_release is null then
    select id into v_release
      from public.installment_credit_releases
     where tenant_id = p_tenant_id and invoice_id = p_invoice_id;
    return v_release;
  end if;

  insert into public.audit_log (
    actor_user_id, tenant_id, action, target_type, target_id, payload
  ) values (
    p_actor, p_tenant_id, 'credits.installment_released', 'installment_plan',
    v_plan_id::text,
    jsonb_build_object(
      'invoice_id', p_invoice_id,
      'installment_no', v_no,
      'installment_count', v_count,
      'minutes', greatest(v_share, 0),
      'ledger_id', v_ledger
    )
  );

  return v_release;
end;
$$;

revoke all on function public.release_installment_credit(uuid, uuid, uuid) from public;
revoke execute on function public.release_installment_credit(uuid, uuid, uuid) from anon, authenticated;
grant execute on function public.release_installment_credit(uuid, uuid, uuid) to service_role;

-- ===========================================================================
-- 6. create_installment_plan — snapshot policy + package tegoed, and (for the
--    immediate policy) release the package's full tegoed right away.
--    Signature unchanged; grants re-asserted below.
-- ===========================================================================
create or replace function public.create_installment_plan(
  p_tenant_id          uuid,
  p_actor              uuid,
  p_student_id         uuid,
  p_total_cents        integer,
  p_installment_count  integer,
  p_first_due_date     date,
  p_interval_days      integer,
  p_description        text,
  p_tax_rate_bp        integer,
  p_related_package_id uuid,
  p_notes              text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan_id   uuid;
  v_count     integer := p_installment_count;
  v_interval  integer := coalesce(p_interval_days, 30);
  v_desc      text    := nullif(trim(coalesce(p_description, '')), '');
  v_tax_bp    integer := coalesce(p_tax_rate_bp, 2100);
  v_base      integer;
  v_rem       integer;
  v_part      integer;
  v_due       date;
  v_invoice   uuid;
  i           integer;
  v_mode_raw  text;
  v_policy    text;
  v_pkg       integer := null;
  v_ledger    uuid;
begin
  if not exists (
    select 1 from public.students
     where id = p_student_id and tenant_id = p_tenant_id
  ) then
    raise exception 'student % not found in tenant %', p_student_id, p_tenant_id;
  end if;
  if v_desc is null then
    raise exception 'description required';
  end if;
  if p_total_cents is null or p_total_cents <= 0 then
    raise exception 'total_cents must be > 0';
  end if;
  if v_count is null or v_count < 2 or v_count > 60 then
    raise exception 'installment_count must be between 2 and 60';
  end if;
  if v_interval < 0 or v_interval > 365 then
    raise exception 'interval_days must be between 0 and 365';
  end if;
  if v_tax_bp < 0 or v_tax_bp > 10000 then
    raise exception 'tax_rate_bp out of range';
  end if;

  -- Snapshot the tenant's tegoed-release policy (default per_installment).
  select value->>'mode' into v_mode_raw
    from public.tenant_settings
   where tenant_id = p_tenant_id and key = 'installment_credit_release';
  v_policy := case
    when v_mode_raw in ('immediate', 'per_installment') then v_mode_raw
    else 'per_installment'
  end;

  -- Snapshot the linked package's tegoed (minutes) so the split is immune to
  -- later package edits. Null when no package is linked (money-only schema).
  if p_related_package_id is not null then
    select credits_total into v_pkg
      from public.packages
     where id = p_related_package_id and tenant_id = p_tenant_id;
  end if;

  insert into public.installment_plans (
    tenant_id, student_id, total_cents, installment_count, interval_days,
    first_due_date, description, related_package_id, notes, created_by,
    credit_release_policy, package_credit_minutes
  ) values (
    p_tenant_id, p_student_id, p_total_cents, v_count, v_interval,
    p_first_due_date, v_desc, p_related_package_id,
    nullif(trim(coalesce(p_notes, '')), ''), p_actor,
    v_policy, v_pkg
  )
  returning id into v_plan_id;

  v_base := p_total_cents / v_count;  -- integer division (floor for >= 0)
  v_rem  := p_total_cents - (v_base * v_count);

  for i in 1..v_count loop
    v_part := v_base + case when i <= v_rem then 1 else 0 end;
    if p_first_due_date is null then
      v_due := null;
    else
      v_due := p_first_due_date + ((i - 1) * v_interval);
    end if;

    v_invoice := public.create_invoice(
      p_tenant_id, p_actor, p_student_id, v_due,
      nullif(trim(coalesce(p_notes, '')), '')
    );

    update public.invoices
       set installment_plan_id = v_plan_id,
           installment_no      = i,
           installment_count   = v_count
     where id = v_invoice and tenant_id = p_tenant_id;

    perform public.add_invoice_line(
      v_invoice, p_tenant_id, p_actor,
      v_desc || ' — Termijn ' || i || ' van ' || v_count,
      1, v_part, v_tax_bp, p_related_package_id
    );

    perform public.set_invoice_status(v_invoice, p_tenant_id, p_actor, 'open');
  end loop;

  insert into public.audit_log (
    actor_user_id, tenant_id, action, target_type, target_id, payload
  ) values (
    p_actor, p_tenant_id, 'installment_plan.created', 'installment_plan',
    v_plan_id::text,
    jsonb_build_object(
      'student_id', p_student_id,
      'total_cents', p_total_cents,
      'installment_count', v_count,
      'interval_days', v_interval,
      'credit_release_policy', v_policy,
      'package_credit_minutes', v_pkg
    )
  );

  -- Immediate policy: release the package's full tegoed now (one ledger row +
  -- one immediate release row, invoice_id null). per_installment plans release
  -- nothing here — each termijn releases on payment.
  if v_policy = 'immediate' and v_pkg is not null and v_pkg > 0 then
    insert into public.credit_ledger (
      tenant_id, student_id, delta, reason, related_type, related_id, note, actor_user_id
    ) values (
      p_tenant_id, p_student_id, v_pkg, 'package_purchase', 'package',
      p_related_package_id,
      'Tegoed vrijgegeven (volledig) bij termijnschema', p_actor
    )
    returning id into v_ledger;

    insert into public.installment_credit_releases (
      tenant_id, plan_id, invoice_id, installment_no, minutes, credit_ledger_id
    ) values (
      p_tenant_id, v_plan_id, null, null, v_pkg, v_ledger
    )
    on conflict (plan_id) where invoice_id is null do nothing;

    insert into public.audit_log (
      actor_user_id, tenant_id, action, target_type, target_id, payload
    ) values (
      p_actor, p_tenant_id, 'credits.installment_released', 'installment_plan',
      v_plan_id::text,
      jsonb_build_object(
        'invoice_id', null,
        'installment_no', null,
        'minutes', v_pkg,
        'ledger_id', v_ledger,
        'immediate', true
      )
    );
  end if;

  return v_plan_id;
end;
$$;

revoke all on function public.create_installment_plan(uuid, uuid, uuid, integer, integer, date, integer, text, integer, uuid, text) from public;
revoke execute on function public.create_installment_plan(uuid, uuid, uuid, integer, integer, date, integer, text, integer, uuid, text) from anon, authenticated;
grant execute on function public.create_installment_plan(uuid, uuid, uuid, integer, integer, date, integer, text, integer, uuid, text) to service_role;

-- ===========================================================================
-- 7. set_invoice_status — release the installment's tegoed-deel on the paid
--    transition (per_installment plans). Signature unchanged; re-assert grants.
-- ===========================================================================
create or replace function public.set_invoice_status(
  p_invoice_id uuid,
  p_tenant_id  uuid,
  p_actor      uuid,
  p_status     public.invoice_status
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current  public.invoice_status;
  v_lines    integer;
  v_issued   timestamptz;
  v_paid     timestamptz;
  v_plan     uuid;
begin
  select status, installment_plan_id into v_current, v_plan from public.invoices
   where id = p_invoice_id and tenant_id = p_tenant_id
   for update;
  if v_current is null then
    raise exception 'invoice % not found in tenant %', p_invoice_id, p_tenant_id;
  end if;
  if v_current = p_status then
    return;
  end if;

  -- Legal transitions:
  --   draft → open | cancelled
  --   open  → paid | cancelled
  if not (
    (v_current = 'draft' and p_status in ('open', 'cancelled'))
    or (v_current = 'open'  and p_status in ('paid', 'cancelled'))
  ) then
    raise exception 'illegal invoice status transition % → %', v_current, p_status;
  end if;

  if p_status = 'open' then
    select count(*) into v_lines from public.invoice_lines where invoice_id = p_invoice_id;
    if v_lines = 0 then
      raise exception 'cannot open an invoice without lines';
    end if;
    v_issued := now();
  end if;

  if p_status = 'paid' then
    v_paid := now();
  end if;

  update public.invoices
     set status    = p_status,
         issued_at = coalesce(v_issued, issued_at),
         paid_at   = coalesce(v_paid,   paid_at)
   where id = p_invoice_id and tenant_id = p_tenant_id;

  insert into public.audit_log (
    actor_user_id, tenant_id, action, target_type, target_id, payload
  ) values (
    p_actor, p_tenant_id, 'invoice.status_changed', 'invoice', p_invoice_id::text,
    jsonb_build_object('from', v_current::text, 'to', p_status::text)
  );

  -- Termijn-tegoed: a paid installment releases its proportional tegoed-deel
  -- (no-op for non-installments / immediate plans / money-only schemas).
  if p_status = 'paid' and v_plan is not null then
    perform public.release_installment_credit(p_tenant_id, p_actor, p_invoice_id);
  end if;
end;
$$;

revoke all on function public.set_invoice_status(uuid, uuid, uuid, public.invoice_status) from public;
revoke execute on function public.set_invoice_status(uuid, uuid, uuid, public.invoice_status) from anon, authenticated;
grant execute on function public.set_invoice_status(uuid, uuid, uuid, public.invoice_status) to service_role;

-- ===========================================================================
-- 8. confirm_mollie_payment — release the installment's tegoed-deel when a
--    Mollie webhook flips the termijn to paid. Signature unchanged; re-assert
--    grants. Body mirrors 0025 with the release call appended.
-- ===========================================================================
create or replace function public.confirm_mollie_payment(
  p_tenant_id          uuid,
  p_actor              uuid,
  p_invoice_id         uuid,
  p_mollie_payment_id  text,
  p_status             text,
  p_amount_cents       integer,
  p_currency           text,
  p_method             text,
  p_paid_at            timestamptz,
  p_raw_payload        jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice_status     public.invoice_status;
  v_invoice_total      integer;
  v_invoice_mollie_id  text;
  v_invoice_plan       uuid;
  v_pr_id              uuid;
  v_was_paid           boolean := false;
  v_mismatch_reason    text := null;
begin
  if p_tenant_id is null or p_invoice_id is null or p_mollie_payment_id is null then
    raise exception 'tenant_id, invoice_id and mollie_payment_id are required';
  end if;

  select status, total_cents, mollie_payment_id, installment_plan_id
    into v_invoice_status, v_invoice_total, v_invoice_mollie_id, v_invoice_plan
    from public.invoices
   where id = p_invoice_id and tenant_id = p_tenant_id
   for update;
  if not found then
    raise exception 'invoice % not found in tenant % (cross-tenant webhook rejected)',
      p_invoice_id, p_tenant_id;
  end if;

  insert into public.payment_records (
    tenant_id, provider, provider_payment_id,
    amount_cents, currency, method, mollie_status,
    paid_at, raw_payload, invoice_id, invoice_tenant_id
  ) values (
    p_tenant_id, 'mollie', p_mollie_payment_id,
    p_amount_cents, coalesce(p_currency,'EUR'), p_method, p_status,
    p_paid_at, coalesce(p_raw_payload,'{}'::jsonb), p_invoice_id, p_tenant_id
  )
  on conflict (tenant_id, provider_payment_id) where provider_payment_id is not null
    do update set
      amount_cents      = excluded.amount_cents,
      currency          = excluded.currency,
      method            = excluded.method,
      mollie_status     = excluded.mollie_status,
      paid_at           = excluded.paid_at,
      raw_payload       = excluded.raw_payload,
      invoice_id        = excluded.invoice_id,
      invoice_tenant_id = excluded.invoice_tenant_id
  returning id into v_pr_id;

  update public.invoices
     set mollie_status = p_status
   where id = p_invoice_id and tenant_id = p_tenant_id;

  if p_status = 'paid' and v_invoice_status = 'open' then
    if v_invoice_mollie_id is null
       or v_invoice_mollie_id <> p_mollie_payment_id then
      v_mismatch_reason := 'mollie_payment_id binding mismatch';
    elsif coalesce(p_currency,'EUR') <> 'EUR' then
      v_mismatch_reason := 'currency mismatch (' || coalesce(p_currency,'<null>') || ')';
    elsif p_amount_cents is null or p_amount_cents < v_invoice_total then
      v_mismatch_reason := 'amount_cents ' || coalesce(p_amount_cents::text, '<null>')
                         || ' < invoice total ' || v_invoice_total::text;
    else
      update public.invoices
         set status            = 'paid',
             paid_at           = coalesce(p_paid_at, now()),
             payment_record_id        = v_pr_id,
             payment_record_tenant_id = p_tenant_id
       where id = p_invoice_id and tenant_id = p_tenant_id;
      v_was_paid := true;
    end if;
  end if;

  insert into public.audit_log (
    actor_user_id, tenant_id, action, target_type, target_id, payload
  ) values (
    p_actor, p_tenant_id,
    case
      when v_was_paid then 'invoice.paid_via_mollie'
      when v_mismatch_reason is not null then 'invoice.mollie_payment_mismatch'
      else 'invoice.mollie_webhook_received'
    end,
    'invoice', p_invoice_id::text,
    jsonb_build_object(
      'mollie_payment_id', p_mollie_payment_id,
      'mollie_status', p_status,
      'amount_cents', p_amount_cents,
      'currency', coalesce(p_currency,'EUR'),
      'method', p_method,
      'payment_record_id', v_pr_id,
      'mismatch_reason', v_mismatch_reason
    )
  );

  -- Termijn-tegoed: a Mollie-paid installment releases its tegoed-deel.
  if v_was_paid and v_invoice_plan is not null then
    perform public.release_installment_credit(p_tenant_id, p_actor, p_invoice_id);
  end if;

  return v_pr_id;
end;
$$;

revoke all on function public.confirm_mollie_payment(uuid, uuid, uuid, text, text, integer, text, text, timestamptz, jsonb) from public;
revoke execute on function public.confirm_mollie_payment(uuid, uuid, uuid, text, text, integer, text, text, timestamptz, jsonb) from anon, authenticated;
grant execute on function public.confirm_mollie_payment(uuid, uuid, uuid, text, text, integer, text, text, timestamptz, jsonb) to service_role;

-- ===========================================================================
-- 9. Seed the platform-default policy for existing tenants (idempotent).
-- ===========================================================================
insert into public.tenant_settings (tenant_id, key, value)
select t.id, 'installment_credit_release', '{"mode":"per_installment"}'::jsonb
  from public.tenants t
on conflict (tenant_id, key) do nothing;

-- 0065_credit_breakdown_expiry_signal.sql
-- Module 5: hour-based tegoed breakdown as the source of truth, credit expiry,
-- and the package follow-up signal. All tegoed-touching mutations stay
-- server-side via service-role RPCs paired with audit_log; the ledger stays
-- insert-only. Everything reckons in MINUTES and is shown in hours.

begin;

-- ---------------------------------------------------------------------------
-- 1. Tegoed breakdown view (per student) — single source of truth.
--
-- Scheduling a lesson immediately books -duration in the ledger, so "gereden vs
-- ingepland" is derived from the LESSON STATUS of each lesson_consumed row, not
-- from any double booking. The buckets partition every ledger reason exactly
-- once, so by construction:
--   available = purchased + refunded + adjustments - driven - planned - expired
-- which matches the canon example (20 gekocht, 12 gereden, 3 ingepland => 5).
--
-- security_invoker so the caller's RLS on students / credit_ledger / lessons
-- applies (mirrors student_credit_balance).
-- ---------------------------------------------------------------------------
create or replace view public.student_credit_breakdown
with (security_invoker = true) as
with consumed as (
  select
    l.student_id,
    l.tenant_id,
    coalesce(sum(case when ls.status = 'planned' then -l.delta else 0 end), 0) as planned_min,
    coalesce(sum(case when ls.status is distinct from 'planned' then -l.delta else 0 end), 0) as driven_min
  from public.credit_ledger l
  left join public.lessons ls
    on ls.id = l.related_id and ls.tenant_id = l.tenant_id
  where l.reason = 'lesson_consumed'
  group by l.student_id, l.tenant_id
),
agg as (
  select
    student_id,
    tenant_id,
    coalesce(sum(delta) filter (
      where reason in ('package_purchase', 'package_refund', 'opening_balance')
    ), 0) as purchased_net,
    coalesce(sum(delta) filter (where reason = 'lesson_refund'), 0) as refunded,
    coalesce(sum(delta) filter (where reason = 'adjustment'), 0) as adjustments,
    coalesce(-sum(delta) filter (where reason = 'credit_expired'), 0) as expired,
    coalesce(sum(delta), 0) as balance
  from public.credit_ledger
  group by student_id, tenant_id
),
withheld as (
  -- Informational: tegoed kept by the school on cancellation / no-show.
  select
    student_id,
    tenant_id,
    coalesce(sum(
      case
        when status = 'no_show' then credits_cost
        when status = 'cancelled_no_refund' then credits_cost
        when status = 'cancelled_with_refund'
          then greatest(credits_cost - coalesce(refunded_credits, 0), 0)
        else 0
      end
    ), 0) as withheld_min
  from public.lessons
  group by student_id, tenant_id
)
select
  s.id        as student_id,
  s.tenant_id as tenant_id,
  coalesce(a.purchased_net, 0)::integer as purchased_minutes,
  coalesce(c.driven_min,    0)::integer as driven_minutes,
  coalesce(c.planned_min,   0)::integer as planned_minutes,
  coalesce(a.refunded,      0)::integer as refunded_minutes,
  coalesce(a.adjustments,   0)::integer as adjustment_minutes,
  coalesce(a.expired,       0)::integer as expired_minutes,
  coalesce(w.withheld_min,  0)::integer as withheld_minutes,
  coalesce(a.balance,       0)::integer as available_minutes
from public.students s
left join agg      a on a.student_id = s.id and a.tenant_id = s.tenant_id
left join consumed c on c.student_id = s.id and c.tenant_id = s.tenant_id
left join withheld w on w.student_id = s.id and w.tenant_id = s.tenant_id;

comment on view public.student_credit_breakdown is
  'Per-student tegoed split (MINUTES, shown in hours): purchased/driven/planned/refunded/adjustment/expired/withheld/available. available = sum(ledger.delta).';

grant select on public.student_credit_breakdown to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. grant_package: honour the auto_grant flag (default true keeps current
--    behaviour). When auto_grant is false the tegoed is deferred and no ledger
--    row is written (no silent mutation), but the assignment is still audited.
--    Re-locked to service_role only (anon/authenticated revoked).
-- ---------------------------------------------------------------------------
create or replace function public.grant_package(
  p_student_id uuid,
  p_tenant_id  uuid,
  p_actor      uuid,
  p_package_id uuid
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pack   record;
  v_ledger uuid;
begin
  if not exists (
    select 1 from public.students
     where id = p_student_id and tenant_id = p_tenant_id
  ) then
    raise exception 'student % not found in tenant %', p_student_id, p_tenant_id;
  end if;

  select id, name, credits_total, price_cents, active, auto_grant
    into v_pack
    from public.packages
   where id = p_package_id and tenant_id = p_tenant_id;
  if v_pack.id is null then
    raise exception 'package % not found in tenant %', p_package_id, p_tenant_id;
  end if;
  if not v_pack.active then
    raise exception 'package % is not active', p_package_id;
  end if;

  if v_pack.auto_grant then
    insert into public.credit_ledger (
      tenant_id, student_id, delta, reason, related_type, related_id, note, actor_user_id
    ) values (
      p_tenant_id, p_student_id, v_pack.credits_total, 'package_purchase',
      'package', v_pack.id,
      'Pakket toegekend: ' || v_pack.name, p_actor
    )
    returning id into v_ledger;
  end if;

  insert into public.audit_log (
    actor_user_id, tenant_id, action, target_type, target_id, payload
  ) values (
    p_actor, p_tenant_id, 'credits.granted', 'student', p_student_id::text,
    jsonb_build_object(
      'package_id',   v_pack.id,
      'package_name', v_pack.name,
      'credits',      case when v_pack.auto_grant then v_pack.credits_total else 0 end,
      'auto_grant',   v_pack.auto_grant,
      'price_cents',  v_pack.price_cents,
      'ledger_id',    v_ledger
    )
  );

  return v_ledger;
end;
$$;

revoke all on function public.grant_package(uuid, uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.grant_package(uuid, uuid, uuid, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 3. expire_student_credits: book expired tegoed for one tenant.
--
-- FIFO over package grants that carry a validity (packages.valid_days). Each
-- grant is a "lot" of credit_minutes expiring at grant_time + valid_days.
-- Lifetime consumption (net of lesson refunds) draws down the oldest lots
-- first. When a lot is past its expiry and still has a live remainder, that
-- remainder is booked once as a negative 'credit_expired' ledger row tied to
-- the originating grant ledger id (related_type='package_grant'). Idempotent:
-- a lot that already has a credit_expired row is skipped. Capped by the current
-- balance so the saldo never goes negative.
-- ---------------------------------------------------------------------------
create or replace function public.expire_student_credits(
  p_tenant_id uuid,
  p_actor     uuid default null
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student        record;
  v_lot            record;
  v_consumption    bigint;
  v_balance        bigint;
  v_used           bigint;
  v_live           bigint;
  v_expire         bigint;
  v_already        boolean;
  v_count          integer := 0;
begin
  for v_student in
    select distinct student_id
      from public.credit_ledger
     where tenant_id = p_tenant_id
  loop
    -- Net lifetime consumption (positive number of minutes used up).
    select greatest(
      coalesce(-sum(delta) filter (where reason = 'lesson_consumed'), 0)
      - coalesce(sum(delta) filter (where reason = 'lesson_refund'), 0),
      0
    )
      into v_consumption
      from public.credit_ledger
     where tenant_id = p_tenant_id and student_id = v_student.student_id;

    -- Current balance (includes any prior expirations).
    select coalesce(sum(delta), 0)
      into v_balance
      from public.credit_ledger
     where tenant_id = p_tenant_id and student_id = v_student.student_id;

    for v_lot in
      select cl.id as grant_ledger_id,
             cl.delta as amount,
             cl.created_at + make_interval(days => p.valid_days) as expires_at
        from public.credit_ledger cl
        join public.packages p
          on p.id = cl.related_id and p.tenant_id = cl.tenant_id
       where cl.tenant_id = p_tenant_id
         and cl.student_id = v_student.student_id
         and cl.reason = 'package_purchase'
         and cl.delta > 0
         and p.valid_days is not null
       order by cl.created_at asc, cl.id asc
    loop
      -- FIFO: consumption eats the oldest lots first.
      v_used := least(v_lot.amount, v_consumption);
      v_consumption := v_consumption - v_used;
      v_live := v_lot.amount - v_used;

      -- Already expired? Skip (idempotent) but keep balance tracking honest.
      select exists (
        select 1 from public.credit_ledger
         where tenant_id = p_tenant_id
           and student_id = v_student.student_id
           and reason = 'credit_expired'
           and related_type = 'package_grant'
           and related_id = v_lot.grant_ledger_id
      ) into v_already;
      if v_already then
        continue;
      end if;

      if v_lot.expires_at <= now() and v_live > 0 and v_balance > 0 then
        v_expire := least(v_live, v_balance);
        insert into public.credit_ledger (
          tenant_id, student_id, delta, reason, related_type, related_id, note, actor_user_id
        ) values (
          p_tenant_id, v_student.student_id, -v_expire, 'credit_expired',
          'package_grant', v_lot.grant_ledger_id,
          'Tegoed verlopen', p_actor
        );
        v_balance := v_balance - v_expire;
        v_count := v_count + 1;

        insert into public.audit_log (
          actor_user_id, tenant_id, action, target_type, target_id, payload
        ) values (
          p_actor, p_tenant_id, 'credits.expired', 'student', v_student.student_id::text,
          jsonb_build_object('grant_ledger_id', v_lot.grant_ledger_id, 'minutes', v_expire)
        );
      end if;
    end loop;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.expire_student_credits(uuid, uuid) from public, anon, authenticated;
grant execute on function public.expire_student_credits(uuid, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 4. ensure_student_task: create a manual, idempotent backoffice task linked to
--    a student, routed via the tenant's assignment rules. Mirrors
--    ensure_lead_intake_task but binds to a student entity. Used for the
--    package follow-up signal. task_type='manual' so the lead automation
--    stale-sweep never archives it; idempotent via (tenant_id, dedupe_key).
-- ---------------------------------------------------------------------------
create or replace function public.ensure_student_task(
  p_tenant_id   uuid,
  p_actor       uuid,
  p_student_id  uuid,
  p_dedupe_key  text,
  p_title       text,
  p_description text,
  p_priority    public.task_priority,
  p_due_date    date
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing uuid;
  v_board    uuid;
  v_column   uuid;
  v_dept     uuid;
  v_rule     uuid;
  v_pos      integer;
  v_id       uuid;
begin
  if not exists (
    select 1 from public.students where id = p_student_id and tenant_id = p_tenant_id
  ) then
    raise exception 'student % not found in tenant %', p_student_id, p_tenant_id;
  end if;
  if p_dedupe_key is null or char_length(btrim(p_dedupe_key)) = 0 then
    raise exception 'dedupe_key is required';
  end if;
  if p_title is null or char_length(btrim(p_title)) = 0 then
    raise exception 'task title is required';
  end if;

  -- Idempotency: an open task with this key already covers the signal.
  select id into v_existing
    from public.tasks
   where tenant_id = p_tenant_id
     and dedupe_key = p_dedupe_key
     and archived_at is null
   limit 1;
  if found then
    return v_existing;
  end if;

  select ra.rule_id, ra.department_id, ra.board_id
    into v_rule, v_dept, v_board
    from public.resolve_task_assignment(p_tenant_id, btrim(p_title)) ra;

  if v_board is not null then
    select id into v_column
      from public.task_columns
     where board_id = v_board and tenant_id = p_tenant_id
     order by sort_order, created_at
     limit 1;
  end if;

  if v_column is null then
    select c.id, c.board_id into v_column, v_board
      from public.task_columns c
      join public.task_boards b
        on b.id = c.board_id and b.tenant_id = c.tenant_id
     where c.tenant_id = p_tenant_id
       and b.archived_at is null
     order by b.sort_order, b.created_at, c.sort_order
     limit 1;
  end if;

  if v_column is null then
    insert into public.task_boards (tenant_id, name, sort_order)
    values (p_tenant_id, 'Leads', 0)
    returning id into v_board;
    insert into public.task_columns (tenant_id, board_id, name, sort_order)
    values
      (p_tenant_id, v_board, 'Te doen', 10),
      (p_tenant_id, v_board, 'Bezig',   20),
      (p_tenant_id, v_board, 'Klaar',   30);
    select id into v_column
      from public.task_columns
     where board_id = v_board and tenant_id = p_tenant_id
     order by sort_order
     limit 1;
    v_dept := null;
  end if;

  if v_dept is null then
    select department_id into v_dept
      from public.task_boards
     where id = v_board and tenant_id = p_tenant_id;
  end if;

  select coalesce(max(position), -1) + 1 into v_pos
    from public.tasks
   where column_id = v_column and tenant_id = p_tenant_id and archived_at is null;

  insert into public.tasks (
    tenant_id, board_id, column_id, department_id, title, description,
    priority, due_date, position, created_by, task_type, dedupe_key
  ) values (
    p_tenant_id, v_board, v_column, v_dept, btrim(p_title), p_description,
    coalesce(p_priority, 'normal'), p_due_date, v_pos, p_actor,
    'manual', p_dedupe_key
  )
  returning id into v_id;

  insert into public.task_links (tenant_id, task_id, entity_type, entity_id, created_by)
  values (p_tenant_id, v_id, 'student', p_student_id, p_actor)
  on conflict (task_id, entity_type, entity_id) do nothing;

  insert into public.audit_log (actor_user_id, tenant_id, action, target_type, target_id, payload)
  values (
    p_actor, p_tenant_id, 'task.student_created', 'task', v_id::text,
    jsonb_build_object(
      'student_id', p_student_id::text, 'dedupe_key', p_dedupe_key,
      'department_id', v_dept, 'assignment_rule_id', v_rule, 'source', 'package_signal'
    )
  );

  return v_id;
end;
$$;

revoke all on function public.ensure_student_task(uuid, uuid, uuid, text, text, text, public.task_priority, date) from public, anon, authenticated;
grant execute on function public.ensure_student_task(uuid, uuid, uuid, text, text, text, public.task_priority, date) to service_role;

commit;

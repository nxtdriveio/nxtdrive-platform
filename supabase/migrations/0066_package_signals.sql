-- 0066_package_signals.sql
-- Package follow-up signal as a service-role RPC with correct per-grant
-- attribution. Earlier the sweep summed ALL of a student's consumption since
-- each grant timestamp, which mis-attributes usage when a student holds more
-- than one package grant. Here consumption is allocated FIFO across the
-- student's package grants (oldest first, same model as expire_student_credits),
-- so each grant only "sees" the minutes actually drawn from its own lot.
--
-- A grant whose package defines signal_threshold_minutes raises exactly one
-- backoffice task once the minutes allocated to that lot reach the threshold.
-- Idempotent: a grant that already has its signal task (open OR archived) is
-- skipped. Creates a task only — no tegoed is mutated.

begin;

create or replace function public.ensure_package_signals(
  p_tenant_id uuid,
  p_actor     uuid default null
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student   record;
  v_grant     record;
  v_pool      bigint;
  v_alloc     bigint;
  v_threshold integer;
  v_dedupe    text;
  v_exists    boolean;
  v_count     integer := 0;
begin
  for v_student in
    select distinct student_id
      from public.credit_ledger
     where tenant_id = p_tenant_id
       and reason = 'package_purchase'
  loop
    -- Lifetime net consumption (minutes actually used).
    select greatest(
      coalesce(-sum(delta) filter (where reason = 'lesson_consumed'), 0)
      - coalesce(sum(delta) filter (where reason = 'lesson_refund'), 0),
      0
    )
      into v_pool
      from public.credit_ledger
     where tenant_id = p_tenant_id and student_id = v_student.student_id;

    -- FIFO over the student's package grants.
    for v_grant in
      select cl.id as grant_ledger_id,
             cl.delta as amount,
             p.name as package_name,
             p.signal_threshold_minutes as threshold
        from public.credit_ledger cl
        join public.packages p
          on p.id = cl.related_id and p.tenant_id = cl.tenant_id
       where cl.tenant_id = p_tenant_id
         and cl.student_id = v_student.student_id
         and cl.reason = 'package_purchase'
         and cl.related_type = 'package'
         and cl.delta > 0
       order by cl.created_at asc, cl.id asc
    loop
      -- Minutes drawn from THIS lot (oldest lots fill first).
      v_alloc := least(v_grant.amount, v_pool);
      v_pool := v_pool - v_alloc;

      v_threshold := v_grant.threshold;
      if v_threshold is null or v_threshold <= 0 then
        continue;
      end if;
      if v_alloc < v_threshold then
        continue;
      end if;

      v_dedupe := 'student:' || v_student.student_id
                  || ':package-signal:' || v_grant.grant_ledger_id;

      -- Fire once ever (ignore archived state).
      select exists (
        select 1 from public.tasks
         where tenant_id = p_tenant_id and dedupe_key = v_dedupe
      ) into v_exists;
      if v_exists then
        continue;
      end if;

      perform public.ensure_student_task(
        p_tenant_id,
        p_actor,
        v_student.student_id,
        v_dedupe,
        'Tegoed bijna op: ' || v_grant.package_name,
        'De leerling heeft de signaaldrempel voor pakket "'
          || v_grant.package_name
          || '" bereikt. Plan een opvolggesprek over verlenging of een nieuw pakket.',
        'normal'::public.task_priority,
        current_date
      );
      v_count := v_count + 1;
    end loop;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.ensure_package_signals(uuid, uuid) from public, anon, authenticated;
grant execute on function public.ensure_package_signals(uuid, uuid) to service_role;

commit;

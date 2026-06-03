-- ===========================================================================
-- Task #114 — Leerling self-service annuleren.
--
-- De bestaande cancel_lesson RPC (0015) autoriseert alleen staf/platform-admin
-- via _lesson_actor_authorized, dus een leerling/voogd kan zijn eigen les niet
-- afzeggen. Deze RPC laat de eigenaar-leerling (students.user_id) of een
-- gekoppelde voogd (student_guardians) dat zelf doen, met dezelfde
-- tenant-instelbare refundstaffel als de staf-flow, PLUS de afdwinging van
-- `min_notice_hours` uit `cancellation_policy` (waar de staf-RPC bewust niet op
-- gate). Identieke neveneffecten: refund-ledger (alleen bij refund > 0) en een
-- insert-only audit-rij. Service-role only — de server action stuurt de actor
-- door en de RPC her-valideert eigendom.
-- ===========================================================================

create or replace function public.student_cancel_lesson(
  p_lesson_id uuid,
  p_tenant_id uuid,
  p_actor     uuid,
  p_reason    text
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lesson         record;
  v_authorized     boolean;
  v_policy         jsonb;
  v_tier           jsonb;
  v_min_notice     numeric := 0;
  v_hours_before   numeric;
  v_refund_pct     integer := 0;
  v_refund_credits integer := 0;
  v_new_status     public.lesson_status;
begin
  -- Lock de les en haal de eigenaar op vóór de autorisatiecheck.
  select id, tenant_id, student_id, starts_at, status, credits_cost
    into v_lesson
    from public.lessons
   where id = p_lesson_id and tenant_id = p_tenant_id
   for update;
  if v_lesson.id is null then
    raise exception 'lesson % not found in tenant %', p_lesson_id, p_tenant_id;
  end if;

  -- Autorisatie: de leerling zelf, of een gekoppelde voogd (NIET via een losse
  -- membership-rij — alleen de echte eigenaar mag zijn eigen les afzeggen).
  v_authorized := exists (
      select 1 from public.students s
       where s.id = v_lesson.student_id
         and s.tenant_id = p_tenant_id
         and s.user_id = p_actor
    )
    or exists (
      select 1 from public.student_guardians g
       where g.student_id = v_lesson.student_id
         and g.tenant_id = p_tenant_id
         and g.user_id = p_actor
    );
  if not v_authorized then
    raise exception 'actor % not authorized to cancel lesson %', p_actor, p_lesson_id;
  end if;

  if v_lesson.status <> 'planned' then
    raise exception 'lesson % is not planned (status=%)', p_lesson_id, v_lesson.status;
  end if;

  v_hours_before := greatest(
    0,
    extract(epoch from (v_lesson.starts_at - now())) / 3600.0
  );

  select value into v_policy
    from public.tenant_settings
   where tenant_id = p_tenant_id and key = 'cancellation_policy';

  -- Minimale opzegtermijn afdwingen (alleen voor self-service; 0 = geen).
  v_min_notice := coalesce((v_policy ->> 'min_notice_hours')::numeric, 0);
  if v_min_notice > 0 and v_hours_before < v_min_notice then
    raise exception 'cancel too late: % hours before < min notice % hours',
      round(v_hours_before, 2), v_min_notice
      using errcode = 'check_violation';
  end if;

  if v_policy is not null then
    select tier into v_tier
      from jsonb_array_elements(v_policy -> 'tiers') as tier
     where v_hours_before >= (tier ->> 'hours_before')::numeric
     order by (tier ->> 'hours_before')::numeric desc
     limit 1;
    if v_tier is not null then
      v_refund_pct := coalesce((v_tier ->> 'refund_pct')::integer, 0);
    end if;
  end if;

  v_refund_credits := round(v_lesson.credits_cost * v_refund_pct / 100.0)::integer;
  if v_refund_credits < 0 then v_refund_credits := 0; end if;
  if v_refund_credits > v_lesson.credits_cost then
    v_refund_credits := v_lesson.credits_cost;
  end if;

  v_new_status := case
    when v_refund_credits > 0 then 'cancelled_with_refund'::public.lesson_status
    else 'cancelled_no_refund'::public.lesson_status
  end;

  update public.lessons
     set status                 = v_new_status,
         cancellation_reason    = p_reason,
         cancelled_hours_before = round(v_hours_before, 2),
         refunded_credits       = v_refund_credits
   where id = p_lesson_id and tenant_id = p_tenant_id;

  if v_refund_credits > 0 then
    insert into public.credit_ledger (
      tenant_id, student_id, delta, reason, related_type, related_id, note, actor_user_id
    ) values (
      p_tenant_id, v_lesson.student_id, v_refund_credits, 'lesson_refund',
      'lesson', v_lesson.id,
      format('Les zelf geannuleerd (%s%% refund, %s u vooraf)', v_refund_pct, round(v_hours_before, 1)),
      p_actor
    );
  end if;

  insert into public.audit_log (
    actor_user_id, tenant_id, action, target_type, target_id, payload
  ) values (
    p_actor, p_tenant_id, 'lesson.cancelled', 'lesson', p_lesson_id::text,
    jsonb_build_object(
      'reason',           p_reason,
      'hours_before',     round(v_hours_before, 2),
      'refund_pct',       v_refund_pct,
      'refunded_credits', v_refund_credits,
      'status',           v_new_status,
      'self_cancel',      true
    )
  );

  return v_refund_credits;
end;
$$;
revoke all on function public.student_cancel_lesson(uuid, uuid, uuid, text) from public;
revoke execute on function public.student_cancel_lesson(uuid, uuid, uuid, text) from anon, authenticated;
grant execute on function public.student_cancel_lesson(uuid, uuid, uuid, text) to service_role;

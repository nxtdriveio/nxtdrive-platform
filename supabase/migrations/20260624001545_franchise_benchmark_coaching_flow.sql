-- Benchmark coaching flow.
--
-- Extends benchmark actions from "create/accept/complete" into a full
-- coaching program: signal -> goal -> action plan -> check-ins -> result.

alter table public.franchise_benchmark_actions
  add column if not exists goal text,
  add column if not exists action_plan text,
  add column if not exists coaching_owner_label text not null default 'Franchise manager',
  add column if not exists target_metric_key text,
  add column if not exists target_value numeric,
  add column if not exists baseline_value numeric,
  add column if not exists latest_value numeric,
  add column if not exists target_due_date date,
  add column if not exists next_check_in_date date,
  add column if not exists result_status text not null default 'open',
  add column if not exists result_summary text,
  add column if not exists result_recorded_by uuid references auth.users(id) on delete set null,
  add column if not exists result_recorded_at timestamptz;

alter table public.franchise_benchmark_actions
  drop constraint if exists franchise_benchmark_actions_goal_length_check,
  add constraint franchise_benchmark_actions_goal_length_check
    check (goal is null or char_length(goal) <= 1200);

alter table public.franchise_benchmark_actions
  drop constraint if exists franchise_benchmark_actions_action_plan_length_check,
  add constraint franchise_benchmark_actions_action_plan_length_check
    check (action_plan is null or char_length(action_plan) <= 4000);

alter table public.franchise_benchmark_actions
  drop constraint if exists franchise_benchmark_actions_owner_length_check,
  add constraint franchise_benchmark_actions_owner_length_check
    check (char_length(coaching_owner_label) between 1 and 160);

alter table public.franchise_benchmark_actions
  drop constraint if exists franchise_benchmark_actions_target_metric_check,
  add constraint franchise_benchmark_actions_target_metric_check
    check (
      target_metric_key is null
      or target_metric_key in (
        'capacity_utilisation',
        'lead_conversion_rate',
        'exam_pass_rate',
        'current_lessons',
        'current_revenue_cents'
      )
    );

alter table public.franchise_benchmark_actions
  drop constraint if exists franchise_benchmark_actions_result_status_check,
  add constraint franchise_benchmark_actions_result_status_check
    check (result_status in ('open', 'on_track', 'at_risk', 'achieved', 'not_achieved', 'cancelled'));

alter table public.franchise_benchmark_actions
  drop constraint if exists franchise_benchmark_actions_result_summary_length_check,
  add constraint franchise_benchmark_actions_result_summary_length_check
    check (result_summary is null or char_length(result_summary) <= 4000);

create table if not exists public.franchise_benchmark_checkins (
  id uuid primary key default gen_random_uuid(),
  action_id uuid not null references public.franchise_benchmark_actions(id) on delete cascade,
  franchise_root_tenant_id uuid not null references public.tenants(id) on delete cascade,
  franchisee_tenant_id uuid not null references public.tenants(id) on delete cascade,
  checkin_type text not null default 'joint',
  status text not null default 'done',
  owner_label text not null default 'Franchise manager',
  note text not null,
  measured_value numeric,
  next_check_in_date date,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint franchise_benchmark_checkins_type_check
    check (checkin_type in ('central', 'local', 'joint')),
  constraint franchise_benchmark_checkins_status_check
    check (status in ('planned', 'done', 'blocked')),
  constraint franchise_benchmark_checkins_owner_length_check
    check (char_length(owner_label) between 1 and 160),
  constraint franchise_benchmark_checkins_note_length_check
    check (char_length(note) between 1 and 4000)
);

create index if not exists idx_franchise_benchmark_checkins_action
  on public.franchise_benchmark_checkins (action_id, created_at desc);

create index if not exists idx_franchise_benchmark_checkins_root
  on public.franchise_benchmark_checkins (franchise_root_tenant_id, created_at desc);

create index if not exists idx_franchise_benchmark_checkins_franchisee
  on public.franchise_benchmark_checkins (franchisee_tenant_id, created_at desc);

drop trigger if exists franchise_benchmark_checkins_set_updated_at
  on public.franchise_benchmark_checkins;
create trigger franchise_benchmark_checkins_set_updated_at
  before update on public.franchise_benchmark_checkins
  for each row execute function public.set_updated_at();

create or replace function public._check_franchise_benchmark_checkin_consistency()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_action public.franchise_benchmark_actions%rowtype;
begin
  select * into v_action
    from public.franchise_benchmark_actions
   where id = new.action_id;

  if v_action.id is null then
    raise exception 'benchmark_action_not_found';
  end if;

  if new.franchise_root_tenant_id <> v_action.franchise_root_tenant_id
     or new.franchisee_tenant_id <> v_action.franchisee_tenant_id then
    raise exception 'benchmark_checkin_wrong_network';
  end if;

  return new;
end;
$$;

revoke all on function public._check_franchise_benchmark_checkin_consistency() from public;
revoke all on function public._check_franchise_benchmark_checkin_consistency() from anon;
revoke all on function public._check_franchise_benchmark_checkin_consistency() from authenticated;

drop trigger if exists trg_franchise_benchmark_checkin_consistency
  on public.franchise_benchmark_checkins;
create trigger trg_franchise_benchmark_checkin_consistency
  before insert or update of action_id, franchise_root_tenant_id, franchisee_tenant_id
  on public.franchise_benchmark_checkins
  for each row execute function public._check_franchise_benchmark_checkin_consistency();

alter table public.franchise_benchmark_checkins enable row level security;

drop policy if exists franchise_benchmark_checkins_select
  on public.franchise_benchmark_checkins;
create policy franchise_benchmark_checkins_select
  on public.franchise_benchmark_checkins
  for select
  to authenticated
  using (
    public.is_platform_admin()
    or exists (
      select 1
        from public.memberships m
       where m.user_id = (select auth.uid())
         and m.tenant_id = franchise_benchmark_checkins.franchise_root_tenant_id
         and m.role in ('tenant_admin', 'franchise_admin')
    )
    or exists (
      select 1
        from public.memberships m
       where m.user_id = (select auth.uid())
         and m.tenant_id = franchise_benchmark_checkins.franchisee_tenant_id
         and m.role in ('tenant_admin', 'franchise_admin', 'branch_manager', 'planner', 'admin_staff', 'marketing')
    )
  );

revoke all on table public.franchise_benchmark_checkins from anon, authenticated;
grant select on table public.franchise_benchmark_checkins to authenticated;
grant all on table public.franchise_benchmark_checkins to service_role;

comment on column public.franchise_benchmark_actions.goal is
  'Concrete coaching goal agreed for this benchmark signal.';
comment on column public.franchise_benchmark_actions.action_plan is
  'Action plan for local execution and central coaching.';
comment on column public.franchise_benchmark_actions.result_status is
  'Final or current result status for the coaching flow.';
comment on table public.franchise_benchmark_checkins is
  'Audit-friendly check-ins for franchise benchmark coaching actions.';

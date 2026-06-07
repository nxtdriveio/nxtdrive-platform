-- Sprint 4D: branch-aware invoices, installment plans and payments.
--
-- `branch_id` is a financial reporting snapshot. New invoices inherit the
-- student's branch at creation time; payment records inherit the invoice branch.
-- Existing RPC signatures stay unchanged.

alter table public.invoices
  add column if not exists branch_id uuid null references public.branches(id) on delete set null;

alter table public.installment_plans
  add column if not exists branch_id uuid null references public.branches(id) on delete set null;

alter table public.payment_records
  add column if not exists branch_id uuid null references public.branches(id) on delete set null;

update public.invoices i
   set branch_id = s.branch_id
  from public.students s
 where i.student_id = s.id
   and i.tenant_id = s.tenant_id
   and i.branch_id is distinct from s.branch_id;

update public.installment_plans ip
   set branch_id = s.branch_id
  from public.students s
 where ip.student_id = s.id
   and ip.tenant_id = s.tenant_id
   and ip.branch_id is distinct from s.branch_id;

update public.payment_records pr
   set branch_id = i.branch_id
  from public.invoices i
 where pr.invoice_id = i.id
   and pr.tenant_id = i.tenant_id
   and pr.branch_id is distinct from i.branch_id;

create index if not exists idx_invoices_tenant_branch
  on public.invoices (tenant_id, branch_id)
  where branch_id is not null;

create index if not exists idx_invoices_tenant_branch_status
  on public.invoices (tenant_id, branch_id, status)
  where branch_id is not null;

create index if not exists idx_installment_plans_tenant_branch
  on public.installment_plans (tenant_id, branch_id)
  where branch_id is not null;

create index if not exists idx_payment_records_tenant_branch
  on public.payment_records (tenant_id, branch_id)
  where branch_id is not null;

create or replace function public.ensure_invoice_branch_tenant()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_branch_id uuid;
  v_tenant_id uuid;
begin
  if tg_table_name in ('invoices', 'installment_plans') then
    select s.branch_id
      into v_branch_id
      from public.students s
     where s.id = new.student_id
       and s.tenant_id = new.tenant_id;

    if not found then
      raise exception 'student_id must belong to the same tenant';
    end if;

    if new.branch_id is null then
      new.branch_id := v_branch_id;
    elsif v_branch_id is not null and new.branch_id <> v_branch_id then
      raise exception 'branch_id must match the student branch';
    elsif v_branch_id is null then
      raise exception 'branch_id cannot be set when the student has no branch';
    end if;
  elsif tg_table_name = 'payment_records' then
    select i.branch_id, i.tenant_id
      into v_branch_id, v_tenant_id
      from public.invoices i
     where i.id = new.invoice_id;

    if not found then
      raise exception 'invoice_id must reference an existing invoice';
    end if;

    if v_tenant_id <> new.tenant_id then
      raise exception 'invoice_id must belong to the same tenant';
    end if;

    if new.branch_id is null then
      new.branch_id := v_branch_id;
    elsif v_branch_id is distinct from new.branch_id then
      raise exception 'branch_id must match the invoice branch';
    end if;
  end if;

  if new.branch_id is not null and not exists (
    select 1
      from public.branches b
     where b.id = new.branch_id
       and b.tenant_id = new.tenant_id
  ) then
    raise exception 'branch_id must belong to the same tenant';
  end if;

  return new;
end;
$$;

drop trigger if exists invoices_branch_tenant_guard on public.invoices;
create trigger invoices_branch_tenant_guard
  before insert or update of tenant_id, student_id, branch_id on public.invoices
  for each row
  execute function public.ensure_invoice_branch_tenant();

drop trigger if exists installment_plans_branch_tenant_guard on public.installment_plans;
create trigger installment_plans_branch_tenant_guard
  before insert or update of tenant_id, student_id, branch_id on public.installment_plans
  for each row
  execute function public.ensure_invoice_branch_tenant();

drop trigger if exists payment_records_branch_tenant_guard on public.payment_records;
create trigger payment_records_branch_tenant_guard
  before insert or update of tenant_id, invoice_id, branch_id on public.payment_records
  for each row
  execute function public.ensure_invoice_branch_tenant();

comment on column public.invoices.branch_id is
  'Financial branch snapshot inherited from the billed student at invoice creation.';

comment on column public.installment_plans.branch_id is
  'Financial branch snapshot inherited from the billed student at plan creation.';

comment on column public.payment_records.branch_id is
  'Financial branch snapshot inherited from the related invoice.';

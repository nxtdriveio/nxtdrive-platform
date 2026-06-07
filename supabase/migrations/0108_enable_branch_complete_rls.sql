-- Sprint 4F safety net: ensure all branch-complete operational tables
-- actually enforce the restrictive branch policies from 0107.

alter table public.vehicles enable row level security;
alter table public.locations enable row level security;
alter table public.task_boards enable row level security;
alter table public.tasks enable row level security;
alter table public.task_links enable row level security;
alter table public.invoices enable row level security;
alter table public.invoice_lines enable row level security;
alter table public.installment_plans enable row level security;
alter table public.payment_records enable row level security;
alter table public.lessons enable row level security;
alter table public.agenda_appointments enable row level security;
alter table public.instructor_availability enable row level security;
alter table public.instructor_availability_exception enable row level security;

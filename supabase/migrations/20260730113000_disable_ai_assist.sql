-- AI assistance is intentionally disabled platform-wide until product,
-- privacy and quality validation have been completed. Deterministic advice
-- remains available and is labelled as such in the product.

alter table public.tenant_ris_settings
  alter column ai_assist_enabled set default false;

update public.tenant_ris_settings
set ai_assist_enabled = false,
    updated_at = now()
where ai_assist_enabled is distinct from false;

create or replace function public.enforce_ai_assist_disabled()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.ai_assist_enabled := false;
  return new;
end;
$$;

drop trigger if exists trg_enforce_ai_assist_disabled
  on public.tenant_ris_settings;

create trigger trg_enforce_ai_assist_disabled
before insert or update of ai_assist_enabled
on public.tenant_ris_settings
for each row
execute function public.enforce_ai_assist_disabled();

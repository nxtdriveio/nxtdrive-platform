-- 0006_indexes.sql
-- Indexes on every tenant_id column and the membership lookup paths.

create index if not exists idx_memberships_user_id    on public.memberships (user_id);
create index if not exists idx_memberships_tenant_id  on public.memberships (tenant_id);
create index if not exists idx_memberships_role       on public.memberships (tenant_id, role);

create index if not exists idx_tenant_settings_tenant on public.tenant_settings (tenant_id);
create index if not exists idx_tenant_branding_domain on public.tenant_branding (custom_domain) where custom_domain is not null;

create index if not exists idx_audit_log_tenant       on public.audit_log (tenant_id, created_at desc);
create index if not exists idx_audit_log_actor        on public.audit_log (actor_user_id, created_at desc);

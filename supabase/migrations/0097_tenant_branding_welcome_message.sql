-- ============================================================================
-- 0097_tenant_branding_welcome_message.sql
--
-- Voegt het nullable tekstveld `welcome_message` toe aan `tenant_branding`.
-- Tenant-admins kunnen hiermee een eigen welkomsttekst instellen die op de
-- (white-label) inlogpagina wordt getoond in plaats van de generieke fallback.
-- Max 120 tekens, afgedwongen via CHECK-constraint.
-- ============================================================================

alter table public.tenant_branding
  add column if not exists welcome_message text
    check (char_length(welcome_message) <= 120);

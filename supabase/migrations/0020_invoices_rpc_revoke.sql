-- 0020_invoices_rpc_revoke.sql
-- Hardening: Supabase applies default privileges that auto-grant EXECUTE on
-- new public-schema functions to `anon` and `authenticated`. The previous
-- `revoke all ... from public` in 0019 only removes the PUBLIC pseudo-grant,
-- not these explicit role grants. Without this, an authenticated user (e.g.
-- an instructor) could call the invoice RPCs directly, bypassing the
-- service-role mediation we rely on for audit_log writes.
--
-- All invoice RPCs must be executable by service_role only.

revoke execute on function public.create_invoice(uuid, uuid, uuid, date, text)
  from anon, authenticated;
revoke execute on function public.update_invoice_draft(uuid, uuid, uuid, date, text)
  from anon, authenticated;
revoke execute on function public.add_invoice_line(uuid, uuid, uuid, text, numeric, integer, integer, uuid)
  from anon, authenticated;
revoke execute on function public.remove_invoice_line(uuid, uuid, uuid)
  from anon, authenticated;
revoke execute on function public.set_invoice_status(uuid, uuid, uuid, public.invoice_status)
  from anon, authenticated;
revoke execute on function public._recalc_invoice_totals(uuid)
  from anon, authenticated;

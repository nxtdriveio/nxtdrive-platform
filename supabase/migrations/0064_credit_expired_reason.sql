-- 0064_credit_expired_reason.sql
-- Add the 'credit_expired' credit reason. ALTER TYPE ... ADD VALUE cannot be
-- used in the same transaction that adds it, so this lives in its own migration
-- (the runner gives each file its own transaction). The expiry function and the
-- breakdown view that USE this value are in 0065, applied afterwards.
alter type public.credit_reason add value if not exists 'credit_expired';

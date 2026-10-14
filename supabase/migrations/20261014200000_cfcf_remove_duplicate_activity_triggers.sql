-- CFCF PRODUCT: Keep one activity-log trigger per financial table.
-- The specialised row-change trigger provides human-readable descriptions and avoids
-- logging unrelated Share updates; the generic manager trigger remains for Funds,
-- Contacts and Fund adjustments.
DROP TRIGGER IF EXISTS cfcf_log_bills_action ON public.cfcf_bills;
DROP TRIGGER IF EXISTS cfcf_log_cycles_action ON public.cfcf_cycles;
DROP TRIGGER IF EXISTS cfcf_log_payments_action ON public.cfcf_payments;
DROP TRIGGER IF EXISTS cfcf_log_shares_action ON public.cfcf_shares;

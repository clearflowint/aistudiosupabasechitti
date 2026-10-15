-- CFCF: remove obsolete per-Share JSON billing storage.
-- Authoritative billing rows live in cfcf_bills; payments live in cfcf_payments.
-- Before applying, legacy JSON fields were verified empty across all current Share rows.
DROP TRIGGER IF EXISTS cfcf_stamp_billing_entry_dates ON public.cfcf_shares;
DROP FUNCTION IF EXISTS public.cfcf_stamp_billing_entry_dates();
ALTER TABLE public.cfcf_shares
  DROP COLUMN IF EXISTS billing_entries,
  DROP COLUMN IF EXISTS billing_entry_dates;

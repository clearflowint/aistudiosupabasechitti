-- CFCF PRODUCT: Remove the active-Fund deletion capability.
-- Fund records must be archived through the explicit archive workflow instead.
-- This drops only the unused delete RPC; it does not delete or modify any data.
DROP FUNCTION IF EXISTS public.cfcf_delete_fund_if_empty(text, text);

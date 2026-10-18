-- CFCF PRODUCT: Net Balance = net payments received - withdrawn - commissions.
-- Billing, pending, adjustments and manager personal-money ledger are excluded.
DO $migration$
DECLARE
  v_definition text;
  v_old text := 'v_net:=v_billed-v_withdrawn-v_pending-v_commissions;';
  v_new text := 'v_net:=v_net_payment_received-v_withdrawn-v_commissions;';
BEGIN
  SELECT pg_get_functiondef('public.cfcf_recalculate_fund_summary(text,text)'::regprocedure) INTO v_definition;
  IF position(v_old IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Prior CFCF Fund Net Balance formula not found; migration stopped.';
  END IF;
  EXECUTE replace(v_definition, v_old, v_new);
END;
$migration$;

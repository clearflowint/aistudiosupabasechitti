-- CFCF: relational cfcf_cycles/cfcf_bills are authoritative; remove legacy JSON arrays.
-- Cycle deletion never mutates shareholder payment rows. Fund archive stores the report,
-- then removes operational history as explicitly confirmed by the manager.
CREATE OR REPLACE FUNCTION public.cfcf_delete_highest_cycle(p_tenant_id text, p_fund_id text, p_cycle_number integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_max integer;
  v_cycle public.cfcf_cycles%ROWTYPE;
  v_new_current_cycle integer;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_active_tenant_owner('CFCF',p_tenant_id) THEN
    RAISE EXCEPTION 'Workspace owner access is required' USING ERRCODE='42501';
  END IF;
  PERFORM 1 FROM public.cfcf_funds
   WHERE product_id='CFCF' AND tenant_id=p_tenant_id AND fund_id=p_fund_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Fund not found or access denied' USING ERRCODE='42501'; END IF;

  SELECT MAX(cycle_number) INTO v_max FROM public.cfcf_cycles
   WHERE product_id='CFCF' AND tenant_id=p_tenant_id AND fund_id=p_fund_id;
  IF p_cycle_number IS DISTINCT FROM v_max THEN
    RAISE EXCEPTION 'Only the highest saved Cycle can be deleted';
  END IF;
  SELECT * INTO v_cycle FROM public.cfcf_cycles
   WHERE product_id='CFCF' AND tenant_id=p_tenant_id AND fund_id=p_fund_id AND cycle_number=p_cycle_number
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cycle not found'; END IF;

  -- Never alter shareholder payments. Only undo a payout explicitly assigned to this Cycle.
  UPDATE public.cfcf_shares
  SET payout_status='undrawn',payout_cycle_number=NULL,withdrawn_amount=0,updated_at=now()
  WHERE product_id='CFCF' AND tenant_id=p_tenant_id AND fund_id=p_fund_id
    AND payout_status='drawn' AND payout_cycle_number=p_cycle_number;

  SELECT COALESCE(MAX(c.cycle_number),0) INTO v_new_current_cycle
  FROM public.cfcf_cycles c
  WHERE c.product_id='CFCF' AND c.tenant_id=p_tenant_id AND c.fund_id=p_fund_id
    AND c.cycle_number<p_cycle_number;

  DELETE FROM public.cfcf_cycles
  WHERE cycle_id=v_cycle.cycle_id AND product_id='CFCF' AND tenant_id=p_tenant_id AND fund_id=p_fund_id;

  UPDATE public.cfcf_funds
  SET current_cycle=v_new_current_cycle,updated_at=now()
  WHERE product_id='CFCF' AND tenant_id=p_tenant_id AND fund_id=p_fund_id;

  PERFORM public.cfcf_recalculate_fund_summary(p_tenant_id,p_fund_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.cfcf_archive_fund_with_report(p_tenant_id text, p_fund_id text, p_report_html text)
RETURNS public.cfcf_archived_funds
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_fund public.cfcf_funds%ROWTYPE;
  v_archive public.cfcf_archived_funds%ROWTYPE;
BEGIN
  IF NOT public.is_active_tenant_owner('CFCF', p_tenant_id) THEN
    RAISE EXCEPTION 'Only the active tenant owner can archive a Fund.';
  END IF;
  IF p_report_html IS NULL OR length(trim(p_report_html)) < 100 THEN
    RAISE EXCEPTION 'The complete Fund report is not ready to archive.';
  END IF;
  SELECT * INTO v_fund FROM public.cfcf_funds
  WHERE product_id='CFCF' AND tenant_id=p_tenant_id AND fund_id=p_fund_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Fund not found or access denied.'; END IF;
  IF v_fund.archived_at IS NOT NULL OR v_fund.status='archived' THEN
    RAISE EXCEPTION 'This Fund is already archived.';
  END IF;

  INSERT INTO public.cfcf_archived_funds(product_id,tenant_id,fund_id,fund_name,report_html)
  VALUES('CFCF',p_tenant_id,v_fund.fund_id,v_fund.fund_name,p_report_html)
  RETURNING * INTO v_archive;

  DELETE FROM public.cfcf_activity_log
  WHERE product_id='CFCF' AND tenant_id=p_tenant_id
    AND (
      entity_id=p_fund_id
      OR entity_id IN (SELECT s.share_id FROM public.cfcf_shares s WHERE s.product_id='CFCF' AND s.tenant_id=p_tenant_id AND s.fund_id=p_fund_id)
      OR entity_id IN (SELECT c.cycle_id::text FROM public.cfcf_cycles c WHERE c.product_id='CFCF' AND c.tenant_id=p_tenant_id AND c.fund_id=p_fund_id)
      OR entity_id IN (SELECT b.bill_id::text FROM public.cfcf_bills b WHERE b.product_id='CFCF' AND b.tenant_id=p_tenant_id AND b.fund_id=p_fund_id)
      OR entity_id IN (SELECT p.payment_id FROM public.cfcf_payments p WHERE p.product_id='CFCF' AND p.tenant_id=p_tenant_id AND p.fund_id=p_fund_id)
      OR entity_id IN (SELECT e.entry_id FROM public.cfcf_fund_other_entries e WHERE e.product_id='CFCF' AND e.tenant_id=p_tenant_id AND e.fund_id=p_fund_id)
    );

  DELETE FROM public.cfcf_bills WHERE product_id='CFCF' AND tenant_id=p_tenant_id AND fund_id=p_fund_id;
  DELETE FROM public.cfcf_payments WHERE product_id='CFCF' AND tenant_id=p_tenant_id AND fund_id=p_fund_id;
  DELETE FROM public.cfcf_fund_other_entries WHERE product_id='CFCF' AND tenant_id=p_tenant_id AND fund_id=p_fund_id;
  DELETE FROM public.cfcf_shares WHERE product_id='CFCF' AND tenant_id=p_tenant_id AND fund_id=p_fund_id;
  DELETE FROM public.cfcf_cycles WHERE product_id='CFCF' AND tenant_id=p_tenant_id AND fund_id=p_fund_id;

  UPDATE public.cfcf_funds
  SET person_id=NULL,fund_name=NULL,start_date=NULL,number_of_cycles=NULL,number_of_shares=NULL,
      current_cycle=0,fund_net_balance=0,fund_total_billed_amount=0,fund_total_pending_amount=0,
      fund_total_advance=0,fund_total_withdrawn=0,fund_total_commissions=0,other_amount=0,
      status='archived',archived_at=now(),updated_at=now()
  WHERE product_id='CFCF' AND tenant_id=p_tenant_id AND fund_id=p_fund_id;
  RETURN v_archive;
END;
$function$;

ALTER TABLE public.cfcf_funds
  DROP CONSTRAINT IF EXISTS cfcf_funds_cycle_arrays_check,
  DROP COLUMN IF EXISTS cycle_payout_amounts,
  DROP COLUMN IF EXISTS cycle_commissions;

-- CFCF PRODUCT: Finish moving payout validation and safe deletion guards to relational records.

CREATE OR REPLACE FUNCTION public.cfcf_set_share_payout(
  p_tenant_id text, p_fund_id text, p_share_id text,
  p_payout_status text, p_payout_cycle_number integer, p_withdrawn_amount integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_summary jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_active_tenant_owner('CFCF',p_tenant_id) THEN
    RAISE EXCEPTION 'Workspace owner access is required to update payout status' USING ERRCODE='42501';
  END IF;
  IF p_payout_status NOT IN ('drawn','undrawn') THEN
    RAISE EXCEPTION 'Payout status must be drawn or undrawn' USING ERRCODE='22023';
  END IF;
  IF p_withdrawn_amount IS NULL OR p_withdrawn_amount<0 OR p_withdrawn_amount>2147483647 THEN
    RAISE EXCEPTION 'Withdrawn amount must be between zero and the supported whole-rupee limit' USING ERRCODE='22023';
  END IF;
  PERFORM 1 FROM public.cfcf_funds
    WHERE product_id='CFCF' AND tenant_id=p_tenant_id AND fund_id=p_fund_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Fund not found in this workspace'; END IF;
  PERFORM 1 FROM public.cfcf_shares
    WHERE product_id='CFCF' AND tenant_id=p_tenant_id AND fund_id=p_fund_id AND share_id=p_share_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Share not found in the selected Fund'; END IF;

  IF p_payout_status='drawn' THEN
    IF p_payout_cycle_number IS NULL OR p_payout_cycle_number<1 THEN
      RAISE EXCEPTION 'Choose a valid saved Cycle for this payout' USING ERRCODE='22023';
    END IF;
    IF NOT EXISTS(SELECT 1 FROM public.cfcf_cycles c
      WHERE c.product_id='CFCF' AND c.tenant_id=p_tenant_id AND c.fund_id=p_fund_id
        AND c.cycle_number=p_payout_cycle_number) THEN
      RAISE EXCEPTION 'Payout must reference an existing Cycle' USING ERRCODE='22023';
    END IF;
    UPDATE public.cfcf_shares
    SET payout_status='drawn',payout_cycle_number=p_payout_cycle_number,
        withdrawn_amount=p_withdrawn_amount,updated_at=now()
    WHERE product_id='CFCF' AND tenant_id=p_tenant_id AND fund_id=p_fund_id AND share_id=p_share_id;
  ELSE
    UPDATE public.cfcf_shares
    SET payout_status='undrawn',payout_cycle_number=NULL,withdrawn_amount=0,updated_at=now()
    WHERE product_id='CFCF' AND tenant_id=p_tenant_id AND fund_id=p_fund_id AND share_id=p_share_id;
  END IF;
  v_summary:=public.cfcf_recalculate_fund_summary(p_tenant_id,p_fund_id);
  RETURN jsonb_build_object('share_id',p_share_id,'payout_status',p_payout_status,
    'payout_cycle_number',CASE WHEN p_payout_status='drawn' THEN p_payout_cycle_number ELSE NULL END,
    'withdrawn_amount',CASE WHEN p_payout_status='drawn' THEN p_withdrawn_amount ELSE 0 END,
    'fund_summary',v_summary);
END;
$function$;

CREATE OR REPLACE FUNCTION public.cfcf_delete_share_if_empty(p_tenant_id text, p_fund_id text, p_share_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_active_tenant_owner('CFCF',p_tenant_id) THEN
    RAISE EXCEPTION 'Active tenant owner access is required' USING ERRCODE='42501';
  END IF;
  PERFORM 1 FROM public.cfcf_funds WHERE product_id='CFCF' AND tenant_id=p_tenant_id AND fund_id=p_fund_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Fund not found or access denied' USING ERRCODE='42501'; END IF;
  PERFORM 1 FROM public.cfcf_shares WHERE product_id='CFCF' AND tenant_id=p_tenant_id AND fund_id=p_fund_id AND share_id=p_share_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Share not found in this Fund'; END IF;
  IF EXISTS (SELECT 1 FROM public.cfcf_payments p WHERE p.product_id='CFCF' AND p.tenant_id=p_tenant_id AND p.fund_id=p_fund_id AND p.share_id=p_share_id)
     OR EXISTS (SELECT 1 FROM public.cfcf_bills b WHERE b.product_id='CFCF' AND b.tenant_id=p_tenant_id AND b.fund_id=p_fund_id AND b.share_id=p_share_id)
     OR EXISTS (SELECT 1 FROM public.cfcf_shares s WHERE s.product_id='CFCF' AND s.tenant_id=p_tenant_id AND s.fund_id=p_fund_id AND s.share_id=p_share_id
       AND (s.payout_status<>'undrawn' OR s.withdrawn_amount<>0 OR s.payout_cycle_number IS NOT NULL
         OR s.share_total_billed_amount<>0 OR s.share_net_payment_received<>0 OR s.total_pending<>0 OR s.total_advance<>0)) THEN
    RAISE EXCEPTION 'This Share has financial history. Deletion is blocked to preserve the ledger.';
  END IF;
  DELETE FROM public.cfcf_shares
  WHERE product_id='CFCF' AND tenant_id=p_tenant_id AND fund_id=p_fund_id AND share_id=p_share_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Share could not be deleted; verify owner access.' USING ERRCODE='42501'; END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.cfcf_delete_fund_if_empty(p_tenant_id text, p_fund_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_active_tenant_owner('CFCF',p_tenant_id) THEN
    RAISE EXCEPTION 'Active tenant owner access is required' USING ERRCODE='42501';
  END IF;
  PERFORM 1 FROM public.cfcf_funds WHERE product_id='CFCF' AND tenant_id=p_tenant_id AND fund_id=p_fund_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Fund not found or access denied' USING ERRCODE='42501'; END IF;
  IF EXISTS (SELECT 1 FROM public.cfcf_shares s WHERE s.product_id='CFCF' AND s.tenant_id=p_tenant_id AND s.fund_id=p_fund_id)
     OR EXISTS (SELECT 1 FROM public.cfcf_payments p WHERE p.product_id='CFCF' AND p.tenant_id=p_tenant_id AND p.fund_id=p_fund_id)
     OR EXISTS (SELECT 1 FROM public.cfcf_fund_other_entries e WHERE e.product_id='CFCF' AND e.tenant_id=p_tenant_id AND e.fund_id=p_fund_id)
     OR EXISTS (SELECT 1 FROM public.cfcf_cycles c WHERE c.product_id='CFCF' AND c.tenant_id=p_tenant_id AND c.fund_id=p_fund_id)
     OR EXISTS (SELECT 1 FROM public.cfcf_bills b WHERE b.product_id='CFCF' AND b.tenant_id=p_tenant_id AND b.fund_id=p_fund_id) THEN
    RAISE EXCEPTION 'Fund contains Shares, payments, adjustments, or saved Cycle records. Deletion is blocked to preserve history.';
  END IF;
  DELETE FROM public.cfcf_funds WHERE product_id='CFCF' AND tenant_id=p_tenant_id AND fund_id=p_fund_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Fund could not be deleted; verify owner access.' USING ERRCODE='42501'; END IF;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.cfcf_set_share_payout(text,text,text,text,integer,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cfcf_delete_share_if_empty(text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cfcf_delete_fund_if_empty(text,text) TO authenticated;

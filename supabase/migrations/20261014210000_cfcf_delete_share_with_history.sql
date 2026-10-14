CREATE OR REPLACE FUNCTION public.cfcf_delete_share_with_history(
  p_tenant_id text,
  p_fund_id text,
  p_share_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_payment_count integer;
  v_bill_count integer;
  v_summary jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_active_tenant_owner('CFCF', p_tenant_id) THEN
    RAISE EXCEPTION 'Active tenant owner access is required' USING ERRCODE = '42501';
  END IF;
  PERFORM 1 FROM public.cfcf_funds
   WHERE product_id = 'CFCF' AND tenant_id = p_tenant_id AND fund_id = p_fund_id
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Fund not found or access denied' USING ERRCODE = '42501'; END IF;
  PERFORM 1 FROM public.cfcf_shares
   WHERE product_id = 'CFCF' AND tenant_id = p_tenant_id AND fund_id = p_fund_id AND share_id = p_share_id
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Share not found in this Fund'; END IF;

  SELECT count(*) INTO v_payment_count FROM public.cfcf_payments
   WHERE product_id = 'CFCF' AND tenant_id = p_tenant_id AND fund_id = p_fund_id AND share_id = p_share_id;
  SELECT count(*) INTO v_bill_count FROM public.cfcf_bills
   WHERE product_id = 'CFCF' AND tenant_id = p_tenant_id AND fund_id = p_fund_id AND share_id = p_share_id;

  -- The UI requires a three-step confirmation. Delete only the selected Share's bills and payments.
  -- Keep the Fund/Cycle rows and activity audit records; delete activity triggers record these removals.
  DELETE FROM public.cfcf_payments
   WHERE product_id = 'CFCF' AND tenant_id = p_tenant_id AND fund_id = p_fund_id AND share_id = p_share_id;
  DELETE FROM public.cfcf_bills
   WHERE product_id = 'CFCF' AND tenant_id = p_tenant_id AND fund_id = p_fund_id AND share_id = p_share_id;
  DELETE FROM public.cfcf_shares
   WHERE product_id = 'CFCF' AND tenant_id = p_tenant_id AND fund_id = p_fund_id AND share_id = p_share_id;

  v_summary := public.cfcf_recalculate_fund_summary(p_tenant_id, p_fund_id);
  RETURN jsonb_build_object('share_id', p_share_id, 'deleted_payments', v_payment_count,
    'deleted_bills', v_bill_count, 'fund_summary', v_summary);
END;
$function$;
REVOKE ALL ON FUNCTION public.cfcf_delete_share_with_history(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cfcf_delete_share_with_history(text, text, text) TO authenticated;
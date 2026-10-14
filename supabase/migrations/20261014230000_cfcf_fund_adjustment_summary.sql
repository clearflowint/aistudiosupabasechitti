CREATE OR REPLACE FUNCTION public.cfcf_get_fund_other_adjustment_summary(
  p_tenant_id text,
  p_fund_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_credits bigint;
  v_debits bigint;
  v_net bigint;
  v_count bigint;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_active_tenant_owner('CFCF', p_tenant_id) THEN
    RAISE EXCEPTION 'Workspace owner access is required' USING ERRCODE='42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.cfcf_funds
    WHERE product_id='CFCF' AND tenant_id=p_tenant_id AND fund_id=p_fund_id
  ) THEN
    RAISE EXCEPTION 'Fund not found in this workspace';
  END IF;

  SELECT
    count(*),
    COALESCE(sum(CASE WHEN entry_type='credit' THEN amount::bigint ELSE 0 END),0),
    COALESCE(sum(CASE WHEN entry_type='debit' THEN amount::bigint ELSE 0 END),0),
    COALESCE(sum(CASE WHEN entry_type='credit' THEN amount::bigint ELSE -amount::bigint END),0)
  INTO v_count,v_credits,v_debits,v_net
  FROM public.cfcf_fund_other_entries
  WHERE product_id='CFCF' AND tenant_id=p_tenant_id AND fund_id=p_fund_id;

  RETURN jsonb_build_object(
    'entry_count',v_count,
    'total_credits',v_credits,
    'total_debits',v_debits,
    'net_adjustments',v_net
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.cfcf_get_fund_other_adjustment_summary(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cfcf_get_fund_other_adjustment_summary(text,text) TO authenticated;

-- CFCF PRODUCT: Validate saved Cycle value arrays before editing them.
-- SKELETON: Explicit transaction boundary; no triggers or new tables.
-- MIX: Keeps the current Fund JSONB schema while rejecting malformed historical values.

CREATE OR REPLACE FUNCTION public.cfcf_save_cycle_values(
 p_tenant_id text,
 p_fund_id text,
 p_cycle_number integer,
 p_payout_amount integer,
 p_commission_amount integer
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
 v_fund public.cfcf_funds%ROWTYPE;
 v_payouts jsonb;
 v_commissions jsonb;
 v_summary jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_active_tenant_owner('CFCF',p_tenant_id) THEN
  RAISE EXCEPTION 'Workspace owner access is required' USING ERRCODE='42501';
 END IF;
 IF p_cycle_number IS NULL OR p_cycle_number<1 OR p_cycle_number>500 THEN
  RAISE EXCEPTION 'Cycle number must be between 1 and 500' USING ERRCODE='22023';
 END IF;
 IF p_payout_amount IS NOT NULL AND p_payout_amount<0 THEN
  RAISE EXCEPTION 'Payout amount must be nonnegative or blank' USING ERRCODE='22023';
 END IF;
 IF p_commission_amount IS NOT NULL AND p_commission_amount<0 THEN
  RAISE EXCEPTION 'Commission must be nonnegative or blank' USING ERRCODE='22023';
 END IF;

 SELECT * INTO v_fund
 FROM public.cfcf_funds
 WHERE fund_id=p_fund_id AND tenant_id=p_tenant_id AND product_id='CFCF'
 FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Fund not found in this workspace'; END IF;

 v_payouts:=COALESCE(v_fund.cycle_payout_amounts,'[]'::jsonb);
 v_commissions:=COALESCE(v_fund.cycle_commissions,'[]'::jsonb);
 IF jsonb_typeof(v_payouts)<>'array' OR jsonb_typeof(v_commissions)<>'array' THEN
  RAISE EXCEPTION 'Saved Cycle values are not arrays; review them before editing';
 END IF;

 -- Reject malformed historical values rather than silently replacing or hiding them.
 IF EXISTS (
  SELECT 1 FROM jsonb_array_elements(v_payouts) AS e(value)
  WHERE e.value<>'null'::jsonb
    AND (jsonb_typeof(e.value)<>'number'
      OR (e.value #>> '{}') !~ '^[0-9]+$'
      OR (e.value #>> '{}')::numeric>2147483647)
 ) THEN
  RAISE EXCEPTION 'Saved Cycle payout values contain an unsupported amount; review existing values before editing';
 END IF;
 IF EXISTS (
  SELECT 1 FROM jsonb_array_elements(v_commissions) AS e(value)
  WHERE e.value<>'null'::jsonb
    AND (jsonb_typeof(e.value)<>'number'
      OR (e.value #>> '{}') !~ '^[0-9]+$'
      OR (e.value #>> '{}')::numeric>2147483647)
 ) THEN
  RAISE EXCEPTION 'Saved Cycle commission values contain an unsupported amount; review existing values before editing';
 END IF;

 WHILE jsonb_array_length(v_payouts)<p_cycle_number LOOP
  v_payouts:=v_payouts||'null'::jsonb;
 END LOOP;
 WHILE jsonb_array_length(v_commissions)<p_cycle_number LOOP
  v_commissions:=v_commissions||'null'::jsonb;
 END LOOP;
 v_payouts:=jsonb_set(v_payouts,ARRAY[(p_cycle_number-1)::text],COALESCE(to_jsonb(p_payout_amount),'null'::jsonb),true);
 v_commissions:=jsonb_set(v_commissions,ARRAY[(p_cycle_number-1)::text],COALESCE(to_jsonb(p_commission_amount),'null'::jsonb),true);

 UPDATE public.cfcf_funds
 SET cycle_payout_amounts=v_payouts,
     cycle_commissions=v_commissions,
     current_cycle=GREATEST(COALESCE(current_cycle,0),p_cycle_number),
     updated_at=now()
 WHERE fund_id=p_fund_id AND tenant_id=p_tenant_id AND product_id='CFCF';

 v_summary:=public.cfcf_recalculate_fund_summary(p_tenant_id,p_fund_id);
 RETURN jsonb_build_object(
  'fund_id',p_fund_id,
  'cycle_number',p_cycle_number,
  'payout_amount',p_payout_amount,
  'commission_amount',p_commission_amount,
  'summary',v_summary
 );
END;
$function$;

REVOKE ALL ON FUNCTION public.cfcf_save_cycle_values(text,text,integer,integer,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cfcf_save_cycle_values(text,text,integer,integer,integer) TO authenticated;

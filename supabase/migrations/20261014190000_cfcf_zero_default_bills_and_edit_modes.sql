-- CFCF billing semantics: a saved Cycle always starts with one zero-value bill per active Share.
-- Bill creation/editing never writes to cfcf_payments or fund credit/debit entries.
CREATE OR REPLACE FUNCTION public.cfcf_add_cycle(p_tenant_id text, p_fund_id text)
RETURNS public.cfcf_cycles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_next integer;
  v_cycle public.cfcf_cycles%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_active_tenant_owner('CFCF',p_tenant_id) THEN
    RAISE EXCEPTION 'Workspace owner access is required' USING ERRCODE='42501';
  END IF;
  PERFORM 1 FROM public.cfcf_funds
   WHERE fund_id=p_fund_id AND tenant_id=p_tenant_id AND product_id='CFCF'
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Fund not found or access denied' USING ERRCODE='42501'; END IF;

  SELECT COALESCE(MAX(cycle_number),0)+1 INTO v_next
  FROM public.cfcf_cycles
  WHERE fund_id=p_fund_id AND tenant_id=p_tenant_id AND product_id='CFCF';

  INSERT INTO public.cfcf_cycles(product_id,tenant_id,fund_id,cycle_number)
  VALUES('CFCF',p_tenant_id,p_fund_id,v_next)
  RETURNING * INTO v_cycle;

  INSERT INTO public.cfcf_bills(product_id,tenant_id,fund_id,cycle_id,share_id,amount,bill_date)
  SELECT 'CFCF',p_tenant_id,p_fund_id,v_cycle.cycle_id,s.share_id,0,current_date
  FROM public.cfcf_shares s
  WHERE s.product_id='CFCF' AND s.tenant_id=p_tenant_id
    AND s.fund_id=p_fund_id AND s.status='active'
  ON CONFLICT (tenant_id,fund_id,cycle_id,share_id) DO NOTHING;

  PERFORM public.cfcf_recalculate_fund_summary(p_tenant_id,p_fund_id);
  RETURN v_cycle;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.cfcf_add_cycle(text,text) TO authenticated;

-- Save every active Share's bill as a concrete row. Blank values are normalized by the UI to zero;
-- server requires a complete one-row-per-active-Share payload and never deletes bills on save.
CREATE OR REPLACE FUNCTION public.cfcf_save_cycle_workspace(
  p_tenant_id text,
  p_fund_id text,
  p_cycle_number integer,
  p_planned_payout_amount integer,
  p_commission_amount integer,
  p_bills jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_cycle public.cfcf_cycles%ROWTYPE;
  v_summary jsonb;
  v_bill_count integer;
  v_unique_share_count integer;
  v_active_share_count integer;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_active_tenant_owner('CFCF',p_tenant_id) THEN
    RAISE EXCEPTION 'Workspace owner access is required' USING ERRCODE='42501';
  END IF;
  IF p_cycle_number IS NULL OR p_cycle_number<1
    OR (p_planned_payout_amount IS NOT NULL AND p_planned_payout_amount<0)
    OR (p_commission_amount IS NOT NULL AND p_commission_amount<0)
    OR jsonb_typeof(p_bills) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Cycle values or bill list are invalid' USING ERRCODE='22023';
  END IF;

  PERFORM 1 FROM public.cfcf_funds
   WHERE product_id='CFCF' AND tenant_id=p_tenant_id AND fund_id=p_fund_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Fund not found in this workspace'; END IF;

  SELECT * INTO v_cycle FROM public.cfcf_cycles
   WHERE product_id='CFCF' AND tenant_id=p_tenant_id AND fund_id=p_fund_id
     AND cycle_number=p_cycle_number FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cycle not found; add the Cycle first'; END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_bills) e(value)
    WHERE jsonb_typeof(e.value) IS DISTINCT FROM 'object'
      OR NULLIF(e.value->>'share_id','') IS NULL
      OR jsonb_typeof(e.value->'amount') IS DISTINCT FROM 'number'
      OR (e.value->>'amount') IS NULL
      OR (e.value->>'amount') !~ '^[0-9]+$'
      OR (e.value->>'amount')::numeric>2147483647
  ) THEN
    RAISE EXCEPTION 'Every bill must contain a Share ID and a nonnegative whole-rupee amount' USING ERRCODE='22023';
  END IF;

  SELECT count(*),count(DISTINCT e.value->>'share_id')
  INTO v_bill_count,v_unique_share_count
  FROM jsonb_array_elements(p_bills) e(value);
  IF v_bill_count <> v_unique_share_count THEN
    RAISE EXCEPTION 'A Share can have only one bill in this Cycle' USING ERRCODE='23505';
  END IF;

  SELECT count(*) INTO v_active_share_count FROM public.cfcf_shares s
  WHERE s.product_id='CFCF' AND s.tenant_id=p_tenant_id
    AND s.fund_id=p_fund_id AND s.status='active';
  IF v_bill_count <> v_active_share_count THEN
    RAISE EXCEPTION 'A bill row is required for every active Share; use zero for an unbilled Share' USING ERRCODE='22023';
  END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_bills) e(value)
    WHERE NOT EXISTS (
      SELECT 1 FROM public.cfcf_shares s
      WHERE s.product_id='CFCF' AND s.tenant_id=p_tenant_id AND s.fund_id=p_fund_id
        AND s.share_id=e.value->>'share_id' AND s.status='active'
    )
  ) THEN
    RAISE EXCEPTION 'A bill references a Share outside this active Fund' USING ERRCODE='42501';
  END IF;

  UPDATE public.cfcf_cycles
  SET planned_payout_amount=p_planned_payout_amount,
      commission_amount=p_commission_amount,
      updated_at=now()
  WHERE cycle_id=v_cycle.cycle_id
    AND (planned_payout_amount IS DISTINCT FROM p_planned_payout_amount
      OR commission_amount IS DISTINCT FROM p_commission_amount);

  INSERT INTO public.cfcf_bills(product_id,tenant_id,fund_id,cycle_id,share_id,amount,bill_date)
  SELECT 'CFCF',p_tenant_id,p_fund_id,v_cycle.cycle_id,e.value->>'share_id',
         (e.value->>'amount')::integer,current_date
  FROM jsonb_array_elements(p_bills) e(value)
  ON CONFLICT (tenant_id,fund_id,cycle_id,share_id)
  DO UPDATE SET amount=EXCLUDED.amount,updated_at=now()
    WHERE public.cfcf_bills.amount IS DISTINCT FROM EXCLUDED.amount;

  v_summary:=public.cfcf_recalculate_fund_summary(p_tenant_id,p_fund_id);
  RETURN jsonb_build_object(
    'cycle_id',v_cycle.cycle_id,'cycle_number',p_cycle_number,
    'planned_payout_amount',p_planned_payout_amount,'commission_amount',p_commission_amount,
    'saved_bill_count',jsonb_array_length(p_bills),'summary',v_summary
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.cfcf_save_cycle_workspace(text,text,integer,integer,integer,jsonb) TO authenticated;

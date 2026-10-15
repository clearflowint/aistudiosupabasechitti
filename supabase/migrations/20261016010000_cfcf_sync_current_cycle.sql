-- Keep the Fund's current_cycle aligned with saved relational Cycle rows.
-- A Fund with no saved Cycles uses 0 as the empty-state sentinel; real Cycle numbers start at 1.
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
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Fund not found or access denied' USING ERRCODE='42501';
  END IF;

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

  UPDATE public.cfcf_funds
  SET current_cycle=v_next,updated_at=now()
  WHERE product_id='CFCF' AND tenant_id=p_tenant_id AND fund_id=p_fund_id;

  PERFORM public.cfcf_recalculate_fund_summary(p_tenant_id,p_fund_id);
  RETURN v_cycle;
END;
$function$;

-- Repair stale current_cycle summaries from actual saved Cycle rows.
-- Funds without any saved Cycles remain at 0; cycle 0 is never a Cycle record.
UPDATE public.cfcf_funds f
SET current_cycle = COALESCE((
  SELECT MAX(c.cycle_number)
  FROM public.cfcf_cycles c
  WHERE c.product_id=f.product_id
    AND c.tenant_id=f.tenant_id
    AND c.fund_id=f.fund_id
),0),
updated_at=now()
WHERE f.product_id='CFCF'
  AND f.current_cycle IS DISTINCT FROM COALESCE((
    SELECT MAX(c.cycle_number)
    FROM public.cfcf_cycles c
    WHERE c.product_id=f.product_id
      AND c.tenant_id=f.tenant_id
      AND c.fund_id=f.fund_id
  ),0);

ALTER TABLE public.cfcf_fund_other_entries
  ADD COLUMN IF NOT EXISTS adjustment_category text;

ALTER TABLE public.cfcf_fund_other_entries
  DROP CONSTRAINT IF EXISTS cfcf_fund_other_entries_adjustment_category_check;

ALTER TABLE public.cfcf_fund_other_entries
  ADD CONSTRAINT cfcf_fund_other_entries_adjustment_category_check
  CHECK (adjustment_category IN ('outside_money','commission','discount','stationery','others'));

DROP FUNCTION IF EXISTS public.cfcf_record_fund_other_entry(text,text,text,text,integer,text);

CREATE OR REPLACE FUNCTION public.cfcf_record_fund_other_entry(
  p_tenant_id text, p_fund_id text, p_person_id text, p_entry_type text,
  p_amount integer, p_remarks text, p_adjustment_category text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_entry_id text; v_created_at timestamptz;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_active_tenant_owner('CFCF',p_tenant_id) THEN
    RAISE EXCEPTION 'Workspace owner access is required' USING ERRCODE='42501';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.persons WHERE person_id=p_person_id AND tenant_id=p_tenant_id AND product_id='CFCF' AND status='active') THEN
    RAISE EXCEPTION 'Active manager person is required for adjustment attribution' USING ERRCODE='42501';
  END IF;
  IF p_entry_type NOT IN ('credit','debit') OR p_amount IS NULL OR p_amount<=0 THEN
    RAISE EXCEPTION 'Choose Credit or Debit and enter a positive whole-rupee amount' USING ERRCODE='22023';
  END IF;
  IF p_adjustment_category IS NULL OR p_adjustment_category NOT IN ('outside_money','commission','discount','stationery','others') THEN
    RAISE EXCEPTION 'Choose an adjustment category' USING ERRCODE='22023';
  END IF;
  IF length(coalesce(p_remarks,''))>500 THEN
    RAISE EXCEPTION 'Remarks must be 500 characters or fewer' USING ERRCODE='22023';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.cfcf_funds WHERE fund_id=p_fund_id AND tenant_id=p_tenant_id AND product_id='CFCF') THEN
    RAISE EXCEPTION 'Fund not found in this workspace';
  END IF;
  v_entry_id:=upper(replace(gen_random_uuid()::text,'-',''));
  INSERT INTO public.cfcf_fund_other_entries(entry_id,product_id,tenant_id,person_id,fund_id,entry_type,amount,remarks,adjustment_category)
  VALUES(v_entry_id,'CFCF',p_tenant_id,p_person_id,p_fund_id,p_entry_type,p_amount,NULLIF(btrim(p_remarks),''),p_adjustment_category)
  RETURNING created_at INTO v_created_at;
  -- This is an independent Other Adjustments ledger. Never recalculate Fund financial summaries here.
  RETURN jsonb_build_object('entry_id',v_entry_id,'entry_type',p_entry_type,'amount',p_amount,'adjustment_category',p_adjustment_category,'created_at',v_created_at);
END;
$function$;
REVOKE ALL ON FUNCTION public.cfcf_record_fund_other_entry(text,text,text,text,integer,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cfcf_record_fund_other_entry(text,text,text,text,integer,text,text) TO authenticated;
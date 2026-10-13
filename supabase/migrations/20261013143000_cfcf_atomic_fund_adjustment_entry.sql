-- CFCF PRODUCT: Fund-level credits/debits remain separate from Share Payments.
-- MIX: The adjustment row and Fund other_amount summary commit atomically.
CREATE OR REPLACE FUNCTION public.cfcf_record_fund_other_entry(
 p_tenant_id text,p_fund_id text,p_person_id text,p_entry_type text,p_amount integer,p_remarks text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path TO 'public'
AS $function$
DECLARE v_fund public.cfcf_funds%ROWTYPE; v_entry_id text; v_summary jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_active_tenant_owner('CFCF',p_tenant_id) THEN RAISE EXCEPTION 'Workspace owner access is required' USING ERRCODE='42501'; END IF;
 IF p_entry_type NOT IN ('credit','debit') OR p_amount IS NULL OR p_amount<=0 THEN RAISE EXCEPTION 'Choose Credit or Debit and enter a positive whole-rupee amount' USING ERRCODE='22023'; END IF;
 SELECT * INTO v_fund FROM public.cfcf_funds WHERE fund_id=p_fund_id AND tenant_id=p_tenant_id AND product_id='CFCF' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Fund not found in this workspace'; END IF;
 v_entry_id:=upper(replace(gen_random_uuid()::text,'-',''));
 INSERT INTO public.cfcf_fund_other_entries(entry_id,product_id,tenant_id,person_id,fund_id,entry_type,amount,remarks)
 VALUES(v_entry_id,'CFCF',p_tenant_id,p_person_id,p_fund_id,p_entry_type,p_amount,NULLIF(btrim(p_remarks),''));
 v_summary:=public.cfcf_recalculate_fund_summary(p_tenant_id,p_fund_id);
 RETURN jsonb_build_object('entry_id',v_entry_id,'entry_type',p_entry_type,'amount',p_amount,'summary',v_summary);
END;
$function$;
REVOKE ALL ON FUNCTION public.cfcf_record_fund_other_entry(text,text,text,text,integer,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.cfcf_record_fund_other_entry(text,text,text,text,integer,text) TO authenticated;

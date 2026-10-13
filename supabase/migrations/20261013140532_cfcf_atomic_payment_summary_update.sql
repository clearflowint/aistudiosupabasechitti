-- CFCF PRODUCT: Payment ledger write, Share summary and Fund summary commit together.
CREATE OR REPLACE FUNCTION public.cfcf_record_share_payment(p_tenant_id text,p_fund_id text,p_share_id text,p_person_id text,p_entry_type text,p_amount integer,p_entry_date date,p_payment_type text,p_remarks text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path TO 'public'
AS $function$
DECLARE v_fund public.cfcf_funds%ROWTYPE; v_share public.cfcf_shares%ROWTYPE; v_net bigint; v_pending bigint; v_advance bigint; v_payment_id text; v_summary jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_active_tenant_owner('CFCF',p_tenant_id) THEN RAISE EXCEPTION 'Workspace owner access is required' USING ERRCODE='42501'; END IF;
 IF p_entry_type NOT IN ('credit','debit') OR p_amount IS NULL OR p_amount<=0 OR p_amount>2147483647 THEN RAISE EXCEPTION 'Choose Credit or Debit and enter a positive whole-rupee amount' USING ERRCODE='22023'; END IF;
 IF p_payment_type NOT IN ('UPI','Cash','Other') THEN RAISE EXCEPTION 'Choose a valid payment mode' USING ERRCODE='22023'; END IF;
 SELECT * INTO v_fund FROM public.cfcf_funds WHERE fund_id=p_fund_id AND tenant_id=p_tenant_id AND product_id='CFCF' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Fund not found in this workspace'; END IF;
 SELECT * INTO v_share FROM public.cfcf_shares WHERE share_id=p_share_id AND fund_id=p_fund_id AND tenant_id=p_tenant_id AND product_id='CFCF' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Share not found in the selected Fund'; END IF;
 v_net:=v_share.share_net_payment_received+CASE WHEN p_entry_type='credit' THEN p_amount::bigint ELSE -p_amount::bigint END;
 IF v_net<0 OR v_net>2147483647 THEN RAISE EXCEPTION 'Net payment total would be outside the supported range' USING ERRCODE='22003'; END IF;
 v_pending:=GREATEST(v_share.share_total_billed_amount::bigint-v_net,0); v_advance:=GREATEST(v_net-v_share.share_total_billed_amount::bigint,0);
 v_payment_id:=upper(replace(gen_random_uuid()::text,'-',''));
 INSERT INTO public.cfcf_payments(payment_id,product_id,tenant_id,person_id,fund_id,share_id,entry_type,amount,entry_date,payment_type,remarks) VALUES(v_payment_id,'CFCF',p_tenant_id,p_person_id,p_fund_id,p_share_id,p_entry_type,p_amount,COALESCE(p_entry_date,current_date),p_payment_type,NULLIF(btrim(p_remarks),''));
 UPDATE public.cfcf_shares SET share_net_payment_received=v_net::integer,total_pending=v_pending::integer,total_advance=v_advance::integer,updated_at=now() WHERE share_id=p_share_id AND fund_id=p_fund_id AND tenant_id=p_tenant_id AND product_id='CFCF';
 v_summary:=public.cfcf_recalculate_fund_summary(p_tenant_id,p_fund_id);
 RETURN jsonb_build_object('payment_id',v_payment_id,'share_id',p_share_id,'share_net_payment_received',v_net,'total_pending',v_pending,'total_advance',v_advance,'fund_summary',v_summary);
END;
$function$;
REVOKE ALL ON FUNCTION public.cfcf_record_share_payment(text,text,text,text,text,integer,date,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.cfcf_record_share_payment(text,text,text,text,text,integer,date,text,text) TO authenticated;

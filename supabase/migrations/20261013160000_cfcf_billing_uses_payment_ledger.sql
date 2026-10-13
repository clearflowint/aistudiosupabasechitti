-- CFCF PRODUCT: Cycle billing derives Share payment totals from the authoritative Payment ledger.
-- SKELETON: Billing and summary updates remain one explicit transaction; no trigger or new table.
-- MIX: Existing JSONB billing and payment schema is retained.

CREATE OR REPLACE FUNCTION public.cfcf_record_cycle_billing(p_tenant_id text,p_fund_id text,p_share_id text,p_cycle_number integer,p_amount integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path TO 'public' AS $function$
DECLARE v_fund public.cfcf_funds%ROWTYPE; v_share public.cfcf_shares%ROWTYPE; v_entries jsonb; v_billed bigint; v_received bigint; v_pending bigint; v_advance bigint; v_summary jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_active_tenant_owner('CFCF',p_tenant_id) THEN RAISE EXCEPTION 'Workspace owner access is required to record cycle billing' USING ERRCODE='42501'; END IF;
 IF p_cycle_number IS NULL OR p_cycle_number<1 OR p_cycle_number>500 THEN RAISE EXCEPTION 'Cycle number must be between 1 and 500' USING ERRCODE='22023'; END IF;
 IF p_amount IS NULL OR p_amount<0 OR p_amount>2147483647 THEN RAISE EXCEPTION 'Billing amount must be zero or a positive whole-rupee amount' USING ERRCODE='22023'; END IF;
 SELECT * INTO v_fund FROM public.cfcf_funds WHERE fund_id=p_fund_id AND tenant_id=p_tenant_id AND product_id='CFCF' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Fund not found in this workspace'; END IF;
 SELECT * INTO v_share FROM public.cfcf_shares WHERE share_id=p_share_id AND fund_id=p_fund_id AND tenant_id=p_tenant_id AND product_id='CFCF' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Share not found in the selected Fund'; END IF;
 v_entries:=COALESCE(v_share.billing_entries,'{}'::jsonb);
 IF jsonb_typeof(v_entries)<>'object' THEN RAISE EXCEPTION 'Saved billing entries are not a JSON object; billing was not changed'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_each(v_entries) e WHERE e.key !~ '^[1-9][0-9]*$' OR jsonb_typeof(e.value)<>'number' OR (e.value #>> '{}') !~ '^[0-9]+$' OR (e.value #>> '{}')::numeric>2147483647) THEN
  RAISE EXCEPTION 'Saved billing entries contain an unsupported format or amount; review existing entries before editing';
 END IF;
 v_entries:=v_entries||jsonb_build_object(p_cycle_number::text,p_amount);
 SELECT COALESCE(sum((e.value #>> '{}')::bigint),0) INTO v_billed FROM jsonb_each(v_entries) e;
 IF v_billed>2147483647 THEN RAISE EXCEPTION 'Share billed total exceeds the supported amount range' USING ERRCODE='22003'; END IF;
 SELECT COALESCE(sum(CASE WHEN entry_type='credit' THEN amount::bigint ELSE -amount::bigint END),0) INTO v_received
 FROM public.cfcf_payments WHERE product_id='CFCF' AND tenant_id=p_tenant_id AND fund_id=p_fund_id AND share_id=p_share_id;
 IF v_received<0 OR v_received>2147483647 THEN RAISE EXCEPTION 'Share payment ledger net is negative or outside the supported range' USING ERRCODE='22003'; END IF;
 v_pending:=GREATEST(v_billed-v_received,0); v_advance:=GREATEST(v_received-v_billed,0);
 IF v_pending>2147483647 OR v_advance>2147483647 THEN RAISE EXCEPTION 'Share pending or advance exceeds supported range' USING ERRCODE='22003'; END IF;
 UPDATE public.cfcf_shares SET billing_entries=v_entries,share_total_billed_amount=v_billed::integer,share_net_payment_received=v_received::integer,total_pending=v_pending::integer,total_advance=v_advance::integer,updated_at=now()
 WHERE share_id=p_share_id AND fund_id=p_fund_id AND tenant_id=p_tenant_id AND product_id='CFCF';
 v_summary:=public.cfcf_recalculate_fund_summary(p_tenant_id,p_fund_id);
 RETURN jsonb_build_object('share_id',p_share_id,'cycle_number',p_cycle_number,'billing_amount',p_amount,'share_total_billed_amount',v_billed,'share_net_payment_received',v_received,'total_pending',v_pending,'total_advance',v_advance,'fund_summary',v_summary);
END; $function$;
REVOKE ALL ON FUNCTION public.cfcf_record_cycle_billing(text,text,text,integer,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.cfcf_record_cycle_billing(text,text,text,integer,integer) TO authenticated;

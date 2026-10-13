-- CFCF PRODUCT: Share count has one authority: cfcf_shares_sync_fund_share_count.
-- Remove duplicate count writes from the financial summary helper; keep count in its diagnostic result.
CREATE OR REPLACE FUNCTION public.cfcf_recalculate_fund_summary(p_tenant_id text,p_fund_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_fund public.cfcf_funds%ROWTYPE; v_billed bigint; v_pending bigint; v_advance bigint; v_withdrawn bigint; v_commissions bigint; v_other bigint; v_net bigint; v_share_count bigint;
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_active_tenant_owner('CFCF',p_tenant_id) THEN RAISE EXCEPTION 'Workspace owner access is required' USING ERRCODE='42501'; END IF;
 SELECT * INTO v_fund FROM public.cfcf_funds WHERE fund_id=p_fund_id AND tenant_id=p_tenant_id AND product_id='CFCF' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Fund not found in this workspace'; END IF;
 SELECT count(*),COALESCE(sum(share_total_billed_amount::bigint),0),COALESCE(sum(total_pending::bigint),0),COALESCE(sum(total_advance::bigint),0),COALESCE(sum(CASE WHEN payout_status='drawn' THEN withdrawn_amount::bigint ELSE 0 END),0)
 INTO v_share_count,v_billed,v_pending,v_advance,v_withdrawn FROM public.cfcf_shares WHERE fund_id=p_fund_id AND tenant_id=p_tenant_id AND product_id='CFCF';
 IF jsonb_typeof(COALESCE(v_fund.cycle_commissions,'[]'::jsonb))<>'array' THEN RAISE EXCEPTION 'Cycle commissions must be a JSON array'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(COALESCE(v_fund.cycle_commissions,'[]'::jsonb)) AS e(value) WHERE e.value<>'null'::jsonb AND (jsonb_typeof(e.value)<>'number' OR (e.value #>> '{}') !~ '^[0-9]+$')) THEN RAISE EXCEPTION 'Cycle commissions contain an unsupported value'; END IF;
 SELECT COALESCE(sum((e.value #>> '{}')::bigint),0) INTO v_commissions FROM jsonb_array_elements(COALESCE(v_fund.cycle_commissions,'[]'::jsonb)) AS e(value) WHERE e.value<>'null'::jsonb;
 SELECT COALESCE(sum(CASE WHEN entry_type='credit' THEN amount::bigint ELSE -amount::bigint END),0) INTO v_other FROM public.cfcf_fund_other_entries WHERE fund_id=p_fund_id AND tenant_id=p_tenant_id AND product_id='CFCF';
 v_net:=v_billed-v_withdrawn-v_pending-v_commissions;
 IF v_share_count>2147483647 OR v_billed>2147483647 OR v_pending>2147483647 OR v_advance>2147483647 OR v_withdrawn>2147483647 OR v_commissions>2147483647 OR v_other>2147483647 OR v_other < -2147483648 OR v_net>2147483647 OR v_net < -2147483648 THEN RAISE EXCEPTION 'Fund financial summary exceeds the supported integer range' USING ERRCODE='22003'; END IF;
 UPDATE public.cfcf_funds SET fund_total_billed_amount=v_billed::integer,fund_total_pending_amount=v_pending::integer,fund_total_advance=v_advance::integer,fund_total_withdrawn=v_withdrawn::integer,fund_total_commissions=v_commissions::integer,other_amount=v_other::integer,fund_net_balance=v_net::integer,updated_at=now() WHERE fund_id=p_fund_id AND tenant_id=p_tenant_id AND product_id='CFCF';
 RETURN jsonb_build_object('number_of_shares',v_share_count,'fund_total_billed_amount',v_billed,'fund_total_pending_amount',v_pending,'fund_total_advance',v_advance,'fund_total_withdrawn',v_withdrawn,'fund_total_commissions',v_commissions,'other_amount',v_other,'fund_net_balance',v_net);
END;
$function$;
REVOKE ALL ON FUNCTION public.cfcf_recalculate_fund_summary(text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.cfcf_recalculate_fund_summary(text,text) TO authenticated;
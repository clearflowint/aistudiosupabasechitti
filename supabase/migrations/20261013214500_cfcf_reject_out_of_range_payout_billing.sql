-- CFCF PRODUCT: A payout Cycle is eligible only when saved billing is a supported whole-rupee amount.
-- SKELETON: Keep the existing atomic payout RPC; no schema or ledger rows are added.

-- SKELETON: Preserve atomic payout update and Fund summary recalculation; never create a Payment row.
-- MIX: Match the workspace's 100-Cycle UX policy and existing JSONB billing schema.

CREATE OR REPLACE FUNCTION public.cfcf_set_share_payout(
 p_tenant_id text,p_fund_id text,p_share_id text,
 p_payout_status text,p_payout_cycle_number integer,p_withdrawn_amount integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $function$
DECLARE
 v_fund public.cfcf_funds%ROWTYPE;
 v_share public.cfcf_shares%ROWTYPE;
 v_summary jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_active_tenant_owner('CFCF',p_tenant_id) THEN
  RAISE EXCEPTION 'Workspace owner access is required to update payout status' USING ERRCODE='42501';
 END IF;
 IF p_payout_status NOT IN ('drawn','undrawn') THEN
  RAISE EXCEPTION 'Payout status must be drawn or undrawn' USING ERRCODE='22023';
 END IF;
 IF p_withdrawn_amount IS NULL OR p_withdrawn_amount<0 OR p_withdrawn_amount>2147483647 THEN
  RAISE EXCEPTION 'Withdrawn amount must be between zero and the supported whole-rupee limit' USING ERRCODE='22023';
 END IF;

 SELECT * INTO v_fund FROM public.cfcf_funds
 WHERE fund_id=p_fund_id AND tenant_id=p_tenant_id AND product_id='CFCF' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Fund not found in this workspace'; END IF;
 SELECT * INTO v_share FROM public.cfcf_shares
 WHERE share_id=p_share_id AND fund_id=p_fund_id AND tenant_id=p_tenant_id AND product_id='CFCF' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Share not found in the selected Fund'; END IF;

 IF p_payout_status='drawn' THEN
  IF p_payout_cycle_number IS NULL OR p_payout_cycle_number<1 OR p_payout_cycle_number>100 THEN
   RAISE EXCEPTION 'Payout Cycle must be between 1 and 100' USING ERRCODE='22023';
  END IF;
  IF NOT EXISTS (
   SELECT 1
   FROM public.cfcf_shares s
   WHERE s.fund_id=p_fund_id
     AND s.tenant_id=p_tenant_id
     AND s.product_id='CFCF'
     AND jsonb_typeof(COALESCE(s.billing_entries,'{}'::jsonb))='object'
     AND s.billing_entries ? p_payout_cycle_number::text
     AND jsonb_typeof(s.billing_entries->(p_payout_cycle_number::text))='number'
     AND (s.billing_entries->>(p_payout_cycle_number::text)) ~ '^[0-9]+
  ) THEN
   RAISE EXCEPTION 'Payout Cycle must have saved billing in this Fund' USING ERRCODE='22023';
  END IF;
  UPDATE public.cfcf_shares
  SET payout_status='drawn',payout_cycle_number=p_payout_cycle_number,
      withdrawn_amount=p_withdrawn_amount,updated_at=now()
  WHERE share_id=p_share_id AND fund_id=p_fund_id AND tenant_id=p_tenant_id AND product_id='CFCF';
 ELSE
  UPDATE public.cfcf_shares
  SET payout_status='undrawn',payout_cycle_number=NULL,withdrawn_amount=0,updated_at=now()
  WHERE share_id=p_share_id AND fund_id=p_fund_id AND tenant_id=p_tenant_id AND product_id='CFCF';
 END IF;

 v_summary:=public.cfcf_recalculate_fund_summary(p_tenant_id,p_fund_id);
 RETURN jsonb_build_object(
  'share_id',p_share_id,'payout_status',p_payout_status,
  'payout_cycle_number',CASE WHEN p_payout_status='drawn' THEN p_payout_cycle_number ELSE NULL END,
  'withdrawn_amount',CASE WHEN p_payout_status='drawn' THEN p_withdrawn_amount ELSE 0 END,
  'fund_summary',v_summary
 );
END;
$function$;

REVOKE ALL ON FUNCTION public.cfcf_set_share_payout(text,text,text,text,integer,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.cfcf_set_share_payout(text,text,text,text,integer,integer) TO authenticated;

     AND (s.billing_entries->>(p_payout_cycle_number::text))::numeric <= 2147483647
  ) THEN
   RAISE EXCEPTION 'Payout Cycle must have saved billing in this Fund' USING ERRCODE='22023';
  END IF;
  UPDATE public.cfcf_shares
  SET payout_status='drawn',payout_cycle_number=p_payout_cycle_number,
      withdrawn_amount=p_withdrawn_amount,updated_at=now()
  WHERE share_id=p_share_id AND fund_id=p_fund_id AND tenant_id=p_tenant_id AND product_id='CFCF';
 ELSE
  UPDATE public.cfcf_shares
  SET payout_status='undrawn',payout_cycle_number=NULL,withdrawn_amount=0,updated_at=now()
  WHERE share_id=p_share_id AND fund_id=p_fund_id AND tenant_id=p_tenant_id AND product_id='CFCF';
 END IF;

 v_summary:=public.cfcf_recalculate_fund_summary(p_tenant_id,p_fund_id);
 RETURN jsonb_build_object(
  'share_id',p_share_id,'payout_status',p_payout_status,
  'payout_cycle_number',CASE WHEN p_payout_status='drawn' THEN p_payout_cycle_number ELSE NULL END,
  'withdrawn_amount',CASE WHEN p_payout_status='drawn' THEN p_withdrawn_amount ELSE 0 END,
  'fund_summary',v_summary
 );
END;
$function$;

REVOKE ALL ON FUNCTION public.cfcf_set_share_payout(text,text,text,text,integer,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.cfcf_set_share_payout(text,text,text,text,integer,integer) TO authenticated;

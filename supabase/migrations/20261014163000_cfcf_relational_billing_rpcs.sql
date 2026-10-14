-- CFCF PRODUCT: Make relational bills and cfcf_cycles authoritative for billing, planned payout, and commission.
-- MIX: Shareholder payments remain in cfcf_payments and are never assigned to a Cycle.
-- SKELETON: All financial mutations and summary recalculations are atomic database RPCs.

CREATE OR REPLACE FUNCTION public.cfcf_recalculate_fund_summary(p_tenant_id text, p_fund_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_billed bigint;
  v_pending bigint;
  v_advance bigint;
  v_withdrawn bigint;
  v_commissions bigint;
  v_other bigint;
  v_net bigint;
  v_share_count bigint;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_active_tenant_owner('CFCF', p_tenant_id) THEN
    RAISE EXCEPTION 'Workspace owner access is required' USING ERRCODE='42501';
  END IF;
  PERFORM 1 FROM public.cfcf_funds
   WHERE fund_id=p_fund_id AND tenant_id=p_tenant_id AND product_id='CFCF' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Fund not found in this workspace'; END IF;

  -- Rebuild Share billed and payment-derived balances from their independent source tables.
  WITH bill_totals AS (
    SELECT b.share_id, sum(b.amount::bigint) AS billed
    FROM public.cfcf_bills b
    WHERE b.product_id='CFCF' AND b.tenant_id=p_tenant_id AND b.fund_id=p_fund_id
    GROUP BY b.share_id
  ), payment_totals AS (
    SELECT p.share_id,
      sum(CASE WHEN p.entry_type='credit' THEN p.amount::bigint ELSE -p.amount::bigint END) AS received
    FROM public.cfcf_payments p
    WHERE p.product_id='CFCF' AND p.tenant_id=p_tenant_id AND p.fund_id=p_fund_id
    GROUP BY p.share_id
  ), derived AS (
    SELECT s.share_id,
      COALESCE(bt.billed,0) AS billed,
      COALESCE(pt.received,0) AS received
    FROM public.cfcf_shares s
    LEFT JOIN bill_totals bt ON bt.share_id=s.share_id
    LEFT JOIN payment_totals pt ON pt.share_id=s.share_id
    WHERE s.product_id='CFCF' AND s.tenant_id=p_tenant_id AND s.fund_id=p_fund_id
  )
  IF EXISTS (
    WITH bill_totals AS (
      SELECT b.share_id, sum(b.amount::bigint) AS billed
      FROM public.cfcf_bills b
      WHERE b.product_id='CFCF' AND b.tenant_id=p_tenant_id AND b.fund_id=p_fund_id
      GROUP BY b.share_id
    ), payment_totals AS (
      SELECT p.share_id,
        sum(CASE WHEN p.entry_type='credit' THEN p.amount::bigint ELSE -p.amount::bigint END) AS received
      FROM public.cfcf_payments p
      WHERE p.product_id='CFCF' AND p.tenant_id=p_tenant_id AND p.fund_id=p_fund_id
      GROUP BY p.share_id
    )
    SELECT 1
    FROM public.cfcf_shares s
    LEFT JOIN bill_totals bt ON bt.share_id=s.share_id
    LEFT JOIN payment_totals pt ON pt.share_id=s.share_id
    WHERE s.product_id='CFCF' AND s.tenant_id=p_tenant_id AND s.fund_id=p_fund_id
      AND (
        COALESCE(bt.billed,0)>2147483647 OR COALESCE(pt.received,0)<0
        OR COALESCE(pt.received,0)>2147483647
        OR GREATEST(COALESCE(bt.billed,0)-COALESCE(pt.received,0),0)>2147483647
        OR GREATEST(COALESCE(pt.received,0)-COALESCE(bt.billed,0),0)>2147483647
      )
  ) THEN
    RAISE EXCEPTION 'A Share billing or payment summary exceeds the supported integer range' USING ERRCODE='22003';
  END IF;

  UPDATE public.cfcf_shares s
  SET share_total_billed_amount=d.billed::integer,
      share_net_payment_received=d.received::integer,
      total_pending=GREATEST(d.billed-d.received,0)::integer,
      total_advance=GREATEST(d.received-d.billed,0)::integer,
      updated_at=now()
  FROM derived d
  WHERE s.share_id=d.share_id AND (
    s.share_total_billed_amount IS DISTINCT FROM d.billed OR
    s.share_net_payment_received IS DISTINCT FROM d.received OR
    s.total_pending IS DISTINCT FROM GREATEST(d.billed-d.received,0) OR
    s.total_advance IS DISTINCT FROM GREATEST(d.received-d.billed,0)
  );

  -- Reject unsupported ranges before writing any derived summary.
  IF EXISTS (
    SELECT 1 FROM public.cfcf_shares s
    WHERE s.product_id='CFCF' AND s.tenant_id=p_tenant_id AND s.fund_id=p_fund_id
      AND (s.share_total_billed_amount < 0 OR s.share_net_payment_received < 0
        OR s.total_pending < 0 OR s.total_advance < 0)
  ) THEN
    RAISE EXCEPTION 'A Share ledger contains an unsupported negative balance';
  END IF;

  -- Recalculate values safely into bigint first; reject out-of-range values.
  SELECT count(*),
         COALESCE(sum(s.share_total_billed_amount::bigint),0),
         COALESCE(sum(s.total_pending::bigint),0),
         COALESCE(sum(s.total_advance::bigint),0),
         COALESCE(sum(CASE WHEN s.payout_status='drawn' THEN s.withdrawn_amount::bigint ELSE 0 END),0)
    INTO v_share_count,v_billed,v_pending,v_advance,v_withdrawn
  FROM public.cfcf_shares s
  WHERE s.product_id='CFCF' AND s.tenant_id=p_tenant_id AND s.fund_id=p_fund_id;

  SELECT COALESCE(sum(c.commission_amount::bigint),0) INTO v_commissions
  FROM public.cfcf_cycles c
  WHERE c.product_id='CFCF' AND c.tenant_id=p_tenant_id AND c.fund_id=p_fund_id;

  SELECT COALESCE(sum(CASE WHEN e.entry_type='credit' THEN e.amount::bigint ELSE -e.amount::bigint END),0)
    INTO v_other
  FROM public.cfcf_fund_other_entries e
  WHERE e.product_id='CFCF' AND e.tenant_id=p_tenant_id AND e.fund_id=p_fund_id;

  v_net:=v_billed-v_withdrawn-v_pending-v_commissions;
  IF v_share_count>2147483647 OR v_billed>2147483647 OR v_pending>2147483647
     OR v_advance>2147483647 OR v_withdrawn>2147483647 OR v_commissions>2147483647
     OR v_other>2147483647 OR v_other < -2147483648
     OR v_net>2147483647 OR v_net < -2147483648 THEN
    RAISE EXCEPTION 'Fund financial summary exceeds the supported integer range' USING ERRCODE='22003';
  END IF;

  UPDATE public.cfcf_funds
  SET fund_total_billed_amount=v_billed::integer,
      fund_total_pending_amount=v_pending::integer,
      fund_total_advance=v_advance::integer,
      fund_total_withdrawn=v_withdrawn::integer,
      fund_total_commissions=v_commissions::integer,
      other_amount=v_other::integer,
      fund_net_balance=v_net::integer,
      number_of_shares=v_share_count::integer,
      updated_at=now()
  WHERE fund_id=p_fund_id AND tenant_id=p_tenant_id AND product_id='CFCF';

  RETURN jsonb_build_object(
    'number_of_shares',v_share_count,
    'fund_total_billed_amount',v_billed,
    'fund_total_pending_amount',v_pending,
    'fund_total_advance',v_advance,
    'fund_total_withdrawn',v_withdrawn,
    'fund_total_commissions',v_commissions,
    'other_amount',v_other,
    'fund_net_balance',v_net
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.cfcf_record_cycle_billing(
  p_tenant_id text, p_fund_id text, p_share_id text, p_cycle_number integer, p_amount integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_cycle public.cfcf_cycles%ROWTYPE;
  v_share public.cfcf_shares%ROWTYPE;
  v_bill public.cfcf_bills%ROWTYPE;
  v_summary jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_active_tenant_owner('CFCF',p_tenant_id) THEN
    RAISE EXCEPTION 'Workspace owner access is required to record Cycle billing' USING ERRCODE='42501';
  END IF;
  IF p_cycle_number IS NULL OR p_cycle_number<1 OR p_amount IS NULL OR p_amount<0 THEN
    RAISE EXCEPTION 'Cycle must be positive and billing amount must be zero or greater' USING ERRCODE='22023';
  END IF;
  PERFORM 1 FROM public.cfcf_funds
    WHERE product_id='CFCF' AND tenant_id=p_tenant_id AND fund_id=p_fund_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Fund not found in this workspace'; END IF;
  SELECT * INTO v_cycle FROM public.cfcf_cycles
    WHERE product_id='CFCF' AND tenant_id=p_tenant_id AND fund_id=p_fund_id AND cycle_number=p_cycle_number FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Save the Cycle before entering bills'; END IF;
  SELECT * INTO v_share FROM public.cfcf_shares
    WHERE product_id='CFCF' AND tenant_id=p_tenant_id AND fund_id=p_fund_id AND share_id=p_share_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Share not found in the selected Fund'; END IF;

  INSERT INTO public.cfcf_bills(product_id,tenant_id,fund_id,cycle_id,share_id,amount,bill_date)
  VALUES('CFCF',p_tenant_id,p_fund_id,v_cycle.cycle_id,p_share_id,p_amount,current_date)
  ON CONFLICT (tenant_id,fund_id,cycle_id,share_id)
  DO UPDATE SET amount=EXCLUDED.amount,bill_date=current_date,updated_at=now()
  RETURNING * INTO v_bill;

  UPDATE public.cfcf_funds SET current_cycle=GREATEST(COALESCE(current_cycle,0),p_cycle_number),updated_at=now()
  WHERE product_id='CFCF' AND tenant_id=p_tenant_id AND fund_id=p_fund_id;
  v_summary:=public.cfcf_recalculate_fund_summary(p_tenant_id,p_fund_id);
  RETURN jsonb_build_object('bill_id',v_bill.bill_id,'share_id',p_share_id,'cycle_number',p_cycle_number,
    'billing_amount',p_amount,'bill_date',v_bill.bill_date,'fund_summary',v_summary);
END;
$function$;

CREATE OR REPLACE FUNCTION public.cfcf_save_cycle_values(
  p_tenant_id text, p_fund_id text, p_cycle_number integer,
  p_payout_amount integer, p_commission_amount integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_cycle public.cfcf_cycles%ROWTYPE; v_summary jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_active_tenant_owner('CFCF',p_tenant_id) THEN
    RAISE EXCEPTION 'Workspace owner access is required' USING ERRCODE='42501';
  END IF;
  IF p_cycle_number IS NULL OR p_cycle_number<1
    OR (p_payout_amount IS NOT NULL AND p_payout_amount<0)
    OR (p_commission_amount IS NOT NULL AND p_commission_amount<0) THEN
    RAISE EXCEPTION 'Cycle and planned amounts must be nonnegative whole numbers' USING ERRCODE='22023';
  END IF;
  PERFORM 1 FROM public.cfcf_funds
    WHERE product_id='CFCF' AND tenant_id=p_tenant_id AND fund_id=p_fund_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Fund not found in this workspace'; END IF;
  UPDATE public.cfcf_cycles
  SET planned_payout_amount=p_payout_amount,commission_amount=p_commission_amount,updated_at=now()
  WHERE product_id='CFCF' AND tenant_id=p_tenant_id AND fund_id=p_fund_id AND cycle_number=p_cycle_number
  RETURNING * INTO v_cycle;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cycle not found; add the Cycle first'; END IF;
  v_summary:=public.cfcf_recalculate_fund_summary(p_tenant_id,p_fund_id);
  RETURN jsonb_build_object('fund_id',p_fund_id,'cycle_number',p_cycle_number,
    'planned_payout_amount',v_cycle.planned_payout_amount,'commission_amount',v_cycle.commission_amount,
    'summary',v_summary);
END;
$function$;

CREATE OR REPLACE FUNCTION public.cfcf_set_cycle_planned_payout(
  p_tenant_id text, p_fund_id text, p_cycle_number integer, p_amount integer
)
RETURNS public.cfcf_cycles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_cycle public.cfcf_cycles%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_active_tenant_owner('CFCF',p_tenant_id) THEN
    RAISE EXCEPTION 'Workspace owner access is required' USING ERRCODE='42501';
  END IF;
  IF p_cycle_number IS NULL OR p_cycle_number<1 OR p_amount IS NULL OR p_amount<0 THEN
    RAISE EXCEPTION 'Cycle and payout amount must be nonnegative whole numbers' USING ERRCODE='22023';
  END IF;
  UPDATE public.cfcf_cycles SET planned_payout_amount=p_amount,updated_at=now()
  WHERE product_id='CFCF' AND tenant_id=p_tenant_id AND fund_id=p_fund_id AND cycle_number=p_cycle_number
  RETURNING * INTO v_cycle;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cycle not found; add the Cycle first'; END IF;
  PERFORM public.cfcf_recalculate_fund_summary(p_tenant_id,p_fund_id);
  RETURN v_cycle;
END;
$function$;

CREATE OR REPLACE FUNCTION public.cfcf_get_cycle_summary(
  p_tenant_id text, p_fund_id text, p_cycle_number integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_result jsonb; v_cycle public.cfcf_cycles%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_active_tenant_owner('CFCF',p_tenant_id) THEN
    RAISE EXCEPTION 'Workspace owner access is required' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_cycle FROM public.cfcf_cycles
   WHERE product_id='CFCF' AND tenant_id=p_tenant_id AND fund_id=p_fund_id AND cycle_number=p_cycle_number;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cycle not found'; END IF;

  SELECT jsonb_build_object(
    'cycle_number',p_cycle_number,
    'total_billed',COALESCE((SELECT sum(b.amount::bigint) FROM public.cfcf_bills b
      WHERE b.product_id='CFCF' AND b.tenant_id=p_tenant_id AND b.fund_id=p_fund_id AND b.cycle_id=v_cycle.cycle_id),0),
    'billed_shares',COALESCE((SELECT count(*) FROM public.cfcf_bills b
      WHERE b.product_id='CFCF' AND b.tenant_id=p_tenant_id AND b.fund_id=p_fund_id AND b.cycle_id=v_cycle.cycle_id AND b.amount>0),0),
    'not_billed_shares',COALESCE((SELECT count(*) FROM public.cfcf_shares s
      WHERE s.product_id='CFCF' AND s.tenant_id=p_tenant_id AND s.fund_id=p_fund_id AND s.status='active')
      - (SELECT count(*) FROM public.cfcf_bills b
        WHERE b.product_id='CFCF' AND b.tenant_id=p_tenant_id AND b.fund_id=p_fund_id AND b.cycle_id=v_cycle.cycle_id AND b.amount>0),0),
    'planned_payout_amount',v_cycle.planned_payout_amount,
    'commission_amount',v_cycle.commission_amount,
    'total_paid_out',COALESCE((SELECT sum(s.withdrawn_amount::bigint) FROM public.cfcf_shares s
      WHERE s.product_id='CFCF' AND s.tenant_id=p_tenant_id AND s.fund_id=p_fund_id
        AND s.payout_cycle_number=p_cycle_number AND s.payout_status='drawn'),0),
    'withdrawn_shares',COALESCE((SELECT jsonb_agg(jsonb_build_object('share_id',s.share_id,'contact_id',s.contact_id,
      'contact_name',c.name,'withdrawn_amount',s.withdrawn_amount) ORDER BY c.name)
      FROM public.cfcf_shares s LEFT JOIN public.contacts c
        ON c.contact_id=s.contact_id AND c.tenant_id=s.tenant_id AND c.product_id=s.product_id
      WHERE s.product_id='CFCF' AND s.tenant_id=p_tenant_id AND s.fund_id=p_fund_id
        AND s.payout_cycle_number=p_cycle_number AND s.payout_status='drawn'),'[]'::jsonb)
  ) INTO v_result;
  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.cfcf_delete_highest_cycle(
  p_tenant_id text, p_fund_id text, p_cycle_number integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_max integer; v_cycle public.cfcf_cycles%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_active_tenant_owner('CFCF',p_tenant_id) THEN
    RAISE EXCEPTION 'Workspace owner access is required' USING ERRCODE='42501';
  END IF;
  PERFORM 1 FROM public.cfcf_funds
   WHERE product_id='CFCF' AND tenant_id=p_tenant_id AND fund_id=p_fund_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Fund not found or access denied' USING ERRCODE='42501'; END IF;
  SELECT MAX(cycle_number) INTO v_max FROM public.cfcf_cycles
   WHERE product_id='CFCF' AND tenant_id=p_tenant_id AND fund_id=p_fund_id;
  IF p_cycle_number IS DISTINCT FROM v_max THEN
    RAISE EXCEPTION 'Only the highest saved Cycle can be deleted';
  END IF;
  SELECT * INTO v_cycle FROM public.cfcf_cycles
   WHERE product_id='CFCF' AND tenant_id=p_tenant_id AND fund_id=p_fund_id AND cycle_number=p_cycle_number
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cycle not found'; END IF;

  -- Reset only payout states explicitly assigned to this Cycle; shareholder payments are untouched.
  UPDATE public.cfcf_shares
  SET payout_status='undrawn',payout_cycle_number=NULL,withdrawn_amount=0,updated_at=now()
  WHERE product_id='CFCF' AND tenant_id=p_tenant_id AND fund_id=p_fund_id
    AND payout_status='drawn' AND payout_cycle_number=p_cycle_number;

  -- Keep legacy arrays synchronized during the app cutover. These values become NULL, not shifted.
  UPDATE public.cfcf_funds f
  SET cycle_payout_amounts=CASE WHEN jsonb_typeof(COALESCE(f.cycle_payout_amounts,'[]'::jsonb))='array'
      AND jsonb_array_length(COALESCE(f.cycle_payout_amounts,'[]'::jsonb))>=p_cycle_number
      THEN jsonb_set(f.cycle_payout_amounts,ARRAY[(p_cycle_number-1)::text],'null'::jsonb,false)
      ELSE COALESCE(f.cycle_payout_amounts,'[]'::jsonb) END,
      cycle_commissions=CASE WHEN jsonb_typeof(COALESCE(f.cycle_commissions,'[]'::jsonb))='array'
      AND jsonb_array_length(COALESCE(f.cycle_commissions,'[]'::jsonb))>=p_cycle_number
      THEN jsonb_set(f.cycle_commissions,ARRAY[(p_cycle_number-1)::text],'null'::jsonb,false)
      ELSE COALESCE(f.cycle_commissions,'[]'::jsonb) END,
      current_cycle=COALESCE((SELECT MAX(c.cycle_number) FROM public.cfcf_cycles c
        WHERE c.product_id='CFCF' AND c.tenant_id=p_tenant_id AND c.fund_id=p_fund_id
          AND c.cycle_number<p_cycle_number),0),
      updated_at=now()
  WHERE f.product_id='CFCF' AND f.tenant_id=p_tenant_id AND f.fund_id=p_fund_id;

  -- Bills cascade from the deleted Cycle. The Cycle row also owns planned payout and commission.
  DELETE FROM public.cfcf_cycles
  WHERE cycle_id=v_cycle.cycle_id AND product_id='CFCF' AND tenant_id=p_tenant_id AND fund_id=p_fund_id;
  PERFORM public.cfcf_recalculate_fund_summary(p_tenant_id,p_fund_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.cfcf_record_share_payment(
  p_tenant_id text, p_fund_id text, p_share_id text, p_person_id text,
  p_entry_type text, p_amount integer, p_entry_date date, p_payment_type text, p_remarks text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_net bigint; v_billed bigint; v_pending bigint; v_advance bigint;
  v_payment_id text; v_summary jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_active_tenant_owner('CFCF',p_tenant_id) THEN
    RAISE EXCEPTION 'Workspace owner access is required' USING ERRCODE='42501';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.persons WHERE person_id=p_person_id AND tenant_id=p_tenant_id AND product_id='CFCF' AND status='active') THEN
    RAISE EXCEPTION 'Active manager person is required for payment attribution' USING ERRCODE='42501';
  END IF;
  IF p_entry_type NOT IN ('credit','debit') OR p_amount IS NULL OR p_amount<=0 OR p_amount>2147483647 THEN
    RAISE EXCEPTION 'Choose Credit or Debit and enter a positive whole-rupee amount' USING ERRCODE='22023';
  END IF;
  IF p_payment_type NOT IN ('UPI','Cash','Other') THEN RAISE EXCEPTION 'Choose a valid payment mode' USING ERRCODE='22023'; END IF;
  PERFORM 1 FROM public.cfcf_funds WHERE product_id='CFCF' AND tenant_id=p_tenant_id AND fund_id=p_fund_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Fund not found in this workspace'; END IF;
  PERFORM 1 FROM public.cfcf_shares WHERE product_id='CFCF' AND tenant_id=p_tenant_id AND fund_id=p_fund_id AND share_id=p_share_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Share not found in the selected Fund'; END IF;

  SELECT COALESCE(sum(CASE WHEN entry_type='credit' THEN amount::bigint ELSE -amount::bigint END),0)
    INTO v_net FROM public.cfcf_payments
   WHERE product_id='CFCF' AND tenant_id=p_tenant_id AND fund_id=p_fund_id AND share_id=p_share_id;
  v_net:=v_net+CASE WHEN p_entry_type='credit' THEN p_amount::bigint ELSE -p_amount::bigint END;
  IF v_net<0 OR v_net>2147483647 THEN RAISE EXCEPTION 'Payment ledger net would be negative or outside the supported range' USING ERRCODE='22003'; END IF;

  SELECT COALESCE(sum(amount::bigint),0) INTO v_billed FROM public.cfcf_bills
   WHERE product_id='CFCF' AND tenant_id=p_tenant_id AND fund_id=p_fund_id AND share_id=p_share_id;
  v_pending:=GREATEST(v_billed-v_net,0); v_advance:=GREATEST(v_net-v_billed,0);
  IF v_pending>2147483647 OR v_advance>2147483647 THEN RAISE EXCEPTION 'Pending or advance exceeds supported range' USING ERRCODE='22003'; END IF;

  v_payment_id:=upper(replace(gen_random_uuid()::text,'-',''));
  INSERT INTO public.cfcf_payments(payment_id,product_id,tenant_id,person_id,fund_id,share_id,entry_type,amount,entry_date,payment_type,remarks)
  VALUES(v_payment_id,'CFCF',p_tenant_id,p_person_id,p_fund_id,p_share_id,p_entry_type,p_amount,COALESCE(p_entry_date,current_date),p_payment_type,NULLIF(btrim(p_remarks),'')); 
  v_summary:=public.cfcf_recalculate_fund_summary(p_tenant_id,p_fund_id);
  RETURN jsonb_build_object('payment_id',v_payment_id,'share_id',p_share_id,
    'share_total_billed_amount',v_billed,'share_net_payment_received',v_net,
    'total_pending',v_pending,'total_advance',v_advance,'fund_summary',v_summary);
END;
$function$;

-- Grant RPC execution only to authenticated users; every function validates active tenant ownership.
GRANT EXECUTE ON FUNCTION public.cfcf_recalculate_fund_summary(text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cfcf_record_cycle_billing(text,text,text,integer,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cfcf_save_cycle_values(text,text,integer,integer,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cfcf_set_cycle_planned_payout(text,text,integer,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cfcf_get_cycle_summary(text,text,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cfcf_delete_highest_cycle(text,text,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cfcf_record_share_payment(text,text,text,text,text,integer,date,text,text) TO authenticated;

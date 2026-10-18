-- CFCF PRODUCT: Persist the Fund-level net payment total alongside Share-level totals.
-- MIX: Rebuild from the authoritative Payment ledger inside the existing atomic Fund summary RPC.

ALTER TABLE public.cfcf_funds
  ADD COLUMN IF NOT EXISTS fund_net_payment_received integer NOT NULL DEFAULT 0;

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
  v_net_payment_received bigint;
  v_share_count bigint;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_active_tenant_owner('CFCF', p_tenant_id) THEN
    RAISE EXCEPTION 'Workspace owner access is required' USING ERRCODE='42501';
  END IF;

  PERFORM 1 FROM public.cfcf_funds
   WHERE fund_id=p_fund_id AND tenant_id=p_tenant_id AND product_id='CFCF' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Fund not found in this workspace'; END IF;

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
    SELECT s.share_id, COALESCE(bt.billed,0) AS billed, COALESCE(pt.received,0) AS received
    FROM public.cfcf_shares s
    LEFT JOIN bill_totals bt ON bt.share_id=s.share_id
    LEFT JOIN payment_totals pt ON pt.share_id=s.share_id
    WHERE s.product_id='CFCF' AND s.tenant_id=p_tenant_id AND s.fund_id=p_fund_id
  )
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

  IF EXISTS (
    SELECT 1 FROM public.cfcf_shares s
    WHERE s.product_id='CFCF' AND s.tenant_id=p_tenant_id AND s.fund_id=p_fund_id
      AND (s.share_total_billed_amount < 0 OR s.share_net_payment_received < 0
        OR s.total_pending < 0 OR s.total_advance < 0)
  ) THEN
    RAISE EXCEPTION 'A Share ledger contains an unsupported negative balance';
  END IF;

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

  SELECT COALESCE(sum(CASE WHEN p.entry_type='credit' THEN p.amount::bigint ELSE -p.amount::bigint END),0)
    INTO v_net_payment_received
  FROM public.cfcf_payments p
  WHERE p.product_id='CFCF' AND p.tenant_id=p_tenant_id AND p.fund_id=p_fund_id;

  v_net:=v_billed-v_withdrawn-v_pending-v_commissions;
  IF v_net_payment_received < 0 OR v_net_payment_received > 2147483647 THEN
    RAISE EXCEPTION 'Fund net payment received exceeds the supported integer range or has net debits exceeding credits' USING ERRCODE='22003';
  END IF;
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
      fund_net_payment_received=v_net_payment_received::integer,
      number_of_shares=v_share_count::integer,
      updated_at=now()
  WHERE fund_id=p_fund_id AND tenant_id=p_tenant_id AND product_id='CFCF';

  RETURN jsonb_build_object(
    'number_of_shares',v_share_count,
    'fund_total_billed_amount',v_billed,
    'fund_net_payment_received',v_net_payment_received,
    'fund_total_pending_amount',v_pending,
    'fund_total_advance',v_advance,
    'fund_total_withdrawn',v_withdrawn,
    'fund_total_commissions',v_commissions,
    'other_amount',v_other,
    'fund_net_balance',v_net
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.cfcf_recalculate_fund_summary(text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.cfcf_recalculate_fund_summary(text,text) TO authenticated;

-- Clear the new summary field when the Fund is archived and its active data is destroyed.
CREATE OR REPLACE FUNCTION public.cfcf_archive_fund_with_report(
  p_tenant_id text,
  p_fund_id text,
  p_report_html text
) RETURNS public.cfcf_archived_funds
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_fund public.cfcf_funds%ROWTYPE;
  v_archive public.cfcf_archived_funds%ROWTYPE;
BEGIN
  IF NOT public.is_active_tenant_owner('CFCF', p_tenant_id) THEN
    RAISE EXCEPTION 'Only the active tenant owner can archive a Fund.';
  END IF;
  IF p_report_html IS NULL OR length(trim(p_report_html)) < 100 THEN
    RAISE EXCEPTION 'The complete Fund report is not ready to archive.';
  END IF;

  SELECT * INTO v_fund
  FROM public.cfcf_funds
  WHERE product_id='CFCF' AND tenant_id=p_tenant_id AND fund_id=p_fund_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Fund not found or access denied.'; END IF;
  IF v_fund.archived_at IS NOT NULL OR v_fund.status='archived' THEN
    RAISE EXCEPTION 'This Fund is already archived.';
  END IF;

  INSERT INTO public.cfcf_archived_funds (product_id,tenant_id,fund_id,fund_name,report_html)
  VALUES ('CFCF',p_tenant_id,v_fund.fund_id,v_fund.fund_name,p_report_html)
  RETURNING * INTO v_archive;

  DELETE FROM public.cfcf_activity_log
  WHERE product_id='CFCF' AND tenant_id=p_tenant_id
    AND (
      entity_id=p_fund_id
      OR entity_id IN (SELECT s.share_id FROM public.cfcf_shares s WHERE s.product_id='CFCF' AND s.tenant_id=p_tenant_id AND s.fund_id=p_fund_id)
      OR entity_id IN (SELECT c.cycle_id::text FROM public.cfcf_cycles c WHERE c.product_id='CFCF' AND c.tenant_id=p_tenant_id AND c.fund_id=p_fund_id)
      OR entity_id IN (SELECT b.bill_id::text FROM public.cfcf_bills b WHERE b.product_id='CFCF' AND b.tenant_id=p_tenant_id AND b.fund_id=p_fund_id)
      OR entity_id IN (SELECT p.payment_id FROM public.cfcf_payments p WHERE p.product_id='CFCF' AND p.tenant_id=p_tenant_id AND p.fund_id=p_fund_id)
      OR entity_id IN (SELECT e.entry_id FROM public.cfcf_fund_other_entries e WHERE e.product_id='CFCF' AND e.tenant_id=p_tenant_id AND e.fund_id=p_fund_id)
    );

  DELETE FROM public.cfcf_bills WHERE product_id='CFCF' AND tenant_id=p_tenant_id AND fund_id=p_fund_id;
  DELETE FROM public.cfcf_payments WHERE product_id='CFCF' AND tenant_id=p_tenant_id AND fund_id=p_fund_id;
  DELETE FROM public.cfcf_fund_other_entries WHERE product_id='CFCF' AND tenant_id=p_tenant_id AND fund_id=p_fund_id;
  DELETE FROM public.cfcf_shares WHERE product_id='CFCF' AND tenant_id=p_tenant_id AND fund_id=p_fund_id;
  DELETE FROM public.cfcf_cycles WHERE product_id='CFCF' AND tenant_id=p_tenant_id AND fund_id=p_fund_id;

  UPDATE public.cfcf_funds
  SET person_id=NULL,
      fund_name=NULL,
      start_date=NULL,
      number_of_cycles=NULL,
      number_of_shares=NULL,
      current_cycle=0,
      fund_net_balance=0,
      fund_net_payment_received=0,
      fund_total_billed_amount=0,
      fund_total_pending_amount=0,
      fund_total_advance=0,
      fund_total_withdrawn=0,
      fund_total_commissions=0,
      other_amount=0,
      status='archived',
      archived_at=now(),
      updated_at=now()
  WHERE product_id='CFCF' AND tenant_id=p_tenant_id AND fund_id=p_fund_id;

  RETURN v_archive;
END;
$function$;

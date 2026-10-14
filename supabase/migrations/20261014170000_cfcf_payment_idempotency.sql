-- CFCF PRODUCT: Make Share-payment retries safe when the browser loses the response after Supabase commits.
-- MIX: The idempotency key is scoped to the tenant and never links Payments to Cycles or payouts.
ALTER TABLE public.cfcf_payments
  ADD COLUMN IF NOT EXISTS request_id uuid;

CREATE UNIQUE INDEX IF NOT EXISTS cfcf_payments_tenant_request_id_uidx
  ON public.cfcf_payments (tenant_id, request_id)
  WHERE request_id IS NOT NULL;

-- Replace the prior signature so every application write must supply a stable request id.
DROP FUNCTION IF EXISTS public.cfcf_record_share_payment(text,text,text,text,text,integer,date,text,text);

CREATE OR REPLACE FUNCTION public.cfcf_record_share_payment(
  p_tenant_id text,
  p_fund_id text,
  p_share_id text,
  p_person_id text,
  p_entry_type text,
  p_amount integer,
  p_entry_date date,
  p_payment_type text,
  p_remarks text,
  p_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_net bigint;
  v_billed bigint;
  v_pending bigint;
  v_advance bigint;
  v_payment_id text;
  v_summary jsonb;
  v_existing public.cfcf_payments%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_active_tenant_owner('CFCF', p_tenant_id) THEN
    RAISE EXCEPTION 'Workspace owner access is required' USING ERRCODE='42501';
  END IF;
  IF p_request_id IS NULL THEN
    RAISE EXCEPTION 'A payment request id is required. Please retry from the payment form.' USING ERRCODE='22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.persons
    WHERE person_id=p_person_id AND tenant_id=p_tenant_id AND product_id='CFCF' AND status='active'
  ) THEN
    RAISE EXCEPTION 'Active manager person is required for payment attribution' USING ERRCODE='42501';
  END IF;
  IF p_entry_type NOT IN ('credit','debit') OR p_amount IS NULL OR p_amount<=0 OR p_amount>2147483647 THEN
    RAISE EXCEPTION 'Choose Credit or Debit and enter a positive whole-rupee amount' USING ERRCODE='22023';
  END IF;
  IF p_payment_type NOT IN ('UPI','Cash','Other') THEN
    RAISE EXCEPTION 'Choose a valid payment mode' USING ERRCODE='22023';
  END IF;

  -- Serialize requests for this Fund. A repeated key returns the original saved Payment
  -- only when all meaningful fields match; reusing a key for changed form data is rejected.
  PERFORM 1 FROM public.cfcf_funds
   WHERE product_id='CFCF' AND tenant_id=p_tenant_id AND fund_id=p_fund_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Fund not found in this workspace'; END IF;

  SELECT * INTO v_existing
  FROM public.cfcf_payments
  WHERE tenant_id=p_tenant_id AND request_id=p_request_id
  FOR UPDATE;

  IF FOUND THEN
    IF v_existing.product_id IS DISTINCT FROM 'CFCF'
      OR v_existing.fund_id IS DISTINCT FROM p_fund_id
      OR v_existing.share_id IS DISTINCT FROM p_share_id
      OR v_existing.person_id IS DISTINCT FROM p_person_id
      OR v_existing.entry_type IS DISTINCT FROM p_entry_type
      OR v_existing.amount IS DISTINCT FROM p_amount
      OR v_existing.entry_date IS DISTINCT FROM COALESCE(p_entry_date,current_date)
      OR v_existing.payment_type IS DISTINCT FROM p_payment_type
      OR v_existing.remarks IS DISTINCT FROM NULLIF(btrim(p_remarks),'') THEN
      RAISE EXCEPTION 'This payment request id was already used for different details. Reopen the form to start a new entry.' USING ERRCODE='22023';
    END IF;
    RETURN jsonb_build_object(
      'payment_id',v_existing.payment_id,
      'share_id',v_existing.share_id,
      'duplicate',true,
      'message','This Payment was already saved; no duplicate was created.'
    );
  END IF;

  PERFORM 1 FROM public.cfcf_shares
   WHERE product_id='CFCF' AND tenant_id=p_tenant_id AND fund_id=p_fund_id AND share_id=p_share_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Share not found in the selected Fund'; END IF;

  SELECT COALESCE(sum(CASE WHEN entry_type='credit' THEN amount::bigint ELSE -amount::bigint END),0)
    INTO v_net FROM public.cfcf_payments
   WHERE product_id='CFCF' AND tenant_id=p_tenant_id AND fund_id=p_fund_id AND share_id=p_share_id;
  v_net:=v_net+CASE WHEN p_entry_type='credit' THEN p_amount::bigint ELSE -p_amount::bigint END;
  IF v_net<0 OR v_net>2147483647 THEN
    RAISE EXCEPTION 'Payment ledger net would be negative or outside the supported range' USING ERRCODE='22003';
  END IF;

  SELECT COALESCE(sum(amount::bigint),0) INTO v_billed FROM public.cfcf_bills
   WHERE product_id='CFCF' AND tenant_id=p_tenant_id AND fund_id=p_fund_id AND share_id=p_share_id;
  v_pending:=GREATEST(v_billed-v_net,0);
  v_advance:=GREATEST(v_net-v_billed,0);
  IF v_pending>2147483647 OR v_advance>2147483647 THEN
    RAISE EXCEPTION 'Pending or advance exceeds supported range' USING ERRCODE='22003';
  END IF;

  v_payment_id:=upper(replace(gen_random_uuid()::text,'-',''));
  INSERT INTO public.cfcf_payments(
    payment_id,product_id,tenant_id,person_id,fund_id,share_id,
    entry_type,amount,entry_date,payment_type,remarks,request_id
  )
  VALUES(
    v_payment_id,'CFCF',p_tenant_id,p_person_id,p_fund_id,p_share_id,
    p_entry_type,p_amount,COALESCE(p_entry_date,current_date),p_payment_type,
    NULLIF(btrim(p_remarks),''),p_request_id
  );

  v_summary:=public.cfcf_recalculate_fund_summary(p_tenant_id,p_fund_id);
  RETURN jsonb_build_object(
    'payment_id',v_payment_id,
    'share_id',p_share_id,
    'duplicate',false,
    'share_total_billed_amount',v_billed,
    'share_net_payment_received',v_net,
    'total_pending',v_pending,
    'total_advance',v_advance,
    'fund_summary',v_summary
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.cfcf_record_share_payment(text,text,text,text,text,integer,date,text,text,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cfcf_record_share_payment(text,text,text,text,text,integer,date,text,text,uuid) TO authenticated;

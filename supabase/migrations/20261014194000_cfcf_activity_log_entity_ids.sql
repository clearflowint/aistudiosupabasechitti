-- Correct the entity identifier recorded for each table.
CREATE OR REPLACE FUNCTION public.cfcf_log_row_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_old jsonb;
  v_new jsonb;
  v_row jsonb;
  v_tenant_id text;
  v_entity_id text;
  v_entity_type text;
  v_action text;
  v_description text;
  v_actor text;
BEGIN
  v_old := CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN to_jsonb(OLD) ELSE NULL END;
  v_new := CASE WHEN TG_OP IN ('INSERT','UPDATE') THEN to_jsonb(NEW) ELSE NULL END;
  v_row := COALESCE(v_new,v_old);
  v_tenant_id := v_row->>'tenant_id';

  IF v_tenant_id IS NULL OR COALESCE(v_row->>'product_id','CFCF') <> 'CFCF' THEN
    IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;

  IF TG_TABLE_NAME='cfcf_shares' THEN
    IF TG_OP='INSERT' OR TG_OP='DELETE' THEN
      v_entity_type := 'share';
    ELSIF (v_old->>'payout_status',v_old->>'payout_cycle_number',v_old->>'withdrawn_amount')
       IS NOT DISTINCT FROM
       (v_new->>'payout_status',v_new->>'payout_cycle_number',v_new->>'withdrawn_amount') THEN
      RETURN NEW;
    ELSE
      v_entity_type := 'share_payout';
    END IF;
  ELSIF TG_TABLE_NAME='cfcf_cycles' THEN
    v_entity_type := 'cycle';
  ELSIF TG_TABLE_NAME='cfcf_bills' THEN
    v_entity_type := 'bill';
  ELSIF TG_TABLE_NAME='cfcf_payments' THEN
    v_entity_type := 'shareholder_payment';
  ELSE
    IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;

  v_entity_id := CASE
    WHEN TG_TABLE_NAME='cfcf_cycles' THEN v_row->>'cycle_id'
    WHEN TG_TABLE_NAME='cfcf_bills' THEN v_row->>'bill_id'
    WHEN TG_TABLE_NAME='cfcf_payments' THEN v_row->>'payment_id'
    WHEN TG_TABLE_NAME='cfcf_shares' THEN v_row->>'share_id'
    ELSE NULL
  END;
  v_action := lower(TG_OP);
  v_description := CASE
    WHEN TG_TABLE_NAME='cfcf_cycles' AND TG_OP='INSERT' THEN 'Cycle created'
    WHEN TG_TABLE_NAME='cfcf_cycles' AND TG_OP='DELETE' THEN 'Cycle deleted'
    WHEN TG_TABLE_NAME='cfcf_cycles' AND TG_OP='UPDATE' THEN 'Cycle settings updated'
    WHEN TG_TABLE_NAME='cfcf_bills' AND TG_OP='INSERT' THEN 'Share bill created'
    WHEN TG_TABLE_NAME='cfcf_bills' AND TG_OP='UPDATE' THEN 'Share bill edited'
    WHEN TG_TABLE_NAME='cfcf_bills' AND TG_OP='DELETE' THEN 'Share bill removed'
    WHEN TG_TABLE_NAME='cfcf_payments' AND TG_OP='INSERT' THEN 'Shareholder payment recorded'
    WHEN TG_TABLE_NAME='cfcf_payments' AND TG_OP='UPDATE' THEN 'Shareholder payment updated'
    WHEN TG_TABLE_NAME='cfcf_payments' AND TG_OP='DELETE' THEN 'Shareholder payment deleted'
    WHEN TG_TABLE_NAME='cfcf_shares' AND TG_OP='INSERT' THEN 'Share created'
    WHEN TG_TABLE_NAME='cfcf_shares' AND TG_OP='DELETE' THEN 'Share deleted'
    ELSE 'Share payout status updated'
  END;

  SELECT p.person_id INTO v_actor
  FROM public.persons p
  WHERE p.product_id='CFCF' AND p.tenant_id=v_tenant_id AND p.status='active'
    AND lower(p.email)=lower(public.current_email())
  ORDER BY p.created_at ASC LIMIT 1;

  INSERT INTO public.cfcf_activity_log(
    product_id,tenant_id,actor_person_id,action_type,entity_type,entity_id,
    description,before_data,after_data,created_at
  ) VALUES (
    'CFCF',v_tenant_id,v_actor,v_action,v_entity_type,v_entity_id,
    v_description,v_old,v_new,now()
  );

  DELETE FROM public.cfcf_activity_log a
  WHERE a.product_id='CFCF' AND a.tenant_id=v_tenant_id
    AND a.action_id NOT IN (
      SELECT keep.action_id FROM public.cfcf_activity_log keep
      WHERE keep.product_id='CFCF' AND keep.tenant_id=v_tenant_id
      ORDER BY keep.created_at DESC,keep.action_id DESC
      LIMIT 500
    );

  IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$function$;


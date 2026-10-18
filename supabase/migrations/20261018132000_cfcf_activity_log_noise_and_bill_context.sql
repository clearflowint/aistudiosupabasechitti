-- CFCF PRODUCT: Remove noisy derived-only Fund updates from Activity Log and enrich Share bill descriptions.
-- MIX: Do not suppress meaningful user edits or change financial source-of-truth data.

CREATE OR REPLACE FUNCTION public.cfcf_activity_change_summary(p_table text,p_op text,p_old jsonb,p_new jsonb)
RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path TO 'public' AS $function$
DECLARE
  v_row jsonb := CASE WHEN p_op='DELETE' THEN p_old ELSE p_new END;
  v_entity text;
  v_base text;
  v_detail text := '';
  v_key text;
  v_label text;
  v_before text;
  v_after text;
  v_keys text[];
BEGIN
  v_entity := CASE p_table
    WHEN 'cfcf_funds' THEN 'Fund' WHEN 'cfcf_cycles' THEN 'Cycle'
    WHEN 'cfcf_bills' THEN 'Share bill' WHEN 'cfcf_shares' THEN CASE WHEN p_op='UPDATE' THEN 'Share payout' ELSE 'Share' END
    WHEN 'cfcf_payments' THEN 'Payment' WHEN 'cfcf_fund_other_entries' THEN 'Fund adjustment'
    WHEN 'contacts' THEN 'Contact' ELSE initcap(replace(p_table,'_',' ')) END;
  v_base := v_entity || CASE p_op WHEN 'INSERT' THEN ' created' WHEN 'UPDATE' THEN ' updated' WHEN 'DELETE' THEN ' deleted' ELSE ' changed' END;
  IF p_table='cfcf_funds' THEN
    v_base := v_base || COALESCE(' · '||NULLIF(v_row->>'fund_name',''),'');
    v_keys := ARRAY['fund_name','start_date','number_of_cycles','number_of_shares','current_cycle','status','other_amount','archived_at'];
  ELSIF p_table='cfcf_cycles' THEN
    v_base := v_base || COALESCE(' · Cycle '||NULLIF(v_row->>'cycle_number',''),'');
    v_keys := ARRAY['planned_payout_amount','commission_amount'];
  ELSIF p_table='cfcf_bills' THEN
    v_keys := ARRAY['amount','bill_date'];
  ELSIF p_table='cfcf_payments' THEN
    v_base := CASE p_op WHEN 'INSERT' THEN 'Payment recorded' WHEN 'UPDATE' THEN 'Payment updated' WHEN 'DELETE' THEN 'Payment deleted' ELSE v_base END
      || COALESCE(' · '||initcap(NULLIF(v_row->>'entry_type','')),'')
      || COALESCE(' ₹'||NULLIF(v_row->>'amount',''),'')
      || COALESCE(' · '||NULLIF(v_row->>'payment_type',''),'');
    v_keys := ARRAY['entry_type','amount','payment_type','entry_date','remarks'];
  ELSIF p_table='cfcf_fund_other_entries' THEN
    v_base := v_base || COALESCE(' · '||NULLIF(v_row->>'adjustment_category',''),'')
      || COALESCE(' · '||initcap(NULLIF(v_row->>'entry_type','')),'')
      || COALESCE(' ₹'||NULLIF(v_row->>'amount',''),'');
    v_keys := ARRAY['adjustment_category','entry_type','amount','remarks'];
  ELSIF p_table='cfcf_shares' THEN
    v_base := CASE WHEN p_op='INSERT' THEN 'Share created' WHEN p_op='DELETE' THEN 'Share deleted' ELSE 'Share payout updated' END
      || CASE WHEN p_op='UPDATE' THEN COALESCE(' · '||initcap(NULLIF(v_row->>'payout_status','')),'')
        || COALESCE(' · ₹'||NULLIF(v_row->>'withdrawn_amount',''),'')
        || COALESCE(' · Cycle '||NULLIF(v_row->>'payout_cycle_number',''),'') ELSE '' END;
    v_keys := ARRAY['payout_status','payout_cycle_number','withdrawn_amount'];
  ELSIF p_table='contacts' THEN
    v_base := v_base || COALESCE(' · '||NULLIF(v_row->>'name',''),'');
    v_keys := ARRAY['name','phone','email'];
  ELSE v_keys := ARRAY[]::text[]; END IF;

  IF p_op='UPDATE' THEN
    FOREACH v_key IN ARRAY v_keys LOOP
      IF p_old->v_key IS DISTINCT FROM p_new->v_key THEN
        v_label := initcap(replace(v_key,'_',' '));
        v_before := NULLIF(p_old->>v_key,''); v_after := NULLIF(p_new->>v_key,'');
        IF v_key IN ('amount','other_amount','planned_payout_amount','commission_amount','withdrawn_amount') THEN
          v_before := CASE WHEN v_before IS NULL THEN 'not set' ELSE '₹'||v_before END;
          v_after := CASE WHEN v_after IS NULL THEN 'not set' ELSE '₹'||v_after END;
        ELSE v_before := COALESCE(v_before,'not set'); v_after := COALESCE(v_after,'not set'); END IF;
        v_detail := v_detail || CASE WHEN v_detail='' THEN ' · ' ELSE '; ' END || v_label||': '||v_before||' → '||v_after;
      END IF;
    END LOOP;
  END IF;
  RETURN left(v_base||v_detail,500);
END;
$function$;

CREATE OR REPLACE FUNCTION public.cfcf_log_manager_action()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_row jsonb; v_old jsonb; v_tenant_id text; v_product_id text; v_entity_id text;
  v_entity_type text; v_actor_person_id text; v_action text; v_description text;
BEGIN
  v_row := CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
  v_old := CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN to_jsonb(OLD) ELSE NULL END;
  v_tenant_id := v_row->>'tenant_id'; v_product_id := COALESCE(v_row->>'product_id','CFCF');
  IF v_tenant_id IS NULL OR v_product_id<>'CFCF' THEN IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW; END IF;

  -- Derived totals and timestamp-only writes are not manager actions. Actual Fund settings remain auditable.
  IF TG_TABLE_NAME='cfcf_funds' AND TG_OP='UPDATE'
     AND (v_old - ARRAY['updated_at','fund_net_balance','fund_total_billed_amount','fund_total_pending_amount','fund_total_advance','fund_total_withdrawn','fund_total_commissions','fund_net_payment_received'])
         = (v_row - ARRAY['updated_at','fund_net_balance','fund_total_billed_amount','fund_total_pending_amount','fund_total_advance','fund_total_withdrawn','fund_total_commissions','fund_net_payment_received']) THEN
    RETURN NEW;
  END IF;

  v_entity_type := CASE TG_TABLE_NAME WHEN 'cfcf_funds' THEN 'fund' WHEN 'cfcf_cycles' THEN 'cycle'
    WHEN 'cfcf_bills' THEN 'bill' WHEN 'cfcf_shares' THEN 'share' WHEN 'cfcf_payments' THEN 'payment'
    WHEN 'cfcf_fund_other_entries' THEN 'fund_adjustment' WHEN 'contacts' THEN 'contact' ELSE TG_TABLE_NAME END;
  v_entity_id := CASE TG_TABLE_NAME WHEN 'cfcf_funds' THEN v_row->>'fund_id' WHEN 'cfcf_cycles' THEN v_row->>'cycle_id'
    WHEN 'cfcf_bills' THEN v_row->>'bill_id' WHEN 'cfcf_shares' THEN v_row->>'share_id'
    WHEN 'cfcf_payments' THEN v_row->>'payment_id' WHEN 'cfcf_fund_other_entries' THEN v_row->>'entry_id'
    WHEN 'contacts' THEN v_row->>'contact_id' ELSE COALESCE(v_row->>'id',v_row->>'entity_id') END;
  v_action := lower(v_entity_type||'_'||TG_OP);
  v_description := public.cfcf_activity_change_summary(TG_TABLE_NAME,TG_OP,v_old,CASE WHEN TG_OP='DELETE' THEN NULL ELSE v_row END);
  SELECT p.person_id INTO v_actor_person_id FROM public.persons p
  WHERE p.tenant_id=v_tenant_id AND p.product_id=v_product_id AND lower(p.email)=lower(COALESCE(auth.jwt()->>'email',''))
  ORDER BY (p.status='active') DESC,p.person_id LIMIT 1;
  INSERT INTO public.cfcf_activity_log(product_id,tenant_id,actor_person_id,action_type,entity_type,entity_id,description,before_data,after_data)
  VALUES(v_product_id,v_tenant_id,v_actor_person_id,v_action,v_entity_type,v_entity_id,v_description,v_old,CASE WHEN TG_OP='DELETE' THEN NULL ELSE v_row END);
  DELETE FROM public.cfcf_activity_log a WHERE a.tenant_id=v_tenant_id AND a.product_id=v_product_id
    AND a.action_id NOT IN (SELECT keep.action_id FROM public.cfcf_activity_log keep WHERE keep.tenant_id=v_tenant_id AND keep.product_id=v_product_id
      ORDER BY keep.created_at DESC,keep.action_id DESC LIMIT 500);
  IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.cfcf_log_row_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_old jsonb; v_new jsonb; v_row jsonb; v_tenant_id text; v_entity_id text;
  v_entity_type text; v_action text; v_description text; v_actor text;
  v_cycle_number text; v_fund_name text;
BEGIN
  v_old := CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN to_jsonb(OLD) ELSE NULL END;
  v_new := CASE WHEN TG_OP IN ('INSERT','UPDATE') THEN to_jsonb(NEW) ELSE NULL END;
  v_row := COALESCE(v_new,v_old); v_tenant_id := v_row->>'tenant_id';
  IF v_tenant_id IS NULL OR COALESCE(v_row->>'product_id','CFCF')<>'CFCF' THEN IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF; END IF;
  IF TG_TABLE_NAME='cfcf_shares' THEN
    IF TG_OP IN ('INSERT','DELETE') THEN v_entity_type:='share';
    ELSIF (v_old->>'payout_status',v_old->>'payout_cycle_number',v_old->>'withdrawn_amount') IS NOT DISTINCT FROM
          (v_new->>'payout_status',v_new->>'payout_cycle_number',v_new->>'withdrawn_amount') THEN RETURN NEW;
    ELSE v_entity_type:='share_payout'; END IF;
  ELSIF TG_TABLE_NAME='cfcf_cycles' THEN v_entity_type:='cycle';
  ELSIF TG_TABLE_NAME='cfcf_bills' THEN v_entity_type:='bill';
  ELSIF TG_TABLE_NAME='cfcf_payments' THEN v_entity_type:='shareholder_payment';
  ELSE IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF; END IF;

  v_entity_id := CASE WHEN TG_TABLE_NAME='cfcf_cycles' THEN v_row->>'cycle_id' WHEN TG_TABLE_NAME='cfcf_bills' THEN v_row->>'bill_id'
    WHEN TG_TABLE_NAME='cfcf_payments' THEN v_row->>'payment_id' WHEN TG_TABLE_NAME='cfcf_shares' THEN v_row->>'share_id' ELSE NULL END;
  v_action := lower(TG_OP);
  v_description := public.cfcf_activity_change_summary(TG_TABLE_NAME,TG_OP,v_old,v_new);

  IF TG_TABLE_NAME='cfcf_bills' THEN
    SELECT c.cycle_number::text INTO v_cycle_number FROM public.cfcf_cycles c
    WHERE c.product_id='CFCF' AND c.tenant_id=v_tenant_id AND c.fund_id=v_row->>'fund_id' AND c.cycle_id=(v_row->>'cycle_id')::bigint LIMIT 1;
    SELECT f.fund_name INTO v_fund_name FROM public.cfcf_funds f
    WHERE f.product_id='CFCF' AND f.tenant_id=v_tenant_id AND f.fund_id=v_row->>'fund_id' LIMIT 1;
    v_description := v_description
      || COALESCE(' · '||NULLIF(v_fund_name,''),'')
      || COALESCE(' · Share '||NULLIF(v_row->>'share_id',''),'')
      || COALESCE(' · Cycle '||NULLIF(v_cycle_number,''),'')
      || CASE WHEN v_row->>'amount' IS NOT NULL THEN ' · ₹'||(v_row->>'amount') ELSE '' END;
  END IF;

  SELECT p.person_id INTO v_actor FROM public.persons p WHERE p.product_id='CFCF' AND p.tenant_id=v_tenant_id AND p.status='active'
    AND lower(p.email)=lower(public.current_email()) ORDER BY p.created_at ASC LIMIT 1;
  INSERT INTO public.cfcf_activity_log(product_id,tenant_id,actor_person_id,action_type,entity_type,entity_id,description,before_data,after_data,created_at)
  VALUES('CFCF',v_tenant_id,v_actor,v_action,v_entity_type,v_entity_id,v_description,v_old,v_new,now());
  DELETE FROM public.cfcf_activity_log a WHERE a.product_id='CFCF' AND a.tenant_id=v_tenant_id
    AND a.action_id NOT IN (SELECT keep.action_id FROM public.cfcf_activity_log keep WHERE keep.product_id='CFCF' AND keep.tenant_id=v_tenant_id
      ORDER BY keep.created_at DESC,keep.action_id DESC LIMIT 500);
  IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$function$;

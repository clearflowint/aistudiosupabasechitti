-- CFCF PRODUCT: Keep Share count maintenance in the existing shares trigger only.
-- MIX: Share creation remains an explicit atomic RPC; no duplicate manual count update.
CREATE OR REPLACE FUNCTION public.cfcf_create_share(p_tenant_id text,p_fund_id text,p_share_id text,p_person_id text,p_contact_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path TO 'public'
AS $function$
DECLARE v_fund public.cfcf_funds%ROWTYPE; v_contact public.contacts%ROWTYPE; v_count integer;
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_active_tenant_owner('CFCF',p_tenant_id) THEN RAISE EXCEPTION 'Workspace owner access is required' USING ERRCODE='42501'; END IF;
 IF NULLIF(btrim(p_share_id),'') IS NULL OR NULLIF(btrim(p_person_id),'') IS NULL OR NULLIF(btrim(p_contact_id),'') IS NULL THEN RAISE EXCEPTION 'Share, manager and Contact IDs are required' USING ERRCODE='22023'; END IF;
 SELECT * INTO v_fund FROM public.cfcf_funds WHERE fund_id=p_fund_id AND tenant_id=p_tenant_id AND product_id='CFCF' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Fund not found in this workspace'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.persons WHERE person_id=p_person_id AND tenant_id=p_tenant_id AND product_id='CFCF' AND status='active') THEN RAISE EXCEPTION 'Manager person is not active in this workspace'; END IF;
 SELECT * INTO v_contact FROM public.contacts WHERE contact_id=p_contact_id AND tenant_id=p_tenant_id AND product_id='CFCF';
 IF NOT FOUND THEN RAISE EXCEPTION 'Contact not found in this workspace'; END IF;
 INSERT INTO public.cfcf_shares(share_id,product_id,tenant_id,fund_id,person_id,contact_id) VALUES(p_share_id,'CFCF',p_tenant_id,p_fund_id,p_person_id,p_contact_id);
 SELECT count(*) INTO v_count FROM public.cfcf_shares WHERE fund_id=p_fund_id AND tenant_id=p_tenant_id AND product_id='CFCF';
 RETURN jsonb_build_object('share_id',p_share_id,'number_of_shares',v_count);
END;
$function$;
REVOKE ALL ON FUNCTION public.cfcf_create_share(text,text,text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.cfcf_create_share(text,text,text,text,text) TO authenticated;

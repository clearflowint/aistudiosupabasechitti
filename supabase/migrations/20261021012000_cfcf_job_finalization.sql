CREATE OR REPLACE FUNCTION public.cfcf_finalize_n8n_job(
  p_job_id bigint,
  p_tenant_id text,
  p_final_status text,
  p_delivery_result jsonb
)
RETURNS SETOF public.n8n_global_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  finalized public.n8n_global_jobs%ROWTYPE;
BEGIN
  IF p_final_status NOT IN ('completed', 'failed') THEN
    RAISE EXCEPTION 'Unsupported final status';
  END IF;

  IF p_delivery_result IS NULL OR jsonb_typeof(p_delivery_result) <> 'object' THEN
    RAISE EXCEPTION 'Delivery result must be a JSON object';
  END IF;

  UPDATE public.n8n_global_jobs
     SET status = p_final_status,
         job_data = job_data || jsonb_build_object('delivery_result', p_delivery_result),
         updated_at = pg_catalog.now(),
         completed_at = pg_catalog.now()
   WHERE job_id = p_job_id
     AND product_id = 'CFCF'
     AND tenant_id = p_tenant_id
     AND status = 'processing'
   RETURNING * INTO finalized;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  RETURN NEXT finalized;
  RETURN;
END;
$function$;

REVOKE ALL ON FUNCTION public.cfcf_finalize_n8n_job(bigint, text, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cfcf_finalize_n8n_job(bigint, text, text, jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.cfcf_finalize_n8n_job(bigint, text, text, jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.cfcf_finalize_n8n_job(bigint, text, text, jsonb) TO service_role;

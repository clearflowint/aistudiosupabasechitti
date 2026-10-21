CREATE OR REPLACE FUNCTION public.cfcf_claim_next_job()
RETURNS SETOF public.n8n_global_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  claimed public.n8n_global_jobs%ROWTYPE;
BEGIN
  SELECT *
    INTO claimed
    FROM public.n8n_global_jobs
   WHERE product_id = 'CFCF'
     AND status = 'queued'
   ORDER BY created_at, job_id
   FOR UPDATE SKIP LOCKED
   LIMIT 1;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  UPDATE public.n8n_global_jobs
     SET status = 'processing',
         updated_at = pg_catalog.now()
   WHERE job_id = claimed.job_id
     AND product_id = 'CFCF'
     AND status = 'queued'
   RETURNING * INTO claimed;

  IF FOUND THEN
    RETURN NEXT claimed;
  END IF;
  RETURN;
END;
$function$;

REVOKE ALL ON FUNCTION public.cfcf_claim_next_job() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cfcf_claim_next_job() FROM anon;
REVOKE ALL ON FUNCTION public.cfcf_claim_next_job() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.cfcf_claim_next_job() TO service_role;

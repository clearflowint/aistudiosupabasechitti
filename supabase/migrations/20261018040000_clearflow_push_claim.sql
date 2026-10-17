-- Batch 5: atomically claim queued push events so concurrent dispatchers cannot send the same event.
CREATE OR REPLACE FUNCTION public.clearflow_claim_push_outbox(p_limit integer DEFAULT 25)
RETURNS SETOF public.clearflow_push_outbox
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH candidates AS (
    SELECT notification_id
    FROM public.clearflow_push_outbox
    WHERE delivery_status IN ('pending', 'partial', 'failed')
      AND available_at <= now()
      AND attempts < 8
    ORDER BY available_at, created_at
    FOR UPDATE SKIP LOCKED
    LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 25), 100))
  )
  UPDATE public.clearflow_push_outbox q
  SET delivery_status = 'processing',
      attempts = q.attempts + 1,
      locked_at = now(),
      updated_at = now()
  FROM candidates c
  WHERE q.notification_id = c.notification_id
  RETURNING q.*;
$$;

REVOKE ALL ON FUNCTION public.clearflow_claim_push_outbox(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.clearflow_claim_push_outbox(integer) TO service_role;

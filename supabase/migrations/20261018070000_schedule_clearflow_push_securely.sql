-- Secure recurring delivery for ClearFlow push notifications.
-- The dispatch secret is read from Supabase Vault at runtime; it is never embedded
-- in migration text or cron command strings.

CREATE OR REPLACE FUNCTION public.clearflow_push_cron_call(p_task text)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault, net, pg_temp
AS $$
DECLARE
  v_secret text;
  v_url text;
  v_request_id bigint;
BEGIN
  IF p_task NOT IN ('evaluate', 'dispatch') THEN
    RAISE EXCEPTION 'Unsupported ClearFlow push task';
  END IF;

  SELECT decrypted_secret
    INTO v_secret
    FROM vault.decrypted_secrets
   WHERE name = 'clearflow_push_dispatch_secret';

  IF v_secret IS NULL OR length(v_secret) < 32 THEN
    RAISE EXCEPTION 'ClearFlow push dispatch secret is missing or invalid in Vault';
  END IF;

  v_url := 'https://dpokiryjtyikfspvfjwu.supabase.co/functions/v1/' ||
           CASE p_task
             WHEN 'evaluate' THEN 'clearflow-push-evaluate'
             WHEN 'dispatch' THEN 'clearflow-push-dispatch'
           END;

  SELECT net.http_post(
    url := v_url,
    body := '{}'::jsonb,
    params := '{}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-clearflow-dispatch-secret', v_secret
    ),
    timeout_milliseconds := 10000
  ) INTO v_request_id;

  RETURN v_request_id;
END;
$$;

REVOKE ALL ON FUNCTION public.clearflow_push_cron_call(text) FROM PUBLIC, anon, authenticated, service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'clearflow-push-evaluate-daily') THEN
    PERFORM cron.unschedule('clearflow-push-evaluate-daily');
  END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'clearflow-push-dispatch-minute') THEN
    PERFORM cron.unschedule('clearflow-push-dispatch-minute');
  END IF;
END;
$$;

-- Evaluate CFCF manager alerts once daily at 02:10 UTC.
SELECT cron.schedule(
  'clearflow-push-evaluate-daily',
  '10 2 * * *',
  $job$SELECT public.clearflow_push_cron_call('evaluate');$job$
);

-- Drain queued notifications every minute. Delivery remains disabled until an
-- origin is explicitly marked push_enabled=true and a device is subscribed.
SELECT cron.schedule(
  'clearflow-push-dispatch-minute',
  '* * * * *',
  $job$SELECT public.clearflow_push_cron_call('dispatch');$job$
);

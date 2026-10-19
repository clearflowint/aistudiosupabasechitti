-- Add a separate daily PWA manager-alert summary without changing six-hour new-alert behavior.
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
  v_body jsonb := '{}'::jsonb;
BEGIN
  IF p_task NOT IN ('evaluate', 'daily_summary', 'dispatch') THEN
    RAISE EXCEPTION 'Unsupported ClearFlow push task';
  END IF;

  SELECT decrypted_secret INTO v_secret
  FROM vault.decrypted_secrets
  WHERE name = 'clearflow_push_dispatch_secret';

  IF v_secret IS NULL OR length(v_secret) < 32 THEN
    RAISE EXCEPTION 'ClearFlow push dispatch secret is missing or invalid in Vault';
  END IF;

  v_url := 'https://dpokiryjtyikfspvfjwu.supabase.co/functions/v1/' ||
    CASE p_task
      WHEN 'evaluate' THEN 'clearflow-push-evaluate'
      WHEN 'daily_summary' THEN 'clearflow-push-evaluate'
      WHEN 'dispatch' THEN 'clearflow-push-dispatch'
    END;

  IF p_task = 'daily_summary' THEN
    v_body := '{"mode":"daily_summary"}'::jsonb;
  END IF;

  SELECT net.http_post(
    url := v_url,
    body := v_body,
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
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'clearflow-push-daily-summary-8am-ist') THEN
    PERFORM cron.unschedule('clearflow-push-daily-summary-8am-ist');
  END IF;
END;
$$;

-- 08:00 Asia/Kolkata = 02:30 UTC. Keep the existing six-hour evaluator untouched.
SELECT cron.schedule(
  'clearflow-push-daily-summary-8am-ist',
  '30 2 * * *',
  $job$SELECT public.clearflow_push_cron_call('daily_summary');$job$
);

-- Roll back the unfinished CFCF scheduled/manual job prototype.
-- The live tables were verified empty before this migration was prepared.
-- Keep the original migrations as immutable history; this migration records the rollback.
-- Deliberately does not touch any clearflow_push_* tables, functions, triggers, or cron jobs.

DO $rollback_guard$
DECLARE
  v_count bigint;
BEGIN
  IF to_regclass('public.cfcf_automation_jobs') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM public.cfcf_automation_jobs' INTO v_count;
    IF v_count <> 0 THEN
      RAISE EXCEPTION
        'Refusing to drop public.cfcf_automation_jobs: % rows exist; export/reconcile them first',
        v_count;
    END IF;
  END IF;

  IF to_regclass('public.cfcf_automation_schedules') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM public.cfcf_automation_schedules' INTO v_count;
    IF v_count <> 0 THEN
      RAISE EXCEPTION
        'Refusing to drop public.cfcf_automation_schedules: % rows exist; export/reconcile them first',
        v_count;
    END IF;
  END IF;
END;
$rollback_guard$;

-- Remove only the RPCs introduced for the unfinished CFCF automation prototype.
DROP FUNCTION IF EXISTS public.cfcf_claim_automation_jobs(integer);
DROP FUNCTION IF EXISTS public.cfcf_claim_due_automation_schedules(integer);
DROP FUNCTION IF EXISTS public.cfcf_create_manual_automation_job(text, text, text);
DROP FUNCTION IF EXISTS public.cfcf_enqueue_scheduled_automation_job(uuid, timestamptz, timestamptz);
DROP FUNCTION IF EXISTS public.cfcf_fail_exhausted_automation_jobs(integer);
DROP FUNCTION IF EXISTS public.cfcf_initialize_automation_schedule(uuid, timestamptz, timestamptz);
DROP FUNCTION IF EXISTS public.cfcf_list_automation_jobs(text, text, integer);
DROP FUNCTION IF EXISTS public.cfcf_list_automation_schedules(text, text);
DROP FUNCTION IF EXISTS public.cfcf_release_automation_schedule_claim(uuid, text);
DROP FUNCTION IF EXISTS public.cfcf_save_automation_schedule(text, text, text, smallint, smallint, time, text, boolean);

-- Jobs first because each scheduled job may reference a schedule.
-- RESTRICT is intentional: unexpected dependencies must stop this migration.
DROP TABLE IF EXISTS public.cfcf_automation_jobs RESTRICT;
DROP TABLE IF EXISTS public.cfcf_automation_schedules RESTRICT;

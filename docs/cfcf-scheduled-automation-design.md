# CFCF Scheduled Automation — Design and Rollout

## Confirmed behavior

- Recurring monthly schedules, in `Asia/Kolkata` by default.
- Per Fund: up to three pending-reminder slots and two report slots.
- Day 29–31 schedules run on the month's last calendar day when that day does not exist.
- n8n owns schedule evaluation, recipient selection, message/report preparation, paced delivery, retry policy, WAHA/provider interaction and progress updates.
- Supabase stores schedule configuration and durable job history, enforces tenant ownership/deduplication, and provides atomic queue claims.
- Existing `clearflow_push_outbox` is reused for manager push alerts. Do not add another notification queue.
- Report output is HTML/CSV or a link to an output artifact; do not reintroduce PDF generation.

## Existing database context inspected

CFCF already has `cfcf_funds`, `cfcf_cycles`, `cfcf_bills`, `cfcf_shares`, and `cfcf_payments`. The existing `clearflow_push_subscriptions`, `clearflow_push_outbox`, and `clearflow_claim_push_outbox` support the PWA push channel. The live CFCF product origin is active with push enabled. The automation schedule/job tables are deployed in production; both currently contain zero rows. A follow-up migration adds composite foreign keys so every automation job's tenant/product and optional fund target must match.

## Proposed tables

### `cfcf_automation_schedules`

One row per configured slot:
- `schedule_id`, `product_id`, `tenant_id`, `fund_id`
- `job_type` (`pending_due_reminder` or `report`), `slot_number`
- `day_of_month`, `time_of_day`, `timezone`
- `is_enabled`, `next_run_at`, `last_run_at`, `claimed_until`, `last_error`
- timestamps

Unique constraint on tenant + fund + job type + slot prevents duplicate slots. RLS is enabled and direct `anon`/ `authenticated` table access is revoked. Manager access is through owner-checked RPCs: `cfcf_save_automation_schedule`, `cfcf_list_automation_schedules`, `cfcf_list_automation_jobs`, and `cfcf_create_manual_automation_job`. Never grant browser users the service-role key.

### `cfcf_automation_jobs`

One row per run, manual or scheduled:
- IDs and ownership: `job_id`, `product_id`, `tenant_id`
- fund reference/snapshot: `fund_id`, `fund_name`; tenant contact details are loaded from current tenant/contact records by n8n only when needed, not duplicated in job history.
- type/trigger: `job_type`, `trigger_type`, `schedule_id`, `scheduled_for`
- idempotency and lifecycle: `idempotency_key`, `status`, `n8n_execution_id`, `attempts`, `claimed_until`
- progress: `recipient_count`, `processed_count`, `success_count`, `failed_count`, `skipped_count`, `progress_message`, `error_summary`, `result_summary`, `output_url`
- timestamps: `created_at`, `accepted_at`, `started_at`, `completed_at`, `updated_at`

The row is the single source of truth for Manager Home and Workspace job history. Composite foreign keys enforce that the job tenant/product pair exists and that any fund target belongs to that same tenant/product. No separate events/history table is planned initially.

## Atomic claim functions

- `cfcf_claim_due_automation_schedules(p_limit)` claims due schedules for five minutes using `FOR UPDATE SKIP LOCKED`.
- `cfcf_claim_automation_jobs(p_limit)` claims queued/delayed jobs for five minutes and increments the attempt count.
- `cfcf_fail_exhausted_automation_jobs(p_limit)` marks jobs failed after eight attempts once any active claim has expired; the worker should call this before claiming work.
- `cfcf_initialize_automation_schedule(schedule_id, next_run_at, claimed_until)` initializes only a an enabled schedule whose `next_run_at` is null and whose current claim lease exactly matches the lease returned to that evaluator; it atomically releases the claim and prevents a stale evaluator from using a newer execution's lease.
- `cfcf_release_automation_schedule_claim(schedule_id, error)` currently releases an unexpired claim by schedule ID. Do not wire it into recovery yet: a stale error execution could release a newer lease. Lease-safe recovery needs the expected claim timestamp and should only be added if the workflow can reliably pass it.
- `cfcf_enqueue_scheduled_automation_job(schedule_id, scheduled_for, next_run_at)` creates the scheduled job and advances the recurrence in one transaction. Its idempotency key returns the existing job after an n8n timeout/retry.
- Both claim functions are executable only by `service_role`. n8n must use credentials stored in n8n, never browser variables. Manager RPCs are executable by `authenticated` but verify `auth.uid()` and `is_active_tenant_owner('CFCF', tenant_id)` on every call.

The n8n workflow must initialize `next_run_at` for newly enabled schedules without immediately executing them, clear `claimed_until` on successful processing, calculate and store the next monthly run, and record an error/release claim when an execution fails. Claims expire so crashed executions can be recovered. Expired `processing` jobs can be reclaimed; after eight attempts, n8n must surface a final failure rather than loop indefinitely.

## Manual trigger protection

- `cfcf_create_manual_automation_job` atomically creates a queued job only for the authenticated tenant owner and a fund in that tenant.
- An advisory transaction lock serializes concurrent clicks. A manager can trigger pending reminders at most once per hour per Fund, and reports separately at most once per hour per Fund.
- Campaigns are intentionally excluded from this job type for now; campaign launch remains a later phase.

## n8n Code node — monthly recurrence

Use this Code node after reading a schedule. It computes the next local calendar occurrence without skipping short months. Keep the schedule's configured local time; the returned ISO timestamp is converted from the selected timezone.

```javascript
const { DateTime } = require('luxon');

function nextMonthlyRun({ day_of_month, time_of_day, timezone = 'Asia/Kolkata' }, after = DateTime.now()) {
  const [hour, minute, second = '0'] = String(time_of_day).split(':');
  let cursor = after.setZone(timezone).startOf('month');

  for (let offset = 0; offset < 15; offset++) {
    const month = cursor.plus({ months: offset });
    const day = Math.min(Number(day_of_month), month.daysInMonth);
    const candidate = month.set({
      day,
      hour: Number(hour),
      minute: Number(minute),
      second: Number(second),
      millisecond: 0,
    });

    if (candidate.toMillis() > after.toMillis()) {
      return candidate.toUTC().toISO();
    }
  }

  throw new Error('Unable to calculate the next monthly run');
}

return items.map(item => ({
  json: {
    ...item.json,
    next_run_at: nextMonthlyRun(item.json),
  },
}));
```

## Importable n8n schedule evaluator

The inactive workflow export is at `n8n/cfcf-monthly-schedule-evaluator.workflow.json`.

The evaluator has been configured in the dedicated n8n instance at `https://clearflow-automation.duckdns.org`, using the Supabase project URL and a Custom Auth credential stored in n8n. It remains inactive until the worker is configured and end-to-end tests pass. The evaluator only initializes schedules and queues due jobs; it does not send messages or process reports. Test with a non-production schedule and confirm `next_run_at` advances and only one queued job is created per occurrence.

The workflow is deliberately inactive and contains no credentials or real Supabase project URL. Initialization calls the atomic `cfcf_initialize_automation_schedule` RPC and passes back the claimed lease timestamp, rather than directly PATCHing a schedule row. The failure-release RPC is available for an n8n Error Workflow; until that handler is configured, failed executions recover by lease expiry. I could not authenticate to the n8n UI from this environment, so import and credential assignment still need to be performed in the instance.

## n8n processing contract

1. Schedule Trigger runs every minute.
2. Call `POST /rest/v1/rpc/cfcf_fail_exhausted_automation_jobs` first, then call `POST /rest/v1/rpc/cfcf_claim_due_automation_schedules` and `POST /rest/v1/rpc/cfcf_claim_automation_jobs` using stored n8n credentials. Newly created schedules may have `next_run_at = null`; initialize their next future monthly occurrence and release the claim without running a job immediately.
3. For a claimed schedule with a real due timestamp, compute the next monthly occurrence in n8n and call `cfcf_enqueue_scheduled_automation_job(schedule_id, scheduled_for, next_run_at)`. This transaction creates the job and advances the schedule atomically. If `next_run_at` is null, initialize it to the next future occurrence and release the claim without creating a job.
4. For each claimed job, validate the job type and ownership, then load only the required fund, share, bill and contact data.
5. Pending reminders use saved pending/billing values; they must not invent dues or recalculate CFCF financial ledgers. Reports read saved records and render an HTML/CSV artifact. No PDF generation.
6. Process recipients in n8n with bounded concurrency, provider-specific rate limits and retries only for transient failures. Never put phone numbers, message bodies or secrets into routine execution logs.
7. Update the same job row with counts, progress, final status and timestamps. Do not create a second job for a retry.
8. Enqueue manager push notifications through the existing `clearflow_push_outbox` with idempotency keys `automation-job:<job_id>:accepted` and `automation-job:<job_id>:final`. Keep push text generic.
9. If a workflow crashes, allow the claim to expire and retry idempotently. A job must not be reported `completed` until its provider operations and final state update are done.

## Still required before production activation

- Add the mobile-first manager UI for schedule setup, manual triggers and job history using the owner-checked RPCs.
- Import/configure the workflow in the n8n instance at `https://clearflow-automation.duckdns.org`; configure the Supabase service-role credential and WAHA/provider credential in n8n's credential store. Do not put secrets in the workflow JSON, source code, or browser variables.
- Finish the workflow's provider nodes and report delivery destination.
- Verify manual and scheduled paths with a test tenant, including month-end dates, duplicate execution, claim expiry, retries, and manager push notifications.
- Keep campaign launch disabled until the separate campaign acceptance/callback path has its own end-to-end test.

# Global n8n WhatsApp Worker Contract — Batch 9

## Status

This is the repository-side implementation contract for the future worker. It is not an exported or active n8n workflow. No database migration is run and no WhatsApp message is sent by this document.

## Scope boundary

- The global worker handles only jobs registered in `n8n_global_jobs` and their linked communication/delivery rows.
- Existing CFCF campaign dispatch and campaign callbacks remain separate. Do not invoke campaign dispatch from this worker or create a second campaign send path.
- The monthly schedule evaluator remains inactive and is not the WhatsApp worker.
- Do not modify PWA push-notification tables, functions, triggers, cron jobs, or data.
- n8n owns orchestration and WAHA calls. Supabase registry RPCs own atomic claiming and durable lifecycle state.

## Required identifiers and scope

- All registry-generated primary keys are sequential PostgreSQL integer identity values starting at 100: `n8n_global_job_id`, `n8n_whatsapp_communication_id`, and `n8n_whatsapp_delivery_id`. Do not parse them as UUIDs or send them as UUID RPC arguments.
- Preserve existing types for `product_id`, `tenant_id`, person/contact IDs and source-record IDs.
- Every read and write must retain `product_id` and `tenant_id`; CFCF jobs use `product_id = 'CFCF'`. Do not infer tenant scope from a phone number or inbound provider payload.
- Keep the Supabase service-role credential and WAHA credential in n8n credentials only. Never put secrets in workflow JSON, browser code, repository files, or execution output.

## Worker sequence

1. Call `n8n_claim_global_jobs(p_limit)` using the service-role credential, with a conservative bounded limit. The RPC returns claimed job rows only; it does not include recipient contact data.
2. For each returned job, query its communication row using all available scope fields, including `n8n_global_job_id`, `product_id`, and `tenant_id`. Then fetch that communication's delivery rows with the same product/tenant scope. Do not perform a broad tenant-free recipient query.
3. Validate the stored message payload and the usable phone number before a provider call. A contact with no usable phone must have been filtered before registration; `skipped` is only for an intentionally excluded recipient that was already registered with a usable phone.
4. Resolve the configured WAHA endpoint and actual session name from deployment configuration. Do not guess either value. Until the endpoint is reachable and the session is confirmed, keep the sender workflow inactive.
5. Send only a delivery that is still `queued`. Do not call the provider again for a delivery already marked `sent_to_server`, `failed`, `uncertain`, or `skipped`.
6. On a confirmed WAHA server acceptance, call `n8n_record_whatsapp_delivery_result` with `sent_to_server`, the provider message ID when supplied, and the actual WAHA session name. This status means accepted by the provider/server, not delivered or read by the recipient.
7. On a definitive provider rejection, record `failed` with bounded error details. If the request times out or the result cannot prove whether WAHA accepted it, record `uncertain`; do not resend automatically.
8. When all registered deliveries have terminal outcomes, call `n8n_finish_global_job` with `completed` only if no delivery remains `queued`. Use `failed` for a worker-level terminal failure and include a concise error. Do not treat a database or callback timeout as proof that a message was not sent.
9. If the worker crashes or a claim becomes stale, the registry marks the job `timed_out` after its configured 90-minute threshold. This is for inspection, not automatic requeue. A human/operator must inspect uncertain deliveries before any explicit re-registration or resend decision.

## Failure and idempotency rules

- No automatic send retries, no automatic requeue, and no blind resend after uncertain results.
- Registration idempotency prevents duplicate logical jobs; it is not permission to repeat a WAHA send.
- Repeated identical result callbacks are idempotent. An `uncertain` delivery may transition to `sent_to_server` only when positive provider acknowledgement is obtained; that transition must not trigger a send.
- Keep provider message IDs, actual session names, and error details on the delivery record. Do not log secrets or full credentials.
- A worker must not mark a job `completed` while any recipient delivery is `queued`. The database RPC is the final guard.
- Keep all status writes in the registry RPC contract; do not update registry status columns ad hoc from a workflow.

## Setup blockers before an executable workflow can be safely completed

1. Confirm the deployed WAHA base URL is reachable from the n8n runtime.
2. Confirm the exact WAHA session name and which WAHA send endpoint/payload the deployment supports.
3. Configure Supabase and WAHA credentials in n8n's credential store; do not commit values.
4. Import the worker as inactive and validate node expressions with synthetic data only.
5. Validate tenant/product-scoped lookups, integer registry IDs, and each delivery outcome using a disposable PostgreSQL test database. No billable Supabase branch is assumed or created.
6. Run controlled end-to-end delivery tests only after the database runtime checks pass and the user explicitly authorizes the controlled send. Until then, keep the worker and monthly evaluator inactive.

## Validation evidence

Repository-level checks can verify workflow structure, integer ID usage, scope propagation and inactive status. They cannot prove PostgreSQL runtime behavior, WAHA connectivity, session validity, or real delivery. These remain unverified until the gated tests above are authorized and performed.

## Existing send-flow migration status

**Neither existing send entry point has been switched to the global job-ID route in this PR.** This distinction is intentional: the registry migrations are not deployed, and the worker is not yet executable or active.

| Existing entry point | Current route | Required target |
|---|---|---|
| Contact Groups → Launch Campaign | `ContactGroupsPanel.tsx` → authenticated `campaign-dispatch` Edge Function → `N8N_CAMPAIGN_WEBHOOK_URL` → existing n8n campaign flow/callback | For WhatsApp recipients, register an idempotent global job and recipient delivery rows, then let the global worker send. Preserve the existing campaign notification and acceptance/final-callback contract. Keep SMS/email behavior separate until the registry explicitly supports those channels; never send the same WhatsApp recipient through both paths. |
| Workspace bulk Pending / Reports WhatsApp actions | `workspace-automation.service.ts` currently has a placeholder URL and `CFCF_WORKSPACE_AUTOMATIONS_ENABLED = false`; no production route is connected | Replace the placeholder with an authenticated server-side handoff that registers a global job scoped to `product_id = 'CFCF'` and the authorized `tenant_id`, then return an immediate acceptance receipt. The worker uses the integer `n8n_global_job_id` and per-recipient delivery IDs. Preserve the existing per-tenant hourly limits and source-record/idempotency protections. |
| Monthly scheduled evaluator | Existing workflow JSON uses placeholder Supabase URLs and is inactive; it does not call the global registry | Keep inactive until the schedule-to-job handoff is explicitly wired and tested. Do not treat the evaluator as the sender. |

### Safe cutover order

1. Keep both UI gates disabled and the existing campaign route unchanged while the registry is only in a draft PR.
2. Finish and validate the worker with synthetic data, including integer IDs, scoped lookups, duplicate-registration behavior, and terminal delivery states.
3. Confirm the actual WAHA endpoint and session name; configure credentials in n8n, not in source files.
4. Add the server-side registration handoff for workspace Pending/Reports and the WhatsApp portion of Launch Campaign. Use a stable source-based idempotency key. Do not put service-role credentials or registry writes in browser code.
5. Ensure each WhatsApp send has exactly one path: either the legacy campaign workflow or the global worker, never both. Keep the existing campaign callback/notification aggregation for campaign status; the registry is the per-recipient WhatsApp delivery ledger, not a replacement for the product notification history.
6. Only after SQL runtime tests and a user-authorized controlled test pass, enable the relevant gates in a separate, reviewed change. Do not enable SMS/email through the WhatsApp-only registry.
7. Do not introduce automatic retries, automatic requeue, or blind resend for uncertain sends. Keep the current no-retry policy for the global worker.

Until these steps are complete, report the old flows as **not migrated** rather than implying that adding the registry tables automatically reroutes them.

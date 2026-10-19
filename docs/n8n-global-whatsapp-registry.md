# Global n8n WhatsApp Registry — Batch 1

## Scope

This migration introduces three global n8n tables only:
- `n8n_global_jobs`: handoff/status registry; it does not replace product-owned business records.
- `n8n_whatsapp_communications`: one WhatsApp communication/batch per global job.
- `n8n_whatsapp_deliveries`: one row per recipient and communication.

It intentionally does **not** alter `clearflow_push_subscriptions`, `clearflow_push_outbox`, `clearflow_push_alert_state`, their functions, triggers, cron jobs, or data. It also does not activate any n8n workflow or enable PWA buttons.

## Identity and isolation

Every global job requires `product_id`, `tenant_id`, and `person_id`. For manual work, use the authenticated initiating person; for scheduled work, use the trusted person responsible for the schedule; for a campaign launch, use the authorized initiator. The person must be active and belong to the same product and tenant. Communication and delivery records repeat product/tenant scope so composite foreign keys and triggers reject cross-scope writes.

CFCF callers must set `product_id = 'CFCF'`. CFCF jobs remain fund-scoped through their source record; do not add `person_id` to `cfcf_automation_jobs`.

## Status meanings

Global job:
- `registered`: accepted into the registry, not yet picked up.
- `picked_up`: n8n has claimed the handoff.
- `completed`: orchestration completed.
- `failed`: terminal processing failure.
- `timed_out`: handoff did not complete within the configured deadline.

Recipient delivery:
- `queued`: not attempted.
- `sent_to_server`: WAHA/WhatsApp server acceptance was confirmed.
- `failed`: provider rejection or confirmed recipient failure.
- `uncertain`: the request may have been accepted but the outcome is unknown; do not blindly resend.
- `skipped`: recipient intentionally excluded (for example, missing/invalid address).

Do not use `delivered` or `read`: those device-level states are out of scope.

## Idempotency and hourly limits

`n8n_global_jobs.idempotency_key` is unique. Registration code must derive a stable key from the source action/request so browser retries cannot create duplicate jobs. Do not add a second hourly limiter: the existing one-Pending and one-Report bulk send per tenant per hour remains authoritative. Preserve its existing duplicate-request protection.

Each batch has one global job and one communication row; every recipient has one delivery row. Campaign launch integration must reuse the existing campaign ID/acceptance lifecycle rather than create a second campaign or send twice.

## Registration and lifecycle RPCs

- `n8n_register_whatsapp_job(...)` atomically creates the global job, one communication record and the recipient delivery rows. It requires product, tenant, person, source identity and idempotency key. Reusing the same key for the same logical source returns the original IDs; reusing it for a different scope/source fails. Registrations with the same key are serialized with a transaction-scoped advisory lock so simultaneous retries resolve idempotently.
- `n8n_claim_global_jobs(p_limit)` atomically claims registered jobs with `FOR UPDATE SKIP LOCKED`. Stale picked-up jobs older than 15 minutes become `timed_out` and are not automatically resent.
- `n8n_finish_global_job(job_id, status, error)` finalizes a picked-up job as `completed`, `failed` or `timed_out`.
- These RPCs are service-role-only. They are not yet connected to any active n8n workflow.

## Credentials and activation

Only `service_role` has table access. Never expose a service-role key, WAHA API key, callback secret, or private webhook URL to browser code or commit them to GitHub. No sender workflow should be activated until session routing, delivery idempotency, callbacks, and tenant-isolation tests pass.

## Migration boundary

This migration adds new tables and validation functions/triggers only. It does not change CFCF financial data, PWA push-notification tables, existing CFCF automation tables/RPCs, campaign notification storage, or frontend behavior.

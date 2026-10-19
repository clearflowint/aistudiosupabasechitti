# Global n8n WhatsApp Registry — Batch 1

## Scope

This migration introduces three global n8n tables only. Their database-generated primary keys are sequential integers starting at 100 (not UUIDs); existing tenant, person and source-record identifiers retain their existing types.
- `n8n_global_jobs`: handoff/status registry; it does not replace product-owned business records.
- `n8n_whatsapp_communications`: one WhatsApp communication/batch per global job.
- `n8n_whatsapp_deliveries`: one row per recipient and communication.

It intentionally does **not** alter `clearflow_push_subscriptions`, `clearflow_push_outbox`, `clearflow_push_alert_state`, their functions, triggers, cron jobs, or data. It also does not activate any n8n workflow or enable PWA buttons.

## Identity and isolation

Every global job requires `product_id` and `tenant_id`. `person_id` is nullable because scheduled or fund-level jobs may have no initiating person. When supplied, the person must be active and belong to the same product and tenant. Manual work and campaign launches should record the authenticated/authorized initiator when available. Communication and delivery records repeat product/tenant scope so composite foreign keys and triggers reject cross-scope writes.

CFCF callers must set `product_id = 'CFCF'`. CFCF jobs remain fund-scoped through their source record; do not add `person_id` to `cfcf_automation_jobs`.

## Status meanings

Global job:
- `registered`: accepted into the registry, not yet picked up.
- `picked_up`: n8n has claimed the handoff.
- `completed`: orchestration completed.
- `failed`: terminal processing failure.
- `timed_out`: handoff did not complete within the configured 90-minute deadline.

Recipient delivery:
- `queued`: not attempted.
- `sent_to_server`: WAHA/WhatsApp server acceptance was confirmed.
- `failed`: provider rejection or confirmed recipient failure.
- `uncertain`: the request may have been accepted but the outcome is unknown; do not blindly resend.
- `skipped`: a registered recipient with a usable stored phone was intentionally excluded from sending. Contacts with a missing or invalid phone should be filtered before registration; the registration RPC requires a nonblank `recipient_phone`, so those contacts do not receive delivery rows.

Do not use `delivered` or `read`: those device-level states are out of scope.

## Idempotency and hourly limits

`n8n_global_jobs.idempotency_key` is unique. Registration code must derive a stable key from the source action/request so duplicate submissions cannot create duplicate jobs. This is duplicate-request protection, not an instruction to retry processing or resend messages. Do not add a second hourly limiter: the existing one-Pending and one-Report bulk send per tenant per hour remains authoritative. Preserve its existing duplicate-request protection.

Each batch has one global job and one communication row; every recipient has one delivery row. Campaign launch integration must reuse the existing campaign ID/acceptance lifecycle rather than create a second campaign or send twice.

## Registration and lifecycle RPCs

- `n8n_register_whatsapp_job(...)` atomically creates the global job, one communication record and the recipient delivery rows. It requires product, tenant, source identity and idempotency key; the initiating person is optional. Reusing the same key for the same logical source and identical communication details/recipient set returns the original IDs; reusing it for a different scope/source, changed message/payload/schedule, or changed recipient set fails. A phone cannot map to conflicting person/contact identities within one request. Registrations with the same key are serialized with a transaction-scoped advisory lock so simultaneous duplicate submissions resolve idempotently.
- `n8n_claim_global_jobs(p_limit)` atomically claims registered jobs with `FOR UPDATE SKIP LOCKED`. Stale picked-up jobs older than 90 minutes become `timed_out`; they are not automatically requeued or resent. The 90-minute threshold is provisional and must be checked against expected worker runtime before activation.
- `n8n_record_whatsapp_delivery_result(delivery_id, status, provider_message_id, error_code, error_message, session_name)` records a recipient result. Allowed first outcomes are `sent_to_server`, `failed`, `uncertain` or `skipped`; `sent_to_server` requires the actual WAHA session name. Use `skipped` only for an intentionally excluded recipient already registered with a usable phone. Contacts without a usable phone must be filtered before registration. A later positive provider acknowledgement may change `uncertain` to `sent_to_server`, but never initiates a resend. Other conflicting terminal transitions are rejected. Repeated same-status callbacks are idempotent.
- `n8n_finish_global_job(job_id, status, error)` finalizes a picked-up job as `completed`, `failed` or `timed_out`. It rejects `completed` while any recipient delivery remains `queued`; failed and uncertain recipient outcomes can still be recorded without claiming device delivery.
- These RPCs are service-role-only. They are not yet connected to any active n8n workflow.

## Credentials and activation

Only `service_role` has table access. Never expose a service-role key, WAHA API key, callback secret, or private webhook URL to browser code or commit them to GitHub. No sender workflow should be activated until session routing, duplicate-request protection, callback handling, and tenant-isolation tests pass. There is no automatic send-retry loop in this design; uncertain sends are recorded for inspection rather than resent automatically.

## Migration boundary

This migration adds new tables and validation functions/triggers only. It does not change CFCF financial data, PWA push-notification tables, existing CFCF automation tables/RPCs, campaign notification storage, or frontend behavior.


## Non-billable static validation checklist

Run these against an isolated test database before production deployment; repository checks alone do not prove PostgreSQL execution:

1. Apply both migrations in order and verify all three tables, indexes, triggers, RPC signatures, and sequential integer IDs starting at 100 for all three registry tables.
2. Register a valid job with two distinct recipient phones; expect one job, one communication and two delivery rows.
3. Repeat the same registration with the same idempotency key and source identity; expect the same IDs and no additional rows.
4. Reuse that key with a different tenant, product, person (including null/non-null mismatch) or source; expect an error and no additional rows.
5. Attempt an inactive or cross-tenant/product person; expect rejection.
6. Submit duplicate phone numbers in one recipient array; expect one delivery per phone.
7. Submit an empty recipient array, malformed recipient JSON or a blank phone; expect rejection of the entire transaction.
8. Run two concurrent claims; expect a job to be returned to at most one claimant.
9. Race a delivery-result callback against job completion; job completion must not succeed while the callback is still leaving a delivery queued.
10. Finalize a picked-up job; verify a second finalization returns false.
11. Age a picked-up job past the timeout threshold in a disposable test database; verify it becomes `timed_out` and is not requeued automatically.
12. Verify all registry tables have RLS enabled, client roles have no table/RPC access, and service-role RPC calls work.
13. Verify delivery transitions: queued to each valid outcome; uncertain to sent_to_server only on positive acknowledgement; reject conflicting terminal transitions; duplicate callbacks are harmless.
14. Verify a global job cannot be completed while any delivery remains queued.
15. Compare the PWA push-notification schema/data before and after: no changes are expected.

**Current evidence level:** source-level/static checks only. These runtime tests have not been executed because no billable test branch was approved. Do not treat this PR as production-ready until they pass.

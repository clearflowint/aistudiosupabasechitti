# CFCF Automation Job Finalization Contract (Draft)

Status: design-only. This document does not install a database function, activate n8n, or authorize provider delivery.

## Purpose

A worker must be able to record the outcome of a claimed job without allowing an expired/stale worker to overwrite the state written by a newer worker. The job's five-minute claim lease is the ownership token.

## Proposed RPC

Proposed name: `cfcf_finalize_automation_job`.

Required inputs:
- `p_job_id uuid`
- `p_tenant_id text`
- `p_fund_id text`
- `p_claimed_until timestamptz` — exact value returned by `cfcf_claim_automation_jobs`
- `p_status text` — one of `completed`, `partial`, `failed`, `delayed`
- `p_recipient_count integer`
- `p_processed_count integer`
- `p_success_count integer`
- `p_failed_count integer`
- `p_skipped_count integer`
- optional controlled `p_progress_code` and `p_error_code`, not arbitrary message text

## Required validation

1. Find the job by the full scope: `job_id + product_id='CFCF' + tenant_id + fund_id`.
2. Update only when `status='processing'`, the stored `claimed_until` exactly equals `p_claimed_until`, and that lease is still in the future. A mismatch returns a safe conflict result or raises a documented conflict error; it must not modify the row.
3. All counters must be nonnegative; `processed_count <= recipient_count`; `success_count + failed_count + skipped_count = processed_count`.
4. For terminal outcomes (`completed`, `partial`, `failed`), require `processed_count = recipient_count`. A partial outcome means some recipients failed or were skipped, not that processing is unfinished.
5. `completed` requires `failed_count=0` and `skipped_count=0`. `partial` requires at least one success and at least one failure or skip. `failed` is for a terminal job with no successful recipient delivery or a non-delivery job failure; define this precisely in tests before implementation.
6. `delayed` is retryable and keeps `completed_at` null. If the current attempt is already the maximum (8), convert the requested delayed outcome to terminal `failed` rather than creating an unclaimable job.
7. Clear `claimed_until` on every accepted finalization. Set `completed_at` only for terminal states. Set `updated_at=now()`.
8. Persist only fixed, allowlisted progress/error codes and a small aggregate-only JSON summary. Do not accept arbitrary free-form strings that might contain phone numbers, message text, secrets, or other personal data.
9. Grant execute to `service_role` only; revoke from `public`, `anon`, and `authenticated`.

## Important delivery limitation

Job-level idempotency prevents duplicate job creation; it does not prevent sending a recipient the same WhatsApp message twice. Before any provider call, introduce a durable per-recipient delivery ledger with a unique key such as `(job_id, recipient_contact_id, message_kind)`, scoped by product/tenant. The workflow should reserve/record a delivery attempt before sending and persist provider response identifiers after sending. Treat ambiguous provider timeouts as an uncertain outcome requiring reconciliation, not blind resend. The exact ledger design must account for WAHA's actual response and idempotency capabilities.

## Minimum tests before migration approval

- valid completion clears the lease and sets terminal timestamp;
- tenant mismatch and Fund mismatch cannot update the job;
- stale claim timestamp cannot update the job;
- expired claim cannot update the job;
- negative counters and inconsistent sums are rejected;
- incomplete terminal counts are rejected;
- each allowed status follows the documented transition rules;
- delayed attempt 7 remains retryable; delayed attempt 8 becomes failed;
- repeated finalization cannot overwrite a terminal result;
- error/progress payloads cannot store arbitrary PII;
- only service role can execute the RPC.

## Activation gates

This contract is not an implementation. Keep the evaluator and worker inactive until the migration is reviewed, tests pass against synthetic jobs, per-recipient duplicate-delivery protection exists, and WAHA delivery is tested with a controlled recipient.

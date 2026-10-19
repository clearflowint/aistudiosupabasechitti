# CFCF Recipient Delivery Idempotency (Design Draft)

Status: design-only. No table, RPC, workflow node, or live provider action is created by this document.

## Goal

Prevent ordinary retries from sending the same reminder/report twice, while acknowledging that an external messaging provider may accept a request even when n8n times out before seeing the response. Without provider-supported idempotency or reliable reconciliation, exactly-once delivery cannot be guaranteed.

## WAHA documentation review

The current public WAHA documentation describes text delivery as `POST /api/sendText` with `session`, `chatId`, and `text`; API key authentication is normally supplied in the `X-Api-Key` header. The documentation also describes message events and message-ack events. See:
- Send messages: https://waha.devlike.pro/docs/how-to/send-messages/
- Events and message acknowledgements: https://waha.devlike.pro/docs/how-to/events/
- API key security: https://waha.devlike.pro/docs/how-to/security/

The reviewed public `sendText` example does not document a client idempotency-key field. This does not prove the user's installed WAHA build lacks an extension or alternate capability. Before relying on provider deduplication, inspect the actual deployed version's Swagger/OpenAPI and test its exact response and event behavior. Do not assume a generic HTTP retry is safe.

## Delivery identity

For a reminder job, the logical delivery key should be unique per:
- `product_id` (currently `CFCF`)
- `tenant_id`
- `job_id`
- `recipient_contact_id`
- `message_kind` (for example `pending_due_reminder` or a specific report notification kind)

A single recipient with several Shares in the same Fund receives one aggregated reminder per job, not one message per Share. Do not include a phone number, message body, or balance in the idempotency key. Use a unique database constraint on the logical key.

## Proposed ledger record

Fields to consider:
- generated `delivery_id`
- `product_id`, `tenant_id`, `fund_id`, `job_id`, `recipient_contact_id`, `message_kind`
- `status`: `reserved`, `sending`, `accepted`, `delivered` (only if provider confirms it), `failed_retryable`, `failed_terminal`, `uncertain`, `skipped`
- `attempt_count`, `claimed_until`, `last_attempt_at`, `provider_message_id`, `provider_status`, timestamps
- a short allowlisted error code; no raw phone number, message body, provider secret, or arbitrary provider response payload

Add composite foreign keys so tenant/product/fund/job/recipient relationships must match. Use existing contacts and jobs as the source of truth; avoid duplicating contact PII.

## Safe send protocol

1. Resolve eligible contacts only from the claimed job's validated tenant + Fund scope. Aggregate all eligible positive-pending Shares by contact using the saved `total_pending`; do not recalculate financial values.
2. Atomically reserve each logical delivery key. A uniqueness conflict means that delivery already exists and must not be treated as a new send.
3. Before calling WAHA, transition the reserved record to `sending` under a short lease. Do not log recipient PII or message content in normal execution data.
4. Call the actual configured provider endpoint. Only use a stable provider idempotency key if the deployed version's API explicitly supports it and a test confirms its behavior.
5. Persist the provider's message ID and sanitized response state. Mark `accepted` when the provider accepted the request; use `delivered` only if the provider supplies a trustworthy delivery receipt.
6. If a definite pre-send validation error occurs, mark skipped or terminal failure as appropriate. If the provider definitively rejects a request for a transient reason, retry under bounded policy.
7. If the request times out or the workflow crashes after it may have reached WAHA, mark `uncertain`. Do not automatically resend an uncertain delivery unless provider idempotency or a reconciliation query proves it safe.
8. Reconcile uncertain attempts using provider message IDs/status or a documented operator review. WAHA message-ack events may help reconcile when the event contains a correlatable provider message ID; validate the event payload and persistence behavior on the actual deployment. If there is no reliable correlation, prefer avoiding duplicate messages over automatic resend.

## Job finalization interaction

The job counters must be derived from ledger outcomes, not just attempted HTTP calls. Define the counter mapping before implementation:
- success: provider accepted (or delivered, if the product specifically requires delivery receipts) according to the agreed definition;
- failed: terminally rejected delivery;
- skipped: ineligible recipient, no usable contact, or duplicate logical delivery already completed;
- uncertain: do not count as success; keep the job retryable/partial according to a documented policy and surface the ambiguity without exposing PII.

The worker must not mark a job `completed` while any delivery remains `reserved`, `sending`, or `uncertain`. A retry must first inspect the existing ledger record and must not blindly repeat the provider call.

## Required tests

- concurrent workers reserve the same logical delivery: exactly one reservation succeeds;
- same contact with multiple Shares in the Fund yields one reminder;
- an accepted delivery is not sent again when the job retries;
- a pre-send failure is safely retryable when policy allows;
- a timeout after the provider may have accepted the message becomes `uncertain`, not an automatic resend;
- expired delivery lease cannot be overwritten by a stale worker;
- cross-tenant, cross-Fund, and cross-job recipient records are rejected;
- provider IDs and errors are sanitized; phone numbers and message bodies never appear in job summaries or ordinary logs;
- job completion is blocked while any delivery is unresolved;
- inspect the installed WAHA Swagger/OpenAPI and verify exact send response, message ID, and message-ack event correlation before enabling any live send.

## Decision required before implementation

The actual WAHA base URL, version, session, and API credential are not available in this repository review, and must not be guessed. Confirm them inside the user's deployment / n8n credential store without pasting secrets into chat. If provider-side idempotency or reliable status reconciliation is unavailable, retain the `uncertain` state and manual reconciliation path rather than claiming exactly-once delivery.

# PWA to n8n contract — minimal first working version

> This replaces the previous elaborate contract. The goal is a small, testable request-to-result flow. Product behavior belongs in the PWA and CFCF-owned n8n workflows; Supabase stores records. Older state-machine, lease, atomic-claim, generated-counter, and generic retry proposals are deferred unless a real test demonstrates the need.

## Request envelope

The PWA sends only IDs and manager-entered options. Example:

```json
{
  "request_id": "client-generated-uuid",
  "product_id": "CFCF",
  "tenant_id": "authorized-tenant-id",
  "person_id": "authorized-person-id",
  "action": "report",
  "selected": {
    "fund_id": "fund-id"
  },
  "options": {}
}
```

- Use `product_id`, `tenant_id`, and `person_id` on every handover.
- Derive tenant/person context from the authenticated workspace; do not treat body IDs as proof of authorization.
- Do not send authoritative phone numbers, recipient records, or computed results from the PWA when n8n can read the source records.
- Do not send credentials or secrets in the request.
- Keep product-specific rules in CFCF workflows. The shared contract contains only common identity, action, and correlation fields.

## Simple duplicate handling

1. In the PWA, disable Submit while the request is in progress, show a loading state, and prevent ordinary double taps. A short cooldown can help with accidental repeated taps, but must not block legitimate future work.
2. At n8n ingress, validate the request and check a request/event ID before starting the action. Do not deduplicate unrelated requests solely because their message text matches.
3. For the first working version, duplicate suppression is best-effort and happens at entry points. Do not add unique-index frameworks, leases, generic queues, or database-side workflow logic by default.
4. If a real test demonstrates a material duplicate risk across concurrent executions or restarts—especially for an external message send—add the smallest targeted persistent guard for that action. Do not turn the whole database into a workflow engine.

## Storage record

Use the minimal `public.n8n_global_jobs` draft table only for work that genuinely needs a progress/status view. A record contains a generated reference, product/tenant scope, action type, simple status, optional request ID, JSON request/result data, and timestamps. n8n creates and updates this record using its trusted server-side Supabase credential when a tracked task is requested. A database function/RPC is not needed.

Allowed statuses for the first version: `queued`, `processing`, `completed`, `failed`, `cancelled`.

- n8n owns the workflow, creates the record for tracked tasks, and updates its status.
- Ordinary n8n executions that only fetch, insert, or update business records do not automatically create job records.
- The PWA reads safe status metadata only.
- Private request/result JSON is not exposed to browser clients.
- No generated progress view, recipient-state machine, event-history framework, lease/claim RPC, or generic retry engine is required for the first working flow.
- The migration is a draft only; do not apply it without explicit approval of a named non-production environment.

## Authentication and tenant boundaries

- PWA-originated actions must use the signed-in identity and the authorized workspace. Never trust a body-supplied email, person ID, or owner flag.
- WAHA-to-n8n ingress authentication must be verified from the actual configuration; do not guess from credential names.
- For the CFCF shared agency number/session, match the sender to one authoritative CFCF contact/tenant before accessing tenant data.
- For tenant-owned numbers/sessions, resolve the tenant from the trusted receiver-number mapping, then look up the sender inside that tenant.
- Unknown or ambiguous mappings stop tenant-specific processing. Never guess a tenant.
- The current ingress and worker workflows remain inactive drafts until authentication and a controlled test are ready.

## Completion and acknowledgement

- Quick operations return their actual result; do not send a separate “queued” message.
- For work that will take noticeably longer, a single receipt may be sent after the request is accepted for processing.
- Report success only after the operation succeeds. Show a clear failure when it fails.
- Do not automatically resend an external message when it is unclear whether the provider accepted the first attempt. Surface that specific case for manual review.
- Do not build a general retry engine before a demonstrated need.

## Current status and restrictions

- The JSONB job storage migration remains unapplied.
- PWA progress UI is feature-flagged off until its data source is approved and verified.
- Shared-number ingress, tenant-owned ingress, and worker remain inactive. Automatic CFCF scheduling is out of scope.
- WAHA-to-n8n authentication remains unresolved. CFCF automatic scheduled reminders and reports are out of scope.
- No production migration/deployment, credential change, live WhatsApp send, or billable Supabase branch is authorized.
- Use synthetic data and mock provider actions for the first controlled test after the non-production environment is explicitly approved.

# ClearFlow source-to-engine contract — minimal first working version

> This contract is source-independent. Request sources include PWA, WhatsApp, AI agents, APIs, and future products, all using the same central n8n ingress/execution architecture. Product behavior belongs in product-owned workflows; Supabase stores job records. Older state-machine, lease, atomic-claim, generated-counter, and generic retry proposals remain deferred unless a real test demonstrates the need.

## Request envelope

Each source adapter normalizes a request to a common envelope. The following is an example of a PWA-originated request, not a PWA-only contract:

```json
{
  "request_id": "client-generated-uuid",
  "product_id": "CFCF",
  "tenant_id": "authorized-tenant-id",
  "person_id": "person-id",
  "action": "report",
  "selected": {
    "fund_id": "fund-id"
  },
  "options": {}
}
```

- Use `product_id`, `tenant_id`, and `person_id` on every handover.
- The PWA sends `product_id`, `tenant_id`, `person_id`, the requested action, and only the fields needed for that action. Include `request_id` for duplicate handling and `scheduled_at` only for a future-dated task.
- Do not add a separate tenant-session key, API key, or authentication key to the PWA-to-n8n request contract.
- Do not send authoritative phone numbers, recipient records, or computed results from the PWA when n8n can read the source records.
- n8n uses the supplied IDs to locate the relevant product, tenant, person, and records; source-specific handling may differ for WhatsApp, AI, APIs, and future integrations.
- Keep product-specific rules in product-owned workflows. The shared contract contains only common identity, action, and correlation fields.

## Simple duplicate handling

1. In the PWA, disable Submit while the request is in progress, show a loading state, and prevent ordinary double taps. A short cooldown can help with accidental repeated taps, but must not block legitimate future work.
2. At n8n ingress, validate the request and check a request/event ID before starting the action. Do not deduplicate unrelated requests solely because their message text matches.
3. For the first working version, duplicate suppression is best-effort and happens at entry points. Do not add unique-index frameworks, leases, generic queues, or database-side workflow logic by default.
4. If a real test demonstrates a material duplicate risk across concurrent executions or restarts—especially for an external message send—add the smallest targeted persistent guard for that action. Do not turn the whole database into a workflow engine.

## Central engine and storage record

Every source enters through its appropriate n8n ingress. For PWA requests, the caller supplies the product, tenant, and person IDs without a separate tenant-session or authentication key; n8n uses those IDs to resolve the relevant records and route the action. Other sources can use their own source-specific input mapping. Only tasks needing lifecycle visibility or deferred execution create a `public.n8n_global_jobs` row; ordinary fetch/insert/update workflow operations do not automatically create jobs.

A job record contains a generated reference, product/tenant scope, open-ended `source_type`, action type, status, optional request ID, optional `scheduled_at`, JSON request/result data, and timestamps. n8n creates and updates the record using its trusted server-side Supabase credential. A database function/RPC is not needed.

For future-dated tasks, n8n persists the requested instant in `scheduled_at`. One shared n8n dispatcher checks for queued jobs whose time has arrived and routes them for execution. Do not create a separate scheduler per job or a separate CFCF recurring-reminder/report subsystem. Store the instant as `timestamptz` and normalize source time zones before writing it.

Allowed statuses for the first version: `queued`, `processing`, `completed`, `failed`, `cancelled`.

- n8n owns source routing and execution, creates records for tracked/deferred tasks, and updates their status.
- `source_type` is open-ended so future request channels do not require a schema change.
- A shared n8n dispatcher handles future-dated jobs using `scheduled_at`.
- Ordinary n8n executions that only fetch, insert, or update business records do not automatically create job records.
- The PWA reads safe status metadata only; other authorized interfaces can expose status appropriate to their source.
- Private request/result JSON is not exposed to browser clients.
- No generated progress view, recipient-state machine, event-history framework, lease/claim RPC, or generic retry engine is required for the first working flow.
- The migration is a draft only; do not apply it without explicit approval of a named non-production environment.

## Authentication and tenant boundaries

- PWA-originated actions use the `product_id`, `tenant_id`, and `person_id` supplied by the PWA contract; do not add a separate tenant-session key or authentication key to that request.
- WAHA-to-n8n ingress configuration is source-specific; document the actual configuration rather than imposing a PWA authentication-key pattern on every source.
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

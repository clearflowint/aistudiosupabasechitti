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

Every source enters through its appropriate adapter. For CFCF manual reminder/report campaigns, the authenticated PWA inserts a narrowly allow-listed request directly into `public.n8n_global_jobs`; RLS requires an active tenant owner, only the two campaign job types are accepted, and the browser cannot read `job_data` or update job status. n8n polls the registry with its trusted server-side credential, validates the request, and owns subsequent status transitions. Other sources use their own source-specific ingress. Ordinary fetch/insert/update workflow operations do not automatically create jobs.

A job record contains a generated reference, product/tenant scope, open-ended `source_type`, action type, status, optional request ID, optional `scheduled_at`, JSON request/result data, and timestamps. For the CFCF PWA manual campaign path, the PWA inserts only a validated queued request through RLS; n8n updates lifecycle status using its trusted server-side Supabase credential. Other tracked sources can have n8n create the row. No database function/RPC is needed.

For future-dated tasks, n8n persists the requested instant in `scheduled_at`. One shared n8n dispatcher checks for queued jobs whose time has arrived and routes them for execution. Do not create a separate scheduler per job or a separate CFCF recurring-reminder/report subsystem. Store the instant as `timestamptz` and normalize source time zones before writing it.

Allowed statuses for the first version: `queued`, `processing`, `completed`, `failed`, `cancelled`.

- n8n owns queue polling, validation, routing and execution, and updates status. CFCF's narrowly scoped PWA campaign request is inserted directly through RLS.
- `source_type` is open-ended so future request channels do not require a schema change.
- A shared n8n dispatcher handles future-dated jobs using `scheduled_at`.
- Ordinary n8n executions that only fetch, insert, or update business records do not automatically create job records.
- The PWA reads safe status metadata only; other authorized interfaces can expose status appropriate to their source.
- Private request/result JSON is not exposed to browser clients.
- No generated progress view, recipient-state machine, event-history framework, lease/claim RPC, or generic retry engine is required for the first working flow.
- The registry migration has been applied to the existing development-stage ClearFlow Platform project after explicit user approval.
- A follow-up migration makes registry read policies product-aware without changing existing CFCF Funds, Shares, Cycles, Payments, archive, or PWA notification policies.

## Authentication and tenant boundaries

### Existing PWA non-regression requirements

- RLS changes must not alter the current PWA's Supabase query shapes, workspace refresh flow, cache hydration, or Fund/Share/Cycle/payment/archived-Fund presentation unless a separate, explicitly approved change requires it.
- Keep tenant-scoped reads and writes consistent with the existing product services. Do not make a policy broader in a way that returns cross-tenant rows, or narrower in a way that silently hides valid records from the current manager.
- Preserve IndexedDB/offline cache isolation across tenant changes and logout. Never show records cached for a previously active tenant in the next tenant's workspace.
- Before accepting an RLS change, test two synthetic tenants with distinct Funds and records: initial load, refresh, repeated refresh, navigation between Funds, logout/login or tenant switch, and cache rehydration. Verify correct records and amounts, no duplicates, no missing authorized records, and no cross-tenant leakage.
- Treat these as regression gates; a passing TypeScript build alone does not prove PWA data correctness.
- RLS baseline: enforce strict `product_id` + `tenant_id` boundaries for tenant-owned records. Do not impose staff-to-staff or row-owner isolation as a global default. Add staff isolation only for products whose documented roles and workflows require it; keep those restrictions product-specific.
- Apply the least restrictive policy that still preserves the product's actual tenant boundary and data permissions. Do not add blanket restrictions just because a table is shared across products.
- The global job table exposes safe status metadata only and remains product/tenant-scoped. Its RLS is product-aware: CFCF status reads remain manager-only, while other products use their own active tenant-access rules. CFCF's manager-only rule is not a universal staff-isolation rule for every ClearFlow product.
- CFCF campaign requests use the authenticated Supabase session and a narrowly scoped insert policy; tenant ownership is checked by RLS. The browser never receives the service-role credential and cannot update job status.
- WAHA-to-n8n ingress configuration is source-specific; document the actual configuration rather than imposing a PWA authentication-key pattern on every source.
- For the CFCF shared agency number/session, match the sender to one authoritative CFCF contact/tenant before accessing tenant data.
- For tenant-owned numbers/sessions, resolve the tenant from the trusted receiver-number mapping, then look up the sender inside that tenant.
- Unknown or ambiguous mappings stop tenant-specific processing. Never guess a tenant.
- The CFCF manual campaign queue gate is active on a one-minute poll, but is intentionally no-send: it records a clear provider-not-configured failure until WAHA endpoint/session/authentication are verified. No real WhatsApp message is sent.

## Completion and acknowledgement

- Quick operations return their actual result; do not send a separate “queued” message.
- For work that will take noticeably longer, a single receipt may be sent after the request is accepted for processing.
- Report success only after the operation succeeds. Show a clear failure when it fails.
- Do not automatically resend an external message when it is unclear whether the provider accepted the first attempt. Surface that specific case for manual review.
- Do not build a general retry engine before a demonstrated need.

## Current status and restrictions

- The JSONB registry and the tenant-owner-only manual campaign insert policy are applied to the development-stage Supabase project.
- PWA progress UI is enabled by default and reads only safe status metadata.
- Shared-number and tenant-owned inbound WhatsApp ingress remain inactive. Automatic CFCF recurring reminders/reports remain out of scope; the one-minute n8n poll is only a central queue dispatcher.
- WAHA-to-n8n authentication remains unresolved. CFCF automatic scheduled reminders and reports are out of scope.
- Development-stage database migrations were approved and applied. Cloudflare deployment and authenticated browser/cache testing are still pending. No live WhatsApp send or credential change has been performed.
- Use synthetic data and mock provider actions for the first controlled test after the non-production environment is explicitly approved.

# ClearFlow Automation Context Contract

## Purpose

Define the trusted context that Supabase and n8n carry through automation runs. This is a contract for ClearFlow workflows; the current automation tables and worker remain CFCF-specific.

## Required context for every job

- `job_id`: durable job identifier when the workflow is job-backed.
- `product_id`: product scope, for example `CFCF`.
- `tenant_id`: tenant scope. Never infer this from a phone number, WhatsApp payload, contact name, or an untrusted request field.

Keep these values attached to each item through every n8n branch, split, merge, retry, and sub-workflow call. A node must not silently drop the context.

## Conditional context

Carry identifiers when the task needs them:

- `fund_id`: when a task targets a particular CFCF Fund.
- `person_id`: when a task is explicitly about one person.
- `contact_id`, `share_id`, `cycle_id`, `schedule_id`: when the task targets those records.
- A product-specific record ID for other ClearFlow products, with the same tenant/product validation rule.

A CFCF pending-due reminder is usually Fund-scoped and may have multiple recipients. Do not assign one arbitrary `person_id` to that job; derive recipient person/contact IDs from the Fund's scoped saved records. Use `person_id` on a job only for genuinely person-targeted work, via a reviewed forward migration and scoped foreign key.

## Contact details

The live schema already has:

- `tenants`: `tenant_id`, `product_id`, `name`, `email`, `phone`, `status`.
- `persons`: `person_id`, `tenant_id`, `product_id`, `name`, `email`, `phone`, `status`.
- `global_access_list`: links `product_id` + `tenant_id` to `person_id`, with `access_type = 'tenantowner'` for the owner relationship.

When needed, n8n should fetch current contact details from Supabase using the trusted `product_id` and `tenant_id`, and then verify the owner/person relationship. Do not duplicate tenant email/phone into every durable job row by default. Keep owner contact and recipient contact as distinct roles; a tenant owner is not automatically the reminder recipient.

## Read/write rules

1. Claim jobs using the privileged n8n credential stored in n8n, never in frontend code.
2. Treat IDs returned by Supabase as trusted workflow context, but still scope every database operation.
3. Every read must include `product_id` and `tenant_id`; add `fund_id` and related IDs where relevant.
4. Every write/update must preserve and validate the same scope. Prefer existing constraints and scoped RPCs; do not add per-node security wrapper layers.
5. Never query a record by its ID alone and assume it belongs to the job's tenant.
6. Never let inbound WhatsApp/provider data choose the tenant scope. Resolve incoming sender details against the already selected job/tenant context.
7. Pass only the minimum contact details required to the provider node. Avoid logging phone numbers, emails, message bodies, tokens, or secrets.
8. A sub-workflow must receive the same required context explicitly and must not re-resolve tenant scope from recipient data.

## Current CFCF implementation status

The deployed `cfcf_automation_jobs` table already carries `job_id`, `product_id`, `tenant_id`, and optional `fund_id`; composite foreign keys enforce tenant/product and fund/tenant/product consistency. The claim RPC returns the job row, not tenant/person contact details. The worker must therefore perform a separate, scoped lookup for contact data only when needed.

The current CFCF job schema has no `person_id`. That is intentional for Fund-level reminders/reports which may involve multiple people. If a future task is explicitly person-targeted, add an optional person reference with a composite foreign key to `persons(person_id, tenant_id, product_id)` in a new forward migration; do not edit/reapply a migration already deployed.

The schedule evaluator and worker must remain inactive until tenant-scoped reads/writes, recipient resolution, retry/idempotency, and a two-tenant isolation test pass. No live messages during these tests.

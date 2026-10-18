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
- `contact_id`, `share_id`, `cycle_id`, `schedule_id`: when the task targets those records.
- A product-specific record ID for other ClearFlow products, with the same tenant/product validation rule.

**CFCF automation jobs do not need `person_id`.** Fund-level reminders and reports may involve multiple recipients, so the worker resolves recipients from the Fund's saved Share/Contact records. Do not add `person_id` to the CFCF automation job schema.

Other ClearFlow products may use `person_id` if their workflow genuinely targets one person. Keep that product-specific and validate the person against the same tenant/product scope.

## Contact details

The live schema already has:

- `tenants`: `tenant_id`, `product_id`, `name`, `email`, `phone`, `status`.
- `persons`: `person_id`, `tenant_id`, `product_id`, `name`, `email`, `phone`, `status`.
- `global_access_list`: links `product_id` + `tenant_id` to `person_id`, with `access_type = 'tenantowner'` for the owner relationship.

When needed, n8n should fetch current tenant-owner contact details from Supabase using the trusted `product_id` and `tenant_id`, and verify the owner relationship. Do not duplicate tenant email/phone into every durable job row by default. Keep owner contact and recipient contact as distinct roles; a tenant owner is not automatically the reminder recipient.

For CFCF reminders, the current schema supports recipient resolution through `cfcf_shares` (`product_id`, `tenant_id`, `fund_id`, `contact_id`) joined to `contacts` on the same contact, tenant and product scope. Use saved `total_pending` for pending reminders; do not recompute financial ledgers in n8n. Validate that any bill/cycle records used are scoped to the same product, tenant and Fund.

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

The deployed `cfcf_automation_jobs` table already carries `job_id`, `product_id`, `tenant_id`, and optional `fund_id`; composite foreign keys enforce tenant/product and fund/tenant/product consistency. The claim RPC returns the job row, not tenant/person contact details. The worker must therefore perform a separate, scoped lookup for tenant contact or Fund recipient data only when needed.

The current CFCF job schema intentionally has no `person_id`; do not add one for CFCF. The worker must resolve recipients from the Fund's scoped Share/Contact records and may have multiple recipients per job.

The schedule evaluator and worker must remain inactive until tenant-scoped reads/writes, recipient resolution, retry/idempotency, and a two-tenant isolation test pass. No live messages during these tests.

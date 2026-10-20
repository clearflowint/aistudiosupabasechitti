# ClearFlow automation job storage — simplified draft

> This document supersedes the earlier elaborate registry proposal. The design is intentionally minimal and portability-first. The migration remains draft-only and must not be applied without explicit approval for a specific non-production environment.

## Purpose

Store a small status record for an automation request so the manager can see whether it is queued, processing, completed, failed, or cancelled. The table is storage, not a workflow engine.

## Data model

One row per job in `public.n8n_global_jobs`:

- `job_id`: generated numeric reference.
- `product_id` and `tenant_id`: scope the record to the owning product and tenant.
- `job_type`: product-owned action name.
- `status`: simple lifecycle status.
- `request_id`: optional correlation value supplied by the caller.
- `job_data`: JSONB for request/result details that need to be saved.
- timestamps: created, updated, and completed.

The draft migration deliberately does not add generated progress columns, a manager progress view, event-history machinery, recipient-count constraints, queue indexes, leases, stored procedures, RPCs, or schedule tables. It does not alter existing PWA notification tables, functions, data, or cron jobs. No database function is needed to create jobs.

The manager UI reads only safe status columns, never the private `job_data` payload. Row-level security limits reads to the active tenant owner. The service role is used only by trusted n8n/server-side integration.

## Request handling

1. A request that genuinely needs visible progress is sent to its n8n workflow (for example, through an authenticated webhook).
2. n8n validates the inbound request and authorization context. It creates a row in `n8n_global_jobs` using its trusted server-side Supabase credential, then executes the requested work and updates that row's status/result.
3. The PWA reads safe status metadata and shows the saved state.
4. Ordinary n8n operations that merely fetch, insert, or update business records do not create job rows. A workflow execution is not automatically a tracked job.

The database is the record store, not the job creator or workflow coordinator. A database function/RPC is not required for this flow. Keep the service-role credential only in trusted n8n/server-side configuration, never in the browser.

For the first working version, duplicate suppression at the PWA and n8n entry points is intentionally simple and best-effort. Do not claim exactly-once processing. If testing demonstrates that a particular external action needs restart-safe duplicate protection, add the smallest targeted persistence mechanism for that action rather than expanding the general job table into a queue framework.

## Status meanings

- `queued`: accepted for later processing.
- `processing`: workflow is running.
- `completed`: workflow finished successfully according to its own result criteria.
- `failed`: workflow failed and reports failure.
- `cancelled`: manager or workflow cancelled it.

Use ordinary n8n execution/error handling first. Do not add a general retry engine. Never automatically repeat an external send when it is unclear whether the provider accepted the first attempt; show a failure/unknown result and resolve it manually if that case occurs.

## Ownership boundaries

- ClearFlow product code owns product behavior and user experience.
- CFCF-specific n8n workflows own CFCF-specific automation.
- The shared shell and shared contracts remain product-neutral.
- Supabase stores records and enforces basic tenant access; it is not the workflow coordinator.
- Provider-specific details stay in small adapter/workflow modules so the database, messaging provider, AI service, or hosting platform can be replaced.

## Current status

- Draft migration: not applied.
- PWA status card: reads safe status columns from the table; feature flag remains off until the storage path is approved and verified.
- n8n worker and inbound workflows: remain inactive drafts.
- Authenticated non-production end-to-end testing: not started.
- Production migration, deployment, credential changes, live WhatsApp sends, and billable Supabase branch: not authorized.

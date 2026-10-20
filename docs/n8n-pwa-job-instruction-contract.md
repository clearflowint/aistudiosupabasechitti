# PWA → n8n Job Instruction Contract — Batch 2

## Purpose

Define one product-neutral instruction envelope for the future PWA-to-n8n handoff. This contract is a design artifact; the PWA still uses its current campaign dispatch path. Do not point production UI at the draft webhook yet.

## Request envelope

```json
{
  "schema_version": 1,
  "request_id": "client-generated-uuid",
  "product_id": "CFCF",
  "tenant_id": "tenant-id-from-authorized-workspace",
  "action": "campaign",
  "selected": {
    "group_ids": ["group-id-1"],
    "contact_ids": []
  },
  "payload": {
    "channels": ["whatsapp"],
    "message": "Message text"
  }
}
```

Rules:

- PWA sends only the active product/tenant context, action, selected IDs, and manager-entered options. It must not send authoritative recipient names/phone numbers or pre-computed campaign results.
- `request_id` is an idempotency/correlation value for this instruction, not the database job ID. n8n creates the job row and uses its returned database `job_id` as the canonical job ID.
- n8n validates the authenticated user's identity and confirms active owner access for the exact `product_id + tenant_id` before reading private data or writing a job.
- n8n fetches authoritative contacts and group memberships from Supabase, deduplicates recipients, and resolves the actual recipient count before creating/sending the campaign.
- A campaign resolves to 1–100 unique contacts. If more than 100 resolve, reject the entire job before any provider call. Do not split automatically.
- No payload should include provider credentials, service-role keys, or any secret.
- Allowed actions are `campaign`, `pending_reminder`, and `report`. Product-specific workflow paths handle their own data and provider rules.

## Draft preview response envelope

```json
{
  "ok": true,
  "mode": "contract_preview_only",
  "draft_only": true,
  "side_effects": false,
  "request_id": "client-generated-uuid",
  "product_id": "CFCF",
  "tenant_id": "tenant-id-from-authorized-workspace",
  "action": "campaign",
  "validation": {
    "valid": true,
    "errors": [],
    "selected_contact_id_count": 0,
    "selected_group_id_count": 1,
    "resolved_recipient_count": null
  },
  "next_step": "Preview only: authentication, authoritative data resolution, JSONB persistence, schedules, callbacks, and provider actions are not connected."
}
```

This is a preview response, not a job receipt. It must not say that a job was created, queued, or sent. No database write, WAHA/provider call, schedule, or callback occurs in the draft workflow.

## Inactive n8n draft

Workflow: **ClearFlow — JSONB Job Contract Preview (Draft Only)**  
URL: https://clearflow-automation.duckdns.org/workflow/6JI23wsvDmbDEJe0  
Status verified through n8n: `active = false`. It contains three nodes: POST webhook, validation-only Code node, and JSON response. The webhook requires no credentials, so it must remain inactive until authentication and tenant-owner checks are implemented. The production URL shown in the editor is not live while the workflow is inactive.

The preview validates the envelope shape, allowed actions, required fields, selected IDs, and the explicit contact-ID limit. It does not resolve group membership, so it cannot determine the actual recipient count. The real worker must resolve the complete audience and enforce the 100-contact cap before any provider call.

## Job record contract

After the future production flow is separately approved, n8n creates one `public.n8n_global_jobs` row per instruction:

- `job_id`: database-generated ID (identity starts at 100); canonical ID returned to the PWA.
- `product_id`, `tenant_id`, `job_type`, `status`: searchable metadata.
- `job_data`: one JSONB object holding request metadata, recipient entries, progress counters, acknowledgement events, result summary and errors.
- All progress updates modify the same job row. No per-recipient database table is needed.
- PWA is read-only for job progress. n8n is the only writer.

## Status semantics

- Job: `queued`, `processing`, `completed`, `partial`, `failed`, `uncertain`, `cancelled`.
- Recipient: `pending`, `submitting`, `provider_accepted`, `failed`, `uncertain`, `skipped`.
- `provider_accepted` means the provider accepted the request, not that the recipient received or read it.
- Any ambiguous send result is `uncertain`; require manual reconciliation before a resend. Do not add automatic retries.
- n8n should update recipient entries sequentially within each job to prevent concurrent JSONB writes from overwriting one another. Keep the event history bounded and store current per-recipient status as the source for progress counts.

## Scheduled reminders and reports

Scheduling is not configured in this draft. When implemented, recurring dates belong in n8n's scheduling/workflow configuration, not in new Supabase schedule tables or generic database functions. Each actual reminder/report execution creates one job record, with the schedule identity and occurrence time stored in `job_data`. Preserve the already-decided monthly pending-reminder schedule (three configured dates) and report schedule (two configured dates) when the scheduling batch is implemented; do not guess the dates if they are not present in the approved prior configuration.

## Security and rollout gates

Before any webhook activation or PWA integration:
1. Validate authentication and tenant ownership server-side, not from request fields alone.
2. Use n8n-stored credentials for Supabase server-side writes; never expose service-role credentials to the PWA.
3. Apply and review the additive registry migration separately; do not run it from the workflow.
4. Test no-recipient, duplicate-recipient, >100-recipient, unauthorized tenant, provider timeout/uncertain result, and repeated request cases without provider sends.
5. Confirm the workflow is inactive and preview-only until the owner explicitly authorizes live integration.

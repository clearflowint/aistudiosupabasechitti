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

## Required authorization and idempotency sequence

The future production worker must execute these gates in this order, before creating a job or reading private recipient data:

1. Require a Bearer token in the HTTP Authorization header. Reject a missing token with 401.
2. Validate the token with the Supabase Auth user endpoint using the public anon key and the supplied Bearer token. Never trust a body-supplied email, person ID, or owner flag. Reject an invalid/expired token with 401.
3. Normalize the verified Auth user's email, then confirm an active `global_access_list` row matching that email, the exact `product_id + tenant_id`, `access_type = tenantowner`, and `status = active`. Also confirm the tenant itself is active and belongs to that product. Reject mismatches with 403.
4. Only after authorization, resolve group membership and authoritative contact records from Supabase. Never use phone numbers supplied by the browser.
5. Enforce the 1–100 unique recipient limit after resolving and deduplicating the complete audience, before creating a sendable job or making any provider call.
6. Store `request_id` in `job_data`. Look up an existing job by the scoped request ID before insertion. The unique index `n8n_global_jobs_request_id_unique_idx` prevents concurrent duplicate creation; on conflict, fetch and return the existing job and do not dispatch again.
7. Create the job with the database-generated `job_id`, then update the same row sequentially as recipient status changes. Bound `events` to the latest 500 entries. A failed/ambiguous provider call becomes `uncertain`; no automatic resend.
8. Return only the canonical job receipt and safe progress summary. The PWA uses its authenticated Supabase client to read jobs through RLS; browser users cannot insert/update/delete jobs.

The service-role credential is held only in n8n and never returned to the PWA. The current inactive preview workflow does **not** implement these checks and must not be treated as secure merely because it validates the request shape.

## Important: service-role credentials and RLS

Supabase `service_role` credentials bypass Row Level Security. Therefore, a query made by n8n using a service-role credential is **not** restricted by the authenticated tenant-owner SELECT policy on `n8n_global_jobs`, and table grants/RLS policies must not be treated as a boundary for those privileged requests. A leaked key or a workflow bug could cross tenant boundaries.

Required controls:

- Never place a service-role key in the PWA, webhook payload, logs, execution output, or response. Keep it only in protected n8n credentials.
- Verify the caller's Supabase access token server-side. Derive the caller identity from the verified token; ignore body-supplied identity fields.
- Check active tenant-owner access for the exact product and tenant before any private read or write. Check that each selected contact/person and group membership belongs to that same tenant. Do not rely on an ID supplied by the browser as proof of ownership.
- Prefer the caller's verified access token for user-authorized reads where RLS can enforce the intended scope. If privileged access is needed for a server-side operation, isolate that operation and enforce explicit tenant/product predicates and authorization checks.
- Restrict privileged writes to the intended job row and allowed fields. Never accept arbitrary table names, SQL, filters, tenant IDs, or job IDs from the webhook caller.
- Keep credential scope/permissions least-privileged where the platform permits it. A service-role key is project-wide privileged access, not a tenant-scoped credential.
- Do not assume the existing n8n credential named `Supabase account` is the production project or has an appropriate permission scope. Credential metadata does not reveal its endpoint, secret, or effective permissions; verify its target and access through a safe, non-mutating check before using it.
- Test unauthorized tenant, cross-tenant contact, inactive owner, inactive tenant, token expiry, repeated request, and ID-tampering cases without provider calls. Keep the workflow inactive until these gates pass and live use is separately approved.

## Authorization test matrix

Before any live integration, run these cases with no provider calls and no production writes:

- Missing Authorization header → 401; no private database access.
- Invalid or expired Supabase access token → 401.
- Valid authenticated user with no active tenant access → 403.
- Active non-owner or owner for a different tenant/product → 403.
- Inactive tenant or inactive owner access row → 403.
- Body-supplied email/person/owner flag conflicts with verified Auth identity → ignore body identity and authorize only from verified identity; reject if owner check fails.
- Selected person/contact or group belongs to a different tenant → reject before private data is returned or any job/provider action occurs.
- Duplicate `request_id` for the same product/tenant → return existing job ID and do not queue or dispatch a second time.
- Same `request_id` in another tenant/product → separate scope; never expose the other tenant's job.
- Group-resolved audience of 0 → reject without job dispatch; 1–100 unique → proceed to the next approved stage; 101+ unique → reject the whole request before provider calls.
- Provider outcome timeout/ambiguous → mark `uncertain`, stop automatic retries, and require manual reconciliation.

## Security and rollout gates

Before any webhook activation or PWA integration:

1. Implement and verify each authorization step above, including inactive tenant, non-owner, expired token, cross-tenant person/contact, and tenant-ID tampering cases.
2. Apply and review the additive registry migration separately; do not run it from the workflow.
3. Test no-recipient, duplicate-recipient, >100-recipient (including group-resolved), provider timeout/uncertain result, and repeated request cases without provider sends.
4. Verify PWA SELECT is tenant-owner scoped and INSERT/UPDATE/DELETE remain denied to authenticated browser users. Remember that this RLS policy does not constrain service-role requests.
5. Confirm the workflow is inactive and preview-only until the owner explicitly authorizes live integration.


## Multi-trigger authentication: PWA, inbound WhatsApp, and schedules

A trigger proves how a workflow started; it does not automatically prove who is authorized to access a tenant. Use a separate source-authentication adapter for each entry point, then pass a normalized, verified identity/context to the shared authorization gate. Never treat `product_id`, `tenant_id`, phone number, person ID, or a claimed role from an incoming payload as proof of authorization.

### PWA-originated manager actions

- The signed-in PWA sends its current Supabase access token in the Authorization Bearer header over HTTPS, along with the requested action, product/tenant context, selected IDs, and manager-entered options.
- n8n validates the access token with Supabase Auth, obtains the trusted user identity, and checks that identity against the active tenant-owner access record for the exact product and tenant.
- The browser must not send the service-role key. The access token is short-lived user authorization and is not a database admin credential.
- Reject missing/invalid/expired tokens before reading private records. Reject an active user who is not an authorized owner of that exact tenant/product.

### Inbound WhatsApp-originated actions

- A WhatsApp message does not carry a Supabase manager access token. Authenticate the webhook sender using the provider/transport's supported webhook signature or a strong shared secret, with replay protection where supported. Do not rely on a secret URL or sender-supplied phone number alone.
- Treat the inbound phone number as an untrusted identity claim until matched to a verified, active ClearFlow person/manager record. Normalize the number and resolve it from authoritative records; do not trust names or tenant IDs included in message text.
- Apply an explicit permission rule for the requested action. Being a known contact does not automatically make someone a tenant owner or authorize campaign sends, reports, or access to another person's financial details.
- For manager-only actions, verify that the matched sender is an active manager/owner for the exact tenant/product. If the number is unlinked, ambiguous, shared, or lacks the required role, refuse private data/actions or request a secure PWA sign-in/approval flow.
- For ordinary inbound customer messages, use a narrowly defined inbound-message workflow with only the permissions needed to process that conversation. Do not elevate the sender to manager access.
- Validate provider event IDs/timestamps and deduplicate inbound webhook events so repeated provider callbacks do not repeat a command or create duplicate jobs.

### Scheduled n8n-originated work

- A schedule trigger has no end-user access token, because it is started by n8n's trusted scheduler rather than by a signed-in manager. Authenticate the workflow execution as an internal service action, using n8n's protected credentials and access controls.
- The schedule must be configured by an authorized operator and bound to an explicit product, tenant, action, and schedule identity. Do not let a public webhook caller choose arbitrary tenant IDs or schedule identities.
- At execution time, re-check that the tenant and schedule are still active and that the schedule is authorized for the intended product/tenant. A schedule is not a permanent bypass for a tenant that has been disabled or lost eligibility.
- Use server-side credentials only for the specific required operations; enforce explicit tenant/product predicates for every private read and write. Never expose service credentials to the PWA or inbound WhatsApp sender.
- Use a stable occurrence key such as schedule identity plus the scheduled occurrence timestamp as the idempotency key. A repeated scheduler invocation must resolve to the existing job rather than create a second run or repeat a send.
- Record scheduled work in the same global JSONB job registry. The three monthly pending-reminder dates and two report dates must be recovered from the approved configuration before the scheduling batch; do not guess dates.

### Shared authorization envelope

After source authentication, each adapter should create an internal normalized context containing only verified fields, such as:

- `source_type`: `pwa`, `whatsapp`, or `schedule`
- `verified_actor_id`: Supabase Auth user ID for PWA; resolved authoritative person/manager ID for WhatsApp; controlled service/schedule identity for scheduled work
- `product_id` and `tenant_id`: values verified against current authorization records
- `action`: allowlisted action, not arbitrary SQL or a caller-selected workflow
- `request_id`: stable idempotency key appropriate to the source
- `authorization_basis`: the verified role/access check or controlled schedule permission

The shared gate must authorize the exact action for the exact product and tenant before private data access. Source identity and action permissions are not interchangeable: a valid WhatsApp webhook signature authenticates the provider delivery, not the person; a known phone number does not prove tenant ownership; and a schedule trigger proves workflow initiation, not that a tenant remains active.

### Multi-trigger security tests

Before connecting any live trigger, verify without provider sends or production writes:

- PWA missing, invalid, or expired Bearer token → reject.
- PWA user is valid but has no active owner access for the exact product/tenant → reject.
- Inbound WhatsApp invalid webhook authentication or replayed event → reject/deduplicate.
- Inbound sender phone is unknown, shared, inactive, or belongs to a different tenant → no private data disclosure and no manager action.
- Known tenant contact attempts an owner-only action without owner permissions → reject.
- Scheduled execution targets an inactive tenant or disabled schedule → skip safely and record a non-sensitive reason.
- Repeated PWA request, WhatsApp event ID, or scheduled occurrence → no duplicate job or repeated provider send.
- All three sources attempt cross-tenant person/contact IDs → reject before private data is returned.

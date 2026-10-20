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


## Workflow ownership and naming — keep global and CFCF separate

Use the established names and ownership boundaries. Do not route CFCF business logic through a generic/global business workflow, and do not invent extra workflow names when an existing workflow has the required role.

### Existing n8n workflow inventory

- **ClearFlow — JSONB Job Contract Preview (Draft Only)** — global contract preview for the PWA-to-n8n instruction envelope. It is not a CFCF WhatsApp entry workflow and remains inactive.
- **CFCF Automation Worker — Draft** — CFCF-specific worker skeleton. It is inactive and its processing path is incomplete. Legacy `cfcf_*` RPC nodes, old `n8n_whatsapp_*` placeholder nodes, and the read-only WAHA session inventory node have now been disabled to prevent accidental use of paths that do not match the approved registry. Do not treat it as a working WhatsApp entry point.
- **CFCF — Monthly Schedule Evaluator (Setup Required)** — CFCF-specific schedule evaluator. It is inactive; the HTTP nodes for the rolled-back schedule/job RPCs have now been disabled. It must be redesigned against approved n8n schedule configuration and the global JSONB registry before activation.
- **CFCF — Shared Error Handler** — currently active and shared only across the CFCF evaluator/worker. It captures sanitized workflow/execution metadata plus explicit `reviewRequired`, `needs_review`, no-blind-retry, and sender-acknowledgement flags; it does not persist a durable job failure, notify the manager, release a lease, or message the sender. It is not a cross-product global error handler.

- **CFCF — Shared WhatsApp Inbound (Draft)** — CFCF-specific shared-number ingress skeleton; inactive, unprotected webhook, no durable enqueue or sender acknowledgement. Returns retryable queue-not-ready if activated, so it must not be activated as-is.
- **CFCF — Tenant-Owned WhatsApp Inbound (Draft)** — separate CFCF-specific tenant-owned-number ingress skeleton; inactive, unprotected webhook, ignores payload-supplied tenant IDs, and has no durable enqueue or sender acknowledgement. Must not be activated as-is.

The existing **ClearFlow MCP Connection Test** is a connection-test utility only; it is not a business workflow.

### Safety preflight — legacy workflow nodes quarantined

On 2026-10-20, the existing inactive `CFCF Automation Worker — Draft` was updated to disable the legacy `cfcf_fail_exhausted_automation_jobs`, `cfcf_claim_automation_jobs`, and scoped-share HTTP nodes, along with disconnected placeholder nodes that refer to the unapproved `n8n_whatsapp_communications`/`n8n_whatsapp_deliveries` model and placeholder RPCs. Its WAHA session-inventory HTTP node was also disabled. The existing safety gate remains `liveCallsEnabled = false`; the workflow was not activated.

The inactive `CFCF — Monthly Schedule Evaluator (Setup Required)` now has its old `cfcf_claim_due_automation_schedules`, `cfcf_initialize_automation_schedule`, and `n8n_register_scheduled_cfcf_job` HTTP nodes disabled because the corresponding prototype schedule/job model was rolled back. The evaluator was not activated. These nodes must not be re-enabled as a shortcut; rebuild the evaluator around approved n8n schedule configuration and `public.n8n_global_jobs` only after the registry migration and worker design are separately approved.

A side-effect-free mock execution of `CFCF Automation Worker — Draft` succeeded and followed the `liveCallsEnabled = false` branch to `Dry Run — no database changes`. Execution output explicitly stated that no Supabase request was made. This validates only the safety gate; it does not test live routing, database access, or WhatsApp delivery.

### WhatsApp entry-point design

- For the shared-number model, use a **CFCF-dedicated shared WhatsApp number/session**. Its entry point is CFCF-specific; the product is known from trusted configuration, so the inbound flow does not need a product-selection router.
- Tenant-owned CFCF WhatsApp numbers/sessions use a separate entry path from the CFCF shared number. Resolve the receiver/business number to the owning CFCF tenant, then check the sender against that tenant's person/contact records and recorded permissions.
- The CFCF shared-number entry path checks the sender number against authoritative CFCF tenant/contact records before tenant-specific routing. A match must resolve unambiguously to one tenant/contact. If no record matches, apply the CFCF product's unknown-sender policy; if no tenant can be identified, do not guess a tenant to notify.
- Both entry paths may call existing product-neutral helper logic only where it is genuinely reusable (for example, normalized event handling or safe job-progress formatting). Product-specific decisions, Supabase table access, message content, reminder/report logic, and role rules remain within CFCF-owned workflow paths.
- Do not broadcast one inbound event to multiple business workflows. One entry path should decide the permitted route; deduplicate provider event IDs before downstream work.
- Native n8n scheduling for CFCF remains separate from WhatsApp inbound entry. The evaluator does not need a WhatsApp webhook, and WhatsApp entry does not need to invoke the schedule evaluator.
- Do not create, rename, or activate workflows as part of this documentation update. Reuse the existing names above; add a new named workflow only if a distinct entry/processing responsibility is confirmed and the existing workflows cannot safely perform it.

### Global versus product-specific data

- `public.n8n_global_jobs` is the global job registry only. Each row carries its `product_id`, `tenant_id`, `job_type`, status and JSONB job details.
- CFCF workflow logic must explicitly validate `product_id = 'CFCF'` and the resolved tenant scope before private reads, job writes or provider actions.
- The global registry does not make a product's business workflow global. CFCF campaigns, pending reminders, reports and WhatsApp routing remain CFCF-specific.
- Keep existing PWA notification tables/functions/data/cron jobs untouched. Do not recreate the rolled-back CFCF schedule/job tables or prototype RPCs as part of this design.

## Multi-trigger authentication: PWA, inbound WhatsApp, and schedules

A trigger proves how a workflow started; it does not automatically prove who is authorized to access a tenant. Use a separate source-authentication adapter for each entry point, then pass a normalized, verified identity/context to the shared authorization gate. Never treat `product_id`, `tenant_id`, phone number, person ID, or a claimed role from an incoming payload as proof of authorization.

### PWA-originated manager actions

- The signed-in PWA sends its current Supabase access token in the Authorization Bearer header over HTTPS, along with the requested action, product/tenant context, selected IDs, and manager-entered options.
- n8n validates the access token with Supabase Auth, obtains the trusted user identity, and checks that identity against the active tenant-owner access record for the exact product and tenant.
- The browser must not send the service-role key. The access token is short-lived user authorization and is not a database admin credential.
- Reject missing/invalid/expired tokens before reading private records. Reject an active user who is not an authorized owner of that exact tenant/product.

### Inbound WhatsApp-originated actions — simplified phone-based routing

- The WhatsApp sender does not need a ClearFlow secret, password, or Supabase token. Do **not** treat a WAHA session name as a secret or require it to be cross-verified as an identity credential.
- Protect the WAHA-to-n8n webhook at the transport/server boundary using the simplest protection supported by the deployment (for example, a private/internal route or reverse-proxy access control; a shared header may be used if readily supported). This is service-to-service protection, not a per-session or per-user login. Do not put secrets in WhatsApp messages or public URLs.
- **First routing gate — verify a sender record before normal routing:** normalize the actual provider sender number and look for an authoritative match in ClearFlow's tenant/contact/person/access records before allowing the message into a tenant workflow. A phone number by itself is not proof of a role or permission. Apply the configured routing mode to scope the lookup, and do not use a phone number typed in the message body. If there is no matching record, do not continue as a recognized tenant/person: apply that product's unknown-sender policy (block; notify the tenant/manager if the tenant can be safely identified; or send a neutral acknowledgement/clarification if unregistered inquiries are allowed). If no tenant can be identified, do not guess which tenant to notify; route to a neutral agency/manual-review path. Keep the inbound event and any notification free of private tenant or financial data.
- For a **shared agency number**, the sender-record lookup must resolve to one unambiguous tenant/contact before tenant-specific routing. If no sender record matches, use the unknown-sender policy above. For a **tenant-owned number**, first resolve the receiver/business number to the tenant, then check whether the sender has a person/contact record within that tenant; an unrecognized sender may be reported to that identified tenant only if the product workflow permits it, but must not be treated as a registered person.
- Route incoming messages using the actual provider event's sender and receiver/business numbers, plus the configured routing mode. Never use a phone number typed into the message body as a verified identity.
- **Shared agency number/session:** use the sender's normalized phone number as the primary lookup to identify the tenant/tenant contact who is contacting the shared agency. Treat this as a tenant-level inbound conversation initially. If the sender also matches a person record, resolve that person too, but do not assume a staff/customer role unless the tenant's records establish it.
- **Tenant-owned WhatsApp number/session:** use the receiver/business number to identify which tenant owns that WhatsApp number; then use the sender's normalized number to look up the person within that tenant and classify them using the tenant's records (for example, owner/manager, staff, or customer). Do not treat the session name as a secret or as the sole tenant key.
- Prefer exact phone-number matches within the resolved routing context. If a number is shared, duplicated, or maps to multiple tenants/people, ask a neutral clarification or route for manual review. Do not disclose private tenant or financial information until the intended tenant/person is clear.
- Keep permissions proportional to the conversation: normal inbound messages can be acknowledged and routed without owner privileges; staff/customer records can only access the actions and information assigned to their role; owner-only operations require a matching active owner record for the resolved tenant. Unknown senders may be handled as unverified inquiries, but must not receive private records or trigger privileged actions.
- Deduplicate by provider event/message ID where available. If the provider does not supply a stable ID, use a conservative fingerprint of session/routing context, sender, receiver, timestamp, and message ID/content metadata to reduce accidental duplicate processing; do not blindly repeat any outbound send after an ambiguous result.

### Scheduled n8n-originated work

- If we use n8n's **built-in Schedule Trigger**, there is no inbound HTTP request and no external app to hold a secret. The scheduler starts the workflow inside the protected n8n instance. Do not add a fake token check to a native schedule trigger.
- Keep schedule configuration and credentials accessible only to authorized n8n operators. Each scheduled workflow must have its product, tenant scope, and allowed action fixed by its trusted configuration—not supplied by a public caller.
- At run time, check that the target tenant is still active and eligible. Use the n8n-stored server credential only for the necessary operations and explicitly scope every private read/write to that product and tenant.
- Use a stable occurrence key, such as schedule identity plus the intended run timestamp, so duplicate execution of the same occurrence resolves to the existing job and does not repeat a send.
- If a separate external scheduler/app calls an n8n webhook instead, **that external app** must store and send a credential (for example, a bearer token or custom header) and n8n must validate it. This is a different setup from n8n's native Schedule Trigger.
- Record scheduled work in the same global JSONB job registry. Recover the approved three monthly pending-reminder dates and two report dates before implementing schedules; do not guess them.

### Practical rule — route by numbers, not by session secrets

| Entry point | How we identify the route/actor | What still needs authorization? |
|---|---|---|
| PWA manager action | Supabase access token from the signed-in session | Current manager/owner access for the exact product and tenant |
| Shared agency WhatsApp number | Sender number identifies the tenant/contact for the incoming conversation | Resolve ambiguity; privileged actions still require the relevant owner permission |
| Tenant-owned WhatsApp number | Receiver/business number identifies the tenant; sender number identifies the person within that tenant | Apply that person's recorded role and permissions |
| n8n native schedule | Protected n8n workflow configuration; no incoming token | Fixed tenant/action scope, current tenant eligibility, and duplicate-occurrence protection |
| External scheduling app | Credential held by that app and validated by n8n | The app's permitted product/tenant/actions and duplicate-event protection |

This intentionally avoids a separate secret per WhatsApp session. Basic protection of the WAHA-to-n8n delivery endpoint remains sensible, but the session name is routing metadata, not a credential. Phone numbers help resolve tenant/person identity; the matching ClearFlow records determine role and data access.

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
- Shared agency number: sender phone resolves to the expected tenant/contact; ambiguous mappings ask for clarification or go to manual review.
- Tenant-owned number: receiver number resolves the tenant, and sender number resolves the person/role within that tenant.
- Session name is not treated as a secret or the sole tenant identity key.
- Unknown inbound senders may receive a neutral acknowledgement, but no private data or privileged action.
- Known tenant contact attempts an owner-only action without owner permissions → reject.
- Webhook transport protection fails, or the same provider event is replayed → reject or deduplicate as appropriate.
- Scheduled execution targets an inactive tenant or disabled schedule → skip safely and record a non-sensitive reason.
- Repeated PWA request, WhatsApp event ID, or scheduled occurrence → no duplicate job or repeated provider send.
- All three sources attempt cross-tenant person/contact IDs → reject before private data is returned.


## Queueing, acknowledgements, and failure review — required before activation

### Queue the inbound request, not the webhook itself

- Both CFCF inbound paths need a durable, idempotent enqueue step. A webhook execution or an in-memory loop is not a durable queue.
- Shared-number path: validate the provider event and session, normalize the sender, resolve exactly one tenant/contact from authoritative CFCF records, and only then create the tenant-scoped job. Unknown or ambiguous sender matches must not be assigned to a guessed tenant.
- Tenant-owned path: resolve the tenant from an authoritative receiver/session-to-tenant mapping. Ignore any payload-supplied `tenant_id`. Then validate the sender/person/role within that tenant before performing private actions.
- The approved `public.n8n_global_jobs` registry requires a tenant ID. Therefore, an unknown shared-number sender cannot be inserted as a normal tenant job. It receives only a neutral, rate-limited acknowledgement/handling path; do not create a fake tenant to force it into the registry.
- The JSONB registry migration is still a draft. Until durable persistence and auth are available, both inbound drafts intentionally return `503 DURABLE_QUEUE_NOT_CONFIGURED`; they must stay inactive. A success response must never be sent before the durable queue write commits.

### Two different acknowledgements

1. **Transport acknowledgement to WAHA/provider:** return a 2xx only after the inbound event is durably stored or confirmed as an already-stored duplicate. This tells the webhook delivery mechanism it can stop retrying that event. If durable enqueue fails, return a retryable non-2xx response; the idempotent provider event ID/request key must prevent duplicate jobs if the provider retries.
2. **WhatsApp acknowledgement to the human sender:** send an immediate receipt only for work that will take longer than a normal interactive response or must continue asynchronously (for example, reports, scheduled reminders, multi-recipient campaigns, or a job that is queued behind other work). After durable enqueue, send one short receipt with a non-sensitive reference, for example: “Received your request (Ref {reference}). It’s queued for processing. Please don’t resend it; we’ll update you when there is a result.” The actual outbound WhatsApp send is not implemented in the drafts. Do not claim queued/accepted until persistence succeeds.

- **Quick operations:** if the request can be safely completed within the normal interactive response window, do not send a separate “queued” receipt. Return the actual result once the operation completes. If the operation crosses into asynchronous/queued work, send the one-time receipt after persistence. Never send a quick-operation success message before the operation succeeds.
- This rule changes only the human WhatsApp acknowledgement, not the provider transport response. Always respond to the webhook promptly: return HTTP 2xx only after the inbound event is durably stored or recognized as an already-stored duplicate. Do not wait for long business processing in the webhook.
- Keep these acknowledgements separate: an HTTP response to WAHA does not send a WhatsApp message to the sender.
- Store acknowledgement policy/state in the same job JSONB document when a job exists (e.g. not_required, pending, provider_accepted, failed, uncertain) and suppress duplicate acknowledgement sends for duplicate provider event IDs. Provider acceptance is not proof the sender received/read the message.
- Unknown/unauthorized/ambiguous senders get no tenant data or tenant-specific status. If a neutral acknowledgement is sent, it must not reveal whether a particular tenant/contact exists. Apply a bounded per-session/sender rate limit to prevent acknowledgement loops.
- Do not deduplicate distinct inbound requests by message text alone; different messages may represent distinct instructions. Use the provider event ID for transport deduplication and a scoped request ID for job idempotency.

### Failure outcomes and manager review

- **Failure before durable enqueue:** do not send a human “queued” acknowledgement. Return retryable transport failure; record only sanitized diagnostics where available.
- **Failure after enqueue but before any provider submission:** retain the job and its reference. It can be safely re-claimed only after the worker/lease state proves no provider submission was attempted. Do not create a second job.
- **Definitive provider rejection:** mark that recipient/job failed with a safe error category; do not retry unless the failure is explicitly classified as transient and the operation is proven idempotent.
- **Timeout or lost provider response after submission:** mark `uncertain`, stop automatic resend, and flag for manager review. Never infer “not sent” from a timeout.
- **Sender-acknowledgement send failure:** keep the business job state separate from the acknowledgement state. If provider acceptance is ambiguous, mark the acknowledgement `uncertain`; do not blindly send it again.
- **Workflow execution failure:** the current `CFCF — Shared Error Handler` captures sanitized execution metadata only. It is not yet a durable alert/recovery system. Once the registry is approved, store a bounded error event and `needs_review`/failure summary on the same job row; expose the safe status/reference in the manager PWA. Do not store secrets, full message bodies, phone numbers, or provider credentials in error summaries.
- Keep bounded history (maximum 500 events per job), update the single job JSONB row sequentially, and do not add per-recipient tables. If status cannot be safely resolved, show `uncertain` and request manual review rather than retrying.
- Avoid retry loops. A retry is allowed only for a classified transient failure before external side effects, or when the provider explicitly confirms rejection and the action is safe. Use finite attempts and a visible terminal outcome; no unbounded retries.

### Queue boundaries and pacing

- Inbound event acceptance should be quick: validate, deduplicate, persist, acknowledge. Do not perform a long recipient loop or send a campaign synchronously inside the inbound webhook.
- A separate CFCF worker claims a small bounded number of jobs, then loops over recipients serially or with a deliberately small concurrency limit. The current mock worker uses batch size 1 and a hard cap of 100 as a test safety ceiling; these are not evidence that the production dispatcher is ready.
- Keep independent queues/pacing per assigned WAHA session/manager. Do not fall back to another tenant's or another product's session if the assigned session is unavailable.
- If a queue is backed up, report queued/waiting state and progress; do not create duplicate jobs or tell the sender to resend.
- Never activate the new inbound drafts until server-boundary authentication, authoritative tenant resolution, durable idempotent enqueue, sender-ack deduplication, failure review, and mock integration tests all pass.

## Inbound webhook authentication gate — Batch 21

The current CFCF inbound workflow drafts are intentionally inactive and their Webhook nodes use `authentication: none`. This is a known blocking condition, not an acceptable production configuration. They must not be activated or exposed publicly in this state.

Before implementing the live ingress path, inspect the actual WAHA deployment and its reachable network boundary. Select and verify one supported protection method that matches that deployment, such as a configured n8n webhook authentication mechanism or a reverse-proxy rule that permits only the trusted WAHA source and validates a secret/signature. Do not assume that a credential with a generic name is configured for WAHA; do not attach it until its type, expected header/token format, and sender-side configuration are verified. Never put a secret in workflow code, a webhook URL, logs, or repository files.

Fail-closed requirements:

- Missing, malformed, or invalid authentication must stop before tenant/contact lookup, durable enqueue, or any human WhatsApp acknowledgement.
- Authentication failure must not reveal whether a tenant, phone number, session, or contact exists.
- Trust the receiver/session mapping only after ingress authentication. Ignore payload-supplied tenant identifiers as an authority.
- Validate the provider event ID and required sender/receiver/session fields; reject malformed events without creating jobs.
- Resolve a shared-number sender to exactly one authoritative CFCF contact/tenant; resolve a tenant-owned receiver to exactly one tenant/session mapping and then check sender/role authorization. Ambiguity is a hard stop.
- Only after the above gates pass may the workflow attempt idempotent durable enqueue. HTTP 2xx is permitted only after enqueue succeeds or the same provider event is confirmed as already stored.
- A human sender receipt is separate and conditional: only long-running work, after durable enqueue; quick operations get their result after success. Duplicate events do not cause duplicate receipts.
- Keep both inbound workflows inactive until authentication, routing, durable enqueue, duplicate handling, acknowledgement suppression, and fail-closed tests are implemented and verified.

Current blocker: the actual WAHA-to-n8n authentication configuration has not been verified in the available workflow configuration. Therefore this batch documents and tests the required gate; it does not claim the webhook is secured or ready to activate.

### Batch 22 validation note — mock gate, not deployed authentication

The repository test `modelInboundGate` exercises the required stage ordering with synthetic states: unverified authentication stops before tenant lookup; malformed events and ambiguous routes stop before enqueue; a successful transport 2xx is modeled only for durable storage or recognized duplicate events. These are contract tests only. They do not validate a real Authorization header, signature, reverse-proxy rule, WAHA delivery configuration, or n8n credential. No production ingress security change has been made because the actual WAHA-to-n8n authentication configuration remains unverified.


## Durable enqueue and duplicate-conflict model — Batch 25

A repository-only model now covers the intended durable-enqueue decisions: a scoped pre-existing request returns its canonical integer job ID without redispatch; a successful insert returns the database-generated ID; a unique conflict is accepted only after the existing same-scope job is confirmed; and an unclassified persistence error returns retryable non-2xx without a success receipt. The model also asserts that enqueue does not itself perform provider dispatch.

This is a synthetic contract model, not a PostgreSQL or n8n integration test. It does not establish that a database row was created, that the webhook is authenticated, or that a worker is connected. The preview and inbound workflows remain inactive; the draft migration remains unapplied; no provider calls or PWA notification changes were made.


## Scoped request deduplication model — Batch 26

The enqueue contract model now checks that an existing request is considered a duplicate only when product ID, tenant ID, and request ID all match. A matching request ID from a different tenant or product must not be returned as the caller's job; it remains a distinct scope. This complements the database's scoped unique index and the separate inbound provider-event identity key.

This is a synthetic test of decision rules, not a live database query or authorization implementation. A real ingress still must authenticate the source, resolve authoritative tenant scope, and confirm a duplicate row within that exact scope before returning success.

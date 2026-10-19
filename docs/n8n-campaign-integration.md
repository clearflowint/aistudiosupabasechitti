# ClearFlow n8n Campaign Contract

> Current implementation note (Batch 9): the browser launch service is being moved to the authenticated `n8n_register_whatsapp_job` Supabase RPC. It will create an integer `n8n_global_job_id` directly without calling an Edge Function or public n8n webhook. The UI gate remains disabled until the global worker and WAHA session are validated. The `campaign-dispatch` Edge Function below is retained as a legacy implementation reference; it is not the new direct job-registration route.

// CFCF PRODUCT: Payload contract for the CFCF Campaign dispatch Edge Function.
// MIX: n8n is responsible for channel-specific delivery and reporting; the browser never receives webhook secrets.

## Direct job-ID route (current target)

The browser calls the authenticated Supabase RPC with the selected Contact Group IDs and message. Supabase verifies the active CFCF tenant-owner identity, validates the supplied recipient phones against saved Contacts in the same tenant, and returns `n8n_global_job_id` plus `n8n_whatsapp_communication_id`. The browser does not call n8n directly and never receives service-role credentials. The n8n worker claims the registered job later. This registry currently supports WhatsApp only; SMS and email must not be sent through it.

## Legacy Edge Function reference (not the new launch path)

## Configure server-side secrets

In Supabase Dashboard → Edge Functions → Secrets, add:

- `N8N_CAMPAIGN_WEBHOOK_URL`: the n8n production Webhook URL that accepts campaign dispatch payloads.
- `N8N_CALLBACK_SECRET`: a long, random secret used by n8n for its status callback.
- Optional `APP_ORIGIN`: the exact deployed ClearFlow origin for CORS, if you want to replace the default wildcard.

Do not put the webhook URL or callback secret in Vite variables, GitHub source, or a browser request.

## ClearFlow UI launch gate (disabled by default)

In `src/features/cfcf/pages/ContactGroupsPanel.tsx`, `CAMPAIGN_AUTOMATION_ENABLED` remains `false` until the worker is validated. The direct registration service calls `n8n_register_whatsapp_job` through Supabase, not the Edge Function. While the flag is false, Launch campaign and submit remain disabled; no jobs are registered and no messages are sent.

Keep the flag false until the authenticated registration RPC and worker have passed the PostgreSQL runtime tests, the actual WAHA endpoint/session are confirmed, and a controlled delivery is explicitly authorized. Do not enable it merely because the registry migrations or n8n workflow exist.

The deployed `campaign-dispatch` function has gateway JWT verification disabled so n8n can use the callback-secret route. The dispatch route validates the Supabase access token itself; the callback route requires the configured `x-cfcf-callback-secret` header.

## Inbound payload to n8n

The Edge Function resolves all selected groups and unique Contacts before calling n8n. n8n should not query Supabase to re-fetch these records. The payload includes:

- `event`, `schema_version`, `campaign_id`, `idempotency_key`, `created_at`
- `workspace`: product, tenant, tenant/business details, authorized manager details
- `campaign`: selected group IDs and group records, channels, message, unique recipient count and missing-email count
- `recipients[]`: minimum fields needed for delivery: `contact_id`, `name`, `phone`, and `email`. Private Contact remarks and internal tenant/product metadata are not sent to n8n
- `callback`: callback URL, method, header name and the status callback body shape

Treat the full recipient payload as private customer data. Do not write it to ordinary execution logs unnecessarily.

## Immediate n8n acceptance receipt

The webhook must respond quickly after the trigger/queue accepts the work. Return JSON such as:

```json
{
  "accepted": true,
  "status": "accepted",
  "campaign_id": "<campaign_id from the request>",
  "execution_id": "<optional n8n execution identifier>"
}
```

The response should mean “accepted for processing”, not “all messages delivered”. The ClearFlow UI shows a spinner until this receipt arrives. The Edge Function waits up to 25 seconds; an acknowledgement timeout is ambiguous, so check Notifications before retrying to avoid accidental duplicates.

## Final delivery callback

After channel-specific loops/queues finish, make an HTTP POST to the `callback.url` from the request. Send the header `x-cfcf-callback-secret` using the same secret configured in Supabase. The body is:

```json
{
  "action": "delivery_callback",
  "campaign_id": "<same campaign ID>",
  "tenant_id": "<same tenant ID>",
  "status": "sent",
  "summary": {
    "sent": 120,
    "failed": 3,
    "skipped": 2
  }
}
```

Allowed terminal statuses are `sent`, `partial`, and `failed`. Use `partial` when at least one recipient was accepted by the provider and at least one failed/skipped; use `failed` when the campaign could not be sent; use `sent` only when all required sends were accepted by the provider. **`sent` does not mean delivered or read.** For a failed campaign, include an `error` string.

The callback is idempotent: repeating a terminal callback will not replace a previously recorded terminal status. Notifications are stored in `cfcf_product_data.notifications`; the UI refreshes while the Notifications panel is open.

## Suggested n8n workflow

1. Webhook trigger receives the complete payload.
2. Validate required fields and immediately respond with the acceptance receipt once the execution/queue is accepted.
3. Split `recipients` into items; route by `campaign.channels`.
4. For each selected channel, validate its required address (phone for WhatsApp/SMS; email for Email), skip missing addresses, and call the configured provider.
5. Aggregate provider outcomes into sent/failed/skipped counts. Respect provider rate limits, retry only transient failures, and use `campaign_id + contact_id + channel` as an idempotency key when supported.
6. POST the terminal callback once the channel loops finish.

The current ClearFlow integration does not claim that a provider message was delivered merely because n8n accepted the job.

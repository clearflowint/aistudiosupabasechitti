# Global n8n WhatsApp Worker Contract — Batch 12

## Status

This is the repository-side implementation contract for the future worker. It is not an exported or active n8n workflow. No database migration is run and no WhatsApp message is sent by this document.

## Scope boundary

- The global worker handles only jobs registered in `n8n_global_jobs` and their linked communication/delivery rows.
- New Launch Campaign WhatsApp requests register directly through the authenticated Supabase RPC and enter this same global worker path. Do not call the legacy `campaign-dispatch` Edge Function from the new route or create a second campaign send path. Existing campaign notification history is a separate product UI concern and must not be mistaken for the registry delivery ledger.
- The monthly schedule evaluator remains inactive and is not the WhatsApp worker.
- Do not modify PWA push-notification tables, functions, triggers, cron jobs, or data.
- n8n owns orchestration and WAHA calls. Supabase registry RPCs own atomic claiming and durable lifecycle state.

## Required identifiers and scope

- All registry-generated primary keys are sequential PostgreSQL integer identity values starting at 100: `n8n_global_job_id`, `n8n_whatsapp_communication_id`, and `n8n_whatsapp_delivery_id`. Do not parse them as UUIDs or send them as UUID RPC arguments.
- Preserve existing types for `product_id`, `tenant_id`, person/contact IDs and source-record IDs.
- Every read and write must retain `product_id` and `tenant_id`; CFCF jobs use `product_id = 'CFCF'`. Do not infer tenant scope from a phone number or inbound provider payload.
- Keep the Supabase service-role credential and WAHA credential in n8n credentials only. Never put secrets in workflow JSON, browser code, repository files, or execution output.

## Worker sequence

1. Call `n8n_claim_global_jobs(p_limit)` using the service-role credential, with a conservative bounded limit. The RPC returns claimed job rows only; it does not include recipient contact data.
2. For each returned job, query its communication row using all available scope fields, including `n8n_global_job_id`, `product_id`, and `tenant_id`. Then fetch that communication's delivery rows with the same product/tenant scope. Do not perform a broad tenant-free recipient query.
3. Validate the stored message payload and the usable phone number before a provider call. A contact with no usable phone must have been filtered before registration; `skipped` is only for an intentionally excluded recipient that was already registered with a usable phone.
4. Resolve the configured WAHA endpoint and actual session name from deployment configuration. Do not guess either value. Until the endpoint is reachable and the session is confirmed, keep the sender workflow inactive.
5. Send only a delivery that is still `queued`. Do not call the provider again for a delivery already marked `sent_to_server`, `failed`, `uncertain`, or `skipped`.
6. On a confirmed WAHA server acceptance, call `n8n_record_whatsapp_delivery_result` with `sent_to_server`, the provider message ID when supplied, and the actual WAHA session name. This status means accepted by the provider/server, not delivered or read by the recipient.
7. On a definitive provider rejection, record `failed` with bounded error details. If the request times out or the result cannot prove whether WAHA accepted it, record `uncertain`; do not resend automatically.
8. When all registered deliveries have terminal outcomes, call `n8n_finish_global_job` with `completed` only if no delivery remains `queued`. Use `failed` for a worker-level terminal failure and include a concise error. Do not treat a database or callback timeout as proof that a message was not sent.
9. If the worker crashes or a claim becomes stale, the registry marks the job `timed_out` after its configured 90-minute threshold. This is for inspection, not automatic requeue. A human/operator must inspect uncertain deliveries before any explicit re-registration or resend decision.

## Failure and idempotency rules

- No automatic send retries, no automatic requeue, and no blind resend after uncertain results.
- Stale picked-up jobs are marked `timed_out` after 90 minutes. The timeout query uses `picked_up_at`, falling back to `updated_at` and `created_at` only if the pickup timestamp is missing. It does not requeue the job. A timed-out job can still have `queued` deliveries; because the worker cannot safely infer whether an in-flight provider request was attempted, those rows require manual reconciliation. The RPC finalization guard applies to calls through `n8n_finish_global_job`; the stale-timeout update in the claim RPC is a separate guarded lifecycle path.
- Registration idempotency prevents duplicate logical jobs; it is not permission to repeat a WAHA send.
- Repeated identical result callbacks are idempotent. An `uncertain` delivery may transition to `sent_to_server` only when positive provider acknowledgement is obtained; that transition must not trigger a send.
- Keep provider message IDs, actual session names, and error details on the delivery record. Do not log secrets or full credentials.
- A worker must not mark a job `completed` while any recipient delivery is `queued`. The database RPC is the final guard.
- Keep all status writes in the registry RPC contract; do not update registry status columns ad hoc from a workflow.

## Setup blockers before an executable workflow can be safely completed

1. Confirm the deployed WAHA base URL is reachable from the n8n runtime.
2. Confirm the exact WAHA session name and which WAHA send endpoint/payload the deployment supports.
3. Configure Supabase and WAHA credentials in n8n's credential store; do not commit values.
4. Import the worker as inactive and validate node expressions with synthetic data only.
5. Validate tenant/product-scoped lookups, integer registry IDs, and each delivery outcome using a disposable PostgreSQL test database. No billable Supabase branch is assumed or created.
6. Run controlled end-to-end delivery tests only after the database runtime checks pass and the user explicitly authorizes the controlled send. Until then, keep the worker and monthly evaluator inactive.

## Batch 12 — Registration boundary hardening

The authenticated `n8n_register_whatsapp_job` RPC now independently validates campaign group ownership on the server. For `manual_campaign`, it requires `source_table = 'contactgroups'`, parses the submitted comma-separated group IDs, rejects blank or duplicate IDs, and verifies that every group belongs to product `CFCF`, the submitted tenant, and the authorized person. Browser-side group preflight remains useful for UX but is no longer the only group-ownership check.

This is a repository migration edit only. It has not been applied to Supabase and has not been runtime-tested against PostgreSQL. Do not enable the UI gate until the migration is reviewed and tested in an approved disposable database.

## Batch 13 — Automated registry contract checks

Added `scripts/n8n-global-registry-contract.test.mjs` and wired `npm run test:n8n-registry` into `.github/workflows/validate.yml`. The GitHub Actions run for commit `46d256d4d6e1ab5827b73048216cd8b7f3250234` passed all stages: TypeScript validation, CFCF financial calculation tests, global registry contract tests, and production build.

These are repository/static regression checks. They do not execute SQL against PostgreSQL, contact WAHA, or prove real message delivery.

## Batch 14 — Worker setup inventory

The connected n8n instance currently has a Supabase credential and the existing `CFCF Automation Worker — Draft`, but the credential inventory returned no WAHA credential and the workflow search returned no separate WAHA workflow. The worker remains inactive, has no active version, and has zero triggers. Its live-call branch remains blocked; the dry-run branch is separate. The legacy RPC nodes are disconnected and must not be reconnected.

Do not guess the WAHA base URL, session name, endpoint, or payload shape. Before the worker can be made executable, the deployment's actual WAHA endpoint/session must be verified and the required credential configured in n8n. Until then, do not add a live sender connection, run a claim against the un-deployed registry, activate the workflow, or enable the UI gates.

## Current n8n draft safety state — Batch 10

The connected `CFCF Automation Worker — Draft` remains inactive with no published/active version. Its safety-gate true branch now goes directly to the explicit blocked-stop node; it no longer reaches the legacy exhausted-job or claim RPC nodes. The false branch remains the dry-run path. Legacy HTTP nodes remain in the draft for reference but are disconnected from the trigger path, and their automatic retry settings are disabled. This is a containment change only: the global registry claim, delivery-result recording, and job finalization sequence is still not implemented in n8n. Do not activate or enable UI gates.

## Validation evidence

Repository-level checks can verify workflow structure, integer ID usage, scope propagation and inactive status. They cannot prove PostgreSQL runtime behavior, WAHA connectivity, session validity, or real delivery. These remain unverified until the gated tests above are authorized and performed.

## Existing send-flow migration status

**The new direct registration code paths are now implemented but remain gated off.** Launch Campaign and bulk Pending/Reports register through the authenticated Supabase RPC when their UI gates are enabled; neither sends directly from the browser. The registry migrations are not deployed and the worker is not yet executable or active, so the production sending route is not cut over.

| Existing entry point | Current route | Required target |
|---|---|---|
| Contact Groups → Launch Campaign | `ContactGroupsPanel.tsx` → `contact-groups.service.ts` → authenticated `n8n_register_whatsapp_job` RPC → global worker | The direct registration path is implemented in source but the UI gate remains disabled. It supports WhatsApp only. The legacy `campaign-dispatch` Edge Function remains in the repository but is not called by the new route. Campaign notification-history integration still needs a registry-backed UI path; do not treat the legacy callback as wired to this new route. |
| Workspace bulk Pending / Reports WhatsApp actions | `WorkspacePage.tsx` → `workspace-automation.service.ts` → authenticated `n8n_register_whatsapp_job` RPC → global worker | Direct integer job-ID registration is implemented in source, with tenant-scoped Fund/Share/Contact reads and server-side tenant-owner/phone checks. The UI gate remains disabled until runtime tests and the worker/WAHA route are validated. The existing once-per-hour per-Fund/action limit is now enforced in the authenticated registration RPC for Pending/Report jobs; verify it under concurrent requests against a disposable PostgreSQL test database before cutover. |
| Monthly scheduled evaluator | Existing workflow JSON uses placeholder Supabase URLs and is inactive; it does not call the global registry | Keep inactive until the schedule-to-job handoff is explicitly wired and tested. Do not treat the evaluator as the sender. |

### Safe cutover order

1. Keep both UI gates disabled while the registry is only in a draft PR; direct registration source code exists, but it must not be used before runtime validation.
2. Finish and validate the worker with synthetic data, including integer IDs, scoped lookups, duplicate-registration behavior, and terminal delivery states.
3. Confirm the actual WAHA endpoint and session name; configure credentials in n8n, not in source files.
4. Validate the already-added authenticated registration RPC route for workspace Pending/Reports and the WhatsApp portion of Launch Campaign. Confirm a job ID is returned and visible in Notifications before enabling either UI gate. Keep service-role credentials out of browser code.
5. Ensure each WhatsApp send has exactly one path: either the legacy campaign workflow or the global worker, never both. Keep the existing campaign callback/notification aggregation for campaign status; the registry is the per-recipient WhatsApp delivery ledger, not a replacement for the product notification history.
6. Only after SQL runtime tests, tenant-scoped history UI checks and a user-authorized controlled test pass, enable the relevant gates in a separate, reviewed change. Do not enable SMS/email through the WhatsApp-only registry.
7. Do not introduce automatic retries, automatic requeue, or blind resend for uncertain sends. Keep the current no-retry policy for the global worker.

The direct registration code paths now exist for Launch Campaign and bulk Pending/Reports, and Notifications includes a registry-backed job history view. Both UI gates remain disabled. The active production sending route is **not cut over** until the worker, runtime tests and controlled delivery pass.

## Batch 15 — Queue discipline and randomized pacing

### Queue ownership and concurrency

- Supabase registry rows are the durable queue; n8n execution history is not the source of truth for queued work.
- The worker must claim a small bounded batch through `n8n_claim_global_jobs(p_limit)`. Never fetch unclaimed jobs and then send them directly.
- Process claimed jobs and their queued deliveries sequentially, one provider send at a time. Do not use Split In Batches or loop settings that allow concurrent sends for the same queue.
- Do not start a second sender execution while one sender execution is processing the queue unless a later database-level concurrency review explicitly proves that claims and per-delivery transitions prevent overlapping sends. For the initial implementation, one sender execution at a time.
- A Wait node is a pacing control, not a queue, lock, acknowledgement, retry, or delivery guarantee. The registry remains authoritative if an n8n execution stops during a wait.
- Keep claim size conservative and bounded. Finish/record each job's delivery outcomes before moving on to the next claimed job; never mark a job completed while any delivery is still queued.

### Random wait node before each new send

- Add a native n8n **Wait** node on the queued-delivery path immediately before the WAHA send node.
- For each delivery that is still `queued`, randomly select exactly one delay from this allowlist: **15 seconds, 30 seconds, or 60 seconds (1 minute)**. Use a uniform choice unless a later measured operational requirement justifies another distribution.
- Apply the wait once per newly attempted delivery, after validating the queued state and payload and before making the provider request. Do not wait between a provider result and its database result-recording RPC.
- Never use the wait node to repeat the send node. Disable automatic node retries; do not connect an error branch back to the sender. A timeout or ambiguous provider result is recorded as `uncertain` and ends that delivery's attempt.
- If the workflow resumes after an interruption, re-read the durable delivery status before any provider call. If the status is not `queued`, do not send. If the outcome of a prior provider request is uncertain, do not infer that it is safe to resend.
- The random delay is pacing, not a promise of a particular messages-per-minute rate. Keep the existing per-Fund hourly registration guard for Pending/Report and apply any provider-specific rate limits only after verifying the actual WAHA deployment's documented limits.
- Do not use a fixed global wait after the entire batch as a substitute for the per-delivery randomized Wait node.

### Queue and pacing acceptance checks

Before any controlled live test, verify with synthetic data that:
1. The claim limit is bounded and only claimed jobs enter the send path.
2. Only one delivery is in the provider-send path at a time.
3. Each newly attempted queued delivery gets exactly one allowlisted randomized wait (15, 30, or 60 seconds) before the provider call.
4. The Wait node cannot loop back to resend and no send node has automatic retries enabled.
5. A non-queued delivery is skipped before the wait/send path.
6. A timeout after the provider request becomes `uncertain`; it does not requeue or resend.
7. The worker remains inactive, UI gates remain disabled, and no live messages are sent before WAHA setup and database runtime validation.

These requirements are part of the worker contract. The n8n draft now contains a random-delay selector connected to a native Wait node, but that two-node chain is disconnected from all triggers, queue claims, and sender paths. The durable global queue claim and sequential delivery-processing path are still not implemented in n8n. The workflow remains inactive and no messages have been sent.
## Batch 16 — Queue lifecycle contract checks

- Added repository regression checks for the bounded `n8n_claim_global_jobs(p_limit)` contract: limits 1–100, only `registered` jobs are claimed, row locking uses `FOR UPDATE SKIP LOCKED`, and stale `picked_up` jobs time out after 90 minutes without being requeued.
- Added checks for terminal delivery-state transitions and the guard that prevents job completion while any delivery remains `queued`.
- The added SQL-pattern checks were independently exercised against the current migration text: **8/8 checks passed**. This is static validation only; it does not execute PostgreSQL or prove runtime locking/transaction behavior.
- GitHub Actions passed all four stages on the earlier test-fix commit `bf4140d01879a60fb52eeea39df60460a2de8fe0`. The subsequent Batch 16 test additions and regex correction are newer commits; their GitHub Actions result is not yet confirmed. Do not report the latest head as CI-green until a run on that head passes.
- n8n remains inactive with zero triggers. The randomized selector and native Wait node remain a disconnected draft chain. The actual global claim/read/delivery-result/finalization chain is not connected or executed.
## Batch 17 — Disconnected n8n queue skeleton

- Added a disconnected draft chain for global registry claim (limit 5), claimed-job validation, scoped communication read, scoped delivery read, and queued-delivery validation.
- Added separate disconnected placeholder RPC nodes for recording a delivery result and finalizing a global job. They use a conspicuous placeholder Supabase URL and illustrative ID 100; no credentials are attached and they must not be executed.
- The claim/read/validation chain is not connected to the Manual Start trigger or safety gate. It ends at a blocking validation node; there is no WAHA send node and no connection to the random Wait chain yet.
- The two read nodes use `tenant_id` and `product_id` filters; the communication lookup also filters by `n8n_global_job_id`, and delivery lookup filters by `n8n_whatsapp_communication_id`. The HTTP response shape and field retention are still unverified and must be tested with synthetic data before connecting lifecycle nodes.
- The worker remains inactive with no active version and zero triggers. Existing legacy nodes remain disconnected from the safety gate. No queue claim, registry read/write, or WhatsApp send was executed.
- GitHub Actions passed on commit `1d40bab40b479192cd45ec548a256249ff382b81`: TypeScript validation, CFCF financial tests, registry contract tests and production build. This does not validate the live n8n draft or execute PostgreSQL.
- This is a draft structure, not an executable worker. Do not connect the placeholder result/finalization nodes or enable gates until registry migrations are runtime-tested and WAHA configuration is verified.
## Batch 18 — WAHA credential readiness

- User reports the WAHA API key is ready. Do not request or accept the secret in chat, GitHub, source files, workflow parameters, or screenshots.
- n8n credential inventory currently contains only `Supabase account` (`supabaseApi`) and `Custom Auth account` (`httpCustomAuth`); no WAHA credential is present.
- Existing conversation context identifies WAHA session `default` as WORKING/CONNECTED. Still need the exact WAHA API base URL (scheme + host + optional port/base path) from the user; do not infer it from the dashboard hostname or deployment setup.
- After the user confirms the base URL, create a dedicated HTTP Header Auth credential in the n8n UI using header `X-Api-Key` only if that matches the deployed WAHA version/configuration; otherwise follow the API-key header documented by that deployment. Enter the key directly into n8n's credential form, never into chat.
- No credential creation action is available through the current automation connector. User must add the secret in the n8n UI, then confirm the credential name (not its secret) so it can be attached to the future WAHA HTTP Request node.
- No live WAHA test, queue claim, registry call, workflow activation, or message send has been performed. Worker remains inactive and the new queue nodes remain disconnected.

## Batch 19 — WAHA endpoint and credential verified

- User supplied the WAHA base URL directly in conversation and configured a generic n8n HTTP Header Auth credential using the `X-Api-Key` header. The credential is stored in n8n; its secret is not present in this repository.
- A disconnected read-only HTTP Request node was added for `GET /api/sessions` using the saved Header Auth credential.
- With explicit user approval, the read-only request completed successfully. WAHA returned a working session named `Lakki`. This is runtime evidence for endpoint reachability and credential validity; it does not test message sending.
- A temporary second Manual Trigger used for isolation was removed after the successful check. The read-only session inventory node is connected to the existing Manual Start trigger only. The workflow remains inactive, has no active version, and has zero triggers in its inactive state.
- No message send endpoint was called. No Supabase RPC, queue claim, registry migration, or PWA notification object was executed or changed.

## Batch 20 — Initial agency/session configuration

- The user explicitly selected `Lakki` as the initial agency name and WAHA session name. Do not substitute `default` or assume a session name.
- The workflow safety/configuration node now carries `agencyName = 'Lakki'` and `wahaSessionName = 'Lakki'` as explicit configuration values. The read-only inventory node is named `WAHA — Read Agency Sessions (Lakki)`.
- The name is a configuration value for the initial agency, not a claim that multi-agency routing is already implemented. Future agency-specific sessions must be configurable and scoped deliberately before any send path is connected.
- Safety remains unchanged: `liveCallsEnabled = false`, `projectConfigured = false`, worker mode `draft-safe-dry-run`, workflow inactive, and no active version. No sendText node or live sender path was added.
- Remaining worker blockers: registry migrations have not been deployed/runtime-tested; the global claim/read/record/finalize nodes remain disconnected placeholders; the sequential send path with one randomized 15/30/60-second wait per new queued delivery is not implemented end-to-end. Do not activate the worker or enable the app UI gates.


## Batch 21 — Scoped worker validator hardening and synthetic test

- Hardened the disconnected global-job normalizer: global job IDs must be sequential integer IDs `>= 100`; job status must be `picked_up`; product must be `CFCF`; tenant must be present; supported job types are `manual_campaign`, `pending_reminder`, and `report`; duplicate IDs and claim batches over five are rejected.
- Added `Validate Scoped Communication Response — Draft`. It checks integer communication/global-job IDs, matches each communication to a claimed job, and verifies exact product/tenant scope before the delivery-read node.
- Hardened `Validate Queued Delivery — Draft Stop`. It validates integer IDs, allowed lifecycle statuses, exact communication/product/tenant scope, and duplicate delivery IDs. It ignores non-queued statuses—including `sent_to_server`, `failed`, `uncertain`, and `skipped`—so they cannot be resent. It only emits queued deliveries, and every emitted item retains `senderBlocked = true`. It rejects queued deliveries without a phone or with a session that conflicts with `Lakki`.
- Corrected the graph so the scoped communication validator is mandatory before the delivery read.
- Ran n8n's synthetic pinned-data test only. Synthetic claim job ID 100, communication ID 100, queued delivery ID 100, and already-terminal delivery ID 101 were used. The test passed: one queued delivery was emitted with the sender still blocked; the terminal delivery was filtered out. All HTTP Request nodes on this test path were pinned, so no external request was made by the test.
- Removed the temporary test connection from Manual Start to the claim placeholder immediately after the test. The WAHA session inventory request was disconnected and disabled after its successful read-only verification to avoid unnecessary repeat requests and repeated session metadata in execution data.
- Current worker remains inactive with no active version. The global claim/read/validation chain remains disconnected from triggers. No Supabase registry RPC or migration was executed, and no WhatsApp message was sent.
- Negative tenant-isolation test also completed using pinned synthetic data: a communication for `tenant-B` against a claimed job for `tenant-A` was rejected with `Communication does not match a claimed job tenant/product scope`. The temporary test connection was removed after the run. Confirm actual deployed schema and response shapes only after an approved non-billable test environment is available; implement result/finalization lifecycle with correct idempotent outcomes; connect the randomized 15/30/60-second Wait immediately before a future sender only after all guards pass. No retries, requeue, or blind resend.


- Follow-up verification: after both synthetic runs, the claim placeholder is confirmed disconnected from Manual Start again; the WAHA session inventory node remains disconnected and disabled; `liveCallsEnabled = false`, `projectConfigured = false`, workflow inactive, no active version, and no active triggers. The latest documentation commit's GitHub Actions run #615 was still in progress at the last check; do not report it as passing until its conclusion is confirmed.


## Batch 22 — Negative lifecycle tests

- Pinned synthetic test with an unknown delivery status (`queued_typo`) failed closed with `Unknown delivery status; refusing to continue.`
- Pinned synthetic test with duplicate delivery ID `100` failed closed with `Duplicate delivery ID in scoped result.`
- Together with Batch 21, synthetic tests now cover: valid queued item passes while terminal item is filtered; cross-tenant communication is rejected; unknown status is rejected; duplicate delivery IDs are rejected.
- The temporary Manual Start → claim-placeholder connection was removed after the tests. Claim/read/validation nodes remain disconnected from all triggers. No external HTTP requests, Supabase RPCs, database writes, or WhatsApp messages were made by these pinned tests.
- Current safety state rechecked: worker inactive, no active version, zero triggers, `liveCallsEnabled = false`, `projectConfigured = false`, `agencyName = 'Lakki'`, `wahaSessionName = 'Lakki'`. The read-only WAHA inventory node remains disconnected and disabled.
- The CI run for the prior implementation/documentation commit completed successfully across TypeScript validation, CFCF financial calculation tests, registry contract tests, and production build. The later documentation-only commits do not change application code; do not infer a new CI run unless one appears for the latest commit.
- Next blocker remains live schema/response validation and safe result/finalization wiring. Registry migrations remain undeployed; no billable Supabase branch may be created. Keep the worker and UI gates disabled.


## Batch 23 — Sequential randomized pacing loop (draft only)

- Added a native n8n `Loop Over Items` node with `batchSize = 1` after the queued-delivery validator. Each validated queued delivery flows through the existing uniform 15/30/60-second selector, then the native Wait node, then `Pacing Complete — Sender Still Blocked`, and loops to the next delivery.
- The loop's done output goes to `Draft Queue Pacing Summary — No Sends`, which explicitly reports `senderConfigured = false` and `messagesSent = 0`. This is not a delivery result and does not finalize a registry job.
- The pacing marker keeps both `senderBlocked = true` and `resultWriteBlocked = true`. There is still no WAHA send node connected to the queue path and no registry result/finalization call connected to it.
- Set `retryOnFail = false` and `onError = stopWorkflow` explicitly on the global registry HTTP placeholders and the disabled WAHA session inventory node. No automatic retry or error-loop path is configured.
- The full claim/read/validate/pacing path remains disconnected from Manual Start. The only Manual Start connection is the safe configuration gate; the WAHA inventory node is disconnected and disabled. This prevents accidental execution of placeholder Supabase URLs or repeated session inventory reads.
- The loop structure was statically inspected after update. It was not executed because the native Wait can legitimately pause for 15, 30, or 60 seconds per item, and no sender is present to justify that execution. Synthetic validator tests from Batch 21/22 passed or failed as expected.
- Remaining blockers: the global registry migrations are not deployed or runtime-tested; the queue/read/result/finalization nodes still contain placeholder URLs or lack service-role credentials; delivery-result and job-finalization behavior must be wired and tested with the RPC contract before any sender exists. Keep the worker inactive, UI gates disabled, and no retries/requeue/blind resend.


## Batch 24 — Communication contract and sender payload

- The scoped communication validator now enforces the repository schema's communication types and mapping: `manual_campaign → campaign`, `pending_reminder → pending_reminder`, and `report → report`. It also requires the WhatsApp channel in `requested_channels` and verifies `message_payload` is an object when present.
- Each validated queued delivery now carries the integer global job/communication/delivery IDs, tenant/product scope, actual configured session `Lakki`, communication type, `message_text`, `message_payload`, and requested channels. The output explicitly retains `senderBlocked = true` and `resultWriteBlocked = true`.
- A pinned synthetic test passed with a `pending_reminder` job/communication and two deliveries: the queued delivery carried the expected synthetic text/payload forward; the already-`sent_to_server` delivery was filtered out. No external request was made.
- The temporary Manual Start connection used for the synthetic test was removed, and the validated queue output was reconnected to the sequential one-item pacing loop. The full worker chain remains disconnected from every trigger.
- The migration files were reviewed statically to align the workflow with the existing registry schema and RPC contract. They remain repository-only and have not been deployed or executed.
- The next safe work is to build/test pure result/finalization payload preparation and ensure job completion is only possible after all deliveries are terminal. Do not connect the result/finalization HTTP placeholders or a WAHA sender until the registry migration has been runtime-validated in an approved non-billable environment. Keep all live gates false, no retries, no automatic requeue, and no blind resend.


## Batch 25 — Result and finalization payload guards

- Added disconnected pure-code `Prepare Delivery Result Payload — Draft`. It requires integer global-job/delivery IDs, CFCF tenant scope, actual configured session `Lakki`, and an explicit provider outcome. It maps only `accepted → sent_to_server`, `rejected → failed`, `uncertain → uncertain`, and `skipped → skipped`. Positive acceptance is required for `sent_to_server`; ambiguous outcomes must be classified as `uncertain`. It builds the exact RPC body for `n8n_record_whatsapp_delivery_result` and keeps `resultWriteBlocked = true`.
- Updated the disconnected delivery-result HTTP placeholder to use the prepared dynamic RPC body rather than a hard-coded example ID. Its URL is still a placeholder and no credential is attached.
- Added disconnected pure-code `Prepare Job Finalization Payload — Draft`. It requires an integer global-job ID, CFCF tenant scope, and the complete delivery outcome array. It refuses finalization if any delivery is `queued`; otherwise it prepares `completed`, unless an explicit worker-fatal error requires `failed`. It keeps `finalizationWriteBlocked = true`.
- Updated the disconnected job-finalization HTTP placeholder to use the prepared dynamic RPC body rather than hard-coded ID 100. Its URL remains a placeholder and no credential is attached.
- Synthetic tests passed for accepted provider outcome → `sent_to_server` payload and terminal delivery set → `completed` payload. A synthetic finalization test containing a queued delivery failed closed as expected. Downstream HTTP nodes were pinned during tests, so no external request or database write occurred.
- Temporary test connections from Manual Start were removed after each test. Both preparation/RPC branches remain disconnected from all triggers. No WAHA sender exists; no message was sent and no registry RPC was called.
- Remaining before any executable lifecycle: validate actual RPC behavior against the approved non-billable runtime (not available yet), design the provider adapter from WAHA's actual response shape, ensure each result RPC is only called after provider outcome is known, and aggregate complete delivery statuses per job before finalization. Keep worker inactive and all gates false.


## Batch 26 — WAHA text payload preflight

- Added `Prepare WAHA Text Payload — Draft Only` after the randomized pacing marker in the sequential one-item loop. It never calls WAHA and always emits `providerCallAllowed = false` and `senderBlocked = true`.
- The node requires a CFCF tenant-scoped integer delivery ID, the configured session name `Lakki`, a nonblank `message_text`, and a saved phone in explicit international `+countrycode` format. It does not guess a country code. For a valid phone it prepares `{ session: 'Lakki', chatId: '<digits>@c.us', text: '<message>' }`; invalid phone/text remains blocked with a reason and no send payload.
- This matches WAHA's official Send Text docs: `POST /api/sendText`, body fields `session`, `chatId`, and `text`; individual phone chat IDs use the international number without `+` followed by `@c.us`. Source: https://waha.devlike.pro/docs/how-to/send-messages/ (Send Text and Fields sections).
- Pinned synthetic preflight test passed for `+919876543210` → `919876543210@c.us`; a local-only `9876543210` phone was blocked without country-code inference. No WAHA request was made.
- The temporary Manual Start connection used for this test was removed. The sequential pacing/preflight loop remains disconnected from all triggers and has no sender node after it.
- No live WhatsApp messages or database writes have occurred. The workflow is still inactive with all live gates false; result/finalization payload guards remain disconnected from triggers and their HTTP nodes use placeholder URLs with no credentials.

## Batch 27 — CFCF job/communication mapping guard

The registration RPC now rejects mismatched CFCF job and communication types at the database boundary: `manual_campaign → campaign`, `pending_reminder → pending_reminder`, and `report → report`. It also explicitly rejects a null communication type before attempting inserts. This is a consistency guard, not a worker activation or sending change.

A repository contract test asserts the mapping guard. This remains static/source-level validation; no SQL was deployed or executed against PostgreSQL. PWA notification objects, the worker activation state, UI gates, and the no-retry/no-requeue policy remain unchanged.

## Batch 28 — Registration idempotency and recipient identity audit

- Added regression assertions for the transaction-scoped idempotency lock, source/scope binding, communication-detail binding, and exact recipient-set binding.
- Added checks that a single phone cannot map to conflicting person/contact identities within one request and that the schema has a unique per-communication phone index. Duplicate same-identity phone entries remain deduplicated by the registration loop and unique index; this is duplicate suppression, not a retry/send policy.
- Re-fetched the current migration and test source and exercised seven targeted static assertions; all seven passed. This is not execution of the Node test suite or SQL against PostgreSQL.
- No schema or runtime behavior was changed in this batch. Registry migrations remain undeployed, no billable branch was created, PWA notification objects are untouched, and all worker/UI gates remain disabled. No retries, automatic requeue, blind resend, or WhatsApp sends were introduced.

## Batch 29 — Finalization guard across every terminal status

- Static audit found the SQL finalization RPC only rejected queued deliveries when the requested job status was `completed`. A caller could mark a job `failed` or `timed_out` while deliveries remained `queued`, stranding those recipients outside the claim path.
- Updated the RPC to reject finalization for **any** final status while any delivery remains queued. Remaining deliveries must first receive explicit terminal outcomes such as `failed`, `uncertain`, or `skipped`; nothing is automatically resent or requeued.
- Updated the repository contract tests to assert the all-status guard and the new error text. Seven targeted static assertions against the fetched SQL/test sources passed, including the finalization guard, uncertain-to-`sent_to_server` positive-acknowledgement-only transition, and service-role-only result RPC grant.
- This is source-level validation only. No PostgreSQL execution, migration deployment, n8n activation, registry write, or WhatsApp send occurred. PWA notification objects and UI gates remain unchanged; no retry/requeue behavior was added.

## Batch 30 — Idempotent accepted-result consistency

- Audited the repeated-callback path in `n8n_record_whatsapp_delivery_result`. A repeated `sent_to_server` callback previously used `coalesce` for error metadata, which could reintroduce an error code/message onto an already accepted delivery.
- Updated the same-status branch to keep `error_code` and `error_message` null for `sent_to_server`, while preserving first-known provider message ID and session metadata. Non-accepted repeated outcomes retain the first available error details.
- Added a regression assertion for both fields. Seven targeted static checks passed against the fetched migration and test source, covering this fix, all-status finalization guard, uncertain-to-accepted transition, no timeout requeue, and service-role-only access.
- Source-level only: no PostgreSQL execution, deployment, n8n activation, database write, or WhatsApp send. PWA notification objects and UI gates remain untouched; no retries or automatic requeue were added.

## Batch 31 — Stale claim timeout audit

- Audited the claim RPC's 90-minute stale-job timeout. The original predicate depended only on `picked_up_at`; a malformed `picked_up` row with a null pickup timestamp would never time out.
- Updated the timeout predicate to fall back to `updated_at`, then `created_at`, only when `picked_up_at` is missing. The claim still only selects `registered` jobs with `FOR UPDATE SKIP LOCKED`; no timed-out job is requeued.
- Added a regression assertion for the fallback and no-requeue behavior. Updated both registry and worker documentation to clarify that a timed-out job can retain queued deliveries for manual reconciliation; the claim-timeout update is a separate lifecycle path from the finalization RPC guard. No automatic status rewrite of delivery rows was added because the worker cannot prove whether an in-flight provider request was attempted.
- Static source assertions only; no PostgreSQL execution or migration deployment. n8n remains inactive, UI gates remain disabled, no WAHA sends or registry writes occurred, PWA notification objects remain untouched, and no retries/requeue/blind resend were introduced.

## Batch 32 — Authorization and lock-order audit

- Rechecked the queue claim, delivery-result and finalization RPC boundaries. Each worker RPC checks the JWT role for `service_role`; migration grants revoke execution from `public`, `anon` and `authenticated` before granting worker RPCs to `service_role`.
- Confirmed the delivery-result RPC locks the parent job before locking the delivery row, and finalization locks the job before checking queued deliveries. This consistent job-first order serializes a result callback against finalization and prevents a queued delivery from being missed by a concurrent completion.
- Confirmed all three registry tables have RLS enabled and direct table grants revoked from browser roles. The CFCF history RPC is separately authenticated, requires `auth.uid()`, and validates active tenant-owner scope; it does not expose direct registry-table access.
- Added repository regression assertions for worker RPC role checks, grants and lock order. Targeted static review passed 9 of 10 initial checks; the remaining check was a temporary verification-script string-match issue, not a source failure. A corrected review confirmed the updated stale-timeout assertion is present. This is not execution of the Node test suite or PostgreSQL.
- No runtime/deployment changes. Worker inactive, UI gates disabled, no billable branch, no live sends, no retries/requeue, and PWA notification objects untouched.


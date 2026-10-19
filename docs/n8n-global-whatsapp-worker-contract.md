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

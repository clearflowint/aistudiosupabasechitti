# Portability review — current CFCF integration boundaries

## Purpose

This is a practical inventory, not a rewrite mandate. It identifies where the current CFCF code depends on Supabase so ClearFlow can make future tool changes deliberately. Do not rewrite working features just to remove every vendor-specific call at once.

## Current coupling found

### 1. Browser data access

- The shared client is created in `src/core/database/supabaseClient.ts` using `@supabase/supabase-js`, the Vite URL/key settings, Supabase session handling, and a tracked fetch wrapper.
- Product service modules such as `src/features/cfcf/services/workspace.service.ts` and `contact-groups.service.ts` call the Supabase query builder directly.
- This is already partly localized: UI pages call product service functions instead of issuing database queries themselves. Keep this boundary and avoid adding direct Supabase queries to UI components.
- Future portability improvement: if another storage provider is selected, replace the implementation behind these service functions in small groups. Do not add a generic multi-database framework before there is a second provider.

### 2. Database RPCs in existing CFCF features

- `workspace.service.ts` calls CFCF RPCs for operations such as cycle creation/deletion, cycle summaries, payout updates, fund archiving, and other related actions.
- Some of these operations currently depend on database-side atomicity or multi-record updates. Removing them without understanding their behavior could break existing financial records.
- Rule for new work: do not add RPCs or triggers merely to orchestrate n8n jobs, status updates, schedules, or generic automation behavior.
- Rule for existing work: document each RPC's user-visible purpose and current side effects before replacing it. When a migration away from Supabase is needed, reimplement the operation behind the existing product service function and test the same inputs/outputs.

### 3. Campaign dispatch integration

- `src/features/cfcf/services/contact-groups.service.ts` calls the existing Supabase Edge Function for campaign dispatch.
- `supabase/functions/campaign-dispatch/index.ts` uses the Supabase JS client, Supabase Auth token verification, service-role access, and the RPC `cfcf_upsert_campaign_notification`.
- The campaign launch flag is currently disabled by default, and the documented campaign flow is separate from the new generic job-status draft.
- Do not silently replace this established campaign path while simplifying job storage. Treat it as an existing provider adapter that can be replaced deliberately when a working alternative is ready.

### 4. Authentication and tenant access

- Current login/session behavior uses Supabase Auth.
- Existing tenant access relies on current authorization logic and database RLS/policies.
- Authentication and tenant separation are essential behaviors, not reasons to build a large workflow framework. A future provider change must preserve these behaviors, but the implementation may move to another identity provider or API boundary.

### 5. New automation job status

- The draft global job table is now intentionally minimal: identity, product/tenant scope, type, simple status, optional request ID, JSONB request/result, and timestamps.
- The PWA reads safe status columns directly; it does not read private JSONB.
- There is no generated progress view, database queue, lease/claim RPC, event-history framework, campaign-size constraint, or unique-index-based deduplication in this draft.
- PWA double-submit prevention and n8n ingress checks are the first duplicate controls. If a controlled test demonstrates a material concurrent/restart duplicate problem, add a narrow fix for that action rather than a general-purpose database engine.

## Portable boundaries to keep

1. **UI → product service functions:** UI asks for a business operation; it does not know query syntax.
2. **Product service → storage adapter:** storage details are confined to service modules and the shared client.
3. **PWA → n8n request envelope:** pass stable IDs, action, and options; do not make the envelope depend on Supabase row shapes beyond the IDs needed by the product.
4. **n8n workflow → provider adapter:** keep WAHA, email, report generation, and future AI providers behind their own workflow nodes/modules.
5. **Status display → safe record:** UI reads status metadata and does not depend on internal worker implementation.

## What not to do

- Do not rewrite all existing financial RPCs in one pass.
- Do not introduce a new generic repository framework with no alternative provider.
- Do not create new tables, RPCs, triggers, leases, generic queues, or retry engines for hypothetical needs.
- Do not enable the current draft registry or workflows just because static tests pass.
- Do not modify PWA notification tables/functions/data/cron jobs or create a billable Supabase branch.

## Next practical sequence

1. Keep the minimal job schema and focused contract tests.
2. Build the smallest CFCF request-to-result n8n flow in draft mode using a mock provider and synthetic records.
3. Verify the actual WAHA-to-n8n auth configuration before touching inbound workflows.
4. Resolve where the manager-selected monthly schedule slots are stored without changing protected notification infrastructure.
5. Test against an explicitly approved non-production environment before applying the draft migration there.
6. Only when a real alternative database/provider is selected, replace the relevant storage adapter and re-run the existing product tests.


## Latest implementation checkpoint — 2026-10-20

The n8n workflow formerly named `CFCF Automation Worker — Draft` has been reduced to `CFCF Automation Worker — Minimal Mock Harness (Draft)` and now has 10 nodes. The obsolete disconnected RPC/placeholder paths for legacy queue claiming, delivery reads/writes, WAHA session inventory, pacing, and finalization were removed from this draft. It remains inactive with zero triggers.

The remaining workflow exercises only the synthetic in-memory path: manual start → mock seed → scope validation and event deduplication → one-at-a-time mock processing → aggregate outcome/finalization guard. Every fixture now carries `product_id`, `tenant_id`, and `person_id`; duplicate event identity is scoped by product and tenant. Mock outcomes include provider acceptance, rejection, and ambiguous post-submission timeout. No provider call, database write, automatic retry, or resend is performed.

A pinned-node preparation check completed, and manual test executions `31`, `32`, and `33` returned success; execution `33` followed the node cleanup and identity/deduplication changes. These are mock-only workflow tests, not live integration tests. The workflow remains inactive. The repository's latest CI run before this documentation checkpoint was #849, which passed TypeScript validation, CFCF financial tests, both focused contract suites, and the production build.

The next real integration blockers remain unchanged: verify the actual WAHA-to-n8n authentication scheme, agree the per-Fund schedule-slot persistence location, and obtain explicit approval of a named non-production Supabase project. No production deployment or migration was performed.

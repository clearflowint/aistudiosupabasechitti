# CFCF Automation Redesign — Decision Boundary

Status: redesign direction agreed; implementation and production cleanup are not authorized by this document.

## Required architecture

n8n is the central automation and communication engine for CFCF. PWA actions, inbound WhatsApp messages, schedules, and other approved integrations should enter shared n8n workflows rather than maintain separate business logic.

n8n owns request normalization, trusted tenant/product identification, input validation, data retrieval, eligibility decisions, business rules, message/report composition, workflow orchestration, WAHA transport, and manager-visible progress updates.

Supabase remains the source of truth for application data, tenant permissions, and durable execution state. Prefer direct, tenant-scoped Supabase reads and writes from n8n where they are secure and sufficient. Keep an RPC or database function only when a concrete database invariant requires an atomic operation that cannot safely be expressed as ordinary scoped reads/writes. Document the invariant and test it.

WAHA is the WhatsApp transport. A provider acceptance response must not be described as delivered/read. If a send outcome is ambiguous, record it as uncertain and surface it for reconciliation; do not blindly resend or promise exactly-once provider delivery.

## Scope and safeguards

- The inactive prototype workflow `n8n/cfcf-monthly-schedule-evaluator.workflow.json` has been removed from the proposed repository state pending redesign.
- Existing recurring-automation migrations and design documents are retained as historical records for now. The migration version `20261018191014` was reported as already applied to production; deleting its file or assuming a Git revert undoes the live schema would be unsafe.
- No production Supabase schema, rows, functions, secrets, n8n workflows, or Cloudflare deployment are changed by this decision.
- Do not create, alter, drop, or backfill PWA notification tables, functions, triggers, cron jobs, or data as part of this redesign. Preserve the existing PWA daily manager alert summary.
- Do not activate any automation or enable provider delivery until the redesigned workflow contract and tests are reviewed.
- Avoid retries, recovery loops, automatic requeues, or blind resends unless a specific failure mode justifies them and the behavior is explicitly agreed and tested.
- PR #22 (global n8n WhatsApp registry) remains unmerged pending redesign review.

## Required next steps before database cleanup

1. Inventory the production objects introduced by the recurring-automation migration and their dependencies.
2. Verify that the schedule/job tables contain no records and that no deployed workflow/function uses them; do not infer this from repository contents alone.
3. Design the simplified n8n-first request and execution contract for PWA manual triggers, inbound WhatsApp commands, and recurring schedules.
4. Identify the minimum atomic database operations required for concurrency, authorization, and durable confirmation; remove forwarding/formatting wrappers only after replacement paths are verified.
5. Propose any database cleanup as a separate reviewed migration. Do not execute it automatically as part of a repository revert.
6. Validate the preserved PWA daily summary independently.

## Acceptance criteria

- All supported trigger sources route to the same shared n8n business workflow.
- Tenant and product scope are derived from trusted authorization/context, never accepted blindly from an inbound sender.
- Supabase access is tenant-scoped; no service-role credentials reach the PWA/browser.
- Provider acceptance, confirmed delivery, failure, and uncertain outcomes remain distinct.
- No blind resend or unbounded retry/requeue behavior.
- PWA daily manager summary behavior remains unchanged.
- Repository checks pass, and production changes remain separate and explicitly authorized.

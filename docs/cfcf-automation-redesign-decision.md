# CFCF Automation Redesign — Decision Boundary

Status: rollback requested. The scheduled/manual automation prototype is being removed through a guarded rollback migration; this does not redesign or alter the protected PWA notification system.

## Required architecture

n8n is the central automation and communication engine for ClearFlow products. PWA actions, inbound WhatsApp messages, schedules, and other approved integrations should enter shared n8n workflows rather than maintain separate business logic.

n8n owns request normalization, trusted tenant/product identification, input validation, data retrieval for workflows, eligibility decisions, business rules, recipient selection, message/report composition, scheduling, workflow orchestration, provider calls through WAHA, and manager-visible progress updates.

Supabase remains the source of truth for application data, tenant permissions, and durable execution state. Prefer direct, tenant-scoped Supabase data access from n8n where secure and sufficient.

## Firm rule: no Supabase Edge Functions for general automation or communication

Do not use Supabase Edge Functions as general-purpose automation, orchestration, scheduling, message composition, campaign dispatch, report generation, or provider communication services. Those responsibilities belong in n8n.

Allowed Edge Function exceptions are product-specific PWA platform needs, such as push-subscription handling, push evaluation/dispatch, and the existing PWA daily manager alert summary. Preserve the currently deployed PWA notification infrastructure unless the user explicitly approves a separate redesign of it.

Database functions/RPCs are a different category and may remain for real database responsibilities: protected data access where direct access is unsuitable, tenant/permission enforcement at the database boundary, and atomic operations needed for proven concurrency or integrity invariants (for example, a financial mutation that must commit as one transaction). They must not merely forward a request to n8n, fetch and format workflow data, compose messages/reports, or duplicate business logic that belongs in n8n. Document the invariant for each retained nontrivial RPC and test it.

## Responsibility boundaries

- **n8n:** all shared automation and communication business logic, trigger normalization, schedule evaluation, selection, parsing, message/report content, orchestration, provider invocation, and workflow progress.
- **Supabase database:** application data, tenant authorization, durable execution state, and only the database-side atomic guarantees that are genuinely required.
- **Supabase Edge Functions:** product-specific PWA requirements only, especially the existing notification lifecycle; not general automation/communication.
- **WAHA and other providers:** transport only. They do not own ClearFlow business rules.

WAHA is the WhatsApp transport. A provider acceptance response must not be described as delivered/read. If a send outcome is ambiguous, record it as uncertain and surface it for reconciliation; do not blindly resend or promise exactly-once provider delivery.

## Scope and safeguards

- The inactive prototype workflow `n8n/cfcf-monthly-schedule-evaluator.workflow.json` has been removed from the proposed repository state pending redesign.
- Historical recurring-automation migrations remain in Git for auditability. A new forward rollback migration removes the prototype schema and its RPCs from the live database; never delete migration history or assume a Git revert changes the live schema.
- The rollback migration is guarded to abort if either prototype table contains rows. It does not touch PWA notification tables/functions/triggers/cron/data, secrets, n8n workflows, or Cloudflare deployment.
- Do not create, alter, drop, or backfill PWA notification tables, functions, triggers, cron jobs, or data as part of this redesign. Preserve the existing PWA daily manager alert summary.
- Do not activate any automation or enable provider delivery until the redesigned workflow contract and tests are reviewed.
- Avoid retries, recovery loops, automatic requeues, or blind resends unless a specific failure mode justifies them and the behavior is explicitly agreed and tested.
- PR #22 (global n8n WhatsApp registry) remains unmerged pending redesign review.

## Rollback validation

1. The production `cfcf_automation_schedules` and `cfcf_automation_jobs` tables were read-only checked and both contain zero rows.
2. The rollback migration drops only the ten prototype RPCs and those two tables, using `RESTRICT`; unexpected dependencies cause it to fail rather than cascade.
3. Historical migration files remain intact.
4. Verify after rollback that all ten prototype RPCs and both tables are absent, while the three existing PWA notification cron jobs and all PWA notification objects remain unchanged.
5. Keep PR #22 unmerged; it is a separate proposal and is not part of this rollback.

## Acceptance criteria

- All supported trigger sources route to shared n8n business workflows.
- No general-purpose automation or communication is implemented in Supabase Edge Functions.
- Tenant and product scope derive from trusted authorization/context, never blindly from an inbound sender.
- Supabase access is tenant-scoped; service-role credentials never reach the PWA/browser.
- Retained database functions have a documented database-integrity/access purpose, not duplicated workflow logic.
- Provider acceptance, confirmed delivery, failure, and uncertain outcomes remain distinct.
- No blind resend or unbounded retry/requeue behavior.
- PWA daily manager summary behavior remains unchanged.
- Repository checks pass, and production changes remain separate and explicitly authorized.

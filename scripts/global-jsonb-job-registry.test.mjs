import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(new URL("../supabase/migrations/20261020150000_n8n_global_jsonb_job_registry.sql", import.meta.url), "utf8");
const policyMigration = readFileSync(new URL("../supabase/migrations/20261020164000_n8n_job_registry_product_scoped_read_policy.sql", import.meta.url), "utf8");
const campaignMigration = readFileSync(new URL("../supabase/migrations/20261020180000_cfcf_manual_campaign_job_requests.sql", import.meta.url), "utf8");
const campaignScopeMigration = readFileSync(new URL("../supabase/migrations/20261020182000_cfcf_manual_campaign_fund_scope.sql", import.meta.url), "utf8");
const workspacePage = readFileSync(new URL("../src/features/cfcf/pages/WorkspacePage.tsx", import.meta.url), "utf8");
const contract = readFileSync(new URL("../docs/n8n-global-jsonb-job-registry.md", import.meta.url), "utf8");
const architecture = readFileSync(new URL("../docs/architecture-guide.md", import.meta.url), "utf8");
const progressService = readFileSync(new URL("../src/features/cfcf/services/automation-jobs.service.ts", import.meta.url), "utf8");
const progressCard = readFileSync(new URL("../src/features/cfcf/components/AutomationJobProgressCard.tsx", import.meta.url), "utf8");
const homeShell = readFileSync(new URL("../src/components/workspace/WorkspaceHomePage.tsx", import.meta.url), "utf8");

test("job storage stays a simple table with a JSON payload", () => {
  assert.equal(migration.split("create table public.n8n_global_jobs").length - 1, 1);
  assert.ok(migration.includes("job_data jsonb not null default '{}'::jsonb"));
  assert.ok(migration.includes("job_id bigint generated always as identity"));
  assert.ok(migration.includes("product_id text not null"));
  assert.ok(migration.includes("tenant_id text not null"));
  assert.ok(migration.includes("request_id text"));
  assert.ok(migration.includes("source_type text not null"));
  assert.ok(migration.includes("scheduled_at timestamptz"));
  assert.ok(migration.includes("n8n_global_jobs_due_idx"));
  assert.equal((migration.match(/create index n8n_global_jobs_due_idx/g) ?? []).length, 1);
  assert.ok(migration.includes("created_at timestamptz not null default now()"));
  assert.ok(migration.includes("updated_at timestamptz not null default now()"));
  assert.equal(migration.includes("create or replace function"), false);
  assert.equal(migration.includes("create view"), false);
  assert.equal(migration.includes("generated always as (\n    jsonb_build_object"), false);
});

test("database contains only the basic lifecycle status and tenant scope", () => {
  for (const status of ["queued", "processing", "completed", "failed", "cancelled"]) {
    assert.ok(migration.includes("'" + status + "'"));
  }
  assert.ok(migration.includes("foreign key (tenant_id, product_id)"));
  assert.ok(migration.includes("references public.tenants (tenant_id, product_id)"));
  assert.ok(migration.includes("on public.n8n_global_jobs\n  for select to authenticated"));
  assert.ok(migration.includes("is_active_tenant_owner(product_id, tenant_id)"));
});

test("global registry status access is tenant-scoped and product-specific", () => {
  assert.ok(policyMigration.includes("when product_id = 'CFCF'"));
  assert.ok(policyMigration.includes("then public.is_active_tenant_owner(product_id, tenant_id)"));
  assert.ok(policyMigration.includes("else public.has_active_access(product_id, tenant_id)"));
  assert.ok(contract.includes("CFCF status remains manager-only"));
});

test("draft schema avoids workflow-engine machinery and duplicate indexes", () => {
  assert.equal(migration.includes("create unique index"), false);
  assert.equal(migration.includes("progress_summary"), false);
  assert.equal(migration.includes("event_history_limit"), false);
  assert.equal(migration.includes("campaign_limit"), false);
  assert.equal(migration.includes("n8n_global_job_progress"), false);
  assert.equal(migration.includes("create or replace function"), false);
  assert.ok(contract.includes("Supabase is the durable record store; n8n is the validator, router, dispatcher, and execution engine."));
  assert.ok(contract.includes("The table is storage, not a workflow engine."));
  assert.ok(contract.includes("best-effort"));
  assert.ok(contract.includes("One shared n8n dispatcher checks queued rows"));
  assert.ok(contract.includes("ordinary fetch/insert/update operation can run without a job row"));
});

test("browser can read safe status fields but not private JSON payload", () => {
  assert.ok(migration.includes("revoke all on table public.n8n_global_jobs from public, anon, authenticated"));
  assert.ok(migration.includes("grant select ("));
  assert.ok(migration.includes("job_id, product_id, tenant_id, source_type, job_type, status, request_id"));
  assert.ok(migration.includes("scheduled_at, created_at, updated_at, completed_at"));
  assert.ok(migration.includes("grant all on table public.n8n_global_jobs to service_role"));
  assert.ok(progressService.includes('from("n8n_global_jobs")'));
  assert.ok(progressService.includes('.eq("product_id", cfcfConfig.productId)'));
  assert.ok(progressService.includes('.eq("tenant_id", tenantId)'));
  assert.ok(progressService.includes('.limit(5)'));
  assert.ok(progressService.includes("Never selects the private job_data payload"));
  assert.equal(progressService.includes('"job_data"'), false);
});

test("manager status card is read-only and enabled by default with an opt-out", () => {
  assert.ok(progressCard.includes('import.meta.env.VITE_CFCF_JOB_PROGRESS_ENABLED !== "false"'));
  assert.ok(progressCard.includes("No job data has been requested"));
  assert.ok(progressCard.includes("Read-only status from saved records"));
  assert.ok(progressCard.includes("job.source_type.replaceAll"));
  assert.ok(progressCard.includes("Scheduled for {formatTime(job.scheduled_at)}"));
  assert.ok(homeShell.includes("{product.renderHomeContent?.(workspace)}"));
});

test("portability-first architecture is documented and notification subsystem stays untouched", () => {
  assert.ok(architecture.includes("Portability-first architecture — approved direction"));
  assert.ok(architecture.includes("ClearFlow owns product behavior and business rules."));
  assert.ok(architecture.includes("Every new table, RPC, trigger, workflow, index, or background worker must state the concrete problem it solves"));
  for (const protectedName of ["clearflow_push_subscriptions", "clearflow_push_outbox", "clearflow_push_alert_state"]) {
    assert.equal(migration.includes(protectedName), false);
  }
  assert.ok(contract.includes("It does not alter existing PWA notification tables, functions, data, or cron jobs."));
});


test("PWA can enqueue only tenant-owned manual CFCF campaign requests", () => {
  assert.ok(campaignMigration.includes("grant insert ("));
  assert.ok(campaignMigration.includes("for insert to authenticated"));
  assert.ok(campaignMigration.includes("public.is_active_tenant_owner(product_id, tenant_id)"));
  assert.ok(campaignMigration.includes("source_type = 'pwa'"));
  assert.ok(campaignMigration.includes("'pending_reminder_campaign', 'share_report_campaign'"));
  assert.ok(campaignMigration.includes("status = 'queued'"));
  assert.ok(campaignMigration.includes("scheduled_at is null"));
  assert.ok(campaignMigration.includes("job_data ->> 'execution_mode' = 'manual_send'"));
  assert.ok(campaignScopeMigration.includes("from public.cfcf_funds as fund"));
  assert.ok(campaignScopeMigration.includes("fund.tenant_id = public.n8n_global_jobs.tenant_id"));
  assert.ok(campaignScopeMigration.includes("fund.status = 'active'"));
  assert.ok(progressService.includes("requestCfcfCampaignJob"));
  assert.ok(progressService.includes('source_type: "pwa"'));
  assert.ok(progressService.includes("campaign_kind: campaignKind"));
  assert.ok(progressService.includes('window.dispatchEvent(new Event("clearflow:cfcf-job-queued"))'));
  assert.ok(workspacePage.includes('queueCampaign("pending_reminder_campaign")'));
  assert.ok(workspacePage.includes('queueCampaign("share_report_campaign")'));
  assert.ok(workspacePage.includes("delivery remains blocked until the WAHA endpoint, session, and authentication are configured."));
});

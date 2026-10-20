import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(new URL("../supabase/migrations/20261020150000_n8n_global_jsonb_job_registry.sql", import.meta.url), "utf8");
const contract = readFileSync(new URL("../docs/n8n-global-jsonb-job-registry.md", import.meta.url), "utf8");

test("one global job table stores status and recipient updates in JSONB", () => {
  assert.ok(migration.includes("create table public.n8n_global_jobs"));
  assert.ok(migration.includes("job_data jsonb not null default '{}'::jsonb"));
  assert.equal(migration.includes("create table public.n8n_whatsapp_communications"), false);
  assert.equal(migration.includes("create table public.n8n_whatsapp_deliveries"), false);
  assert.equal(migration.includes("create or replace function"), false);
});

test("job IDs start at 100 and jobs are tenant/product scoped", () => {
  assert.ok(migration.includes("identity (start with 100 increment by 1)"));
  assert.ok(migration.includes("foreign key (tenant_id, product_id)"));
  assert.ok(migration.includes("is_active_tenant_owner(product_id, tenant_id)"));
  assert.ok(migration.includes("for select to authenticated"));
});

test("tenant foreign key matches the composite tenant/product unique key", () => {
  assert.ok(migration.includes("foreign key (tenant_id, product_id)"));
  assert.ok(migration.includes("references public.tenants (tenant_id, product_id)"));
});

test("request IDs are unique per product and tenant to prevent duplicate jobs", () => {
  assert.ok(migration.includes("n8n_global_jobs_request_id_unique_idx"));
  assert.ok(migration.includes("(product_id, tenant_id, (job_data ->> 'request_id'))"));
  assert.ok(migration.includes("where nullif(btrim(job_data ->> 'request_id'), '') is not null"));
  assert.ok(contract.includes("return that job receipt and do not dispatch again"));
});

test("campaign recipient arrays have a hard 100-contact ceiling", () => {
  assert.ok(migration.includes("jsonb_array_length(job_data -> 'recipients') between 1 and 100"));
  assert.ok(migration.includes("or case"));
  assert.ok(migration.includes("when jsonb_typeof(job_data -> 'recipients') = 'array'"));
  assert.ok(contract.includes("1–100 unique resolved contacts"));
  assert.ok(contract.includes("before any provider call"));
});

test("JSONB event history is an array capped at 500 entries", () => {
  assert.ok(migration.includes("constraint n8n_global_jobs_event_history_limit"));
  assert.ok(migration.includes("jsonb_array_length(job_data -> 'events') <= 500"));
  assert.ok(migration.includes("when jsonb_typeof(job_data -> 'events') = 'array'"));
  assert.ok(contract.includes("500-event history"));
});

test("schema avoids the protected PWA push subsystem and general automation RPCs", () => {
  for (const protectedName of ["clearflow_push_subscriptions", "clearflow_push_outbox", "clearflow_push_alert_state"]) {
    assert.equal(migration.includes(protectedName), false);
  }
  assert.equal(migration.includes("create or replace function"), false);
  assert.ok(contract.includes("Existing PWA push tables/functions/data/cron jobs remain untouched."));
});

test("inbound provider events have a scoped uniqueness guard separate from request idempotency", () => {
  assert.ok(migration.includes("n8n_global_jobs_inbound_event_unique_idx"));
  assert.ok(migration.includes("where job_type = 'whatsapp_inbound'"));
  assert.ok(migration.includes("(job_data ->> 'provider_name')"));
  assert.ok(migration.includes("(job_data ->> 'session_name')"));
  assert.ok(migration.includes("(job_data ->> 'provider_event_id')"));
  assert.ok(contract.includes("trusted `session_name`, and `provider_event_id`"));
  assert.ok(contract.includes("The migration remains draft-only and has not been applied to any database."));
});

function mockInboundEventKey({ productId, tenantId, providerName, sessionName, providerEventId }) {
  const fields = [productId, tenantId, providerName, sessionName, providerEventId];
  if (fields.some(value => typeof value !== "string" || value.trim() === "")) return null;
  return fields.map(value => value.trim()).join("::");
}

test("mock inbound event idempotency distinguishes provider, session, tenant, and event", () => {
  const base = { productId: "CFCF", tenantId: "tenant-a", providerName: "WAHA", sessionName: "Lakki", providerEventId: "evt-123" };
  assert.equal(mockInboundEventKey(base), mockInboundEventKey({ ...base }));
  assert.notEqual(mockInboundEventKey(base), mockInboundEventKey({ ...base, providerEventId: "evt-124" }));
  assert.notEqual(mockInboundEventKey(base), mockInboundEventKey({ ...base, sessionName: "tenant-session-2" }));
  assert.notEqual(mockInboundEventKey(base), mockInboundEventKey({ ...base, tenantId: "tenant-b" }));
  assert.notEqual(mockInboundEventKey(base), mockInboundEventKey({ ...base, providerName: "other-provider" }));
  assert.equal(mockInboundEventKey({ ...base, sessionName: " " }), null);
  assert.equal(mockInboundEventKey({ ...base, providerEventId: "" }), null);
});

test("inbound event index is partial, fully scoped, and does not replace request idempotency", () => {
  const start = migration.indexOf("create unique index n8n_global_jobs_inbound_event_unique_idx");
  assert.notEqual(start, -1);
  const block = migration.slice(start, migration.indexOf(";", start) + 1);
  for (const required of [
    "product_id",
    "tenant_id",
    "job_data ->> 'provider_name'",
    "job_data ->> 'session_name'",
    "job_data ->> 'provider_event_id'",
    "where job_type = 'whatsapp_inbound'",
    "nullif(btrim(job_data ->> 'provider_name'), '') is not null",
    "nullif(btrim(job_data ->> 'session_name'), '') is not null",
    "nullif(btrim(job_data ->> 'provider_event_id'), '') is not null"
  ]) assert.ok(block.includes(required), `missing inbound index guard: ${required}`);
  assert.ok(migration.includes("n8n_global_jobs_request_id_unique_idx"));
  assert.ok(contract.includes("If insertion conflicts, fetch the existing job in the same product/tenant scope"));
  assert.ok(contract.includes("If insert fails for any reason other than a confirmed duplicate, return retryable non-2xx"));
  assert.ok(contract.includes("The migration remains draft-only and has not been applied to any database."));
});

test("inbound event idempotency is not an authorization shortcut or a live enqueue implementation", () => {
  assert.ok(contract.includes("never accepted as proof of identity from caller-supplied tenant fields"));
  assert.ok(contract.includes("Authenticate the inbound transport and validate required event fields."));
  assert.ok(contract.includes("Resolve the trusted receiving session and exactly one authoritative CFCF tenant/contact/role"));
  assert.equal(migration.includes("create or replace function"), false);
  assert.equal(migration.includes("create table public.clearflow_push_subscriptions"), false);
  assert.equal(migration.includes("create table public.clearflow_push_outbox"), false);
  assert.equal(migration.includes("create table public.clearflow_push_alert_state"), false);
});


test("manager progress view exposes only sanitized summary fields", () => {
  assert.equal(migration.split("create table public.n8n_global_jobs").length - 1, 1);
  assert.equal(migration.split("create view public.n8n_global_job_progress").length - 1, 1);
  assert.equal(migration.split("create unique index n8n_global_jobs_request_id_unique_idx").length - 1, 1);
  assert.equal(migration.includes("grant select on table public.n8n_global_jobs to authenticated"), false);
  assert.ok(migration.includes("revoke all on table public.n8n_global_jobs from anon, authenticated"));

  assert.ok(migration.includes("progress_summary jsonb generated always as"));
  assert.ok(migration.includes("create view public.n8n_global_job_progress"));
  assert.ok(migration.includes("with (security_invoker = true)"));
  assert.ok(migration.includes("grant select on public.n8n_global_job_progress to authenticated"));
  assert.ok(migration.includes("grant select ("));
  assert.ok(migration.includes("job_id, product_id, tenant_id, job_type, status"));
  assert.ok(migration.includes("created_at, updated_at as last_safe_update_at, completed_at"));
  assert.ok(migration.includes("progress_summary,"));
  assert.ok(migration.includes("(status in ('uncertain', 'partial')) as needs_review"));
  assert.equal(migration.includes("grant select on table public.n8n_global_jobs to authenticated"), false);
  const viewStart = migration.indexOf("create view public.n8n_global_job_progress");
  const viewBlock = migration.slice(viewStart, migration.indexOf(";", viewStart) + 1);
  assert.equal(viewBlock.includes("job_data"), false);
  assert.equal(viewBlock.includes("message_text"), false);
  assert.equal(viewBlock.includes("phone"), false);
});

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
  assert.ok(migration.includes("for select\n  to authenticated"));
});

test("request IDs are unique per product and tenant to prevent duplicate jobs", () => {
  assert.ok(migration.includes("n8n_global_jobs_request_id_unique_idx"));
  assert.ok(migration.includes("(product_id, tenant_id, (job_data ->> 'request_id'))"));
  assert.ok(migration.includes("where nullif(btrim(job_data ->> 'request_id'), '') is not null"));
  assert.ok(contract.includes("duplicate request_id must return the existing job"));
});

test("campaign recipient arrays have a hard 100-contact ceiling", () => {
  assert.ok(migration.includes("jsonb_array_length(job_data -> 'recipients') <= 100"));
  assert.ok(contract.includes("1–100 unique resolved contacts"));
  assert.ok(contract.includes("before any provider call"));
});

test("schema avoids the protected PWA push subsystem and general automation RPCs", () => {
  for (const protectedName of ["clearflow_push_subscriptions", "clearflow_push_outbox", "clearflow_push_alert_state"]) {
    assert.equal(migration.includes(protectedName), false);
  }
  assert.equal(migration.includes("create or replace function"), false);
  assert.ok(contract.includes("Existing PWA push tables/functions/data/cron jobs remain untouched."));
});

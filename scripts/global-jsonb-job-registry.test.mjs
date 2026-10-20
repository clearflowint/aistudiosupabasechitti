import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(new URL("../supabase/migrations/20261020150000_n8n_global_jsonb_job_registry.sql", import.meta.url), "utf8");
const contract = readFileSync(new URL("../docs/n8n-global-jsonb-job-registry.md", import.meta.url), "utf8");

test("one global job table stores status and recipient updates in JSONB", () => {
  assert.match(migration, /create table public\.n8n_global_jobs/i);
  assert.match(migration, /job_data jsonb not null default '\{\}'::jsonb/i);
  assert.doesNotMatch(migration, /create table public\.n8n_whatsapp_(communications|deliveries)/i);
  assert.doesNotMatch(migration, /create or replace function/i);
});

test("job IDs start at 100 and jobs are tenant/product scoped", () => {
  assert.match(migration, /identity \(start with 100 increment by 1\)/i);
  assert.match(migration, /foreign key \(tenant_id, product_id\)/i);
  assert.match(migration, /is_active_tenant_owner\(product_id, tenant_id\)/i);
  assert.match(migration, /for select\s+to authenticated/i);
});

test("campaign recipient arrays have a hard 100-contact ceiling", () => {
  assert.match(migration, /jsonb_array_length\(job_data -> 'recipients'\) <= 100/i);
  assert.match(contract, /1–100 unique contacts/i);
  assert.match(contract, /before any provider call/i);
});

test("schema avoids the protected PWA push subsystem and general automation RPCs", () => {
  for (const protectedName of ["clearflow_push_subscriptions", "clearflow_push_outbox", "clearflow_push_alert_state"]) {
    assert.equal(migration.includes(protectedName), false);
  }
  assert.doesNotMatch(migration, /create or replace function/i);
  assert.match(contract, /does not touch the existing PWA push-notification tables/i);
});

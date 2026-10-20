import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(new URL("../supabase/migrations/20261021010000_cfcf_atomic_job_claim.sql", import.meta.url), "utf8");

test("atomic CFCF job claim only claims one queued CFCF row", () => {
  assert.ok(migration.includes("FUNCTION public.cfcf_claim_next_job()"));
  assert.ok(migration.includes("RETURNS SETOF public.n8n_global_jobs"));
  assert.ok(migration.includes("WHERE product_id = 'CFCF'"));
  assert.ok(migration.includes("AND status = 'queued'"));
  assert.ok(migration.includes("ORDER BY created_at, job_id"));
  assert.ok(migration.includes("FOR UPDATE SKIP LOCKED"));
  assert.ok(migration.includes("LIMIT 1"));
  assert.ok(migration.includes("SET status = 'processing'"));
  assert.ok(migration.includes("AND status = 'queued'"));
});

test("atomic claim RPC is not callable by browser roles", () => {
  assert.ok(migration.includes("SECURITY DEFINER"));
  assert.ok(migration.includes("SET search_path = pg_catalog, public"));
  assert.ok(migration.includes("REVOKE ALL ON FUNCTION public.cfcf_claim_next_job() FROM PUBLIC"));
  assert.ok(migration.includes("REVOKE ALL ON FUNCTION public.cfcf_claim_next_job() FROM anon"));
  assert.ok(migration.includes("REVOKE ALL ON FUNCTION public.cfcf_claim_next_job() FROM authenticated"));
  assert.ok(migration.includes("GRANT EXECUTE ON FUNCTION public.cfcf_claim_next_job() TO service_role"));
  assert.equal(migration.includes("clearflow_push_"), false);
  assert.equal(migration.includes("CREATE TRIGGER"), false);
});

const finalizationMigration = readFileSync(new URL("../supabase/migrations/20261021012000_cfcf_job_finalization.sql", import.meta.url), "utf8");

test("job finalization only updates a matching processing CFCF job", () => {
  assert.ok(finalizationMigration.includes("FUNCTION public.cfcf_finalize_n8n_job("));
  assert.ok(finalizationMigration.includes("p_job_id bigint"));
  assert.ok(finalizationMigration.includes("p_tenant_id text"));
  assert.ok(finalizationMigration.includes("p_final_status text"));
  assert.ok(finalizationMigration.includes("p_delivery_result jsonb"));
  assert.ok(finalizationMigration.includes("p_final_status NOT IN ('completed', 'failed')"));
  assert.ok(finalizationMigration.includes("AND product_id = 'CFCF'"));
  assert.ok(finalizationMigration.includes("AND tenant_id = p_tenant_id"));
  assert.ok(finalizationMigration.includes("AND status = 'processing'"));
  assert.ok(finalizationMigration.includes("jsonb_build_object('delivery_result', p_delivery_result)"));
  assert.ok(finalizationMigration.includes("completed_at = pg_catalog.now()"));
});

test("job finalization is service-role-only and does not add retry behavior", () => {
  assert.ok(finalizationMigration.includes("SECURITY DEFINER"));
  assert.ok(finalizationMigration.includes("SET search_path = pg_catalog, public"));
  assert.ok(finalizationMigration.includes("REVOKE ALL ON FUNCTION public.cfcf_finalize_n8n_job(bigint, text, text, jsonb) FROM PUBLIC"));
  assert.ok(finalizationMigration.includes("REVOKE ALL ON FUNCTION public.cfcf_finalize_n8n_job(bigint, text, text, jsonb) FROM anon"));
  assert.ok(finalizationMigration.includes("REVOKE ALL ON FUNCTION public.cfcf_finalize_n8n_job(bigint, text, text, jsonb) FROM authenticated"));
  assert.ok(finalizationMigration.includes("GRANT EXECUTE ON FUNCTION public.cfcf_finalize_n8n_job(bigint, text, text, jsonb) TO service_role"));
  assert.equal(finalizationMigration.toLowerCase().includes("retry"), false);
  assert.equal(finalizationMigration.includes("clearflow_push_"), false);
});

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const contract = readFileSync(new URL("../docs/n8n-pwa-job-instruction-contract.md", import.meta.url), "utf8");

test("instruction envelope sends IDs and manager options, not authoritative recipient data", () => {
  assert.ok(contract.includes('"schema_version": 1'));
  assert.ok(contract.includes('"request_id": "client-generated-uuid"'));
  assert.ok(contract.includes('"group_ids"'));
  assert.ok(contract.includes("must not send authoritative recipient names/phone numbers"));
});

test("campaigns reject over 100 unique recipients before any provider call", () => {
  assert.ok(contract.includes("1–100 unique contacts"));
  assert.ok(contract.includes("reject the entire job before any provider call"));
  assert.ok(contract.includes("Do not split automatically"));
});

test("authorization trusts the verified Auth identity and enforces active tenant-owner access", () => {
  assert.ok(contract.includes("Validate the token with the Supabase Auth user endpoint"));
  assert.ok(contract.includes("Never trust a body-supplied email, person ID, or owner flag."));
  assert.ok(contract.includes("access_type = tenantowner"));
  assert.ok(contract.includes("Reject mismatches with 403."));
  assert.ok(contract.includes("service-role credential is held only in n8n"));
});

test("security matrix covers unauthorized and ambiguous outcomes", () => {
  for (const phrase of ["Missing Authorization header → 401", "Invalid or expired Supabase access token → 401", "Active non-owner or owner for a different tenant/product → 403", "101+ unique", "mark `uncertain`"]) {
    assert.ok(contract.includes(phrase), `missing security matrix case: ${phrase}`);
  }
});

test("repeated request IDs must resolve to the same job without dispatching again", () => {
  assert.ok(contract.includes("n8n_global_jobs_request_id_unique_idx"));
  assert.ok(contract.includes("fetch and return the existing job and do not dispatch again"));
  assert.ok(contract.includes("Bound `events` to the latest 500 entries."));
});

test("draft preview cannot claim persistence or sending", () => {
  assert.ok(contract.includes('"mode": "contract_preview_only"'));
  assert.ok(contract.includes('"side_effects": false'));
  assert.ok(contract.includes("It must not say that a job was created, queued, or sent."));
});

test("safety and existing architecture constraints are explicit", () => {
  assert.ok(contract.includes("No database write, WAHA/provider call, schedule, or callback"));
  assert.ok(contract.includes("PWA is read-only for job progress"));
  assert.ok(contract.includes("Do not add automatic retries"));
  assert.ok(contract.includes("not in new Supabase schedule tables or generic database functions"));
});

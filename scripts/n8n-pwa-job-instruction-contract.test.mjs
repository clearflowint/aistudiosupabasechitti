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

test("service-role RLS bypass and safer user-scoped reads are explicit", () => {
  assert.ok(contract.includes("Supabase `service_role` credentials bypass Row Level Security."));
  assert.ok(contract.includes("not restricted by the authenticated tenant-owner SELECT policy"));
  assert.ok(contract.includes("Prefer the caller's verified access token for user-authorized reads"));
  assert.ok(contract.includes("project-wide privileged access, not a tenant-scoped credential"));
  assert.ok(contract.includes("verify its target and access through a safe, non-mutating check"));
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

test("multi-trigger design distinguishes PWA, WhatsApp, and schedule authentication", () => {
  for (const phrase of [
    "PWA-originated manager actions",
    "Inbound WhatsApp-originated actions — simplified phone-based routing",
    "Scheduled n8n-originated work",
    "validates the access token with Supabase Auth",
    "Protect the WAHA-to-n8n webhook at the transport/server boundary",
    "there is no inbound HTTP request and no external app to hold a secret",
    "shared authorization gate",
    "Unknown senders may be handled as unverified inquiries"
  ]) {
    assert.ok(contract.includes(phrase), `missing multi-trigger security rule: ${phrase}`);
  }
});

test("scheduled and inbound events require idempotency and current tenant authorization", () => {
  assert.ok(contract.includes("schedule identity plus the intended run timestamp"));
  assert.ok(contract.includes("Deduplicate by provider event/message ID where available"));
  assert.ok(contract.includes("check that the target tenant is still active and eligible"));
  assert.ok(contract.includes("Source identity and action permissions are not interchangeable"));
});

test("WhatsApp routing uses sender/receiver numbers and does not treat session name as a secret", () => {
  for (const phrase of [
    "Do **not** treat a WAHA session name as a secret",
    "Shared agency number/session:",
    "sender's normalized phone number as the primary lookup to identify the tenant",
    "Tenant-owned WhatsApp number/session:",
    "receiver/business number to identify which tenant owns that WhatsApp number",
    "sender's normalized number to look up the person within that tenant",
    "session name is routing metadata, not a credential",
    "ask a neutral clarification or route for manual review"
  ]) {
    assert.ok(contract.includes(phrase), `missing WhatsApp routing rule: ${phrase}`);
  }
});

test("WhatsApp first gate checks sender records before normal tenant routing", () => {
  for (const phrase of [
    "First routing gate — verify a sender record before normal routing:",
    "look for an authoritative match in ClearFlow's tenant/contact/person/access records",
    "If there is no matching record, do not continue as a recognized tenant/person",
    "notify the tenant/manager if the tenant can be safely identified",
    "If no tenant can be identified, do not guess which tenant to notify",
    "check whether the sender has a person/contact record within that tenant"
  ]) {
    assert.ok(contract.includes(phrase), `missing first-gate sender validation rule: ${phrase}`);
  }
});

test("global registry and CFCF workflows have separate ownership and established names", () => {
  for (const phrase of [
    "Workflow ownership and naming — keep global and CFCF separate",
    "ClearFlow — JSONB Job Contract Preview (Draft Only)",
    "CFCF Automation Worker — Draft",
    "CFCF — Monthly Schedule Evaluator (Setup Required)",
    "CFCF — Shared Error Handler",
    "not a cross-product global error handler",
    "CFCF-dedicated shared WhatsApp number/session",
    "separate entry path from the CFCF shared number",
    "Do not broadcast one inbound event to multiple business workflows",
    "The global registry does not make a product's business workflow global"
  ]) {
    assert.ok(contract.includes(phrase), `missing global/product workflow boundary: ${phrase}`);
  }
});

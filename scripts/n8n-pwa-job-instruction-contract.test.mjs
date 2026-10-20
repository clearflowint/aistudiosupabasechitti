import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const contract = readFileSync(new URL("../docs/n8n-pwa-job-instruction-contract.md", import.meta.url), "utf8");
const migration = readFileSync(new URL("../supabase/migrations/20261020150000_n8n_global_jsonb_job_registry.sql", import.meta.url), "utf8");
const progressCard = readFileSync(new URL("../src/features/cfcf/components/AutomationJobProgressCard.tsx", import.meta.url), "utf8");

test("request contract carries identity and action, not authoritative contact data", () => {
  for (const field of ['"request_id"', '"product_id"', '"tenant_id"', '"person_id"', '"action"']) {
    assert.ok(contract.includes(field), "missing request field " + field);
  }
  assert.ok(contract.includes("Do not send authoritative phone numbers"));
  assert.ok(contract.includes("Do not add a separate tenant-session key, API key, or authentication key to the PWA-to-n8n request contract."));
});

test("PWA and n8n handle common duplicate submissions at entry points", () => {
  assert.ok(contract.includes("disable Submit while the request is in progress"));
  assert.ok(contract.includes("At n8n ingress, validate the request and check a request/event ID"));
  assert.ok(contract.includes("duplicate suppression is best-effort and happens at entry points"));
  assert.ok(contract.includes("Do not deduplicate unrelated requests solely because their message text matches"));
  assert.ok(contract.includes("Do not add unique-index frameworks, leases, generic queues"));
});

test("storage remains simple and does not become a workflow engine", () => {
  for (const status of ["queued", "processing", "completed", "failed", "cancelled"]) {
    assert.ok(contract.includes("`" + status + "`"));
    assert.ok(migration.includes("'" + status + "'"));
  }
  assert.ok(contract.includes("No generated progress view, recipient-state machine, event-history framework"));
  assert.equal(migration.includes("create view"), false);
  assert.equal(migration.includes("create or replace function"), false);
  assert.equal(migration.includes("create unique index"), false);
});

test("RLS enforces tenant isolation without blanket staff isolation", () => {
  assert.ok(contract.includes("enforce strict `product_id` + `tenant_id` boundaries"));
  assert.ok(contract.includes("Add staff isolation only for products whose documented roles and workflows require it"));
  assert.ok(contract.includes("CFCF's manager-only rule is not a universal staff-isolation rule"));
});

test("RLS changes preserve PWA refresh, cache isolation, and record presentation", () => {
  assert.ok(contract.includes("must not alter the current PWA's Supabase query shapes, workspace refresh flow, cache hydration"));
  assert.ok(contract.includes("Preserve IndexedDB/offline cache isolation across tenant changes and logout."));
  assert.ok(contract.includes("two synthetic tenants with distinct Funds and records"));
  assert.ok(contract.includes("no cross-tenant leakage"));
});

test("tenant boundaries and real ingress authentication remain required", () => {
  assert.ok(contract.includes("Do not add a separate tenant-session key, API key, or authentication key to the PWA-to-n8n request contract."));
  assert.ok(contract.includes("The PWA sends `product_id`, `tenant_id`, `person_id`, the requested action"));
  assert.ok(contract.includes("WAHA-to-n8n ingress configuration is source-specific"));
  assert.ok(contract.includes("resolve the tenant from the trusted receiver-number mapping"));
  assert.ok(contract.includes("Unknown or ambiguous mappings stop tenant-specific processing."));
});

test("acknowledgement stays simple and ambiguous external sends are not automatically repeated", () => {
  assert.ok(contract.includes("Quick operations return their actual result"));
  assert.ok(contract.includes("a single receipt may be sent after the request is accepted for processing"));
  assert.ok(contract.includes("Do not automatically resend an external message when it is unclear"));
  assert.ok(contract.includes("Do not build a general retry engine"));
});

test("tracked jobs are created by n8n only for work needing progress; CFCF schedules are out of scope", () => {
  assert.ok(contract.includes("n8n updates lifecycle status using its trusted server-side Supabase credential"));
  assert.ok(contract.includes("One shared n8n dispatcher checks for queued jobs whose time has arrived"));
  assert.ok(contract.includes("do not automatically create jobs"));
  assert.ok(contract.includes("PWA, WhatsApp, AI agents, APIs, and future products"));
  assert.ok(contract.includes("CFCF automatic scheduled reminders and reports are out of scope"));
  assert.ok(contract.includes("Automatic CFCF scheduling is out of scope"));
  assert.ok(migration.includes("Existing PWA notification tables, functions, data, and cron jobs are untouched."));
  for (const protectedName of ["clearflow_push_subscriptions", "clearflow_push_outbox", "clearflow_push_alert_state"]) {
    assert.equal(migration.includes(protectedName), false);
  }
});

test("development-stage registry approval does not authorize external sends or production deployment", () => {
  assert.ok(contract.includes("CFCF automatic scheduled reminders and reports are out of scope"));
  assert.ok(contract.includes("remain inactive"));
  assert.ok(contract.includes("live WhatsApp send"));
});


test("automation status card discards stale responses across tenant switches", () => {
  assert.ok(progressCard.includes("const requestVersion = useRef(0)"));
  assert.ok(progressCard.includes("if (version !== requestVersion.current) return"));
  assert.ok(progressCard.includes("Never carry the previous tenant's status rows into a new workspace."));
  assert.ok(progressCard.includes("requestVersion.current += 1"));
});

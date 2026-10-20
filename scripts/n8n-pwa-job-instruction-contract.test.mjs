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

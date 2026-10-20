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
  assert.ok(contract.includes("restricted by the authenticated tenant-owner SELECT policy on `n8n_global_jobs`"));
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

function normalizePhoneForMock(value) {
  return String(value ?? "").replace(/[^0-9]/g, "");
}

// Contract-model only: this pure function models the intended routing rules.
// It does not call WAHA, Supabase, n8n, or any network service.
function routeInboundMock({ routingMode, productId, receiverNumber, senderNumber, sharedNumber, tenantOwnedNumbers, tenantContacts, allowUnknownTenantOwned = false }) {
  const receiver = normalizePhoneForMock(receiverNumber);
  const sender = normalizePhoneForMock(senderNumber);
  if (!receiver || !sender) return { outcome: "invalid_event" };

  if (routingMode === "shared_agency") {
    if (productId !== "CFCF" || receiver !== normalizePhoneForMock(sharedNumber)) {
      return { outcome: "unrecognized_entry_point" };
    }
    const matches = tenantContacts.filter(row => normalizePhoneForMock(row.phone) === sender);
    if (matches.length === 0) return { outcome: "unknown_sender", productId: "CFCF", tenantId: null, notifyTenant: false };
    if (matches.length !== 1) return { outcome: "ambiguous_sender", productId: "CFCF", tenantId: null, notifyTenant: false };
    const match = matches[0];
    return { outcome: "routed", productId: "CFCF", tenantId: match.tenantId, personId: match.personId, role: match.role ?? null };
  }

  if (routingMode === "tenant_owned") {
    const tenantMatches = tenantOwnedNumbers.filter(row => normalizePhoneForMock(row.number) === receiver);
    if (tenantMatches.length !== 1) return { outcome: "unrecognized_or_ambiguous_receiver" };
    const tenantId = tenantMatches[0].tenantId;
    const matches = tenantContacts.filter(row => row.tenantId === tenantId && normalizePhoneForMock(row.phone) === sender);
    if (matches.length === 0) {
      return { outcome: "unknown_sender", productId: "CFCF", tenantId, notifyTenant: allowUnknownTenantOwned };
    }
    if (matches.length !== 1) return { outcome: "ambiguous_sender", productId: "CFCF", tenantId: null, notifyTenant: false };
    const match = matches[0];
    return { outcome: "routed", productId: "CFCF", tenantId, personId: match.personId, role: match.role ?? null };
  }

  return { outcome: "unconfigured_routing_mode" };
}

test("mock routing: CFCF shared number resolves a registered sender to one tenant", () => {
  const result = routeInboundMock({
    routingMode: "shared_agency",
    productId: "CFCF",
    receiverNumber: "+91 90000 00001",
    senderNumber: "+91-90000-00002",
    sharedNumber: "+919000000001",
    tenantOwnedNumbers: [],
    tenantContacts: [{ tenantId: "tenant-a", personId: "person-a", phone: "+919000000002", role: "customer" }]
  });
  assert.deepEqual(result, { outcome: "routed", productId: "CFCF", tenantId: "tenant-a", personId: "person-a", role: "customer" });
});

test("mock routing: unknown shared-number sender is not assigned or notified to a guessed tenant", () => {
  const result = routeInboundMock({
    routingMode: "shared_agency",
    productId: "CFCF",
    receiverNumber: "+919000000001",
    senderNumber: "+919000000099",
    sharedNumber: "+919000000001",
    tenantOwnedNumbers: [],
    tenantContacts: [{ tenantId: "tenant-a", personId: "person-a", phone: "+919000000002", role: "owner" }]
  });
  assert.deepEqual(result, { outcome: "unknown_sender", productId: "CFCF", tenantId: null, notifyTenant: false });
});

test("mock routing: ambiguous shared sender match stops tenant-specific routing", () => {
  const result = routeInboundMock({
    routingMode: "shared_agency",
    productId: "CFCF",
    receiverNumber: "+919000000001",
    senderNumber: "+919000000002",
    sharedNumber: "+919000000001",
    tenantOwnedNumbers: [],
    tenantContacts: [
      { tenantId: "tenant-a", personId: "person-a", phone: "+919000000002" },
      { tenantId: "tenant-b", personId: "person-b", phone: "+919000000002" }
    ]
  });
  assert.equal(result.outcome, "ambiguous_sender");
  assert.equal(result.tenantId, null);
});

test("mock routing: tenant-owned receiver scopes sender lookup to that tenant", () => {
  const result = routeInboundMock({
    routingMode: "tenant_owned",
    productId: "CFCF",
    receiverNumber: "+919000000010",
    senderNumber: "+919000000002",
    sharedNumber: "+919000000001",
    tenantOwnedNumbers: [{ tenantId: "tenant-a", number: "+919000000010" }],
    tenantContacts: [
      { tenantId: "tenant-a", personId: "person-a", phone: "+919000000002", role: "staff" },
      { tenantId: "tenant-b", personId: "person-b", phone: "+919000000002", role: "owner" }
    ]
  });
  assert.deepEqual(result, { outcome: "routed", productId: "CFCF", tenantId: "tenant-a", personId: "person-a", role: "staff" });
});

test("mock routing: tenant-owned unknown sender can only notify the receiver-resolved tenant when policy allows", () => {
  const result = routeInboundMock({
    routingMode: "tenant_owned",
    productId: "CFCF",
    receiverNumber: "+919000000010",
    senderNumber: "+919000000099",
    sharedNumber: "+919000000001",
    tenantOwnedNumbers: [{ tenantId: "tenant-a", number: "+919000000010" }],
    tenantContacts: [],
    allowUnknownTenantOwned: true
  });
  assert.deepEqual(result, { outcome: "unknown_sender", productId: "CFCF", tenantId: "tenant-a", notifyTenant: true });
});

test("mock routing: unmapped or duplicate tenant-owned receiver is not guessed", () => {
  const base = {
    routingMode: "tenant_owned",
    productId: "CFCF",
    receiverNumber: "+919000000010",
    senderNumber: "+919000000002",
    sharedNumber: "+919000000001",
    tenantContacts: [{ tenantId: "tenant-a", personId: "person-a", phone: "+919000000002", role: "owner" }]
  };
  assert.equal(routeInboundMock({ ...base, tenantOwnedNumbers: [] }).outcome, "unrecognized_or_ambiguous_receiver");
  assert.equal(routeInboundMock({ ...base, tenantOwnedNumbers: [{ tenantId: "tenant-a", number: "+919000000010" }, { tenantId: "tenant-b", number: "+919000000010" }] }).outcome, "unrecognized_or_ambiguous_receiver");
});

test("human WhatsApp receipt is conditional on long-running work, transport ack is always required", () => {
  assert.ok(contract.includes("send an immediate receipt only for work that will take longer than a normal interactive response"));
  assert.ok(contract.includes("Quick operations"));
  assert.ok(contract.includes("do not send a separate “queued” receipt"));
  assert.ok(contract.includes("return HTTP 2xx only after the inbound event is durably stored"));
  assert.ok(contract.includes("not_required, pending, provider_accepted, failed, uncertain"));
  assert.ok(contract.includes("Never send a quick-operation success message before the operation succeeds."));
});


function modelInboundAcknowledgement({ durableEnqueue, duplicateEvent = false, operationDuration }) {
  if (durableEnqueue !== true && duplicateEvent !== true) {
    return {
      transportStatus: 503,
      transportAccepted: false,
      humanAcknowledgement: "not_sent",
      reason: "durable_enqueue_failed"
    };
  }
  const humanAcknowledgement = duplicateEvent
    ? "suppressed_duplicate"
    : operationDuration === "long_running"
      ? "send_receipt_after_enqueue"
      : "not_required";
  return {
    transportStatus: 200,
    transportAccepted: true,
    humanAcknowledgement,
    duplicateEvent
  };
}

test("ack model: quick operation gets transport ack but no queued WhatsApp receipt", () => {
  assert.deepEqual(modelInboundAcknowledgement({
    durableEnqueue: true,
    operationDuration: "quick"
  }), {
    transportStatus: 200,
    transportAccepted: true,
    humanAcknowledgement: "not_required",
    duplicateEvent: false
  });
});

test("ack model: long-running operation gets receipt decision only after durable enqueue", () => {
  assert.deepEqual(modelInboundAcknowledgement({
    durableEnqueue: true,
    operationDuration: "long_running"
  }), {
    transportStatus: 200,
    transportAccepted: true,
    humanAcknowledgement: "send_receipt_after_enqueue",
    duplicateEvent: false
  });
});

test("ack model: enqueue failure returns retryable transport failure and never claims queued", () => {
  assert.deepEqual(modelInboundAcknowledgement({
    durableEnqueue: false,
    operationDuration: "long_running"
  }), {
    transportStatus: 503,
    transportAccepted: false,
    humanAcknowledgement: "not_sent",
    reason: "durable_enqueue_failed"
  });
});

test("ack model: duplicate provider event is transport-accepted but does not trigger another receipt", () => {
  assert.deepEqual(modelInboundAcknowledgement({
    durableEnqueue: false,
    duplicateEvent: true,
    operationDuration: "long_running"
  }), {
    transportStatus: 200,
    transportAccepted: true,
    humanAcknowledgement: "suppressed_duplicate",
    duplicateEvent: true
  });
});

test("inbound webhook auth is a hard activation gate", () => {
  assert.ok(contract.includes("Webhook nodes use `authentication: none`"));
  assert.ok(contract.includes("must not be activated or exposed publicly in this state"));
  assert.ok(contract.includes("actual WAHA-to-n8n authentication configuration has not been verified"));
});

test("inbound authentication fails closed before lookup, enqueue, or sender acknowledgement", () => {
  assert.ok(contract.includes("Missing, malformed, or invalid authentication must stop before tenant/contact lookup, durable enqueue, or any human WhatsApp acknowledgement."));
  assert.ok(contract.includes("Authentication failure must not reveal whether a tenant, phone number, session, or contact exists."));
  assert.ok(contract.includes("Ambiguity is a hard stop."));
});

test("inbound auth configuration must be verified rather than guessed from credential names", () => {
  assert.ok(contract.includes("Do not assume that a credential with a generic name is configured for WAHA"));
  assert.ok(contract.includes("Never put a secret in workflow code, a webhook URL, logs, or repository files."));
  assert.ok(contract.includes("HTTP 2xx is permitted only after enqueue succeeds or the same provider event is confirmed as already stored."));
});

// Contract model only: this function does not authenticate a real webhook.
function modelInboundGate({ authState, eventValid = true, routeOutcome = "routed", enqueueOutcome = "stored" }) {
  if (authState !== "verified") return { accepted: false, stage: "authentication", tenantLookup: false, enqueue: false, senderAcknowledgement: false, transportStatus: 401 };
  if (!eventValid) return { accepted: false, stage: "event_validation", tenantLookup: false, enqueue: false, senderAcknowledgement: false, transportStatus: 400 };
  if (routeOutcome !== "routed") return { accepted: false, stage: "authoritative_routing", tenantLookup: true, enqueue: false, senderAcknowledgement: false, transportStatus: 403 };
  if (enqueueOutcome === "failed") return { accepted: false, stage: "durable_enqueue", tenantLookup: true, enqueue: false, senderAcknowledgement: false, transportStatus: 503 };
  if (enqueueOutcome === "duplicate") return { accepted: true, stage: "duplicate_recognized", tenantLookup: true, enqueue: false, senderAcknowledgement: false, transportStatus: 200 };
  return { accepted: true, stage: "durably_stored", tenantLookup: true, enqueue: true, senderAcknowledgement: false, transportStatus: 200 };
}

test("ingress model: missing or invalid authentication stops before tenant lookup", () => {
  for (const authState of ["missing", "invalid", "malformed", "unknown"]) {
    assert.deepEqual(modelInboundGate({ authState }), {
      accepted: false, stage: "authentication", tenantLookup: false, enqueue: false, senderAcknowledgement: false, transportStatus: 401
    });
  }
});

test("ingress model: malformed event and ambiguous routing fail before enqueue or human acknowledgement", () => {
  assert.equal(modelInboundGate({ authState: "verified", eventValid: false }).enqueue, false);
  const ambiguous = modelInboundGate({ authState: "verified", routeOutcome: "ambiguous_sender" });
  assert.equal(ambiguous.accepted, false);
  assert.equal(ambiguous.enqueue, false);
  assert.equal(ambiguous.senderAcknowledgement, false);
});

test("ingress model: transport 2xx follows durable storage or duplicate recognition only", () => {
  const stored = modelInboundGate({ authState: "verified", enqueueOutcome: "stored" });
  assert.equal(stored.transportStatus, 200);
  assert.equal(stored.enqueue, true);
  const duplicate = modelInboundGate({ authState: "verified", enqueueOutcome: "duplicate" });
  assert.equal(duplicate.transportStatus, 200);
  assert.equal(duplicate.senderAcknowledgement, false);
  const failed = modelInboundGate({ authState: "verified", enqueueOutcome: "failed" });
  assert.equal(failed.transportStatus, 503);
  assert.equal(failed.accepted, false);
  assert.equal(failed.senderAcknowledgement, false);
});

function modelDurableEnqueue({ existingJobId = null, insertOutcome, conflictJobId = null }) {
  if (Number.isInteger(existingJobId) && existingJobId >= 100) {
    return { outcome: "duplicate", httpStatus: 200, jobId: existingJobId, dispatch: false };
  }
  if (insertOutcome === "inserted" && Number.isInteger(conflictJobId) === false) {
    return { outcome: "created", httpStatus: 202, jobId: 100, dispatch: false };
  }
  if (insertOutcome === "unique_conflict" && Number.isInteger(conflictJobId) && conflictJobId >= 100) {
    return { outcome: "duplicate", httpStatus: 200, jobId: conflictJobId, dispatch: false };
  }
  return { outcome: "persistence_failure", httpStatus: 503, jobId: null, dispatch: false };
}

test("enqueue model: pre-existing scoped request returns its canonical job without redispatch", () => {
  assert.deepEqual(modelDurableEnqueue({ existingJobId: 143, insertOutcome: "not_attempted" }), {
    outcome: "duplicate", httpStatus: 200, jobId: 143, dispatch: false
  });
});

test("enqueue model: successful durable insert returns generated integer job ID but does not send inline", () => {
  assert.deepEqual(modelDurableEnqueue({ insertOutcome: "inserted" }), {
    outcome: "created", httpStatus: 202, jobId: 100, dispatch: false
  });
});

test("enqueue model: unique conflict returns only the confirmed existing job", () => {
  assert.deepEqual(modelDurableEnqueue({ insertOutcome: "unique_conflict", conflictJobId: 157 }), {
    outcome: "duplicate", httpStatus: 200, jobId: 157, dispatch: false
  });
  assert.deepEqual(modelDurableEnqueue({ insertOutcome: "unique_conflict", conflictJobId: null }), {
    outcome: "persistence_failure", httpStatus: 503, jobId: null, dispatch: false
  });
});

test("enqueue model: unknown persistence failure never returns a success receipt", () => {
  for (const insertOutcome of ["timeout", "permission_denied", "connection_lost", "unknown_error"]) {
    assert.deepEqual(modelDurableEnqueue({ insertOutcome }), {
      outcome: "persistence_failure", httpStatus: 503, jobId: null, dispatch: false
    });
  }
});

test("enqueue contract separates durable receipt from worker dispatch and forbids blind resend", () => {
  assert.ok(contract.includes("n8n creates the job row and uses its returned database `job_id` as the canonical job ID"));
  assert.ok(contract.includes("on conflict, fetch and return the existing job and do not dispatch again"));
  assert.ok(contract.includes("If durable enqueue fails, return a retryable non-2xx response"));
  assert.ok(contract.includes("no automatic resend"));
  assert.ok(contract.includes("The migration remains draft-only and has not been applied to any database.") || contract.includes("Do not point production UI at the draft webhook yet."));
});

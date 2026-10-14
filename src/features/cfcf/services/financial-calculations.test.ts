// CFCF PRODUCT: Deterministic tests for financial calculations; fixtures are in-memory only.
// SKELETON: Use Node's built-in test runner so no production dependency or live Supabase access is required.
// MIX: Validate derived summaries against the existing CFCF row contracts.

import test from "node:test";
import assert from "node:assert/strict";
import { calculateCfcfFundFinancialSummary } from "./financial-calculations.ts";
import type { CfcfFundRow, CfcfShareRow, CfcfPaymentRow, CfcfFundOtherEntryRow } from "../types/database.types.ts";

const fund: CfcfFundRow = {
  fund_id: "fund-1", product_id: "CFCF", tenant_id: "tenant-1", person_id: "owner-1",
  fund_name: "Test Fund", start_date: null, number_of_cycles: 10, number_of_shares: 999,
  current_cycle: 2, cycle_payout_amounts: [1000, 1000], cycle_commissions: [100, 50],
  fund_net_balance: 0, fund_total_billed_amount: 0, fund_total_pending_amount: 0,
  fund_total_advance: 0, fund_total_withdrawn: 0, fund_total_commissions: 0,
  other_amount: 0, status: "active", created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z",
};

function share(overrides: Partial<CfcfShareRow> = {}): CfcfShareRow {
  return {
    share_id: "share-1", product_id: "CFCF", tenant_id: "tenant-1", fund_id: "fund-1",
    person_id: "owner-1", contact_id: "contact-1", billing_entries: { "1": 1000, "2": 500 }, billing_entry_dates: {},
    share_total_billed_amount: 1500, share_net_payment_received: 0, total_pending: 1500,
    total_advance: 0, payout_status: "undrawn", withdrawn_amount: 0, payout_cycle_number: null,
    status: "active", created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function payment(overrides: Partial<CfcfPaymentRow> = {}): CfcfPaymentRow {
  return {
    payment_id: "payment-1", product_id: "CFCF", tenant_id: "tenant-1", person_id: "owner-1",
    fund_id: "fund-1", share_id: "share-1", entry_type: "credit", amount: 700,
    entry_date: "2026-01-02", payment_type: "UPI", remarks: null,
    created_at: "2026-01-02T00:00:00Z", updated_at: "2026-01-02T00:00:00Z", ...overrides,
  };
}

function adjustment(overrides: Partial<CfcfFundOtherEntryRow> = {}): CfcfFundOtherEntryRow {
  return {
    entry_id: "adjustment-1", product_id: "CFCF", tenant_id: "tenant-1", person_id: "owner-1",
    fund_id: "fund-1", entry_type: "credit", amount: 200, remarks: "Other credit",
    created_at: "2026-01-03T00:00:00Z", updated_at: "2026-01-03T00:00:00Z", ...overrides,
  };
}

const calculate = (shares: CfcfShareRow[], payments: CfcfPaymentRow[] = [], adjustments: CfcfFundOtherEntryRow[] = []) =>
  calculateCfcfFundFinancialSummary(fund, shares, payments, adjustments);

test("derives pending from billing less net payments and ignores stored summary values", () => {
  const result = calculate([share()], [payment()]);
  assert.equal(result.shares[0].shareTotalBilledAmount, 1500);
  assert.equal(result.shares[0].shareNetPaymentReceived, 700);
  assert.equal(result.shares[0].totalPending, 800);
  assert.equal(result.shares[0].totalAdvance, 0);
  assert.equal(result.fundTotalBilledAmount, 1500);
  assert.equal(result.fundTotalPendingAmount, 800);
  assert.equal(result.numberOfShares, 1); // Actual row count, not the configured 999.
});

test("billing edits recalculate pending/advance from the same payment ledger", () => {
  const edited = share({ billing_entries: { "1": 400 }, share_total_billed_amount: 400 });
  const result = calculate([edited], [payment()]);
  assert.equal(result.shares[0].shareTotalBilledAmount, 400);
  assert.equal(result.shares[0].totalPending, 0);
  assert.equal(result.shares[0].totalAdvance, 300);
});

test("debit corrections reduce net payments and may leave a pending balance", () => {
  const result = calculate([share({ billing_entries: { "1": 500 } })], [
    payment({ amount: 700 }),
    payment({ payment_id: "payment-2", entry_type: "debit", amount: 300 }),
  ]);
  assert.equal(result.shares[0].shareNetPaymentReceived, 400);
  assert.equal(result.shares[0].totalPending, 100);
  assert.equal(result.shares[0].totalAdvance, 0);
});

test("drawn payouts contribute withdrawn totals; undrawn Shares do not", () => {
  const result = calculate([
    share({ share_id: "drawn", payout_status: "drawn", withdrawn_amount: 250, payout_cycle_number: 1 }),
    share({ share_id: "undrawn", payout_status: "undrawn", withdrawn_amount: 900, payout_cycle_number: null }),
  ]);
  assert.equal(result.fundTotalWithdrawn, 250);
  assert.equal(result.shares.find((item) => item.shareId === "undrawn")?.withdrawnAmount, 0);
});

test("rejects unsupported stored payout statuses rather than treating them as undrawn", () => {
  assert.throws(
    () => calculate([share({ payout_status: "pending" as CfcfShareRow["payout_status"] })]),
    /Unsupported payout status/,
  );
});

test("Fund net balance may be negative; Fund adjustments stay separate", () => {
  const result = calculate(
    [share({ billing_entries: { "1": 100 }, payout_status: "drawn", withdrawn_amount: 500 })],
    [],
    [adjustment({ amount: 200 }), adjustment({ entry_id: "adjustment-2", entry_type: "debit", amount: 350 })],
  );
  assert.equal(result.fundNetBalance, -500 - 150); // billed 100 - withdrawn 500 - pending 100 - commissions 150
  assert.equal(result.otherAmount, -150);
  assert.equal(result.fundTotalBilledAmount, 100);
  assert.equal(result.fundTotalWithdrawn, 500);
});

test("rejects payment rows attributed to a Share outside the Fund", () => {
  assert.throws(() => calculate([share()], [payment({ share_id: "other-share" })]), /outside this Fund/);
});

test("rejects negative net payment totals instead of silently hiding excessive debits", () => {
  assert.throws(() => calculate([share()], [payment({ entry_type: "debit", amount: 800 })]), /net debits exceeding credits/);
});

test("rejects malformed billing entries and unsafe amounts", () => {
  assert.throws(() => calculate([share({ billing_entries: { "bad": 100 } })]), /Invalid Cycle key/);
  assert.throws(() => calculate([share({ billing_entries: { "1": -1 } })]), /non-negative whole-rupee/);
});


test("ignores Share, Payment, and Fund adjustment rows outside the selected tenant/Fund", () => {
  const result = calculate(
    [
      share({ share_id: "in-scope", billing_entries: { "1": 500 } }),
      share({ share_id: "other-tenant", tenant_id: "tenant-2", billing_entries: { "1": 9000 } }),
      share({ share_id: "other-fund", fund_id: "fund-2", billing_entries: { "1": 8000 } }),
    ],
    [
      payment({ share_id: "in-scope", amount: 200 }),
      payment({ payment_id: "other-tenant-payment", tenant_id: "tenant-2", share_id: "other-tenant", amount: 7000 }),
      payment({ payment_id: "other-fund-payment", fund_id: "fund-2", share_id: "other-fund", amount: 6000 }),
    ],
    [
      adjustment({ amount: 100 }),
      adjustment({ entry_id: "other-tenant-adjustment", tenant_id: "tenant-2", amount: 7000 }),
      adjustment({ entry_id: "other-fund-adjustment", fund_id: "fund-2", amount: 6000 }),
    ],
  );

  assert.equal(result.numberOfShares, 1);
  assert.equal(result.fundTotalBilledAmount, 500);
  assert.equal(result.shares[0].shareNetPaymentReceived, 200);
  assert.equal(result.shares[0].totalPending, 300);
  assert.equal(result.otherAmount, 100);
});

test("rejects invalid commission entries rather than silently accepting malformed data", () => {
  const invalidFund = { ...fund, cycle_commissions: [1.5] };
  assert.throws(
    () => calculateCfcfFundFinancialSummary(invalidFund, [share()], [], []),
    /non-negative whole-rupee/,
  );
});

test("rejects totals that exceed JavaScript's safe integer range", () => {
  assert.throws(
    () => calculate(
      [share({ billing_entries: { "1": Number.MAX_SAFE_INTEGER, "2": 1 } })],
    ),
    /safe integer range/,
  );
});

test("preserves exact net payment totals when gross ledger sums exceed the safe range", () => {
  const result = calculate([share({ billing_entries: {} })], [
    payment({ amount: Number.MAX_SAFE_INTEGER }),
    payment({ payment_id: "payment-2", amount: 1 }),
    payment({ payment_id: "payment-3", entry_type: "debit", amount: 1 }),
  ]);
  assert.equal(result.shares[0].shareNetPaymentReceived, Number.MAX_SAFE_INTEGER);
  assert.equal(result.shares[0].totalAdvance, Number.MAX_SAFE_INTEGER);
});

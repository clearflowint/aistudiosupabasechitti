// CFCF PRODUCT: Deterministic tests for relational financial calculations; fixtures are in-memory only.
// SKELETON: Use Node's built-in test runner so no production dependency or live Supabase access is required.
// MIX: Validate independent bill, Cycle, payment, payout, and Fund-adjustment records.

import test from "node:test";
import assert from "node:assert/strict";
import { calculateCfcfFundFinancialSummary } from "./financial-calculations.ts";
import type {
  CfcfBillRow, CfcfCycleRow, CfcfFundRow, CfcfShareRow,
  CfcfPaymentRow, CfcfFundOtherEntryRow,
} from "../types/database.types.ts";

const fund: CfcfFundRow = {
  fund_id: "fund-1", product_id: "CFCF", tenant_id: "tenant-1", person_id: "owner-1",
  fund_name: "Test Fund", start_date: null, number_of_cycles: 10, number_of_shares: 999,
  current_cycle: 2, cycle_payout_amounts: [], cycle_commissions: [],
  fund_net_balance: 0, fund_total_billed_amount: 0, fund_total_pending_amount: 0,
  fund_total_advance: 0, fund_total_withdrawn: 0, fund_total_commissions: 0,
  other_amount: 0, status: "active", created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z",
};

function share(overrides: Partial<CfcfShareRow> = {}): CfcfShareRow {
  return {
    share_id: "share-1", product_id: "CFCF", tenant_id: "tenant-1", fund_id: "fund-1",
    person_id: "owner-1", contact_id: "contact-1", share_total_billed_amount: 1500,
    share_net_payment_received: 0, total_pending: 1500, total_advance: 0,
    payout_status: "undrawn", withdrawn_amount: 0, payout_cycle_number: null,
    status: "active", created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

const cycles: CfcfCycleRow[] = [
  { cycle_id: 1, product_id: "CFCF", tenant_id: "tenant-1", fund_id: "fund-1", cycle_number: 1,
    planned_payout_amount: 1000, commission_amount: 100, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z" },
  { cycle_id: 2, product_id: "CFCF", tenant_id: "tenant-1", fund_id: "fund-1", cycle_number: 2,
    planned_payout_amount: 1000, commission_amount: 50, created_at: "2026-01-02T00:00:00Z", updated_at: "2026-01-02T00:00:00Z" },
];

function bill(overrides: Partial<CfcfBillRow> = {}): CfcfBillRow {
  return {
    bill_id: 501, product_id: "CFCF", tenant_id: "tenant-1", fund_id: "fund-1",
    cycle_id: 1, share_id: "share-1", amount: 1000, bill_date: "2026-01-01",
    created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z", ...overrides,
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

const calculate = (
  shares: CfcfShareRow[],
  bills: CfcfBillRow[] = [bill(), bill({ bill_id: 502, cycle_id: 2, amount: 500, bill_date: "2026-02-01" })],
  payments: CfcfPaymentRow[] = [],
  adjustments: CfcfFundOtherEntryRow[] = [],
  cycleRows: CfcfCycleRow[] = cycles,
) => calculateCfcfFundFinancialSummary(fund, shares, bills, cycleRows, payments, adjustments);

test("derives pending from all Cycle bills less independent net shareholder payments", () => {
  const result = calculate([share()], undefined, [payment()]);
  assert.equal(result.shares[0].shareTotalBilledAmount, 1500);
  assert.equal(result.shares[0].shareNetPaymentReceived, 700);
  assert.equal(result.shares[0].totalPending, 800);
  assert.equal(result.shares[0].totalAdvance, 0);
  assert.equal(result.fundTotalBilledAmount, 1500);
  assert.equal(result.fundTotalPendingAmount, 800);
  assert.equal(result.numberOfShares, 1);
});

test("editing a bill changes billed/pending values without editing payment rows", () => {
  const result = calculate([share()], [bill({ amount: 400 })], [payment()]);
  assert.equal(result.shares[0].shareTotalBilledAmount, 900);
  assert.equal(result.shares[0].totalPending, 200);
  assert.equal(result.shares[0].totalAdvance, 0);
});

test("debit corrections reduce net shareholder payments independently of Cycle records", () => {
  const result = calculate([share()], [bill({ amount: 500 })], [
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
  ], [bill({ share_id: "drawn" }), bill({ bill_id: 502, share_id: "drawn", cycle_id: 2, amount: 500 })]);
  assert.equal(result.fundTotalWithdrawn, 250);
  assert.equal(result.shares.find((item) => item.shareId === "undrawn")?.withdrawnAmount, 0);
});

test("rejects unsupported stored payout statuses", () => {
  assert.throws(
    () => calculate([share({ payout_status: "pending" as CfcfShareRow["payout_status"] })]),
    /Unsupported payout status/,
  );
});

test("Fund net balance may be negative; commissions are read from Cycle rows and adjustments stay separate", () => {
  const result = calculate(
    [share({ payout_status: "drawn", withdrawn_amount: 500 })],
    [bill({ amount: 100 })],
    [],
    [adjustment({ amount: 200 }), adjustment({ entry_id: "adjustment-2", entry_type: "debit", amount: 350 })],
  );
  assert.equal(result.fundNetBalance, -650); // billed 100 - withdrawn 500 - pending 100 - commissions 150
  assert.equal(result.otherAmount, -150);
  assert.equal(result.fundTotalBilledAmount, 100);
  assert.equal(result.fundTotalWithdrawn, 500);
  assert.equal(result.fundTotalCommissions, 150);
});

test("rejects payment rows attributed to a Share outside the Fund", () => {
  assert.throws(() => calculate([share()], undefined, [payment({ share_id: "other-share" })]), /outside this Fund/);
});

test("rejects negative net payment totals instead of hiding excessive debits", () => {
  assert.throws(() => calculate([share()], undefined, [payment({ entry_type: "debit", amount: 800 })]), /net debits exceeding credits/);
});

test("rejects duplicate current bills for one Share in one Cycle", () => {
  assert.throws(() => calculate([share()], [bill(), bill({ bill_id: 502 })]), /Duplicate bill/);
});

test("zero amount remains an explicit bill record but contributes zero to total billed", () => {
  const result = calculate([share()], [bill({ amount: 0 })], []);
  assert.equal(result.fundTotalBilledAmount, 0);
  assert.equal(result.shares[0].totalPending, 0);
});

test("ignores Share, Bill, Payment, Cycle and adjustment rows outside selected tenant/Fund", () => {
  const result = calculate(
    [
      share({ share_id: "in-scope" }),
      share({ share_id: "other-tenant", tenant_id: "tenant-2" }),
      share({ share_id: "other-fund", fund_id: "fund-2" }),
    ],
    [
      bill({ share_id: "in-scope", amount: 500 }),
      bill({ bill_id: 502, share_id: "other-tenant", tenant_id: "tenant-2", amount: 9000 }),
      bill({ bill_id: 503, share_id: "other-fund", fund_id: "fund-2", amount: 8000 }),
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

test("rejects bills linked to cycles outside selected Fund", () => {
  assert.throws(() => calculate([share()], [bill({ cycle_id: 99 })]), /Cycle outside this Fund/);
});

test("rejects totals that exceed JavaScript's safe integer range", () => {
  assert.throws(
    () => calculate([share()], [bill({ amount: Number.MAX_SAFE_INTEGER }), bill({ bill_id: 502, cycle_id: 2, amount: 1 })]),
    /safe integer range/,
  );
});

test("preserves exact net payment totals when gross ledger sums exceed the safe range", () => {
  const result = calculate([share()], [], [
    payment({ amount: Number.MAX_SAFE_INTEGER }),
    payment({ payment_id: "payment-2", amount: 1 }),
    payment({ payment_id: "payment-3", entry_type: "debit", amount: 1 }),
  ]);
  assert.equal(result.shares[0].shareNetPaymentReceived, Number.MAX_SAFE_INTEGER);
  assert.equal(result.shares[0].totalAdvance, Number.MAX_SAFE_INTEGER);
});

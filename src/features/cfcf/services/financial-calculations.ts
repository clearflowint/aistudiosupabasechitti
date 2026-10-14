// CFCF PRODUCT: Pure financial calculations over normalized relational records.
// SKELETON: No Supabase, React, browser, or persistence dependencies; inputs are stored rows and outputs are derived summaries.
// MIX: Database RPCs remain the atomic write boundary; these functions support reconciliation and deterministic tests.

import type {
  CfcfBillRow,
  CfcfCycleRow,
  CfcfFundOtherEntryRow,
  CfcfFundRow,
  CfcfPaymentRow,
  CfcfShareRow,
} from "../types/database.types";

export interface CfcfShareFinancialSummary {
  shareId: string;
  shareTotalBilledAmount: number;
  shareNetPaymentReceived: number;
  totalPending: number;
  totalAdvance: number;
  payoutStatus: CfcfShareRow["payout_status"];
  withdrawnAmount: number;
}

export interface CfcfFundFinancialSummary {
  fundId: string;
  numberOfShares: number;
  fundTotalBilledAmount: number;
  fundTotalPendingAmount: number;
  fundTotalAdvance: number;
  fundTotalWithdrawn: number;
  fundTotalCommissions: number;
  otherAmount: number;
  fundNetBalance: number;
  shares: CfcfShareFinancialSummary[];
}

function wholeRupees(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(label + " must be a non-negative whole-rupee amount.");
  }
  return value;
}

function checkedTotal(values: number[], label: string): number {
  const total = values.reduce((sum, value) => sum + BigInt(value), 0n);
  if (total > BigInt(Number.MAX_SAFE_INTEGER) || total < BigInt(Number.MIN_SAFE_INTEGER)) {
    throw new Error(label + " exceeds JavaScript's safe integer range.");
  }
  return Number(total);
}

/**
 * Rebuilds summary fields from normalized bills, cycle values, payment ledger rows,
 * Share payout state, and Fund adjustment rows.
 *
 * Payments are never assigned to a Cycle or payout. They are an independent ledger.
 * Total bills and net payments are compared only to derive the overall Share pending/advance
 * balances; deleting a Cycle never deletes or edits payment rows.
 */
export function calculateCfcfFundFinancialSummary(
  fund: CfcfFundRow,
  shares: CfcfShareRow[],
  bills: CfcfBillRow[],
  cycles: CfcfCycleRow[],
  payments: CfcfPaymentRow[],
  otherEntries: CfcfFundOtherEntryRow[],
): CfcfFundFinancialSummary {
  const scopedShares = shares.filter((share) =>
    share.fund_id === fund.fund_id &&
    share.tenant_id === fund.tenant_id &&
    share.product_id === fund.product_id
  );
  const shareIds = new Set(scopedShares.map((share) => share.share_id));
  const cycleIds = new Set(cycles.filter((cycle) =>
    cycle.fund_id === fund.fund_id &&
    cycle.tenant_id === fund.tenant_id &&
    cycle.product_id === fund.product_id
  ).map((cycle) => cycle.cycle_id));

  const billsByShare = new Map<string, CfcfBillRow[]>();
  const uniqueBillKeys = new Set<string>();
  for (const bill of bills) {
    if (bill.fund_id !== fund.fund_id || bill.tenant_id !== fund.tenant_id || bill.product_id !== fund.product_id) continue;
    if (!shareIds.has(bill.share_id)) throw new Error("Bill " + bill.bill_id + " references a Share outside this Fund.");
    if (!cycleIds.has(bill.cycle_id)) throw new Error("Bill " + bill.bill_id + " references a Cycle outside this Fund.");
    const key = bill.cycle_id + ":" + bill.share_id;
    if (uniqueBillKeys.has(key)) throw new Error("Duplicate bill exists for Share " + bill.share_id + " in Cycle " + bill.cycle_id + ".");
    uniqueBillKeys.add(key);
    wholeRupees(bill.amount, "Bill " + bill.bill_id);
    const list = billsByShare.get(bill.share_id) ?? [];
    list.push(bill);
    billsByShare.set(bill.share_id, list);
  }

  const paymentsByShare = new Map<string, CfcfPaymentRow[]>();
  for (const payment of payments) {
    if (
      payment.fund_id !== fund.fund_id ||
      payment.tenant_id !== fund.tenant_id ||
      payment.product_id !== fund.product_id
    ) continue;
    if (!shareIds.has(payment.share_id)) {
      throw new Error("Payment " + payment.payment_id + " references a Share outside this Fund.");
    }
    const list = paymentsByShare.get(payment.share_id) ?? [];
    list.push(payment);
    paymentsByShare.set(payment.share_id, list);
  }

  const shareSummaries = scopedShares.map((share): CfcfShareFinancialSummary => {
    const shareBills = billsByShare.get(share.share_id) ?? [];
    const billed = checkedTotal(
      shareBills.map((bill) => wholeRupees(bill.amount, "Bill " + bill.bill_id)),
      "Share billed total",
    );
    const paymentRows = paymentsByShare.get(share.share_id) ?? [];
    const netPayments = checkedTotal(
      paymentRows.map((payment) => {
        const amount = wholeRupees(payment.amount, "Payment " + payment.payment_id);
        if (payment.entry_type === "credit") return amount;
        if (payment.entry_type === "debit") return -amount;
        throw new Error("Unsupported payment type in Payment " + payment.payment_id + ".");
      }),
      "Share net payment total",
    );
    if (netPayments < 0) throw new Error("Share " + share.share_id + " has net debits exceeding credits.");
    const pending = Math.max(billed - netPayments, 0);
    const advance = Math.max(netPayments - billed, 0);
    if (share.payout_status !== "drawn" && share.payout_status !== "undrawn") {
      throw new Error("Unsupported payout status for Share " + share.share_id + ".");
    }
    const withdrawn = share.payout_status === "drawn"
      ? wholeRupees(share.withdrawn_amount, "Withdrawn amount for Share " + share.share_id)
      : 0;
    return {
      shareId: share.share_id,
      shareTotalBilledAmount: billed,
      shareNetPaymentReceived: netPayments,
      totalPending: pending,
      totalAdvance: advance,
      payoutStatus: share.payout_status,
      withdrawnAmount: withdrawn,
    };
  });

  const billed = checkedTotal(shareSummaries.map((share) => share.shareTotalBilledAmount), "Fund billed total");
  const pending = checkedTotal(shareSummaries.map((share) => share.totalPending), "Fund pending total");
  const advance = checkedTotal(shareSummaries.map((share) => share.totalAdvance), "Fund advance total");
  const withdrawn = checkedTotal(shareSummaries.map((share) => share.withdrawnAmount), "Fund withdrawn total");
  const commissions = checkedTotal(
    cycles.filter((cycle) => cycle.fund_id === fund.fund_id && cycle.tenant_id === fund.tenant_id && cycle.product_id === fund.product_id)
      .map((cycle) => cycle.commission_amount === null ? 0 : wholeRupees(cycle.commission_amount, "Commission for Cycle " + cycle.cycle_number)),
    "Fund commission total",
  );

  const scopedOtherEntries = otherEntries.filter((entry) =>
    entry.fund_id === fund.fund_id &&
    entry.tenant_id === fund.tenant_id &&
    entry.product_id === fund.product_id
  );
  const otherAmount = checkedTotal(
    scopedOtherEntries.map((entry) => {
      const amount = wholeRupees(entry.amount, "Fund adjustment " + entry.entry_id);
      if (entry.entry_type === "credit") return amount;
      if (entry.entry_type === "debit") return -amount;
      throw new Error("Unsupported entry type in Fund adjustment " + entry.entry_id + ".");
    }),
    "Fund other amount",
  );

  const netBalance = billed - withdrawn - pending - commissions;
  if (!Number.isSafeInteger(netBalance)) throw new Error("Fund net balance exceeds JavaScript's safe integer range.");

  return {
    fundId: fund.fund_id,
    numberOfShares: scopedShares.length,
    fundTotalBilledAmount: billed,
    fundTotalPendingAmount: pending,
    fundTotalAdvance: advance,
    fundTotalWithdrawn: withdrawn,
    fundTotalCommissions: commissions,
    otherAmount,
    fundNetBalance: netBalance,
    shares: shareSummaries,
  };
}

// CFCF PRODUCT: Pure financial calculations for the existing CFCF schema.
// SKELETON: No Supabase, React, browser, or persistence dependencies; inputs are stored rows and outputs are derived summaries.
// MIX: RPCs remain the atomic write boundary; use these functions for preflight, reconciliation, and deterministic tests.

import type {
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
  let total = 0;
  for (const value of values) {
    total += value;
    // Check every intermediate sum: an unsafe total can later appear safe again
    // after subtracting a debit, but precision may already have been lost.
    if (!Number.isSafeInteger(total)) {
      throw new Error(label + " exceeds JavaScript's safe integer range.");
    }
  }
  return total;
}

function sumBillingEntries(entries: CfcfShareRow["billing_entries"], shareId: string): number {
  if (!entries || typeof entries !== "object" || Array.isArray(entries)) {
    throw new Error("Billing entries for Share " + shareId + " must be a JSON object.");
  }
  const amounts = Object.entries(entries).map(([cycleKey, value]) => {
    if (!/^\d+$/.test(cycleKey) || Number(cycleKey) < 1) {
      throw new Error("Invalid Cycle key in Share " + shareId + ": " + cycleKey);
    }
    return wholeRupees(value, "Billing for Share " + shareId + ", Cycle " + cycleKey);
  });
  return checkedTotal(amounts, "Share billed total");
}

function sumCycleCommissions(values: CfcfFundRow["cycle_commissions"]): number {
  if (!Array.isArray(values)) throw new Error("Cycle commissions must be an array.");
  return checkedTotal(
    values.map((value, index) => value === null ? 0 : wholeRupees(value, "Commission for Cycle " + (index + 1))),
    "Fund commission total",
  );
}

/**
 * Rebuilds all financial summary fields from authoritative billing/payment/payout/expense rows.
 *
 * Payments are signed by entry_type (credit - debit); stored net-payment fields are not
 * treated as the source of truth. Payouts are separate from payment transactions.
 * Fund other entries are tenant-level adjustments/expenses and never alter Share payment totals.
 */
export function calculateCfcfFundFinancialSummary(
  fund: CfcfFundRow,
  shares: CfcfShareRow[],
  payments: CfcfPaymentRow[],
  otherEntries: CfcfFundOtherEntryRow[],
): CfcfFundFinancialSummary {
  const scopedShares = shares.filter((share) =>
    share.fund_id === fund.fund_id &&
    share.tenant_id === fund.tenant_id &&
    share.product_id === fund.product_id
  );
  const shareIds = new Set(scopedShares.map((share) => share.share_id));

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
    const billed = sumBillingEntries(share.billing_entries, share.share_id);
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
    if (netPayments < 0) {
      throw new Error("Share " + share.share_id + " has net debits exceeding credits.");
    }
    const pending = Math.max(billed - netPayments, 0);
    const advance = Math.max(netPayments - billed, 0);
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
  const commissions = sumCycleCommissions(fund.cycle_commissions);

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

  // This balance is intentionally allowed to be positive or negative.
  const netBalance = billed - withdrawn - pending - commissions;
  if (!Number.isSafeInteger(netBalance)) {
    throw new Error("Fund net balance exceeds JavaScript's safe integer range.");
  }

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

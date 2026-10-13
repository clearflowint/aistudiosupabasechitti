// CFCF PRODUCT: CFCF workspace reads and fund mutations against the existing CFCF tables.
// MIX: Receives tenant/person identity from the universal authorized workspace; enforce RLS and parent ownership in the database.

import { supabase } from "../../../core/database/supabaseClient";
import { cfcfConfig } from "../config/cfcf.config";
import { calculateCfcfFundFinancialSummary } from "./financial-calculations";
import type {
  CfcfFundOtherEntryRow,
  CfcfFundRow,
  CfcfPaymentRow,
  CfcfShareRow,
} from "../types/database.types";

const MAX_CFCF_CYCLES = 100;

const FUND_FIELDS =
  "fund_id, product_id, tenant_id, person_id, fund_name, start_date, number_of_cycles, number_of_shares, current_cycle, cycle_payout_amounts, cycle_commissions, fund_net_balance, fund_total_billed_amount, fund_total_pending_amount, fund_total_advance, fund_total_withdrawn, fund_total_commissions, other_amount, status, created_at, updated_at";

const SHARE_FIELDS =
  "share_id, product_id, tenant_id, fund_id, person_id, contact_id, billing_entries, share_total_billed_amount, share_net_payment_received, total_pending, total_advance, payout_status, withdrawn_amount, payout_cycle_number, status, created_at, updated_at";

export async function listCfcfFunds(tenantId: string): Promise<CfcfFundRow[]> {
  const { data, error } = await supabase
    .from("cfcf_funds")
    .select(FUND_FIELDS)
    .eq("product_id", cfcfConfig.productId)
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });

  if (error) throw new Error("Unable to load funds: " + error.message);
  return (data ?? []) as CfcfFundRow[];
}

export interface CreateCfcfFundInput {
  fundName: string;
  startDate?: string;
  numberOfCycles?: number | null;
  numberOfShares?: number | null;
}

export async function createCfcfFund(
  tenantId: string,
  personId: string,
  input: CreateCfcfFundInput,
): Promise<CfcfFundRow> {
  const fundName = input.fundName.trim();
  if (!fundName) throw new Error("Enter a fund name.");

  for (const [label, value] of [
    ["Cycle count", input.numberOfCycles],
    ["Share count", input.numberOfShares],
  ] as const) {
    if (value !== null && value !== undefined
      && (!Number.isSafeInteger(value) || value < 1 || value > 2147483647)) {
      throw new Error(label + " must be a positive whole number.");
    }
  }

  const { data, error } = await supabase
    .from("cfcf_funds")
    .insert({
      // CFCF PRODUCT: Required IDs come from the authorized workspace or a generated record ID.
      fund_id: crypto.randomUUID().replace(/-/g, "").toUpperCase(),
      product_id: cfcfConfig.productId,
      tenant_id: tenantId,
      person_id: personId,
      fund_name: fundName,
      start_date: input.startDate || null,
      number_of_cycles: input.numberOfCycles ?? null,
      // The database trigger maintains this count from actual Share rows.
      number_of_shares: 0,
    })
    .select(FUND_FIELDS)
    .single();

  if (error) throw new Error("Unable to create fund: " + error.message);
  return data as CfcfFundRow;
}

export async function listCfcfShares(
  tenantId: string,
  fundId: string,
): Promise<CfcfShareRow[]> {
  const { data, error } = await supabase
    .from("cfcf_shares")
    .select(SHARE_FIELDS)
    .eq("product_id", cfcfConfig.productId)
    .eq("tenant_id", tenantId)
    .eq("fund_id", fundId)
    .order("created_at", { ascending: false });

  if (error) throw new Error("Unable to load shares: " + error.message);
  return (data ?? []) as CfcfShareRow[];
}

export interface CfcfLedgerItem {
  id: string;
  kind: "payment" | "fund-entry";
  fundId: string;
  shareId: string | null;
  entryType: "credit" | "debit";
  amount: number;
  date: string;
  paymentType: string | null;
  remarks: string | null;
}

export async function listCfcfLedgerItems(
  tenantId: string,
  fundId: string,
): Promise<CfcfLedgerItem[]> {
  const [paymentsResult, fundEntriesResult] = await Promise.all([
    supabase
      .from("cfcf_payments")
      .select("payment_id, fund_id, share_id, entry_type, amount, entry_date, payment_type, remarks, created_at")
      .eq("product_id", cfcfConfig.productId)
      .eq("tenant_id", tenantId)
      .eq("fund_id", fundId),
    supabase
      .from("cfcf_fund_other_entries")
      .select("entry_id, fund_id, entry_type, amount, remarks, created_at")
      .eq("product_id", cfcfConfig.productId)
      .eq("tenant_id", tenantId)
      .eq("fund_id", fundId),
  ]);

  if (paymentsResult.error) {
    throw new Error("Unable to load payment ledger: " + paymentsResult.error.message);
  }
  if (fundEntriesResult.error) {
    throw new Error("Unable to load fund entries: " + fundEntriesResult.error.message);
  }

  const payments = (paymentsResult.data ?? []) as Array<
    Pick<
      CfcfPaymentRow,
      "payment_id" | "fund_id" | "share_id" | "entry_type" | "amount" | "entry_date" | "payment_type" | "remarks" | "created_at"
    >
  >;

  const fundEntries = (fundEntriesResult.data ?? []) as Pick<
    CfcfFundOtherEntryRow, "entry_id" | "fund_id" | "entry_type" | "amount" | "remarks" | "created_at"
  >[];

  const items: CfcfLedgerItem[] = [
    ...payments.map((row) => ({
      id: row.payment_id,
      kind: "payment" as const,
      fundId: row.fund_id,
      shareId: row.share_id,
      entryType: row.entry_type,
      amount: row.amount,
      date: row.entry_date,
      paymentType: row.payment_type,
      remarks: row.remarks,
    })),
    ...fundEntries.map((row) => ({
      id: row.entry_id,
      kind: "fund-entry" as const,
      fundId: row.fund_id,
      shareId: null,
      entryType: row.entry_type,
      amount: row.amount,
      date: row.created_at.slice(0, 10),
      paymentType: null,
      remarks: row.remarks,
    })),
  ];

  return items.sort((a, b) => b.date.localeCompare(a.date));
}



/** CFCF PRODUCT: Deletion is intentionally limited to records with no financial history. */
export async function deleteCfcfShareIfEmpty(tenantId: string, fundId: string, shareId: string): Promise<void> {
  const { error } = await supabase.rpc("cfcf_delete_share_if_empty", {
    p_tenant_id: tenantId, p_fund_id: fundId, p_share_id: shareId,
  });
  if (error) throw new Error("Unable to delete Share: " + error.message);
}

export async function deleteCfcfFundIfEmpty(tenantId: string, fundId: string): Promise<void> {
  const { error } = await supabase.rpc("cfcf_delete_fund_if_empty", {
    p_tenant_id: tenantId, p_fund_id: fundId,
  });
  if (error) throw new Error("Unable to delete Fund: " + error.message);
}

// CFCF PRODUCT: Manual per-Share cycle billing is persisted through one database transaction.
// MIX: Tenant identity comes from the authorized workspace; database function rechecks owner access and Fund/Share relationships.
export async function recordCfcfCycleBilling(
  tenantId: string,
  fundId: string,
  shareId: string,
  cycleNumber: number,
  amount: number,
): Promise<void> {
  if (!Number.isSafeInteger(cycleNumber) || cycleNumber < 1 || cycleNumber > MAX_CFCF_CYCLES) {
    throw new Error("Cycle number must be between 1 and 100.");
  }
  if (!Number.isSafeInteger(amount) || amount < 0 || amount > 2147483647) {
    throw new Error("Billing amount must be a whole rupee amount of zero or more.");
  }

  const { error } = await supabase.rpc("cfcf_record_cycle_billing", {
    p_tenant_id: tenantId,
    p_fund_id: fundId,
    p_share_id: shareId,
    p_cycle_number: cycleNumber,
    p_amount: amount,
  });

  if (error) {
    if (error.code === "42501") throw new Error("Supabase denied this billing change. Confirm you have active owner access.");
    throw new Error("Unable to save cycle billing: " + error.message);
  }
}


// CFCF PRODUCT: Payout status is Share data, not a payment transaction.
// MIX: Database rechecks owner access and Share/Fund tenant ownership.
export async function setCfcfSharePayout(
  tenantId: string,
  fundId: string,
  shareId: string,
  payoutStatus: "drawn" | "undrawn",
  payoutCycleNumber: number | null,
  withdrawnAmount: number,
): Promise<void> {
  if (payoutStatus === "drawn" && (
    !Number.isSafeInteger(payoutCycleNumber) ||
    (payoutCycleNumber ?? 0) < 1 ||
    (payoutCycleNumber ?? 0) > MAX_CFCF_CYCLES
  )) {
    throw new Error("Payout Cycle must be between 1 and 100.");
  }
  if (!Number.isSafeInteger(withdrawnAmount) || withdrawnAmount < 0 || withdrawnAmount > 2147483647) {
    throw new Error("Withdrawn amount must be a whole rupee amount of zero or more.");
  }
  const { error } = await supabase.rpc("cfcf_set_share_payout", {
    p_tenant_id: tenantId,
    p_fund_id: fundId,
    p_share_id: shareId,
    p_payout_status: payoutStatus,
    p_payout_cycle_number: payoutCycleNumber,
    p_withdrawn_amount: withdrawnAmount,
  });
  if (error) {
    if (error.code === "42501") throw new Error("Supabase denied this payout change. Confirm you have active owner access.");
    throw new Error("Unable to update Share payout: " + error.message);
  }
}


// CFCF PRODUCT: Cycle payout and commission are manager-entered stored values, not calculated transactions.
export async function saveCfcfCycleValues(
  tenantId: string,
  fundId: string,
  cycleNumber: number,
  payoutAmount: number | null,
  commissionAmount: number | null,
): Promise<void> {
  if (!Number.isSafeInteger(cycleNumber) || cycleNumber < 1 || cycleNumber > MAX_CFCF_CYCLES) {
    throw new Error("Cycle number must be between 1 and 100.");
  }
  for (const [label, value] of [["Payout amount", payoutAmount], ["Commission", commissionAmount]] as const) {
    if (value !== null && (!Number.isSafeInteger(value) || value < 0 || value > 2147483647)) {
      throw new Error(label + " must be a whole rupee amount or left blank.");
    }
  }

  // MIX: One explicit RPC owns the atomic update of Cycle values and all Fund summary columns.
  const { error } = await supabase.rpc("cfcf_save_cycle_values", {
    p_tenant_id: tenantId,
    p_fund_id: fundId,
    p_cycle_number: cycleNumber,
    p_payout_amount: payoutAmount,
    p_commission_amount: commissionAmount,
  });
  if (error) {
    if (error.code === "42501") throw new Error("Supabase denied this Cycle change. Confirm you have active owner access.");
    throw new Error("Unable to save Cycle values: " + error.message);
  }
}

// CFCF PRODUCT: Planned cycle count remains editable descriptive setup data, not a limit.
export async function updateCfcfPlannedCycleCount(tenantId: string, fundId: string, count: number | null): Promise<void> {
  if (count !== null && (!Number.isSafeInteger(count) || count < 0 || count > MAX_CFCF_CYCLES)) {
    throw new Error("Planned Cycle count must be between 0 and 100.");
  }
  const { error } = await supabase.from("cfcf_funds").update({ number_of_cycles: count, updated_at: new Date().toISOString() })
    .eq("product_id", cfcfConfig.productId).eq("tenant_id", tenantId).eq("fund_id", fundId);
  if (error) throw new Error("Unable to update planned Cycle count: " + error.message);
}


// CFCF PRODUCT: Share creation is an explicit atomic database operation; Share count is updated in the same transaction.
export async function createCfcfShare(tenantId: string, fundId: string, personId: string, contactId: string): Promise<void> {
  if (!fundId || !personId || !contactId) throw new Error("Choose a Fund and Contact.");
  const { error } = await supabase.rpc("cfcf_create_share", {
    p_tenant_id: tenantId, p_fund_id: fundId,
    p_share_id: crypto.randomUUID().replace(/-/g, "").toUpperCase(),
    p_person_id: personId, p_contact_id: contactId,
  });
  if (error) {
    if (error.code === "42501") throw new Error("You do not have owner access to add a Share.");
    if (error.code === "23505") throw new Error("This Share ID already exists. Try again.");
    throw new Error("Unable to add Share: " + error.message);
  }
}

export async function recordCfcfSharePayment(
  tenantId: string, fundId: string, shareId: string, personId: string,
  entryType: "credit" | "debit", amount: number, entryDate: string,
  paymentType: "UPI" | "Cash" | "Other", remarks: string,
): Promise<void> {
  if (!Number.isSafeInteger(amount) || amount <= 0 || amount > 2147483647) throw new Error("Enter a positive whole-rupee amount.");
  if (!["UPI", "Cash", "Other"].includes(paymentType)) throw new Error("Choose a valid payment mode.");
  const { error } = await supabase.rpc("cfcf_record_share_payment", {
    p_tenant_id: tenantId, p_fund_id: fundId, p_share_id: shareId, p_person_id: personId,
    p_entry_type: entryType, p_amount: amount, p_entry_date: entryDate || null,
    p_payment_type: paymentType, p_remarks: remarks.trim() || null,
  });
  if (error) {
    if (error.code === "42501") throw new Error("You do not have owner access to record this transaction.");
    throw new Error("Unable to record payment/correction: " + error.message);
  }
}


// CFCF PRODUCT: Read-only reconciliation for validating stored summaries before functional testing.
// SKELETON: Reports differences; never mutates financial history or database rows.
export interface CfcfFinancialReconciliation {
  fundId: string;
  expected: ReturnType<typeof calculateCfcfFundFinancialSummary>;
  mismatches: Array<{ recordType: "fund" | "share"; recordId: string; field: string; stored: number; expected: number }>;
}

export async function inspectCfcfFundFinancialSummary(
  tenantId: string,
  fundId: string,
): Promise<CfcfFinancialReconciliation> {
  const [fundResult, sharesResult, paymentsResult, otherEntriesResult] = await Promise.all([
    supabase.from("cfcf_funds").select("*")
      .eq("product_id", cfcfConfig.productId).eq("tenant_id", tenantId).eq("fund_id", fundId).single(),
    supabase.from("cfcf_shares").select("*")
      .eq("product_id", cfcfConfig.productId).eq("tenant_id", tenantId).eq("fund_id", fundId),
    supabase.from("cfcf_payments").select("*")
      .eq("product_id", cfcfConfig.productId).eq("tenant_id", tenantId).eq("fund_id", fundId),
    supabase.from("cfcf_fund_other_entries").select("*")
      .eq("product_id", cfcfConfig.productId).eq("tenant_id", tenantId).eq("fund_id", fundId),
  ]);
  if (fundResult.error || !fundResult.data) {
    throw new Error("Unable to load Fund for financial reconciliation: " + (fundResult.error?.message ?? "Fund not found."));
  }
  if (sharesResult.error) throw new Error("Unable to load Shares for financial reconciliation: " + sharesResult.error.message);
  if (paymentsResult.error) throw new Error("Unable to load Payments for financial reconciliation: " + paymentsResult.error.message);
  if (otherEntriesResult.error) throw new Error("Unable to load Fund adjustments for financial reconciliation: " + otherEntriesResult.error.message);

  const fund = fundResult.data as CfcfFundRow;
  const shares = (sharesResult.data ?? []) as CfcfShareRow[];
  const payments = (paymentsResult.data ?? []) as CfcfPaymentRow[];
  const otherEntries = (otherEntriesResult.data ?? []) as CfcfFundOtherEntryRow[];
  const expected = calculateCfcfFundFinancialSummary(fund, shares, payments, otherEntries);
  const mismatches: CfcfFinancialReconciliation["mismatches"] = [];
  const compare = (
    recordType: "fund" | "share",
    recordId: string,
    field: string,
    stored: number | null,
    calculated: number,
  ) => {
    if (stored !== calculated) {
      mismatches.push({ recordType, recordId, field, stored: stored ?? 0, expected: calculated });
    }
  };

  compare("fund", fund.fund_id, "number_of_shares", fund.number_of_shares, expected.numberOfShares);
  compare("fund", fund.fund_id, "fund_total_billed_amount", fund.fund_total_billed_amount, expected.fundTotalBilledAmount);
  compare("fund", fund.fund_id, "fund_total_pending_amount", fund.fund_total_pending_amount, expected.fundTotalPendingAmount);
  compare("fund", fund.fund_id, "fund_total_advance", fund.fund_total_advance, expected.fundTotalAdvance);
  compare("fund", fund.fund_id, "fund_total_withdrawn", fund.fund_total_withdrawn, expected.fundTotalWithdrawn);
  compare("fund", fund.fund_id, "fund_total_commissions", fund.fund_total_commissions, expected.fundTotalCommissions);
  compare("fund", fund.fund_id, "other_amount", fund.other_amount, expected.otherAmount);
  compare("fund", fund.fund_id, "fund_net_balance", fund.fund_net_balance, expected.fundNetBalance);

  for (const expectedShare of expected.shares) {
    const stored = shares.find((share) => share.share_id === expectedShare.shareId);
    if (!stored) continue;
    compare("share", stored.share_id, "share_total_billed_amount", stored.share_total_billed_amount, expectedShare.shareTotalBilledAmount);
    compare("share", stored.share_id, "share_net_payment_received", stored.share_net_payment_received, expectedShare.shareNetPaymentReceived);
    compare("share", stored.share_id, "total_pending", stored.total_pending, expectedShare.totalPending);
    compare("share", stored.share_id, "total_advance", stored.total_advance, expectedShare.totalAdvance);
    compare("share", stored.share_id, "withdrawn_amount", stored.withdrawn_amount, expectedShare.withdrawnAmount);
  }

  return { fundId, expected, mismatches };
}

// CFCF PRODUCT: Fund-level credits/debits are separate from Share Payment records.
export async function recordCfcfFundOtherEntry(
  tenantId: string,
  fundId: string,
  personId: string,
  entryType: "credit" | "debit",
  amount: number,
  remarks: string,
): Promise<void> {
  if (!Number.isSafeInteger(amount) || amount <= 0 || amount > 2147483647) {
    throw new Error("Enter a positive whole-rupee amount.");
  }
  const { error } = await supabase.rpc("cfcf_record_fund_other_entry", {
    p_tenant_id: tenantId,
    p_fund_id: fundId,
    p_person_id: personId,
    p_entry_type: entryType,
    p_amount: amount,
    p_remarks: remarks.trim() || null,
  });
  if (error) {
    if (error.code === "42501") throw new Error("You do not have owner access to record this Fund entry.");
    throw new Error("Unable to record Fund adjustment: " + error.message);
  }
}


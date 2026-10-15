// CFCF PRODUCT: CFCF workspace reads and fund mutations against the existing CFCF tables.
// MIX: Receives tenant/person identity from the universal authorized workspace; enforce RLS and parent ownership in the database.

import { supabase } from "../../../core/database/supabaseClient";
import { cfcfConfig } from "../config/cfcf.config";
import { calculateCfcfFundFinancialSummary } from "./financial-calculations";
import type {
  CfcfActivityLogRow,
  CfcfBillRow,
  CfcfCycleRow as CfcfCycleRowType,
  CfcfFundOtherEntryRow,
  CfcfFundRow,
  CfcfPaymentRow,
  CfcfShareRow,
} from "../types/database.types";

const MAX_CFCF_CYCLES = 100;
export type CfcfCycleRow = CfcfCycleRowType;


export interface CfcfArchivedFundRow {
  archive_id: string;
  product_id: "CFCF";
  tenant_id: string;
  fund_id: string;
  fund_name: string;
  archived_at: string;
  expires_at: string;
  report_html: string;
}

export async function listCfcfArchivedFunds(tenantId: string): Promise<CfcfArchivedFundRow[]> {
  const { data, error } = await supabase.from("cfcf_archived_funds")
    .select("archive_id, product_id, tenant_id, fund_id, fund_name, archived_at, expires_at, report_html")
    .eq("product_id", cfcfConfig.productId)
    .eq("tenant_id", tenantId)
    .gt("expires_at", new Date().toISOString())
    .order("archived_at", { ascending: false });
  if (error) throw new Error("Unable to load Archived Funds: " + error.message);
  return (data ?? []) as CfcfArchivedFundRow[];
}

export async function archiveCfcfFundWithReport(tenantId: string, fundId: string, reportHtml: string): Promise<CfcfArchivedFundRow> {
  const { data, error } = await supabase.rpc("cfcf_archive_fund_with_report", {
    p_tenant_id: tenantId,
    p_fund_id: fundId,
    p_report_html: reportHtml,
  });
  if (error) throw new Error("Unable to archive Fund: " + error.message);
  return data as CfcfArchivedFundRow;
}

export async function deleteCfcfArchivedFund(tenantId: string, archiveId: string): Promise<void> {
  const { error } = await supabase.rpc("cfcf_delete_archived_fund", {
    p_tenant_id: tenantId,
    p_archive_id: archiveId,
  });
  if (error) throw new Error("Unable to delete archived Fund: " + error.message);
}

export async function listCfcfCycles(tenantId: string, fundId: string): Promise<CfcfCycleRow[]> {
  const { data, error } = await supabase.from("cfcf_cycles")
    .select("cycle_id, product_id, tenant_id, fund_id, cycle_number, planned_payout_amount, commission_amount, created_at, updated_at")
    .eq("product_id", cfcfConfig.productId).eq("tenant_id", tenantId).eq("fund_id", fundId)
    .order("cycle_number", { ascending: true });
  if (error) throw new Error("Unable to load Cycles: " + error.message);
  return (data ?? []) as CfcfCycleRow[];
}

export interface CfcfCycleSummary {
  cycle_number: number;
  total_billed: number;
  billed_shares: number;
  not_billed_shares: number;
  planned_payout_amount: number | null;
  commission_amount: number | null;
  total_paid_out: number;
  withdrawn_shares: Array<{ share_id: string; contact_id: string; contact_name: string | null; withdrawn_amount: number }>;
}

export async function getCfcfCycleSummary(tenantId: string, fundId: string, cycleNumber: number): Promise<CfcfCycleSummary> {
  const { data, error } = await supabase.rpc("cfcf_get_cycle_summary", { p_tenant_id: tenantId, p_fund_id: fundId, p_cycle_number: cycleNumber });
  if (error) throw new Error("Unable to load Cycle statement: " + error.message);
  return data as CfcfCycleSummary;
}

export async function addCfcfCycle(tenantId: string, fundId: string): Promise<CfcfCycleRow> {
  const { data, error } = await supabase.rpc("cfcf_add_cycle", { p_tenant_id: tenantId, p_fund_id: fundId });
  if (error) throw new Error("Unable to add Cycle: " + error.message);
  return data as CfcfCycleRow;
}

export async function setCfcfCyclePlannedPayout(tenantId: string, fundId: string, cycleNumber: number, amount: number): Promise<CfcfCycleRow> {
  if (!Number.isSafeInteger(amount) || amount < 0) throw new Error("Enter a whole-rupee payout amount of zero or more.");
  const { data, error } = await supabase.rpc("cfcf_set_cycle_planned_payout", { p_tenant_id: tenantId, p_fund_id: fundId, p_cycle_number: cycleNumber, p_amount: amount });
  if (error) throw new Error("Unable to save planned payout: " + error.message);
  return data as CfcfCycleRow;
}

export async function deleteHighestCfcfCycle(tenantId: string, fundId: string, cycleNumber: number): Promise<void> {
  const { error } = await supabase.rpc("cfcf_delete_highest_cycle", { p_tenant_id: tenantId, p_fund_id: fundId, p_cycle_number: cycleNumber });
  if (error) throw new Error("Unable to delete Cycle: " + error.message);
}


function localDateFromTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 10);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return year + "-" + month + "-" + day;
}

const FUND_FIELDS =
  "fund_id, product_id, tenant_id, person_id, fund_name, start_date, number_of_cycles, number_of_shares, current_cycle, cycle_payout_amounts, cycle_commissions, fund_net_balance, fund_total_billed_amount, fund_total_pending_amount, fund_total_advance, fund_total_withdrawn, fund_total_commissions, other_amount, status, created_at, updated_at";

const SHARE_FIELDS =
  "share_id, product_id, tenant_id, fund_id, person_id, contact_id, share_total_billed_amount, share_net_payment_received, total_pending, total_advance, payout_status, withdrawn_amount, payout_cycle_number, status, created_at, updated_at";

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

  if (input.numberOfCycles !== null && input.numberOfCycles !== undefined
    && (!Number.isSafeInteger(input.numberOfCycles) || input.numberOfCycles < 1 || input.numberOfCycles > MAX_CFCF_CYCLES)) {
    throw new Error("Cycle count must be a whole number from 1 to 100.");
  }
  // CFCF PRODUCT: Share count is derived from saved Share rows; callers cannot set it manually.

  const { data, error } = await supabase
    .from("cfcf_funds")
    .insert({
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

export async function listCfcfBills(tenantId: string, fundId: string): Promise<CfcfBillRow[]> {
  const { data, error } = await supabase.from("cfcf_bills")
    .select("bill_id, product_id, tenant_id, fund_id, cycle_id, share_id, amount, bill_date, created_at, updated_at")
    .eq("product_id", cfcfConfig.productId).eq("tenant_id", tenantId).eq("fund_id", fundId)
    .order("created_at", { ascending: false });
  if (error) throw new Error("Unable to load bills: " + error.message);
  return (data ?? []) as CfcfBillRow[];
}

export async function listCfcfActivityLog(tenantId: string): Promise<CfcfActivityLogRow[]> {
  const { data, error } = await supabase.from("cfcf_activity_log")
    .select("action_id, product_id, tenant_id, actor_person_id, action_type, entity_type, entity_id, description, before_data, after_data, created_at")
    .eq("product_id", cfcfConfig.productId).eq("tenant_id", tenantId)
    .order("created_at", { ascending: false }).order("action_id", { ascending: false }).limit(500);
  if (error) throw new Error("Unable to load manager activity: " + error.message);
  return (data ?? []) as CfcfActivityLogRow[];
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
  adjustmentCategory: string | null;
}

export interface CfcfFundOtherAdjustmentSummary {
  entry_count: number;
  total_credits: number;
  total_debits: number;
  net_adjustments: number;
}

export async function getCfcfFundOtherAdjustmentSummary(
  tenantId: string,
  fundId: string,
): Promise<CfcfFundOtherAdjustmentSummary> {
  const { data, error } = await supabase.rpc("cfcf_get_fund_other_adjustment_summary", {
    p_tenant_id: tenantId,
    p_fund_id: fundId,
  });
  if (error) throw new Error("Unable to load Other Adjustments summary: " + error.message);
  const result = data as CfcfFundOtherAdjustmentSummary | null;
  if (!result) throw new Error("Other Adjustments summary was not returned.");
  return result;
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
      .select("entry_id, fund_id, entry_type, amount, remarks, adjustment_category, created_at")
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
    CfcfFundOtherEntryRow, "entry_id" | "fund_id" | "entry_type" | "amount" | "remarks" | "adjustment_category" | "created_at"
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
      adjustmentCategory: null,
    })),
    ...fundEntries.map((row) => ({
      id: row.entry_id,
      kind: "fund-entry" as const,
      fundId: row.fund_id,
      shareId: null,
      entryType: row.entry_type,
      amount: row.amount,
      date: localDateFromTimestamp(row.created_at),
      paymentType: null,
      remarks: row.remarks,
      adjustmentCategory: row.adjustment_category ?? null,
    })),
  ];

  return items.sort((a, b) => b.date.localeCompare(a.date));
}



/** CFCF PRODUCT: Explicitly confirmed atomic deletion of one Share and its own bill/payment rows. */
export interface CfcfShareDeletionResult {
  share_id: string;
  deleted_payments: number;
  deleted_bills: number;
}
export async function deleteCfcfShareWithHistory(tenantId: string, fundId: string, shareId: string): Promise<CfcfShareDeletionResult> {
  const { data, error } = await supabase.rpc("cfcf_delete_share_with_history", {
    p_tenant_id: tenantId, p_fund_id: fundId, p_share_id: shareId,
  });
  if (error) throw new Error("Unable to delete Share and its history: " + error.message);
  return data as CfcfShareDeletionResult;
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

  // Individual Share-card billing deliberately uses the same atomic Cycle RPC
  // as bulk billing. Read the saved Cycle and all of its bills, replace only
  // the selected Share's amount, and send the complete Cycle bill set so no
  // other Share's bill can be deleted by the bulk-save semantics.
  const [cycles, bills, shares] = await Promise.all([
    listCfcfCycles(tenantId, fundId),
    listCfcfBills(tenantId, fundId),
    listCfcfShares(tenantId, fundId),
  ]);
  const cycle = cycles.find((row) => row.cycle_number === cycleNumber);
  if (!cycle) throw new Error("Cycle not found. Add the Cycle first.");
  if (!shares.some((share) => share.share_id === shareId && share.status === "active")) {
    throw new Error("This Share is not active in the selected Fund.");
  }

  // The RPC requires a bill row for every active Share. Preserve every other
  // Share's saved amount and use zero for a legacy Cycle that predates default bills.
  const existingByShare = new Map(
    bills.filter((bill) => bill.cycle_id === cycle.cycle_id).map((bill) => [bill.share_id, bill.amount]),
  );
  const cycleBills = shares
    .filter((share) => share.status === "active")
    .map((share) => ({
      share_id: share.share_id,
      amount: share.share_id === shareId ? amount : (existingByShare.get(share.share_id) ?? 0),
    }));

  await saveCfcfCycleWorkspace(
    tenantId,
    fundId,
    cycleNumber,
    cycle.planned_payout_amount,
    cycle.commission_amount,
    cycleBills,
  );
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

// CFCF PRODUCT: Bulk-edit all current bills plus Cycle-owned planned values in one database transaction.
export async function saveCfcfCycleWorkspace(
  tenantId: string,
  fundId: string,
  cycleNumber: number,
  plannedPayoutAmount: number | null,
  commissionAmount: number | null,
  bills: Array<{ share_id: string; amount: number }>,
): Promise<void> {
  if (!Number.isSafeInteger(cycleNumber) || cycleNumber < 1 || cycleNumber > MAX_CFCF_CYCLES) {
    throw new Error("Cycle number must be a positive whole number.");
  }
  for (const [label, value] of [["Planned payout", plannedPayoutAmount], ["Commission", commissionAmount]] as const) {
    if (value !== null && (!Number.isSafeInteger(value) || value < 0 || value > 2147483647)) {
      throw new Error(label + " must be a whole-rupee amount or left blank.");
    }
  }
  const seen = new Set<string>();
  for (const bill of bills) {
    if (!bill.share_id || seen.has(bill.share_id)) throw new Error("Each Share can have only one bill in a Cycle.");
    seen.add(bill.share_id);
    if (!Number.isSafeInteger(bill.amount) || bill.amount < 0 || bill.amount > 2147483647) {
      throw new Error("Every bill must be a nonnegative whole-rupee amount.");
    }
  }
  const { error } = await supabase.rpc("cfcf_save_cycle_workspace", {
    p_tenant_id: tenantId,
    p_fund_id: fundId,
    p_cycle_number: cycleNumber,
    p_planned_payout_amount: plannedPayoutAmount,
    p_commission_amount: commissionAmount,
    p_bills: bills,
  });
  if (error) {
    if (error.code === "42501") throw new Error("Supabase denied this Cycle change. Confirm you have active owner access.");
    throw new Error("Unable to save Cycle workspace: " + error.message);
  }
}

// CFCF PRODUCT: Edit descriptive Fund setup fields only; never touch stored financial fields.
export async function updateCfcfFundDetails(tenantId: string, fundId: string, input: { fundName: string; startDate: string | null; numberOfCycles: number | null }): Promise<void> {
  const fundName = input.fundName.trim();
  if (!fundName) throw new Error("Fund name is required.");
  if (input.numberOfCycles !== null && (!Number.isSafeInteger(input.numberOfCycles) || input.numberOfCycles < 0 || input.numberOfCycles > MAX_CFCF_CYCLES)) throw new Error("Planned Cycle count must be between 0 and 100.");
  const { data, error } = await supabase.from("cfcf_funds").update({ fund_name: fundName, start_date: input.startDate || null, number_of_cycles: input.numberOfCycles, updated_at: new Date().toISOString() }).eq("product_id", cfcfConfig.productId).eq("tenant_id", tenantId).eq("fund_id", fundId).select("fund_id").maybeSingle();
  if (error) throw new Error("Unable to update Fund details: " + error.message);
  if (!data) throw new Error("Fund not found or you do not have owner access.");
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
    p_share_id: "", // Legacy RPC parameter; database now generates the actual Share ID.
    p_person_id: personId, p_contact_id: contactId,
  });
  if (error) {
    if (error.code === "42501") throw new Error("You do not have owner access to add a Share.");
    if (error.code === "23505") throw new Error("This Share ID already exists. Try again.");
    throw new Error("Unable to add Share: " + error.message);
  }
}

export interface CfcfPaymentWriteResult {
  payment_id: string;
  share_id: string;
  duplicate: boolean;
}

export async function recordCfcfSharePayment(
  tenantId: string, fundId: string, shareId: string, personId: string,
  entryType: "credit" | "debit", amount: number, entryDate: string,
  paymentType: "UPI" | "Cash" | "Other", remarks: string, requestId: string,
): Promise<CfcfPaymentWriteResult> {
  if (!Number.isSafeInteger(amount) || amount <= 0 || amount > 2147483647) throw new Error("Enter a positive whole-rupee amount.");
  if (!["UPI", "Cash", "Other"].includes(paymentType)) throw new Error("Choose a valid payment mode.");
  if (!requestId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId)) {
    throw new Error("A valid payment request id is required. Reopen the payment form and try again.");
  }
  const { data, error } = await supabase.rpc("cfcf_record_share_payment", {
    p_tenant_id: tenantId, p_fund_id: fundId, p_share_id: shareId, p_person_id: personId,
    p_entry_type: entryType, p_amount: amount, p_entry_date: entryDate || null,
    p_payment_type: paymentType, p_remarks: remarks.trim() || null, p_request_id: requestId,
  });
  if (error) {
    if (error.code === "42501") throw new Error("Supabase rejected this payment because active owner access is required. No payment was saved.");
    if (error.code) throw new Error("Supabase rejected the payment and rolled back the request. No payment was saved: " + error.message);
    throw new Error("The Supabase response was interrupted, so the final save status is unknown. Do not start a new entry; retry the same confirmation to safely check whether it was saved. Details: " + error.message);
  }
  const result = data as Partial<CfcfPaymentWriteResult> | null;
  if (!result?.payment_id || result.share_id !== shareId || typeof result.duplicate !== "boolean") {
    throw new Error("Supabase returned an incomplete payment acknowledgement. Retry this same confirmation to safely check the saved entry.");
  }
  return { payment_id: result.payment_id, share_id: result.share_id, duplicate: result.duplicate };
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
  const [fundResult, sharesResult, billsResult, cyclesResult, paymentsResult, otherEntriesResult] = await Promise.all([
    supabase.from("cfcf_funds").select("*")
      .eq("product_id", cfcfConfig.productId).eq("tenant_id", tenantId).eq("fund_id", fundId).single(),
    supabase.from("cfcf_shares").select(SHARE_FIELDS)
      .eq("product_id", cfcfConfig.productId).eq("tenant_id", tenantId).eq("fund_id", fundId),
    supabase.from("cfcf_bills").select("*")
      .eq("product_id", cfcfConfig.productId).eq("tenant_id", tenantId).eq("fund_id", fundId),
    supabase.from("cfcf_cycles").select("cycle_id, product_id, tenant_id, fund_id, cycle_number, planned_payout_amount, commission_amount, created_at, updated_at")
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
  if (billsResult.error) throw new Error("Unable to load Bills for financial reconciliation: " + billsResult.error.message);
  if (cyclesResult.error) throw new Error("Unable to load Cycles for financial reconciliation: " + cyclesResult.error.message);
  if (paymentsResult.error) throw new Error("Unable to load Payments for financial reconciliation: " + paymentsResult.error.message);
  if (otherEntriesResult.error) throw new Error("Unable to load Fund adjustments for financial reconciliation: " + otherEntriesResult.error.message);

  const fund = fundResult.data as CfcfFundRow;
  const shares = (sharesResult.data ?? []) as CfcfShareRow[];
  const bills = (billsResult.data ?? []) as CfcfBillRow[];
  const cycles = (cyclesResult.data ?? []) as CfcfCycleRow[];
  const payments = (paymentsResult.data ?? []) as CfcfPaymentRow[];
  const otherEntries = (otherEntriesResult.data ?? []) as CfcfFundOtherEntryRow[];
  const expected = calculateCfcfFundFinancialSummary(fund, shares, bills, cycles, payments, otherEntries);
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
  adjustmentCategory: "outside_money" | "commission" | "discount" | "stationery" | "others",
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
    p_adjustment_category: adjustmentCategory,
  });
  if (error) {
    if (error.code === "42501") throw new Error("You do not have owner access to record this Fund entry.");
    throw new Error("Unable to record Fund adjustment: " + error.message);
  }
}


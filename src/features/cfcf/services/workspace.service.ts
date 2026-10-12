// CFCF PRODUCT: CFCF workspace reads and fund mutations against the existing CFCF tables.
// MIX: Receives tenant/person identity from the universal authorized workspace; enforce RLS and parent ownership in the database.

import { supabase } from "../../../core/database/supabaseClient";
import { cfcfConfig } from "../config/cfcf.config";
import type {
  CfcfFundOtherEntryRow,
  CfcfFundRow,
  CfcfPaymentRow,
  CfcfShareRow,
} from "../types/database.types";

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
      number_of_shares: input.numberOfShares ?? null,
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

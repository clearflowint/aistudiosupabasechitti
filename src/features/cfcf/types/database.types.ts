// CFCF PRODUCT: These are schema-bound CFCF database types, not universal application contracts. Keep names aligned with existing Supabase columns.
/**
 * Database-facing types for the existing CFCF Supabase schema.
 * Keep these names and fields aligned with Supabase; do not rename database columns
 * to match legacy UI terminology.
 */

export type CfcfProductId = "CFCF";
export type ActiveRecordStatus = "active" | "inactive" | "closed";
export type AccessStatus = "active" | "suspended";
export type CfcfEntryType = "credit" | "debit";
export type CfcfPaymentType = "UPI" | "Cash" | "Other";
export type CfcfPayoutStatus = "undrawn" | "drawn";

export interface CfcfTenantRow {
  tenant_id: string;
  product_id: CfcfProductId;
  status: "active" | "inactive" | "suspended";
  business_name: string | null;
  name: string | null;
  email: string;
  phone: string | null;
  created_at: string;
  updated_at: string;
}

export interface CfcfPersonRow {
  person_id: string;
  tenant_id: string;
  product_id: CfcfProductId;
  name: string;
  email: string | null;
  phone: string | null;
  type: "owner" | "professional" | "admin_staff" | "contractor" | "customer";
  status: "active" | "inactive";
  created_at: string;
  updated_at: string;
}

export interface CfcfContactRow {
  contact_id: string;
  product_id: CfcfProductId;
  tenant_id: string;
  name: string;
  phone: string;
  email: string | null;
  remarks: string | null;
  created_at: string;
  updated_at: string;
}

export interface CfcfFundRow {
  fund_id: string;
  product_id: CfcfProductId;
  tenant_id: string;
  person_id: string;
  fund_name: string;
  start_date: string | null;
  number_of_cycles: number | null;
  number_of_shares: number | null;
  current_cycle: number;
  cycle_payout_amounts: unknown[];
  cycle_commissions: unknown[];
  fund_net_balance: number;
  fund_total_billed_amount: number;
  fund_total_pending_amount: number;
  fund_total_advance: number;
  fund_total_withdrawn: number;
  fund_total_commissions: number;
  other_amount: number;
  status: ActiveRecordStatus;
  created_at: string;
  updated_at: string;
}

export interface CfcfShareRow {
  share_id: string;
  product_id: CfcfProductId;
  tenant_id: string;
  fund_id: string;
  person_id: string;
  contact_id: string;
  billing_entries: Record<string, unknown>;
  share_total_billed_amount: number;
  share_net_payment_received: number;
  total_pending: number;
  total_advance: number;
  payout_status: CfcfPayoutStatus;
  withdrawn_amount: number;
  payout_cycle_number: number | null;
  status: ActiveRecordStatus;
  created_at: string;
  updated_at: string;
}

export interface CfcfPaymentRow {
  payment_id: string;
  product_id: CfcfProductId;
  tenant_id: string;
  person_id: string;
  fund_id: string;
  share_id: string;
  entry_type: CfcfEntryType;
  amount: number;
  entry_date: string;
  payment_type: CfcfPaymentType;
  remarks: string | null;
  created_at: string;
  updated_at: string;
}

export interface CfcfFundOtherEntryRow {
  entry_id: string;
  product_id: CfcfProductId;
  tenant_id: string;
  person_id: string;
  fund_id: string;
  entry_type: CfcfEntryType;
  amount: number;
  remarks: string | null;
  created_at: string;
  updated_at: string;
}

export interface CfcfProductDataRow {
  product_id: CfcfProductId;
  tenant_id: string;
  person_id: string | null;
  notifications: unknown[];
  updated_at: string;
}

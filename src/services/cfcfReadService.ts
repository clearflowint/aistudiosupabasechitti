import { supabase } from "../lib/supabase";
import type {
  CfcfContactRow,
  CfcfFundRow,
  CfcfPaymentRow,
  CfcfShareRow,
} from "../types/cfcfDatabase";

/**
 * Read-only access to the canonical CFCF schema.
 * Financial mutations will be added only after their person/tenant constraints
 * and transaction requirements are wired to trusted database operations.
 */
function requireTenantId(tenantId: string): string {
  const value = tenantId.trim();
  if (!value) throw new Error("An authorized tenant ID is required.");
  return value;
}

export const cfcfReadService = {
  async getFunds(tenantId: string): Promise<CfcfFundRow[]> {
    const tenant = requireTenantId(tenantId);
    const { data, error } = await supabase
      .from("cfcf_funds")
      .select("*")
      .eq("product_id", "CFCF")
      .eq("tenant_id", tenant)
      .order("created_at", { ascending: false });

    if (error) throw new Error(`Unable to load CFCF funds: ${error.message}`);
    return (data ?? []) as CfcfFundRow[];
  },

  async getShares(fundId: string, tenantId: string): Promise<CfcfShareRow[]> {
    const tenant = requireTenantId(tenantId);
    const fund = fundId.trim();
    if (!fund) throw new Error("A fund ID is required.");

    const { data, error } = await supabase
      .from("cfcf_shares")
      .select("*")
      .eq("product_id", "CFCF")
      .eq("tenant_id", tenant)
      .eq("fund_id", fund)
      .order("created_at", { ascending: true });

    if (error) throw new Error(`Unable to load CFCF shares: ${error.message}`);
    return (data ?? []) as CfcfShareRow[];
  },

  async getPayments(fundId: string, tenantId: string): Promise<CfcfPaymentRow[]> {
    const tenant = requireTenantId(tenantId);
    const fund = fundId.trim();
    if (!fund) throw new Error("A fund ID is required.");

    const { data, error } = await supabase
      .from("cfcf_payments")
      .select("*")
      .eq("product_id", "CFCF")
      .eq("tenant_id", tenant)
      .eq("fund_id", fund)
      .order("entry_date", { ascending: false });

    if (error) throw new Error(`Unable to load CFCF payments: ${error.message}`);
    return (data ?? []) as CfcfPaymentRow[];
  },

  async getContacts(tenantId: string): Promise<CfcfContactRow[]> {
    const tenant = requireTenantId(tenantId);
    const { data, error } = await supabase
      .from("contacts")
      .select("*")
      .eq("product_id", "CFCF")
      .eq("tenant_id", tenant)
      .order("name", { ascending: true });

    if (error) throw new Error(`Unable to load CFCF contacts: ${error.message}`);
    return (data ?? []) as CfcfContactRow[];
  },
};

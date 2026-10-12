import { supabase } from "../lib/supabase";
import { ChittiMaster, ChittiDetails, MathTemplate, MemberShare, Transaction } from "../types";
import { financialEngine } from "./financialEngine";
import { calculateChittiMonth } from "../chittiMonthUtils";
import { AvailableMathTemplates } from "../math/chitFormulas";

export const fundsService = {
  async getMathTemplates(): Promise<MathTemplate[]> {
    try {
      const { data, error } = await supabase
        .from("math_templates")
        .select("formula_id, name, description");

      if (!error && data && data.length > 0) {
        return data.map((t: any) => ({
          formula_id: t.formula_id,
          name: t.name,
          description: t.description,
        }));
      }
    } catch (e) {
      // Fallback to static math engine registry
    }

    return AvailableMathTemplates.map((m) => ({
      formula_id: m.formula_id,
      name: m.name,
      description: m.description,
    }));
  },

  async getFunds(tenantId: string): Promise<ChittiMaster[]> {
    const authorizedTenantId = tenantId.trim();
    if (!authorizedTenantId) return [];

    const { data, error } = await supabase
      .from("cfcf_funds")
      .select("fund_id, product_id, tenant_id, fund_name, start_date, number_of_cycles, number_of_shares, current_cycle, cycle_payout_amounts, cycle_commissions, fund_net_balance, fund_total_billed_amount, fund_total_pending_amount, fund_total_advance, fund_total_withdrawn, fund_total_commissions, other_amount, status")
      .eq("product_id", "CFCF")
      .eq("tenant_id", authorizedTenantId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Unable to load CFCF funds:", error);
      throw new Error(`Unable to load funds: ${error.message}`);
    }

    // Transitional UI adapter: database column names remain canonical.
    // Values not represented by the current CFCF schema are not fabricated.
    return (data ?? []).map((row: any) => ({
      chitti_id: row.fund_id,
      tenant_id: row.tenant_id,
      formula_id: "manual",
      name: row.fund_name,
      start_date: row.start_date || "",
      total_members: Number(row.number_of_shares ?? 0),
      total_months: Number(row.number_of_cycles ?? 0),
      u_due: 0,
      d_due: 0,
      commission: 0,
      current_month: Number(row.current_cycle ?? 0),
      payout_schedule: JSON.stringify(row.cycle_payout_amounts ?? []),
    }));
  },

  async getFundDetails(fundId: string, tenantId: string, requestedMonth?: number): Promise<ChittiDetails> {
    if (!fundId) throw new Error("Fund ID is required");

    // 1. Fetch fund master record
    const { data: fundData, error: fundErr } = await supabase
      .from("chittis")
      .select("*")
      .eq("chitti_id", fundId)
      .single();

    if (fundErr || !fundData) {
      throw new Error(fundErr?.message || "Fund not found");
    }

    const fund: ChittiMaster = {
      chitti_id: fundData.chitti_id || fundData.id,
      tenant_id: fundData.tenant_id,
      formula_id: fundData.formula_id || "standard_chit_v1",
      name: fundData.name,
      start_date: fundData.start_date,
      total_members: Number(fundData.total_members) || 20,
      total_months: Number(fundData.total_months) || 20,
      u_due: Number(fundData.u_due) || 5000,
      d_due: Number(fundData.d_due) || 6000,
      commission: Number(fundData.commission) || 2000,
      current_month: fundData.current_month,
      last_checked_date: fundData.last_checked_date,
      payout_schedule: fundData.payout_schedule,
    };

    // 2. Fetch member shares
    const { data: sharesData, error: sharesErr } = await supabase
      .from("shares")
      .select("*")
      .eq("chitti_id", fundId)
      .order("share_id", { ascending: true });

    if (sharesErr) throw sharesErr;

    // 3. Fetch transactions
    const { data: txsData, error: txsErr } = await supabase
      .from("transactions")
      .select("*")
      .eq("chitti_id", fundId)
      .eq("is_void", false);

    if (txsErr) throw txsErr;

    const shares: MemberShare[] = (sharesData || []).map((s: any) => ({
      share_id: s.share_id || s.id,
      chitti_id: s.chitti_id,
      tenant_id: s.tenant_id,
      member_name: s.member_name || "Member",
      phone: s.phone || "",
      win_month: s.win_month !== null && s.win_month !== undefined ? Number(s.win_month) : null,
      status: "undrawn",
      monthly_due_current: Number(s.monthly_due_current) || fund.u_due,
      total_billed: Number(s.total_billed) || 0,
      total_paid: Number(s.total_paid) || 0,
      net_balance: Number(s.net_balance) || 0,
      pending_amount: Number(s.pending_amount) || 0,
      advance_amount: Number(s.advance_amount) || 0,
      transactions: [],
    }));

    const transactions: Transaction[] = (txsData || []).map((tx: any) => ({
      tx_id: tx.tx_id || tx.id,
      share_id: tx.share_id,
      chitti_id: tx.chitti_id,
      tenant_id: tx.tenant_id,
      amount: Number(tx.amount) || 0,
      date_paid: tx.date_paid,
      payment_mode: tx.payment_mode || "UPI",
    }));

    // Authoritative calculations performed in financialEngine
    return financialEngine.computeTreasuryAndDetails(fund, shares, transactions, requestedMonth);
  },

  async createFund(
    fundData: Partial<ChittiMaster>,
    initialMembers?: { name: string; phone: string }[]
  ): Promise<ChittiMaster> {
    const chittiId = fundData.chitti_id || `chit_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const tenantId = fundData.tenant_id || "";
    const totalMembers = Number(fundData.total_members) || 20;
    const totalMonths = Number(fundData.total_months) || 20;
    const uDue = Number(fundData.u_due) || 5000;
    const dDue = Number(fundData.d_due) || 6000;
    const commission = Number(fundData.commission) || 2000;
    const formulaId = fundData.formula_id || "standard_chit_v1";

    const schedule = financialEngine.generatePayoutSchedule(totalMonths, totalMembers, uDue, dDue, commission);

    const newFundRecord = {
      chitti_id: chittiId,
      tenant_id: tenantId,
      name: fundData.name || "Chitti Scheme",
      start_date: fundData.start_date || new Date().toISOString().split("T")[0],
      total_members: totalMembers,
      total_months: totalMonths,
      u_due: uDue,
      d_due: dDue,
      commission: commission,
      formula_id: formulaId,
      current_month: 1,
      payout_schedule: JSON.stringify(schedule),
      total_arrears: 0,
      cumulative_commission: commission,
      total_disbursed: 0,
      total_cash_collected: 0,
      net_balance: 0,
    };

    const { error: fundInsertErr } = await supabase.from("chittis").insert(newFundRecord);
    if (fundInsertErr) {
      console.error("Error creating chitti in Supabase:", fundInsertErr);
      throw fundInsertErr;
    }

    // Allocate initial member shares
    const memberRows: any[] = [];
    for (let i = 1; i <= totalMembers; i++) {
      const initInfo = initialMembers && initialMembers[i - 1];
      memberRows.push({
        share_id: `SH-${chittiId.replace(/^chit_/, "")}-${String(i).padStart(2, "0")}`,
        chitti_id: chittiId,
        tenant_id: tenantId,
        member_name: initInfo?.name ? initInfo.name.trim() : `Member ${i}`,
        phone: initInfo?.phone ? initInfo.phone.trim() : "",
        win_month: null,
        monthly_due_current: uDue,
        total_billed: uDue,
        total_paid: 0,
        net_balance: -uDue,
        pending_amount: uDue,
        advance_amount: 0,
      });
    }

    const { error: sharesErr } = await supabase.from("shares").insert(memberRows);
    if (sharesErr) {
      console.warn("Error inserting initial shares in Supabase:", sharesErr);
    }

    return {
      chitti_id: chittiId,
      tenant_id: tenantId,
      formula_id: formulaId,
      name: newFundRecord.name,
      start_date: newFundRecord.start_date,
      total_members: totalMembers,
      total_months: totalMonths,
      u_due: uDue,
      d_due: dDue,
      commission: commission,
      current_month: 1,
      payout_schedule: JSON.stringify(schedule),
    };
  },

  async deleteFund(fundId: string, tenantId: string): Promise<boolean> {
    if (!fundId || !tenantId) return false;

    // Delete child records first to respect foreign key constraints
    await supabase.from("transactions").delete().eq("chitti_id", fundId).eq("tenant_id", tenantId);
    await supabase.from("chitti_expenses").delete().eq("chitti_id", fundId).eq("tenant_id", tenantId);
    await supabase.from("shares").delete().eq("chitti_id", fundId).eq("tenant_id", tenantId);

    const { error } = await supabase
      .from("chittis")
      .delete()
      .eq("chitti_id", fundId)
      .eq("tenant_id", tenantId);

    if (error) {
      console.error("Failed to delete fund from Supabase:", error);
      throw error;
    }

    return true;
  },
};

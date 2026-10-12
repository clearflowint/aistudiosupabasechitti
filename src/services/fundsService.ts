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
    const authorizedTenantId = tenantId.trim();
    if (!fundId.trim() || !authorizedTenantId) throw new Error("Fund ID and authorized tenant ID are required.");

    const { data: fundRow, error: fundError } = await supabase
      .from("cfcf_funds")
      .select("*")
      .eq("product_id", "CFCF")
      .eq("tenant_id", authorizedTenantId)
      .eq("fund_id", fundId)
      .maybeSingle();

    if (fundError) throw new Error(`Unable to load fund: ${fundError.message}`);
    if (!fundRow) throw new Error("Fund not found for this authorized tenant.");

    const [{ data: shareRows, error: sharesError }, { data: paymentRows, error: paymentsError }, { data: contactRows, error: contactsError }] = await Promise.all([
      supabase.from("cfcf_shares").select("*").eq("product_id", "CFCF").eq("tenant_id", authorizedTenantId).eq("fund_id", fundId).order("created_at", { ascending: true }),
      supabase.from("cfcf_payments").select("*").eq("product_id", "CFCF").eq("tenant_id", authorizedTenantId).eq("fund_id", fundId).order("entry_date", { ascending: false }),
      supabase.from("contacts").select("contact_id, tenant_id, product_id, name, phone, email, remarks").eq("product_id", "CFCF").eq("tenant_id", authorizedTenantId),
    ]);

    if (sharesError) throw new Error(`Unable to load shares: ${sharesError.message}`);
    if (paymentsError) throw new Error(`Unable to load payments: ${paymentsError.message}`);
    if (contactsError) throw new Error(`Unable to load contacts: ${contactsError.message}`);

    const contactsById = new Map((contactRows ?? []).map((contact: any) => [contact.contact_id, contact]));
    const activeCycle = Math.max(1, requestedMonth ?? Number(fundRow.current_cycle ?? 1));
    const payments = (paymentRows ?? []).map((row: any): Transaction => ({
      tx_id: row.payment_id,
      share_id: row.share_id,
      chitti_id: row.fund_id,
      tenant_id: row.tenant_id,
      amount: Number(row.amount) || 0,
      date_paid: row.entry_date,
      payment_mode: row.payment_type || "Other",
    }));

    const members: MemberShare[] = (shareRows ?? []).map((row: any) => {
      const contact: any = contactsById.get(row.contact_id);
      const billed = Number(row.share_total_billed_amount) || 0;
      const paid = Number(row.share_net_payment_received) || 0;
      const billingValue = row.billing_entries?.[String(activeCycle)];
      const currentDue = typeof billingValue === "number" || typeof billingValue === "string"
        ? Number(billingValue) || 0
        : Number(billingValue?.amount ?? billingValue?.billed_amount ?? 0) || 0;
      const sharePayments = payments.filter((payment) => payment.share_id === row.share_id);
      return {
        share_id: row.share_id,
        chitti_id: row.fund_id,
        tenant_id: row.tenant_id,
        member_name: contact?.name || "Member",
        phone: contact?.phone || "",
        win_month: row.payout_status === "drawn" ? Number(row.payout_cycle_number) || null : null,
        status: row.payout_status || "undrawn",
        monthly_due_current: currentDue,
        total_billed: billed,
        total_paid: paid,
        net_balance: paid - billed,
        pending_amount: Number(row.total_pending) || 0,
        advance_amount: Number(row.total_advance) || 0,
        transactions: sharePayments,
      };
    });

    const totalMonths = Number(fundRow.number_of_cycles) || 0;
    const totalMembers = Number(fundRow.number_of_shares) || members.length;
    const schedule = Array.isArray(fundRow.cycle_payout_amounts) ? fundRow.cycle_payout_amounts : [];
    const payoutValue = schedule[activeCycle - 1];
    const payoutAmount = typeof payoutValue === "number" ? payoutValue : Number(payoutValue?.amount ?? payoutValue?.payout ?? 0) || 0;
    const fund: ChittiMaster = {
      chitti_id: fundRow.fund_id,
      tenant_id: fundRow.tenant_id,
      formula_id: "manual",
      name: fundRow.fund_name,
      start_date: fundRow.start_date || "",
      total_members: totalMembers,
      total_months: totalMonths,
      u_due: 0,
      d_due: 0,
      commission: 0,
      current_month: activeCycle,
      payout_schedule: JSON.stringify(schedule),
    };

    const totalPaid = (paymentRows ?? []).filter((row: any) => row.entry_type === "credit").reduce((sum: number, row: any) => sum + (Number(row.amount) || 0), 0);
    const totalDebits = (paymentRows ?? []).filter((row: any) => row.entry_type === "debit").reduce((sum: number, row: any) => sum + (Number(row.amount) || 0), 0);
    const drawnCount = members.filter((member) => member.win_month !== null).length;
    const pending = members.reduce((sum, member) => sum + (Number(member.pending_amount) || 0), 0);

    return {
      chitti: fund,
      active_month: activeCycle,
      payout_t: payoutAmount,
      total_pending_market: pending,
      members,
      treasury: {
        gross_collection: totalPaid,
        actual_cash_collected: totalPaid,
        undrawn_count: members.length - drawnCount,
        drawn_count: drawnCount,
        winners_this_month: members.filter((member) => member.win_month === activeCycle).length,
        total_disbursement: Number(fundRow.fund_total_withdrawn) || 0,
        cumulative_disbursement: Number(fundRow.fund_total_withdrawn) || 0,
        flat_commission: Number(fundRow.fund_total_commissions) || 0,
        cumulative_commission: Number(fundRow.fund_total_commissions) || 0,
        net_cashflow: Number(fundRow.fund_net_balance) || 0,
        closing_ledger_balance: Number(fundRow.fund_net_balance) || 0,
      },
    };
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

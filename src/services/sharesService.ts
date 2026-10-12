import { supabase } from "../lib/supabase";
import { MemberShare, ChittiMaster, Transaction } from "../types";
import { financialEngine } from "./financialEngine";

export const sharesService = {
  async getSharesByFund(fundId: string, tenantId: string): Promise<MemberShare[]> {
    const { data, error } = await supabase
      .from("shares")
      .select("*")
      .eq("chitti_id", fundId)
      .eq("tenant_id", tenantId)
      .order("share_id", { ascending: true });

    if (error) {
      console.error("Error fetching shares:", error);
      throw error;
    }

    return (data || []).map((s: any) => ({
      share_id: s.share_id || s.id,
      chitti_id: s.chitti_id,
      tenant_id: s.tenant_id,
      member_name: s.member_name || "Member",
      phone: s.phone || "",
      win_month: s.win_month !== null && s.win_month !== undefined ? Number(s.win_month) : null,
      status: "undrawn",
      monthly_due_current: Number(s.monthly_due_current) || 0,
      total_billed: Number(s.total_billed) || 0,
      total_paid: Number(s.total_paid) || 0,
      net_balance: Number(s.net_balance) || 0,
      pending_amount: Number(s.pending_amount) || 0,
      advance_amount: Number(s.advance_amount) || 0,
      transactions: [],
    }));
  },

  async updateMemberContact(
    shareId: string,
    memberName: string,
    phone: string
  ): Promise<void> {
    const { error } = await supabase
      .from("shares")
      .update({
        member_name: memberName.trim(),
        phone: phone.trim(),
      })
      .eq("share_id", shareId);

    if (error) {
      console.error("Error updating member contact:", error);
      throw error;
    }
  },

  async assignWinner(
    shareId: string,
    fundId: string,
    tenantId: string,
    winMonth: number | null
  ): Promise<void> {
    // 1. Update win_month in Supabase
    const { error: updateErr } = await supabase
      .from("shares")
      .update({
        win_month: winMonth,
      })
      .eq("share_id", shareId)
      .eq("chitti_id", fundId);

    if (updateErr) {
      console.error("Error assigning winner in Supabase:", updateErr);
      throw updateErr;
    }

    // 2. Fetch fresh shares, fund, and txs to re-compute authoritative summaries
    const { data: fundData } = await supabase
      .from("chittis")
      .select("*")
      .eq("chitti_id", fundId)
      .single();

    const { data: sharesData } = await supabase
      .from("shares")
      .select("*")
      .eq("chitti_id", fundId);

    const { data: txsData } = await supabase
      .from("transactions")
      .select("*")
      .eq("chitti_id", fundId)
      .eq("is_void", false);

    if (fundData && sharesData) {
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
        payout_schedule: fundData.payout_schedule,
      };

      const shares: MemberShare[] = sharesData.map((s: any) => ({
        share_id: s.share_id,
        chitti_id: s.chitti_id,
        tenant_id: s.tenant_id,
        member_name: s.member_name,
        phone: s.phone,
        win_month: s.win_month !== null && s.win_month !== undefined ? Number(s.win_month) : null,
        status: "undrawn",
        monthly_due_current: Number(s.monthly_due_current) || 0,
        total_billed: Number(s.total_billed) || 0,
        total_paid: Number(s.total_paid) || 0,
        net_balance: Number(s.net_balance) || 0,
        transactions: [],
      }));

      const transactions: Transaction[] = (txsData || []).map((t: any) => ({
        tx_id: t.tx_id,
        share_id: t.share_id,
        chitti_id: t.chitti_id,
        tenant_id: t.tenant_id,
        amount: Number(t.amount) || 0,
        date_paid: t.date_paid,
        payment_mode: t.payment_mode,
      }));

      // Persist coordinated totals
      await financialEngine.syncFundTotalsInSupabase(fundId, tenantId, shares, transactions, fund);
    }
  },
};

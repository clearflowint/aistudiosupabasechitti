import { supabase } from "../lib/supabase";
import { Transaction, MemberShare, ChittiMaster } from "../types";
import { financialEngine } from "./financialEngine";

export const paymentsService = {
  async getTransactions(fundId: string, tenantId: string): Promise<Transaction[]> {
    const { data, error } = await supabase
      .from("transactions")
      .select("*")
      .eq("chitti_id", fundId)
      .eq("tenant_id", tenantId)
      .order("date_paid", { ascending: false });

    if (error) {
      console.error("Error fetching transactions:", error);
      throw error;
    }

    return (data || []).map((t: any) => ({
      tx_id: t.tx_id || t.id,
      share_id: t.share_id,
      chitti_id: t.chitti_id,
      tenant_id: t.tenant_id,
      amount: Number(t.amount) || 0,
      date_paid: t.date_paid,
      payment_mode: t.payment_mode || "UPI",
    }));
  },

  async recordPayment(
    shareId: string,
    fundId: string,
    tenantId: string,
    amount: number,
    paymentMode: string = "UPI"
  ): Promise<Transaction> {
    const txId = `tx_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const datePaid = new Date().toISOString();

    const newTxRecord = {
      tx_id: txId,
      share_id: shareId,
      chitti_id: fundId,
      tenant_id: tenantId,
      amount: Number(amount),
      date_paid: datePaid,
      payment_mode: paymentMode,
      is_void: false,
    };

    // 1. Insert transaction record in Supabase
    const { error: insertErr } = await supabase.from("transactions").insert(newTxRecord);
    if (insertErr) {
      console.error("Error inserting transaction:", insertErr);
      throw insertErr;
    }

    // 2. Fetch fresh data to run authoritative multi-record recalculation
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

      // Calculate the specific share's updated balances
      const targetShare = shares.find((s) => s.share_id === shareId);
      if (targetShare) {
        const shareTxs = transactions.filter((t) => t.share_id === shareId);
        const activeMonth = fund.current_month || 1;
        const ledger = financialEngine.computeShareLedger(
          targetShare,
          activeMonth,
          fund.u_due,
          fund.d_due,
          shareTxs
        );

        // Update share balances in Supabase
        await supabase
          .from("shares")
          .update({
            total_paid: ledger.totalPaid,
            net_balance: ledger.netBalance,
            pending_amount: ledger.pendingAmount,
            advance_amount: ledger.advanceAmount,
          })
          .eq("share_id", shareId);
      }

      // Sync fund overall totals
      await financialEngine.syncFundTotalsInSupabase(fundId, tenantId, shares, transactions, fund);
    }

    return {
      tx_id: txId,
      share_id: shareId,
      chitti_id: fundId,
      tenant_id: tenantId,
      amount: Number(amount),
      date_paid: datePaid,
      payment_mode: paymentMode,
    };
  },

  async voidTransaction(txId: string, fundId: string, tenantId: string): Promise<boolean> {
    const { error } = await supabase
      .from("transactions")
      .update({ is_void: true })
      .eq("tx_id", txId)
      .eq("chitti_id", fundId)
      .eq("tenant_id", tenantId);

    if (error) {
      console.error("Error voiding transaction:", error);
      throw error;
    }

    return true;
  },
};

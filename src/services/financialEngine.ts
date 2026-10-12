import { ChittiMaster, MemberShare, Transaction, TreasuryData, ChittiDetails } from "../types";
import { calculateChittiMonth } from "../chittiMonthUtils";
import { supabase } from "../lib/supabase";

export interface PayoutScheduleItem {
  month: number;
  payout: number;
}

export const financialEngine = {
  /**
   * Authoritative formula payout calculation:
   * Payout_t = [(t - 1) * (D - U)] + (N * U) - F
   */
  calculatePayout(t: number, N: number, U: number, D: number, F: number): number {
    return ((t - 1) * (D - U)) + (N * U) - F;
  },

  /**
   * Authoritative member due calculation for month m:
   * If member won in month m or earlier, due is D (Drawn Due), else U (Undrawn Due)
   */
  calculateMemberDueForMonth(month: number, winMonth: number | null, U: number, D: number): number {
    const isDrawn = winMonth !== null && winMonth <= month;
    return isDrawn ? D : U;
  },

  /**
   * Generates full payout schedule across all scheme months
   */
  generatePayoutSchedule(totalMonths: number, N: number, U: number, D: number, F: number): PayoutScheduleItem[] {
    const schedule: PayoutScheduleItem[] = [];
    for (let m = 1; m <= totalMonths; m++) {
      schedule.push({
        month: m,
        payout: this.calculatePayout(m, N, U, D, F),
      });
    }
    return schedule;
  },

  /**
   * Computes authoritative member share balances
   */
  computeShareLedger(
    share: MemberShare,
    activeMonth: number,
    U: number,
    D: number,
    shareTransactions: Transaction[]
  ): {
    totalBilled: number;
    totalPaid: number;
    netBalance: number;
    pendingAmount: number;
    advanceAmount: number;
    monthlyDueCurrent: number;
  } {
    let totalBilled = 0;
    let monthlyDueCurrent = U;

    for (let m = 1; m <= activeMonth; m++) {
      const dueForMonth = this.calculateMemberDueForMonth(m, share.win_month, U, D);
      totalBilled += dueForMonth;
      if (m === activeMonth) {
        monthlyDueCurrent = dueForMonth;
      }
    }

    const totalPaid = (shareTransactions || []).reduce(
      (sum, tx) => sum + (Number(tx.amount) || 0),
      0
    );
    const netBalance = totalPaid - totalBilled;
    const pendingAmount = netBalance < 0 ? Math.abs(netBalance) : 0;
    const advanceAmount = netBalance > 0 ? netBalance : 0;

    return {
      totalBilled,
      totalPaid,
      netBalance,
      pendingAmount,
      advanceAmount,
      monthlyDueCurrent,
    };
  },

  /**
   * Computes complete treasury ledger and fund summaries from stored database state
   */
  computeTreasuryAndDetails(
    chitti: ChittiMaster,
    shares: MemberShare[],
    transactions: Transaction[],
    requestedMonth?: number
  ): ChittiDetails {
    const totalMembers = Number(chitti.total_members) || 20;
    const totalMonths = Number(chitti.total_months) || 20;
    const U = Number(chitti.u_due) || 5000;
    const D = Number(chitti.d_due) || 6000;
    const F = Number(chitti.commission) || 2000;

    const calendarActiveMonth = calculateChittiMonth(chitti.start_date, totalMonths);
    const activeMonth = requestedMonth !== undefined ? requestedMonth : (chitti.current_month || calendarActiveMonth);

    // Ensure payout schedule exists
    let schedule: PayoutScheduleItem[] = [];
    try {
      if (chitti.payout_schedule) {
        schedule = typeof chitti.payout_schedule === "string" 
          ? JSON.parse(chitti.payout_schedule) 
          : chitti.payout_schedule;
      }
    } catch (e) {}

    if (!schedule || schedule.length !== totalMonths) {
      schedule = this.generatePayoutSchedule(totalMonths, totalMembers, U, D, F);
    }

    const payoutItem = schedule.find((s) => s.month === activeMonth);
    const payoutT = payoutItem ? payoutItem.payout : this.calculatePayout(activeMonth, totalMembers, U, D, F);

    // Compute share ledgers
    let totalPendingMarket = 0;
    let undrawnCount = 0;
    let drawnCount = 0;
    let winnersThisMonth = 0;

    const computedMembers: MemberShare[] = shares.map((share) => {
      const isDrawn = share.win_month !== null && share.win_month <= activeMonth;
      if (isDrawn) drawnCount++;
      else undrawnCount++;

      if (share.win_month === activeMonth) {
        winnersThisMonth++;
      }

      const shareTxs = transactions.filter(
        (tx) => String(tx.share_id) === String(share.share_id)
      );

      const ledger = this.computeShareLedger(share, activeMonth, U, D, shareTxs);

      if (ledger.netBalance < 0) {
        totalPendingMarket += Math.abs(ledger.netBalance);
      }

      return {
        ...share,
        status: isDrawn ? "drawn" : "undrawn",
        monthly_due_current: ledger.monthlyDueCurrent,
        total_billed: ledger.totalBilled,
        total_paid: ledger.totalPaid,
        net_balance: ledger.netBalance,
        pending_amount: ledger.pendingAmount,
        advance_amount: ledger.advanceAmount,
        transactions: shareTxs,
      };
    });

    // Treasury Calculations
    const grossCollection = computedMembers.reduce((sum, m) => sum + m.monthly_due_current, 0);
    const actualCashCollected = transactions.reduce((sum, tx) => sum + (Number(tx.amount) || 0), 0);

    const totalDisbursement = winnersThisMonth * payoutT;

    let cumulativeDisbursement = 0;
    for (let m = 1; m <= activeMonth; m++) {
      const pItem = schedule.find((s) => s.month === m);
      const pAmount = pItem ? pItem.payout : this.calculatePayout(m, totalMembers, U, D, F);
      const winnersM = shares.filter((s) => s.win_month === m).length;
      cumulativeDisbursement += winnersM * pAmount;
    }

    const flatCommission = F;
    const cumulativeCommission = activeMonth * F;
    const netCashflow = grossCollection - totalDisbursement - flatCommission;
    const closingLedgerBalance = actualCashCollected - cumulativeDisbursement - cumulativeCommission;

    const treasury: TreasuryData = {
      gross_collection: grossCollection,
      actual_cash_collected: actualCashCollected,
      undrawn_count: undrawnCount,
      drawn_count: drawnCount,
      winners_this_month: winnersThisMonth,
      total_disbursement: totalDisbursement,
      cumulative_disbursement: cumulativeDisbursement,
      flat_commission: flatCommission,
      cumulative_commission: cumulativeCommission,
      net_cashflow: netCashflow,
      closing_ledger_balance: closingLedgerBalance,
    };

    return {
      chitti: {
        ...chitti,
        current_month: activeMonth,
        payout_schedule: JSON.stringify(schedule),
      },
      active_month: activeMonth,
      payout_t: payoutT,
      total_pending_market: totalPendingMarket,
      treasury,
      members: computedMembers,
    };
  },

  /**
   * Trusted multi-record update: synchronizes share totals and chitti master summary in Supabase
   */
  async syncFundTotalsInSupabase(
    fundId: string,
    tenantId: string,
    shares: MemberShare[],
    transactions: Transaction[],
    fund: ChittiMaster
  ): Promise<void> {
    try {
      const details = this.computeTreasuryAndDetails(fund, shares, transactions);

      // Update chitti summary columns in Supabase
      await supabase
        .from("chittis")
        .update({
          total_arrears: details.total_pending_market,
          cumulative_commission: details.treasury.cumulative_commission,
          total_disbursed: details.treasury.cumulative_disbursement,
          total_cash_collected: details.treasury.actual_cash_collected,
          net_balance: details.treasury.closing_ledger_balance,
          payout_schedule: details.chitti.payout_schedule,
        })
        .eq("chitti_id", fundId)
        .eq("tenant_id", tenantId);
    } catch (err) {
      console.warn("Could not sync fund totals in Supabase:", err);
    }
  },
};

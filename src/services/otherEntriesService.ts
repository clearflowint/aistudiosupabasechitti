import { supabase } from "../lib/supabase";
import { ChittiExpense } from "../types";

export const otherEntriesService = {
  async getOtherEntries(
    fundId: string,
    tenantId: string
  ): Promise<{
    expenses: ChittiExpense[];
    total_credit: number;
    total_debit: number;
    net_expenses: number;
  }> {
    if (!fundId) {
      return { expenses: [], total_credit: 0, total_debit: 0, net_expenses: 0 };
    }

    try {
      const { data, error } = await supabase
        .from("chitti_expenses")
        .select("*")
        .eq("chitti_id", fundId)
        .order("date", { ascending: false });

      if (error) {
        console.warn("Error fetching other entries from Supabase:", error);
        return { expenses: [], total_credit: 0, total_debit: 0, net_expenses: 0 };
      }

      const expenses: ChittiExpense[] = (data || []).map((row: any) => ({
        expense_id: row.expense_id || row.id,
        chitti_id: row.chitti_id,
        tenant_id: row.tenant_id,
        title: row.title || "Expense",
        type: row.type === "credit" ? "credit" : "debit",
        amount: Number(row.amount) || 0,
        date: row.date || new Date().toISOString(),
      }));

      const total_credit = expenses
        .filter((e) => e.type === "credit")
        .reduce((sum, e) => sum + e.amount, 0);

      const total_debit = expenses
        .filter((e) => e.type === "debit")
        .reduce((sum, e) => sum + e.amount, 0);

      const net_expenses = total_credit - total_debit;

      return {
        expenses,
        total_credit,
        total_debit,
        net_expenses,
      };
    } catch (err) {
      console.error("Failed to load other entries:", err);
      return { expenses: [], total_credit: 0, total_debit: 0, net_expenses: 0 };
    }
  },

  async addOtherEntry(
    fundId: string,
    tenantId: string,
    title: string,
    type: "credit" | "debit",
    amount: number
  ): Promise<ChittiExpense> {
    const expenseId = `exp_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const date = new Date().toISOString();

    const record = {
      expense_id: expenseId,
      chitti_id: fundId,
      tenant_id: tenantId,
      title: title.trim(),
      type,
      amount: Number(amount),
      date,
    };

    const { error } = await supabase.from("chitti_expenses").insert(record);
    if (error) {
      console.error("Error inserting other entry into Supabase:", error);
      throw error;
    }

    return {
      expense_id: expenseId,
      chitti_id: fundId,
      tenant_id: tenantId,
      title: title.trim(),
      type,
      amount: Number(amount),
      date,
    };
  },

  async deleteOtherEntry(expenseId: string, tenantId: string): Promise<boolean> {
    const { error } = await supabase
      .from("chitti_expenses")
      .delete()
      .eq("expense_id", expenseId);

    if (error) {
      console.error("Error deleting other entry:", error);
      throw error;
    }

    return true;
  },
};

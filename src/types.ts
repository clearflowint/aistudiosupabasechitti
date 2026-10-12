export interface ManagerAccount {
  manager_email: string;
  name: string;
}

export type Tenant = ManagerAccount;

export interface MathTemplate {
  formula_id: string;
  name: string;
  description: string;
}

export interface ChittiMaster {
  chitti_id: string;
  tenant_id: string; // Manager email ID
  formula_id: string; // Math formula template ID
  name: string;
  start_date: string;
  total_members: number;
  total_months: number;
  u_due: number;
  d_due: number;
  commission: number;
  current_month?: number;
  last_checked_date?: string;
  payout_schedule?: string;
}

export interface Transaction {
  tx_id: string;
  share_id: string;
  chitti_id: string;
  tenant_id: string;
  amount: number;
  date_paid: string;
  payment_mode: string;
}

export interface MemberShare {
  share_id: string;
  chitti_id: string;
  tenant_id: string;
  member_name: string;
  phone: string;
  win_month: number | null;
  status: string;
  monthly_due_current: number;
  total_billed: number;
  total_paid: number;
  net_balance: number;
  pending_amount?: number;
  advance_amount?: number;
  transactions: Transaction[];
}

export interface TreasuryData {
  gross_collection: number;
  actual_cash_collected: number;
  undrawn_count: number;
  drawn_count: number;
  winners_this_month: number;
  total_disbursement: number;
  cumulative_disbursement: number;
  flat_commission: number;
  cumulative_commission: number;
  net_cashflow: number;
  closing_ledger_balance: number;
}

export interface ChittiDetails {
  chitti: ChittiMaster;
  active_month: number;
  payout_t: number;
  total_pending_market: number;
  treasury: TreasuryData;
  members: MemberShare[];
}

export interface ChittiExpense {
  expense_id: string;
  chitti_id: string;
  tenant_id: string;
  title: string;
  type: 'credit' | 'debit';
  amount: number;
  date: string;
}

export interface Contact {
  contact_id: string;
  tenant_id: string;
  name: string;
  phone: string;
  email?: string;
  notes?: string;
  created_at?: string;
}

export interface CfcfNotification {
  id?: string;
  tenant_id: string;
  recipient_phone: string;
  recipient_name: string;
  message_type: 'payment_receipt' | 'month_bill' | 'winner_congrats' | 'reminder';
  payload: Record<string, any>;
  status: 'pending' | 'sent' | 'failed';
  created_at?: string;
}


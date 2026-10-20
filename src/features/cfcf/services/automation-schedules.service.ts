// CFCF PRODUCT: Manager-owned monthly automation schedule configuration.
// MIX: Schedule reads/writes use owner-checked Supabase RPCs; n8n remains responsible for due-time evaluation and execution.

import { supabase } from "../../../core/database/supabaseClient";

export type CfcfAutomationScheduleType = "pending_due_reminder" | "report";

export interface CfcfAutomationSchedule {
  schedule_id: string;
  product_id: "CFCF";
  tenant_id: string;
  fund_id: string;
  job_type: CfcfAutomationScheduleType;
  slot_number: number;
  day_of_month: number;
  time_of_day: string;
  timezone: string;
  is_enabled: boolean;
  next_run_at: string | null;
  last_run_at: string | null;
  claimed_until: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

export async function listCfcfAutomationSchedules(
  tenantId: string,
  fundId: string,
): Promise<CfcfAutomationSchedule[]> {
  const { data, error } = await supabase.rpc("cfcf_list_automation_schedules", {
    p_tenant_id: tenantId,
    p_fund_id: fundId,
  });
  if (error) throw new Error("Unable to load monthly automation schedules: " + error.message);
  return (Array.isArray(data) ? data : []) as CfcfAutomationSchedule[];
}

export async function saveCfcfAutomationSchedule(input: {
  tenantId: string;
  fundId: string;
  jobType: CfcfAutomationScheduleType;
  slotNumber: number;
  dayOfMonth: number;
  timeOfDay: string;
  isEnabled: boolean;
}): Promise<CfcfAutomationSchedule> {
  const { data, error } = await supabase.rpc("cfcf_save_automation_schedule", {
    p_tenant_id: input.tenantId,
    p_fund_id: input.fundId,
    p_job_type: input.jobType,
    p_slot_number: input.slotNumber,
    p_day_of_month: input.dayOfMonth,
    p_time_of_day: input.timeOfDay,
    p_timezone: "Asia/Kolkata",
    p_is_enabled: input.isEnabled,
  });
  if (error) throw new Error("Unable to save monthly automation schedule: " + error.message);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row.schedule_id !== "string") {
    throw new Error("Supabase did not return a valid saved schedule.");
  }
  return row as CfcfAutomationSchedule;
}

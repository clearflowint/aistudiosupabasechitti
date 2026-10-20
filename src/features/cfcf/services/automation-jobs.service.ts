// CFCF PRODUCT: Read-only manager job status from the shared storage table.
import { supabase } from "../../../core/database/supabaseClient";
import { cfcfConfig } from "../config/cfcf.config";
import type { CfcfProductId } from "../types/database.types";

export interface CfcfAutomationJobStatus {
  job_id: number;
  product_id: CfcfProductId;
  tenant_id: string;
  source_type: string;
  job_type: string;
  status: "queued" | "processing" | "completed" | "failed" | "cancelled";
  request_id: string | null;
  scheduled_at: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

/**
 * Reads safe status metadata only. Never selects the private job_data payload.
 */
export async function listCfcfAutomationJobStatus(tenantId: string): Promise<CfcfAutomationJobStatus[]> {
  if (!tenantId.trim()) throw new Error("Authorized tenant scope is required.");
  const { data, error } = await supabase
    .from("n8n_global_jobs")
    .select("job_id, product_id, tenant_id, source_type, job_type, status, request_id, scheduled_at, created_at, updated_at, completed_at")
    .eq("product_id", cfcfConfig.productId)
    .eq("tenant_id", tenantId)
    .order("updated_at", { ascending: false })
    .limit(5);
  if (error) throw error;
  return (data ?? []) as CfcfAutomationJobStatus[];
}

export type CfcfCampaignKind = "pending_reminder_campaign" | "share_report_campaign";

export async function requestCfcfCampaignJob(
  tenantId: string,
  fundId: string,
  campaignKind: CfcfCampaignKind,
): Promise<CfcfAutomationJobStatus> {
  if (!tenantId.trim()) throw new Error("Authorized tenant scope is required.");
  if (!fundId.trim()) throw new Error("Select a Fund before starting a campaign.");

  const requestId = crypto.randomUUID();
  const { data, error } = await supabase
    .from("n8n_global_jobs")
    .insert({
      product_id: cfcfConfig.productId,
      tenant_id: tenantId,
      source_type: "pwa",
      job_type: campaignKind,
      status: "queued",
      request_id: requestId,
      scheduled_at: null,
      job_data: {
        fund_id: fundId,
        campaign_kind: campaignKind,
        execution_mode: "manual_send",
      },
    })
    .select("job_id, product_id, tenant_id, source_type, job_type, status, request_id, scheduled_at, created_at, updated_at, completed_at")
    .single();

  if (error) {
    if (error.code === "42501") {
      throw new Error("Only an authorized workspace owner can queue this campaign.");
    }
    throw new Error("Unable to queue campaign: " + error.message);
  }

  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("clearflow:cfcf-job-queued"));
  }
  return data as CfcfAutomationJobStatus;
}

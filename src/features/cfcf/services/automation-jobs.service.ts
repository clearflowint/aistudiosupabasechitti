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

  const webhookUrl = import.meta.env.VITE_CFCF_N8N_CAMPAIGN_WEBHOOK_URL as string | undefined;
  if (!webhookUrl) {
    throw new Error("Campaign request service is not configured yet. No job was created.");
  }

  // The PWA submits an authenticated request; n8n, not the browser, creates the job row.
  const { data: sessionResult, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw new Error("Unable to verify the signed-in session.");
  const accessToken = sessionResult.session?.access_token;
  if (!accessToken) throw new Error("Sign in again before requesting a campaign.");

  const requestId = crypto.randomUUID();
  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + accessToken,
    },
    body: JSON.stringify({
      request_id: requestId,
      product_id: cfcfConfig.productId,
      tenant_id: tenantId,
      action: campaignKind,
      selected: { fund_id: fundId },
      options: { execution_mode: "manual_send" },
    }),
  });

  const result = await response.json().catch(() => null) as
    | { job?: CfcfAutomationJobStatus; error?: string }
    | null;
  if (!response.ok || !result?.job) {
    throw new Error(result?.error || "n8n did not confirm the campaign request. No success was reported.");
  }

  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("clearflow:cfcf-job-queued"));
  }
  return result.job;
}

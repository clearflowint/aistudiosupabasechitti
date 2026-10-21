// CFCF PRODUCT: Read-only manager job status and aggregate counts from a safe summary view.
import { supabase } from "../../../core/database/supabaseClient";
import { cfcfConfig } from "../config/cfcf.config";
import type { CfcfProductId } from "../types/database.types";

export interface CfcfAutomationJobStatus {
  communication_id: number;
  job_id: number | null;
  product_id: CfcfProductId;
  tenant_id: string;
  source_type: string;
  job_type: string;
  status: "queued" | "processing" | "completed" | "failed" | "cancelled";
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  recipient_count: number;
  sent_count: number;
  failed_count: number;
  uncertain_count: number;
}

/**
 * Reads safe status metadata and extracted aggregate counts only. The view never exposes private job_data.
 */
export async function listCfcfAutomationJobStatus(tenantId: string): Promise<CfcfAutomationJobStatus[]> {
  if (!tenantId.trim()) throw new Error("Authorized tenant scope is required.");
  const { data, error } = await supabase.rpc("list_cfcf_whatsapp_communications", {
    p_tenant_id: tenantId,
  });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    communication_id: Number(row.communication_id),
    job_id: row.job_id == null ? null : Number(row.job_id),
    product_id: row.product_id as CfcfProductId,
    tenant_id: row.tenant_id,
    source_type: row.source_type,
    job_type: row.communication_type,
    status: row.status as CfcfAutomationJobStatus["status"],
    created_at: row.created_at,
    updated_at: row.updated_at,
    completed_at: row.completed_at,
    recipient_count: row.recipient_count,
    sent_count: row.waha_accepted_count,
    failed_count: row.waha_rejected_count,
    uncertain_count: row.outcome_unknown_count,
  })) as CfcfAutomationJobStatus[];
}

export type CfcfAutomationAction = "pending_reminder_campaign" | "share_report_campaign";
/** Backwards-compatible alias for the existing campaign buttons. */
export type CfcfCampaignKind = CfcfAutomationAction;

/**
 * Submit a CFCF automation request through the single CFCF n8n ingress.
 * n8n authenticates the Supabase session and creates the job; the browser
 * never inserts directly into n8n_global_jobs.
 */
export async function requestCfcfAutomationJob(
  tenantId: string,
  fundId: string,
  action: CfcfAutomationAction,
): Promise<CfcfAutomationJobStatus> {
  if (!tenantId.trim()) throw new Error("Authorized tenant scope is required.");
  if (!fundId.trim()) throw new Error("Select a Fund before requesting this CFCF action.");

  const webhookUrl = import.meta.env.VITE_CFCF_N8N_WEBHOOK_URL as string | undefined;
  if (!webhookUrl) {
    throw new Error("CFCF automation service is not configured yet. No job was created.");
  }

  const { data: sessionResult, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw new Error("Unable to verify the signed-in session.");
  const accessToken = sessionResult.session?.access_token;
  if (!accessToken) throw new Error("Sign in again before requesting CFCF automation.");

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
      scope: "fund",
      action,
      selected: { fund_id: fundId },
      options: { execution_mode: "manual_send" },
    }),
  });

  const result = await response.json().catch(() => null) as
    | { job?: CfcfAutomationJobStatus; error?: string }
    | null;
  if (!response.ok || !result?.job) {
    throw new Error(result?.error || "n8n did not confirm the CFCF automation request. No success was reported.");
  }

  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("clearflow:cfcf-job-queued"));
  }
  return result.job;
}


/**
 * Submit a homepage bulk WhatsApp campaign. The PWA sends only selected
 * Contact Group names and the tenant-authored message body; n8n resolves
 * contacts and substitutes campaign variables from saved data.
 */
export async function requestCfcfHomepageCampaignJob(
  tenantId: string,
  groupNames: string[],
  messageBody: string,
): Promise<CfcfAutomationJobStatus> {
  const selectedGroupNames = [...new Set(groupNames.map((name) => name.trim()).filter(Boolean))];
  const trimmedMessage = messageBody.trim();
  if (!tenantId.trim()) throw new Error("Authorized tenant scope is required.");
  if (selectedGroupNames.length === 0) throw new Error("Select at least one Contact Group.");
  if (!trimmedMessage) throw new Error("Enter a campaign message.");
  if (trimmedMessage.length > 5000) throw new Error("Campaign messages must be 5000 characters or fewer.");

  const webhookUrl = import.meta.env.VITE_CFCF_N8N_WEBHOOK_URL as string | undefined;
  if (!webhookUrl) throw new Error("CFCF automation service is not configured yet. No job was created.");

  const { data: sessionResult, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw new Error("Unable to verify the signed-in session.");
  const accessToken = sessionResult.session?.access_token;
  if (!accessToken) throw new Error("Sign in again before requesting CFCF automation.");

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
      source_type: "pwa",
      scope: "homepage",
      action: "send_campaign",
      group_names: selectedGroupNames,
      channels: ["whatsapp"],
      message_body: trimmedMessage,
      options: { execution_mode: "manual_send" },
    }),
  });

  const result = await response.json().catch(() => null) as
    | { job?: CfcfAutomationJobStatus; error?: string }
    | null;
  if (!response.ok || !result?.job) {
    throw new Error(result?.error || "n8n did not confirm the CFCF campaign request. No success was reported.");
  }
  if (typeof window !== "undefined") window.dispatchEvent(new Event("clearflow:cfcf-job-queued"));
  return result.job;
}

/** Compatibility wrapper while the existing UI actions retain their campaign names. */
export function requestCfcfCampaignJob(
  tenantId: string,
  fundId: string,
  campaignKind: CfcfCampaignKind,
): Promise<CfcfAutomationJobStatus> {
  return requestCfcfAutomationJob(tenantId, fundId, campaignKind);
}

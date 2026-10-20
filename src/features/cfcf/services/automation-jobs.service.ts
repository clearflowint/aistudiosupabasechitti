// CFCF PRODUCT: Read-only manager progress projection from the global ClearFlow job registry.
import { supabase } from "../../../core/database/supabaseClient";
import { cfcfConfig } from "../config/cfcf.config";
import type { CfcfProductId } from "../types/database.types";

export interface CfcfAutomationJobProgress {
  job_id: number;
  product_id: CfcfProductId;
  tenant_id: string;
  job_type: string;
  status: "queued" | "processing" | "completed" | "partial" | "failed" | "uncertain" | "cancelled";
  created_at: string;
  last_safe_update_at: string;
  completed_at: string | null;
  progress_summary: Record<string, number | null> | null;
  needs_review: boolean;
}

/**
 * Reads only the safe progress view. Never select job_data, recipient arrays,
 * message bodies, phone numbers, provider payloads, or raw error details.
 */
export async function listCfcfAutomationJobProgress(tenantId: string): Promise<CfcfAutomationJobProgress[]> {
  if (!tenantId.trim()) throw new Error("Authorized tenant scope is required.");
  const { data, error } = await supabase
    .from("n8n_global_job_progress")
    .select("job_id, product_id, tenant_id, job_type, status, created_at, last_safe_update_at, completed_at, progress_summary, needs_review")
    .eq("product_id", cfcfConfig.productId)
    .eq("tenant_id", tenantId)
    .order("last_safe_update_at", { ascending: false })
    .limit(5);
  if (error) throw error;
  return (data ?? []) as CfcfAutomationJobProgress[];
}

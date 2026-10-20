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

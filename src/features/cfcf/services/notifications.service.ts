// CFCF PRODUCT: Reads campaign lifecycle notifications stored on the tenant's existing product-data row.
import { supabase } from "../../../core/database/supabaseClient";
import { cfcfConfig } from "../config/cfcf.config";

export interface CfcfNotification {
  id?: string;
  campaign_id?: string;
  type?: string;
  title?: string;
  message?: string;
  status?: string;
  channels?: string[];
  group_names?: string[];
  recipient_count?: number;
  created_at?: string;
  updated_at?: string;
  accepted_at?: string;
  completed_at?: string;
  error?: string | null;
  delivery_summary?: Record<string, unknown>;
}

export async function listCfcfNotifications(tenantId: string): Promise<CfcfNotification[]> {
  const { data, error } = await supabase
    .from("cfcf_product_data")
    .select("notifications")
    .eq("product_id", cfcfConfig.productId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (error) throw new Error("Unable to load Notifications: " + error.message);
  if (!Array.isArray(data?.notifications)) return [];
  return data.notifications.filter((item: unknown): item is CfcfNotification =>
    Boolean(item && typeof item === "object" && !Array.isArray(item)),
  ).sort((a, b) => String(b.updated_at ?? b.created_at ?? "").localeCompare(String(a.updated_at ?? a.created_at ?? "")));
}

export interface CfcfGlobalWhatsAppJob {
  n8n_global_job_id: number;
  product_id: string;
  tenant_id: string;
  person_id: string | null;
  job_type: string;
  source_table: string;
  source_record_id: string;
  job_status: string;
  communication_type: string | null;
  message_text: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  last_error: string | null;
  recipient_count: number;
  queued_count: number;
  sent_to_server_count: number;
  failed_count: number;
  uncertain_count: number;
  skipped_count: number;
}

export async function listCfcfGlobalWhatsAppJobs(tenantId: string): Promise<CfcfGlobalWhatsAppJob[]> {
  const { data, error } = await supabase.rpc("n8n_list_cfcf_whatsapp_jobs", {
    p_tenant_id: tenantId,
    p_limit: 50,
  });
  if (error) throw new Error("Unable to load WhatsApp job history: " + error.message);
  return (Array.isArray(data) ? data : []) as CfcfGlobalWhatsAppJob[];
}

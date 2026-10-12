import { supabase } from "./supabaseClient";

export interface ConnectionStatus {
  connected: boolean;
  message: string;
}

export async function checkTenantDatabaseConnection(tenantId: string): Promise<ConnectionStatus> {
  if (!tenantId.trim()) {
    return { connected: false, message: "No authorized workspace is selected." };
  }

  const { data, error } = await supabase
    .from("tenants")
    .select("tenant_id")
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (error) {
    return { connected: false, message: error.message };
  }

  if (!data) return { connected: false, message: "The authorized workspace could not be found." };

  return { connected: true, message: "Connected to the workspace database." };
}

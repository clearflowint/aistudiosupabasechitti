import { supabase } from "./supabaseClient";

export interface ConnectionStatus {
  connected: boolean;
  message: string;
}

export async function checkTenantDatabaseConnection(tenantId: string): Promise<ConnectionStatus> {
  if (!tenantId.trim()) {
    return { connected: false, message: "No authorized workspace is selected." };
  }

  const { error } = await supabase
    .from("tenants")
    .select("tenant_id")
    .eq("tenant_id", tenantId)
    .limit(1);

  if (error) {
    return { connected: false, message: error.message };
  }

  return { connected: true, message: "Connected to the workspace database." };
}

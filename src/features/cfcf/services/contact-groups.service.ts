// CFCF PRODUCT: Relational Contact Group and bulk-campaign preparation services.
// MIX: Uses the shared Supabase client for group operations and authenticated Edge Function campaign dispatch.

import { supabase } from "../../../core/database/supabaseClient";
import { cfcfConfig } from "../config/cfcf.config";
import type { CfcfContactGroupMemberRow, CfcfContactGroupRow } from "../types/database.types";

export type CfcfCampaignChannel = "whatsapp" | "sms" | "email";

export interface CfcfCampaignRecipient {
  contact_id: string;
  name: string;
  phone: string;
  email: string | null;
}

export interface CfcfCampaignRequest {
  product_id: "CFCF";
  tenant_id: string;
  group_ids: string[];
  contact_ids: string[];
  recipients: CfcfCampaignRecipient[];
  channels: CfcfCampaignChannel[];
  message: string;
}

const GROUP_FIELDS = "group_id, product_id, tenant_id, person_id, group_name, created_at, updated_at";

function makeId(): string {
  return crypto.randomUUID().replace(/-/g, "").toUpperCase();
}

export async function listCfcfContactGroups(tenantId: string): Promise<CfcfContactGroupRow[]> {
  const { data, error } = await supabase
    .from("contactgroups")
    .select(GROUP_FIELDS)
    .eq("product_id", cfcfConfig.productId)
    .eq("tenant_id", tenantId)
    .order("group_name", { ascending: true });

  if (error) throw new Error("Unable to load Contact Groups: " + error.message);
  return (data ?? []) as CfcfContactGroupRow[];
}

export async function listCfcfGroupMembers(tenantId: string, groupIds?: string[]): Promise<CfcfContactGroupMemberRow[]> {
  if (groupIds && groupIds.length === 0) return [];
  const rows: CfcfContactGroupMemberRow[] = [];
  const pageSize = 1000;

  // Supabase REST responses are paginated so large audiences are not silently truncated.
  for (let offset = 0; ; offset += pageSize) {
    let query = supabase
      .from("contact_group_members")
      .select("group_id, contact_id, product_id, tenant_id, created_at")
      .eq("product_id", cfcfConfig.productId)
      .eq("tenant_id", tenantId)
      .order("group_id", { ascending: true })
      .order("contact_id", { ascending: true })
      .range(offset, offset + pageSize - 1);

    if (groupIds) query = query.in("group_id", groupIds);

    const { data, error } = await query;
    if (error) throw new Error("Unable to load Contact Group members: " + error.message);
    const page = (data ?? []) as CfcfContactGroupMemberRow[];
    rows.push(...page);
    if (page.length < pageSize) break;
  }

  return rows;
}

export async function createCfcfContactGroup(
  tenantId: string,
  personId: string,
  groupName: string,
): Promise<CfcfContactGroupRow> {
  const name = groupName.trim();
  if (!name) throw new Error("Enter a group name.");
  if (name.length > 120) throw new Error("Group names must be 120 characters or fewer.");

  const { data, error } = await supabase
    .from("contactgroups")
    .insert({
      group_id: makeId(),
      product_id: cfcfConfig.productId,
      tenant_id: tenantId,
      person_id: personId,
      group_name: name,
    })
    .select(GROUP_FIELDS)
    .single();

  if (error) {
    if (error.code === "42501") throw new Error("You do not have permission to create a Contact Group in this workspace.");
    if (error.code === "23505") throw new Error("A Contact Group with this name already exists in this workspace. Choose a unique name.");
    throw new Error("Unable to create Contact Group: " + error.message);
  }
  return data as CfcfContactGroupRow;
}

export async function renameCfcfContactGroup(
  tenantId: string,
  groupId: string,
  groupName: string,
): Promise<CfcfContactGroupRow> {
  const name = groupName.trim();
  if (!name) throw new Error("Enter a group name.");
  if (name.length > 120) throw new Error("Group names must be 120 characters or fewer.");

  const { data, error } = await supabase
    .from("contactgroups")
    .update({ group_name: name })
    .eq("product_id", cfcfConfig.productId)
    .eq("tenant_id", tenantId)
    .eq("group_id", groupId)
    .select(GROUP_FIELDS)
    .single();

  if (error?.code === "23505") throw new Error("A Contact Group with this name already exists in this workspace. Choose a unique name.");
  if (error) throw new Error("Unable to rename Contact Group: " + error.message);
  return data as CfcfContactGroupRow;
}

export async function deleteCfcfContactGroup(tenantId: string, groupId: string): Promise<void> {
  const { data, error } = await supabase
    .from("contactgroups")
    .delete()
    .eq("product_id", cfcfConfig.productId)
    .eq("tenant_id", tenantId)
    .eq("group_id", groupId)
    .select("group_id")
    .maybeSingle();

  if (error) throw new Error("Unable to delete Contact Group: " + error.message);
  if (!data) throw new Error("Contact Group was not found or is no longer available.");
}

export async function addCfcfContactToGroup(
  tenantId: string,
  groupId: string,
  contactId: string,
): Promise<void> {
  const { data, error } = await supabase
    .from("contact_group_members")
    .upsert({
      group_id: groupId,
      contact_id: contactId,
      product_id: cfcfConfig.productId,
      tenant_id: tenantId,
    }, { onConflict: "group_id,contact_id" })
    .select("group_id, contact_id, product_id, tenant_id, created_at")
    .single();

  if (error) throw new Error("Unable to add Contact to group: " + error.message);
  if (!data) throw new Error("Supabase did not return the saved Contact Group membership.");
}

export async function removeCfcfContactFromGroup(
  tenantId: string,
  groupId: string,
  contactId: string,
): Promise<void> {
  const { data, error } = await supabase
    .from("contact_group_members")
    .delete()
    .eq("product_id", cfcfConfig.productId)
    .eq("tenant_id", tenantId)
    .eq("group_id", groupId)
    .eq("contact_id", contactId)
    .select("group_id, contact_id")
    .maybeSingle();

  if (error) throw new Error("Unable to remove Contact from group: " + error.message);
  if (!data) throw new Error("The Contact Group membership was not found or could not be confirmed as deleted.");
}

/**
 * CFCF PRODUCT: Dispatches a campaign to the authenticated Edge Function.
 * The Edge Function resolves the current full recipient records and sends them to n8n,
 * avoiding a second database lookup inside n8n.
 */
export interface CfcfCampaignDispatchReceipt {
  accepted: true;
  status: "accepted";
  campaign_id: string;
  accepted_at: string;
  recipient_count: number;
  channels: CfcfCampaignChannel[];
  message: string;
  execution_id: string | null;
}

export async function dispatchCfcfCampaign(
  tenantId: string,
  groupIds: string[],
  channels: CfcfCampaignChannel[],
  message: string,
): Promise<CfcfCampaignDispatchReceipt> {
  const selectedGroupIds = [...new Set(groupIds.map((id) => id.trim()).filter(Boolean))];
  const selectedChannels = [...new Set(channels)];
  const trimmedMessage = message.trim();

  if (!tenantId.trim()) throw new Error("No authorized workspace is selected.");
  if (selectedGroupIds.length === 0) throw new Error("Select at least one Contact Group.");
  if (selectedChannels.length === 0) throw new Error("Select at least one delivery channel.");
  if (!trimmedMessage) throw new Error("Enter a campaign message.");

  const { data, error } = await supabase.functions.invoke("campaign-dispatch", {
    body: {
      tenant_id: tenantId,
      group_ids: selectedGroupIds,
      channels: selectedChannels,
      message: trimmedMessage,
    },
  });

  if (error) {
    let details = data && typeof data === "object" && "error" in data
      ? String((data as { error: unknown }).error)
      : "";
    const context = (error as { context?: unknown }).context;
    if (!details && context instanceof Response) {
      try {
        const responseBody = await context.clone().json() as { error?: unknown };
        if (typeof responseBody.error === "string") details = responseBody.error;
      } catch {
        // Fall back to the Supabase function client's safe generic error.
      }
    }
    throw new Error(details || error.message || "Campaign dispatch failed. Check Notifications before retrying.");
  }

  if (!data || data.accepted !== true || data.status !== "accepted" || typeof data.campaign_id !== "string") {
    throw new Error(typeof data?.error === "string" ? data.error : "n8n did not acknowledge campaign receipt.");
  }

  return data as CfcfCampaignDispatchReceipt;
}

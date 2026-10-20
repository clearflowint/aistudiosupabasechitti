// CFCF PRODUCT: Relational Contact Group and bulk-campaign preparation services.
// MIX: Uses the shared Supabase client for group operations and authenticated Edge Function campaign dispatch.

import { supabase } from "../../../core/database/supabaseClient";
import { cfcfConfig } from "../config/cfcf.config";
import { requestCfcfHomepageCampaignJob } from "./automation-jobs.service";
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
 * Queues a homepage bulk WhatsApp campaign through the shared n8n ingress.
 * The browser sends group names and the authored body only; it never resolves
 * or sends recipient phone numbers and never invokes the campaign Edge Function.
 */
export interface CfcfCampaignDispatchReceipt {
  job_id: number;
  product_id: "CFCF";
  tenant_id: string;
  source_type: string;
  job_type: string;
  status: "queued" | "processing" | "completed" | "failed" | "cancelled";
  request_id: string | null;
  scheduled_at: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  group_names: string[];
  channels: ["whatsapp"];
}

export async function dispatchCfcfCampaign(
  tenantId: string,
  groupNames: string[],
  channels: CfcfCampaignChannel[],
  message: string,
): Promise<CfcfCampaignDispatchReceipt> {
  const selectedChannels = [...new Set(channels)];
  if (selectedChannels.length !== 1 || selectedChannels[0] !== "whatsapp") {
    throw new Error("Only WhatsApp bulk campaigns are currently supported.");
  }
  const names = [...new Set(groupNames.map((name) => name.trim()).filter(Boolean))];
  const job = await requestCfcfHomepageCampaignJob(tenantId, names, message);
  return { ...job, group_names: names, channels: ["whatsapp"] };
}

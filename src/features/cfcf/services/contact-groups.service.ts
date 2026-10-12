// CFCF PRODUCT: Relational Contact Group and bulk-campaign preparation services.
// MIX: Uses the shared Supabase client and authorized workspace identity; campaign delivery is intentionally not connected yet.

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
  const { error } = await supabase
    .from("contact_group_members")
    .upsert({
      group_id: groupId,
      contact_id: contactId,
      product_id: cfcfConfig.productId,
      tenant_id: tenantId,
    }, { onConflict: "group_id,contact_id", ignoreDuplicates: true });

  if (error) throw new Error("Unable to add Contact to group: " + error.message);
}

export async function removeCfcfContactFromGroup(
  tenantId: string,
  groupId: string,
  contactId: string,
): Promise<void> {
  const { error } = await supabase
    .from("contact_group_members")
    .delete()
    .eq("product_id", cfcfConfig.productId)
    .eq("tenant_id", tenantId)
    .eq("group_id", groupId)
    .eq("contact_id", contactId);

  if (error) throw new Error("Unable to remove Contact from group: " + error.message);
}

/**
 * CFCF PRODUCT: Builds the future n8n handoff payload from persisted memberships.
 * This function intentionally does not make a network request or claim that delivery occurred.
 */
export async function prepareCfcfCampaignRequest(
  tenantId: string,
  groupIds: string[],
  channels: CfcfCampaignChannel[],
  message: string,
): Promise<CfcfCampaignRequest> {
  const selectedGroupIds = [...new Set(groupIds)];
  const selectedChannels = [...new Set(channels)];
  const trimmedMessage = message.trim();

  if (selectedGroupIds.length === 0) throw new Error("Select at least one Contact Group.");
  if (selectedChannels.length === 0) throw new Error("Select at least one delivery channel.");
  if (!trimmedMessage) throw new Error("Enter a campaign message.");

  const groups = await listCfcfContactGroups(tenantId);
  const validGroupIds = new Set(groups.map((group) => group.group_id));
  if (selectedGroupIds.some((id) => !validGroupIds.has(id))) {
    throw new Error("One or more selected groups are not available in this workspace. Refresh and try again.");
  }

  const memberships = await listCfcfGroupMembers(tenantId, selectedGroupIds);
  const contactIds = [...new Set(memberships.map((membership) => membership.contact_id))];
  if (contactIds.length === 0) throw new Error("The selected groups do not contain any contacts.");

  // Include delivery addresses for n8n, but only after tenant-scoped IDs have been resolved.
  // Chunk requests so a large audience does not exceed URL/query limits.
  const recipients: CfcfCampaignRequest["recipients"] = [];
  for (let offset = 0; offset < contactIds.length; offset += 500) {
    const idChunk = contactIds.slice(offset, offset + 500);
    const { data, error } = await supabase
      .from("contacts")
      .select("contact_id, name, phone, email")
      .eq("product_id", cfcfConfig.productId)
      .eq("tenant_id", tenantId)
      .in("contact_id", idChunk);

    if (error) throw new Error("Unable to resolve campaign recipients: " + error.message);
    recipients.push(...((data ?? []) as CfcfCampaignRequest["recipients"]));
  }

  if (recipients.length !== contactIds.length) {
    throw new Error("Some selected Contacts are no longer available. Refresh the groups and try again.");
  }

  // The future n8n request includes unique IDs plus current recipient delivery details.
  return {
    product_id: cfcfConfig.productId,
    tenant_id: tenantId,
    group_ids: selectedGroupIds,
    contact_ids: contactIds,
    recipients,
    channels: selectedChannels,
    message: trimmedMessage,
  };
}

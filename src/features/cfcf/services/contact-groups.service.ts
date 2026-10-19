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
 * CFCF PRODUCT: Registers a WhatsApp campaign directly in the global n8n job
 * registry through the authenticated Supabase RPC. No Edge Function or public
 * n8n webhook is called by the browser.
 */
export interface CfcfCampaignDispatchReceipt {
  accepted: true;
  status: "registered";
  n8n_global_job_id: number;
  n8n_whatsapp_communication_id: number;
  was_existing: boolean;
  recipient_count: number;
  channels: ["whatsapp"];
  message: string;
}

export async function dispatchCfcfCampaign(
  tenantId: string,
  personId: string,
  groupIds: string[],
  channels: CfcfCampaignChannel[],
  message: string,
): Promise<CfcfCampaignDispatchReceipt> {
  const selectedGroupIds = [...new Set(groupIds.map((id) => id.trim()).filter(Boolean))].sort();
  const selectedChannels = [...new Set(channels)];
  const trimmedMessage = message.trim();

  if (!tenantId.trim() || !personId.trim()) throw new Error("No authorized workspace/person is selected.");
  if (selectedGroupIds.length === 0) throw new Error("Select at least one Contact Group.");
  if (selectedChannels.length !== 1 || selectedChannels[0] !== "whatsapp") {
    throw new Error("The global job registry currently supports WhatsApp only. Select WhatsApp without SMS or email.");
  }
  if (!trimmedMessage) throw new Error("Enter a campaign message.");

  const { data: groups, error: groupError } = await supabase
    .from("contactgroups")
    .select("group_id, group_name")
    .eq("product_id", cfcfConfig.productId)
    .eq("tenant_id", tenantId)
    .in("group_id", selectedGroupIds);
  if (groupError) throw new Error("Unable to verify selected Contact Groups: " + groupError.message);
  if (!groups || groups.length !== selectedGroupIds.length) {
    throw new Error("One or more Contact Groups are no longer available in this workspace.");
  }

  const { data: memberships, error: membershipError } = await supabase
    .from("contact_group_members")
    .select("contact_id")
    .eq("product_id", cfcfConfig.productId)
    .eq("tenant_id", tenantId)
    .in("group_id", selectedGroupIds);
  if (membershipError) throw new Error("Unable to load selected group members: " + membershipError.message);

  const contactIds = [...new Set((memberships ?? []).map((row) => row.contact_id).filter(Boolean))];
  if (contactIds.length === 0) throw new Error("The selected groups contain no Contacts.");

  const recipients: Array<{ recipient_contact_id: string; recipient_phone: string }> = [];
  for (let offset = 0; offset < contactIds.length; offset += 500) {
    const chunk = contactIds.slice(offset, offset + 500);
    const { data, error } = await supabase
      .from("contacts")
      .select("contact_id, phone")
      .eq("product_id", cfcfConfig.productId)
      .eq("tenant_id", tenantId)
      .in("contact_id", chunk);
    if (error) throw new Error("Unable to resolve recipient phone numbers: " + error.message);
    for (const contact of data ?? []) {
      const phone = typeof contact.phone === "string" ? contact.phone.trim() : "";
      if (phone) recipients.push({ recipient_contact_id: contact.contact_id, recipient_phone: phone });
    }
  }
  const uniqueRecipients = [...new Map(recipients.map((recipient) => [recipient.recipient_contact_id, recipient])).values()];
  if (uniqueRecipients.length === 0) throw new Error("The selected groups have no Contacts with usable phone numbers.");

  const requestKey = "cfcf-campaign:" + tenantId + ":" + crypto.randomUUID();
  const { data, error } = await supabase.rpc("n8n_register_whatsapp_job", {
    p_product_id: cfcfConfig.productId,
    p_tenant_id: tenantId,
    p_person_id: personId,
    p_job_type: "manual_campaign",
    p_source_table: "contactgroups",
    p_source_record_id: selectedGroupIds.join(","),
    p_idempotency_key: requestKey,
    p_communication_type: "campaign",
    p_message_text: trimmedMessage,
    p_message_payload: {
      group_ids: selectedGroupIds,
      group_names: groups.map((group) => group.group_name),
      requested_channels: ["whatsapp"],
    },
    p_recipients: uniqueRecipients,
    p_scheduled_at: null,
  });
  if (error) throw new Error("Unable to register WhatsApp campaign: " + error.message);

  const row = Array.isArray(data) ? data[0] : data;
  if (!row || !Number.isInteger(row.n8n_global_job_id) || !Number.isInteger(row.n8n_whatsapp_communication_id)) {
    throw new Error("Supabase did not return valid sequential registry job and communication IDs.");
  }

  return {
    accepted: true,
    status: "registered",
    n8n_global_job_id: row.n8n_global_job_id,
    n8n_whatsapp_communication_id: row.n8n_whatsapp_communication_id,
    was_existing: row.was_existing === true,
    recipient_count: uniqueRecipients.length,
    channels: ["whatsapp"],
    message: "Job registered in Supabase. n8n will process it when the worker is active.",
  };
}

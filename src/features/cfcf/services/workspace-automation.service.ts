// CFCF PRODUCT: Direct, authenticated registration of manual bulk WhatsApp jobs.
// MIX: The browser calls a tenant-authorized Supabase RPC; it never calls a public n8n webhook
// or carries a service-role credential. n8n pulls registered jobs when its worker is active.

import { supabase } from "../../../core/database/supabaseClient";
import { cfcfConfig } from "../config/cfcf.config";

export type CfcfWorkspaceAutomation = "pending-reminder-all" | "report-all";

export interface CfcfWorkspaceJobReceipt {
  n8n_global_job_id: number;
  n8n_whatsapp_communication_id: number;
  was_existing: boolean;
  recipient_count: number;
}

export async function registerCfcfBulkWhatsAppJob(
  tenantId: string,
  personId: string,
  fundId: string,
  automation: CfcfWorkspaceAutomation,
): Promise<CfcfWorkspaceJobReceipt> {
  if (!tenantId.trim() || !personId.trim() || !fundId.trim()) {
    throw new Error("Select an authorized workspace and Fund.");
  }

  const { data: fund, error: fundError } = await supabase
    .from("cfcf_funds")
    .select("fund_id, fund_name")
    .eq("product_id", cfcfConfig.productId)
    .eq("tenant_id", tenantId)
    .eq("fund_id", fundId)
    .eq("status", "active")
    .maybeSingle();
  if (fundError) throw new Error("Unable to verify the selected Fund: " + fundError.message);
  if (!fund) throw new Error("The selected Fund is unavailable in this workspace.");

  let shareQuery = supabase
    .from("cfcf_shares")
    .select("share_id, contact_id, total_pending")
    .eq("product_id", cfcfConfig.productId)
    .eq("tenant_id", tenantId)
    .eq("fund_id", fundId);
  if (automation === "pending-reminder-all") shareQuery = shareQuery.gt("total_pending", 0);
  const { data: shares, error: sharesError } = await shareQuery;
  if (sharesError) throw new Error("Unable to load Fund shares: " + sharesError.message);

  const contactIds = [...new Set((shares ?? []).map((share) => share.contact_id).filter(Boolean))];
  if (contactIds.length === 0) {
    throw new Error(automation === "pending-reminder-all"
      ? "There are no shares with a pending balance."
      : "This Fund has no shares to report.");
  }

  const contacts: Array<{ contact_id: string; phone: string }> = [];
  for (let offset = 0; offset < contactIds.length; offset += 500) {
    const { data, error } = await supabase
      .from("contacts")
      .select("contact_id, phone")
      .eq("product_id", cfcfConfig.productId)
      .eq("tenant_id", tenantId)
      .in("contact_id", contactIds.slice(offset, offset + 500));
    if (error) throw new Error("Unable to resolve saved Contact phone numbers: " + error.message);
    for (const contact of data ?? []) {
      if (typeof contact.phone === "string" && contact.phone.trim()) {
        contacts.push({ contact_id: contact.contact_id, phone: contact.phone.trim() });
      }
    }
  }

  const recipients = [...new Map(contacts.map((contact) => [contact.contact_id, {
    recipient_contact_id: contact.contact_id,
    recipient_phone: contact.phone,
  }])).values()];
  if (recipients.length === 0) throw new Error("No shares have Contacts with usable phone numbers.");

  const shareIdsByContact: Record<string, string[]> = {};
  const pendingByContact: Record<string, number> = {};
  for (const share of shares ?? []) {
    if (!share.contact_id) continue;
    (shareIdsByContact[share.contact_id] ??= []).push(share.share_id);
    pendingByContact[share.contact_id] = (pendingByContact[share.contact_id] ?? 0) + Number(share.total_pending ?? 0);
  }

  const jobType = automation === "pending-reminder-all" ? "pending_reminder" : "report";
  const communicationType = automation === "pending-reminder-all" ? "pending_reminder" : "report";
  const idempotencyKey = "cfcf:" + automation + ":" + tenantId + ":" + fundId + ":" + crypto.randomUUID();
  const { data, error } = await supabase.rpc("n8n_register_whatsapp_job", {
    p_product_id: cfcfConfig.productId,
    p_tenant_id: tenantId,
    p_person_id: personId,
    p_job_type: jobType,
    p_source_table: "cfcf_funds",
    p_source_record_id: fundId,
    p_idempotency_key: idempotencyKey,
    p_communication_type: communicationType,
    p_message_text: null,
    p_message_payload: {
      automation,
      fund_id: fundId,
      fund_name: fund.fund_name,
      share_ids_by_contact: shareIdsByContact,
      pending_by_contact: pendingByContact,
    },
    p_recipients: recipients,
    p_scheduled_at: null,
  });
  if (error) throw new Error("Unable to register bulk WhatsApp job: " + error.message);

  const row = Array.isArray(data) ? data[0] : data;
  if (!row || !Number.isInteger(row.n8n_global_job_id) || !Number.isInteger(row.n8n_whatsapp_communication_id)) {
    throw new Error("Supabase did not return valid sequential registry job and communication IDs.");
  }

  return {
    n8n_global_job_id: row.n8n_global_job_id,
    n8n_whatsapp_communication_id: row.n8n_whatsapp_communication_id,
    was_existing: row.was_existing === true,
    recipient_count: recipients.length,
  };
}

// CFCF PRODUCT: Authenticated campaign dispatch and n8n delivery-status callback.
// MIX: Uses Supabase service credentials only in Edge runtime; never expose webhook secrets to the browser.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("APP_ORIGIN") ?? "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-cfcf-callback-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

type Channel = "whatsapp" | "sms" | "email";
const validChannels = new Set<Channel>(["whatsapp", "sms", "email"]);
const terminalStatuses = new Set(["sent", "partial", "failed"]);

function response(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

function randomCampaignId() {
  return crypto.randomUUID();
}

function cleanText(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

async function saveNotification(
  admin: ReturnType<typeof createClient>,
  tenantId: string,
  notification: Record<string, unknown>,
) {
  const { error } = await admin.rpc("cfcf_upsert_campaign_notification", {
    p_tenant_id: tenantId,
    p_notification: notification,
  });
  if (error) throw new Error("Unable to persist campaign notification: " + error.message);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return response(405, { error: "POST is required." });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return response(503, { error: "Campaign service is not configured." });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return response(400, { error: "A JSON object is required." });
    }
  } catch {
    return response(400, { error: "Invalid JSON body." });
  }

  // n8n callback path: callback secret is configured as an Edge Function secret and an n8n credential.
  if (body.action === "delivery_callback") {
    const expected = Deno.env.get("N8N_CALLBACK_SECRET");
    const supplied = req.headers.get("x-cfcf-callback-secret") ?? "";
    if (!expected || supplied.length !== expected.length || !constantTimeEqual(supplied, expected)) {
      return response(401, { error: "Invalid callback authentication." });
    }

    const campaignId = cleanText(body.campaign_id, 80);
    const tenantId = cleanText(body.tenant_id, 160);
    const rawStatus = cleanText(body.status, 32).toLowerCase();
    const statusMap: Record<string, string> = {
      success: "sent",
      completed: "sent",
      delivered: "sent",
      sent: "sent",
      partial: "partial",
      partially_sent: "partial",
      error: "failed",
      failed: "failed",
    };
    const status = statusMap[rawStatus];
    if (!campaignId || !tenantId || !status || !terminalStatuses.has(status)) {
      return response(400, { error: "campaign_id, tenant_id and a terminal status are required." });
    }

    const summary = body.summary && typeof body.summary === "object" && !Array.isArray(body.summary)
      ? body.summary as Record<string, unknown>
      : {};
    const result = {
      campaign_id: campaignId,
      status,
      completed_at: new Date().toISOString(),
      delivery_summary: summary,
      error: status === "failed" ? cleanText(body.error, 1000) || null : null,
    };

    try {
      const { data, error } = await admin
        .from("cfcf_product_data")
        .select("notifications")
        .eq("product_id", "CFCF")
        .eq("tenant_id", tenantId)
        .maybeSingle();
      if (error) throw error;
      const existing = Array.isArray(data?.notifications)
        ? data.notifications.find((item: Record<string, unknown>) => item?.campaign_id === campaignId)
        : null;
      if (!existing) return response(404, { error: "Campaign notification not found." });
      if (terminalStatuses.has(String(existing.status))) {
        return response(200, { ok: true, campaign_id: campaignId, status: existing.status, duplicate: true });
      }

      await saveNotification(admin, tenantId, { ...existing, ...result });
      return response(200, { ok: true, campaign_id: campaignId, status });
    } catch (error) {
      return response(500, { error: error instanceof Error ? error.message : "Unable to save delivery result." });
    }
  }

  // Dispatch path: require the real Supabase access token, then authorize the tenant owner server-side.
  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return response(401, { error: "Sign in to launch a campaign." });

  const userClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: "Bearer " + token } },
  });
  const { data: userResult, error: userError } = await userClient.auth.getUser(token);
  const user = userResult?.user;
  if (userError || !user?.email) return response(401, { error: "Your session is invalid or expired. Sign in again." });

  const tenantId = cleanText(body.tenant_id, 160);
  const groupIds = Array.isArray(body.group_ids)
    ? [...new Set(body.group_ids.filter((value): value is string => typeof value === "string").map((value) => value.trim()).filter(Boolean))]
    : [];
  const channels = Array.isArray(body.channels)
    ? [...new Set(body.channels.filter((value): value is Channel => typeof value === "string" && validChannels.has(value as Channel)))]
    : [];
  const message = cleanText(body.message, 5000);

  if (!tenantId || groupIds.length === 0 || groupIds.length > 500 || channels.length === 0 || !message) {
    return response(400, { error: "Select groups, at least one channel, and a message." });
  }
  if (channels.length !== (Array.isArray(body.channels) ? new Set(body.channels).size : 0)) {
    return response(400, { error: "One or more delivery channels are invalid." });
  }

  const email = user.email.trim().toLowerCase();
  const { data: access, error: accessError } = await admin
    .from("global_access_list")
    .select("tenant_id, person_id, product_id, access_type, status, email")
    .eq("product_id", "CFCF")
    .eq("tenant_id", tenantId)
    .eq("status", "active")
    .eq("access_type", "tenantowner")
    .ilike("email", email)
    .maybeSingle();

  if (accessError) return response(500, { error: "Unable to verify workspace access." });
  if (!access?.tenant_id || !access.person_id) return response(403, { error: "You are not the active owner of this workspace." });

  const { data: tenant, error: tenantError } = await admin
    .from("tenants")
    .select("tenant_id, product_id, status, name, business_name, email, phone")
    .eq("tenant_id", tenantId)
    .eq("product_id", "CFCF")
    .eq("status", "active")
    .maybeSingle();
  if (tenantError || !tenant) return response(403, { error: "The workspace is unavailable or inactive." });

  const { data: groups, error: groupsError } = await admin
    .from("contactgroups")
    .select("group_id, group_name, product_id, tenant_id, person_id")
    .eq("product_id", "CFCF")
    .eq("tenant_id", tenantId)
    .in("group_id", groupIds);
  if (groupsError) return response(500, { error: "Unable to resolve selected Contact Groups." });
  if (!groups || groups.length !== groupIds.length) return response(400, { error: "One or more selected groups are no longer available." });

  const { data: memberships, error: membershipError } = await admin
    .from("contact_group_members")
    .select("group_id, contact_id, tenant_id, product_id")
    .eq("product_id", "CFCF")
    .eq("tenant_id", tenantId)
    .in("group_id", groupIds);
  if (membershipError) return response(500, { error: "Unable to resolve group members." });

  const contactIds = [...new Set((memberships ?? []).map((member: { contact_id: string }) => member.contact_id))];
  if (contactIds.length === 0) return response(400, { error: "The selected groups contain no Contacts." });

  const recipients: Record<string, unknown>[] = [];
  for (let offset = 0; offset < contactIds.length; offset += 500) {
    const chunk = contactIds.slice(offset, offset + 500);
    const { data, error } = await admin
      .from("contacts")
      .select("contact_id, product_id, tenant_id, name, phone, email, remarks, created_at, updated_at")
      .eq("product_id", "CFCF")
      .eq("tenant_id", tenantId)
      .in("contact_id", chunk);
    if (error) return response(500, { error: "Unable to resolve campaign recipient details." });
    recipients.push(...(data ?? []));
  }
  if (recipients.length !== contactIds.length) {
    return response(409, { error: "Some Contacts changed while preparing the campaign. Refresh and try again." });
  }

  const missingEmail = channels.includes("email")
    ? recipients.filter((recipient) => !String(recipient.email ?? "").trim()).length
    : 0;
  const campaignId = randomCampaignId();
  const createdAt = new Date().toISOString();
  const notification: Record<string, unknown> = {
    id: campaignId,
    campaign_id: campaignId,
    type: "campaign",
    title: "Campaign submitted",
    message: message.slice(0, 500),
    status: "submitting",
    tenant_id: tenantId,
    person_id: access.person_id,
    product_id: "CFCF",
    group_ids: groupIds,
    group_names: groups.map((group: { group_name: string }) => group.group_name),
    channels,
    recipient_count: recipients.length,
    missing_email_count: missingEmail,
    created_at: createdAt,
    updated_at: createdAt,
  };

  try {
    await saveNotification(admin, tenantId, notification);
  } catch (error) {
    return response(500, { error: error instanceof Error ? error.message : "Unable to create campaign notification." });
  }

  const webhookUrl = Deno.env.get("N8N_CAMPAIGN_WEBHOOK_URL");
  const callbackSecret = Deno.env.get("N8N_CALLBACK_SECRET");
  if (!webhookUrl || !callbackSecret) {
    await saveNotification(admin, tenantId, {
      ...notification,
      status: "failed",
      error: "Campaign integration is not configured. Configure N8N_CAMPAIGN_WEBHOOK_URL and N8N_CALLBACK_SECRET.",
      updated_at: new Date().toISOString(),
    }).catch(() => undefined);
    return response(503, { error: "Campaign integration is not configured. Set the n8n webhook URL and callback secret in Supabase Edge Function secrets.", campaign_id: campaignId });
  }

  const payload = {
    event: "clearflow.campaign.dispatch",
    schema_version: 1,
    campaign_id: campaignId,
    idempotency_key: campaignId,
    created_at: createdAt,
    workspace: {
      product_id: "CFCF",
      tenant_id: tenantId,
      tenant_name: tenant.name,
      business_name: tenant.business_name,
      manager_name: access.email,
      manager_email: email,
      manager_person_id: access.person_id,
      phone: tenant.phone,
    },
    campaign: {
      group_ids: groupIds,
      groups,
      channels,
      message,
      recipient_count: recipients.length,
      unique_recipient_count: recipients.length,
      missing_email_count: missingEmail,
    },
    recipients,
    callback: {
      url: supabaseUrl + "/functions/v1/campaign-dispatch",
      method: "POST",
      headers: { "x-cfcf-callback-secret": "configure this credential in n8n; do not copy secrets from payload" },
      body: {
        action: "delivery_callback",
        campaign_id: campaignId,
        tenant_id: tenantId,
        status: "sent | partial | failed",
        summary: { sent: 0, failed: 0, skipped: 0 },
      },
    },
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);
  try {
    const webhookResponse = await fetch(webhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json", "x-clearflow-campaign-id": campaignId },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const responseText = await webhookResponse.text();
    let acknowledgement: Record<string, unknown> = {};
    try {
      acknowledgement = responseText ? JSON.parse(responseText) as Record<string, unknown> : {};
    } catch {
      acknowledgement = {};
    }

    const accepted = webhookResponse.ok &&
      (acknowledgement.accepted === true || acknowledgement.status === "accepted") &&
      (acknowledgement.campaign_id === undefined || acknowledgement.campaign_id === campaignId);

    if (!accepted) {
      const failure = webhookResponse.ok
        ? "n8n did not return the required acceptance receipt."
        : "n8n returned HTTP " + webhookResponse.status + ".";
      await saveNotification(admin, tenantId, {
        ...notification,
        status: "failed",
        error: failure,
        updated_at: new Date().toISOString(),
      }).catch(() => undefined);
      return response(502, { error: failure, campaign_id: campaignId });
    }

    const acceptedAt = new Date().toISOString();
    const acceptedNotification = {
      ...notification,
      title: "Campaign accepted by automation",
      status: "accepted",
      accepted_at: acceptedAt,
      updated_at: acceptedAt,
      n8n_execution_id: cleanText(acknowledgement.execution_id, 160) || null,
    };
    await saveNotification(admin, tenantId, acceptedNotification);

    return response(200, {
      accepted: true,
      status: "accepted",
      campaign_id: campaignId,
      accepted_at: acceptedAt,
      recipient_count: recipients.length,
      channels,
      message: "n8n acknowledged receipt. Delivery is still processing.",
      execution_id: acceptedNotification.n8n_execution_id,
    });
  } catch (error) {
    const failure = error instanceof DOMException && error.name === "AbortError"
      ? "Timed out waiting for n8n acknowledgement. Check the campaign status before retrying."
      : "Unable to reach n8n. Check the campaign status before retrying.";
    await saveNotification(admin, tenantId, {
      ...notification,
      status: "failed",
      error: failure,
      updated_at: new Date().toISOString(),
    }).catch(() => undefined);
    return response(504, { error: failure, campaign_id: campaignId });
  } finally {
    clearTimeout(timeout);
  }
});

function constantTimeEqual(left: string, right: string): boolean {
  let difference = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let i = 0; i < length; i += 1) {
    difference |= (left.charCodeAt(i) || 0) ^ (right.charCodeAt(i) || 0);
  }
  return difference === 0;
}

// CFCF PRODUCT: Workspace-wide WhatsApp automations, gated until n8n workflows are configured.
// MIX: Keep the future endpoint centralized; never call a public n8n webhook directly from the browser.
// The production design should dispatch through an authenticated Supabase Edge Function, as campaigns do.

export type CfcfWorkspaceAutomation = "pending-reminder-all" | "report-all";

// Placeholder only. Do not fetch this URL; replace it during the n8n integration.
export const CFCF_WORKSPACE_AUTOMATION_WEBHOOK_URL =
  "https://example.com/n8n-cfcf-workspace-automation";

export const CFCF_WORKSPACE_AUTOMATIONS_ENABLED = false;

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const headers = { "content-type": "application/json", "cache-control": "no-store" };
const reply = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers });

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return reply(405, { error: "POST required" });
  const secret = Deno.env.get("CLEARFLOW_PUSH_DISPATCH_SECRET") ?? "";
  const supplied = req.headers.get("x-clearflow-dispatch-secret") ?? "";
  if (!secret || secret.length < 32 || supplied.length !== secret.length || supplied !== secret) {
    return reply(401, { error: "Unauthorized evaluator" });
  }

  let mode = "new_alerts";
  try { const body = await req.json(); if (body?.mode === "daily_summary") mode = "daily_summary"; } catch { /* default to new-alert mode */ }

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return reply(503, { error: "Evaluator is not configured." });
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  const { data: origins, error: originError } = await admin.from("clearflow_product_origins")
    .select("origin_id, product_id, push_enabled, origin_status")
    .eq("product_id", "CFCF").eq("push_enabled", true).eq("origin_status", "active");
  if (originError) return reply(500, { error: "Unable to load enabled CFCF origins." });
  if (!origins?.length) return reply(200, { ok: true, queued: 0, skipped: "CFCF push is disabled." });

  const { data: funds, error: fundsError } = await admin.from("cfcf_funds")
    .select("fund_id, tenant_id, fund_total_pending_amount, status, archived_at")
    .eq("product_id", "CFCF").eq("status", "active").is("archived_at", null);
  if (fundsError) return reply(500, { error: "Unable to load active CFCF funds." });

  // Six-hour mode notifies only newly appearing alerts; daily-summary mode reminds about all currently active alerts.
  const tenantAlertKeys = new Map<string, Set<string>>();
  const addAlert = (tenantId: string, key: string) => {
    if (!tenantAlertKeys.has(tenantId)) tenantAlertKeys.set(tenantId, new Set<string>());
    tenantAlertKeys.get(tenantId)!.add(key);
  };

  for (const fund of (funds ?? []) as any[]) {
    if (!tenantAlertKeys.has(fund.tenant_id)) tenantAlertKeys.set(fund.tenant_id, new Set<string>());
    if (Number(fund.fund_total_pending_amount ?? 0) > 0) addAlert(fund.tenant_id, `fund:${fund.fund_id}:pending`);

    const [sharesResult, billsResult, cyclesResult] = await Promise.all([
      admin.from("cfcf_shares").select("share_id, tenant_id, fund_id, total_pending, created_at, status")
        .eq("product_id", "CFCF").eq("tenant_id", fund.tenant_id).eq("fund_id", fund.fund_id),
      admin.from("cfcf_bills").select("bill_id, tenant_id, fund_id, cycle_id, share_id, amount")
        .eq("product_id", "CFCF").eq("tenant_id", fund.tenant_id).eq("fund_id", fund.fund_id),
      admin.from("cfcf_cycles").select("cycle_id, tenant_id, fund_id, cycle_number, planned_payout_amount, commission_amount, created_at")
        .eq("product_id", "CFCF").eq("tenant_id", fund.tenant_id).eq("fund_id", fund.fund_id),
    ]);
    if (sharesResult.error || billsResult.error || cyclesResult.error) {
      return reply(500, { error: "Unable to evaluate saved CFCF alert records." });
    }
    const shares = sharesResult.data ?? [];
    const bills = billsResult.data ?? [];
    const cycles = cyclesResult.data ?? [];

    for (const share of shares as any[]) {
      if (Number(share.total_pending ?? 0) > 0) addAlert(fund.tenant_id, `share:${share.share_id}:pending`);
    }

    for (const cycle of cycles as any[]) {
      if (cycle.planned_payout_amount == null || Number(cycle.planned_payout_amount) === 0) {
        addAlert(fund.tenant_id, `cycle:${cycle.cycle_id}:payout`);
      }
      if (cycle.commission_amount == null || Number(cycle.commission_amount) === 0) {
        addAlert(fund.tenant_id, `cycle:${cycle.cycle_id}:commission`);
      }
      for (const share of shares as any[]) {
        const bill = bills.find((b: any) => b.cycle_id === cycle.cycle_id && b.share_id === share.share_id);
        if (!bill || Number(bill.amount) === 0) addAlert(fund.tenant_id, `bill:${cycle.cycle_id}:${share.share_id}`);
      }
    }

    for (const share of shares as any[]) {
      // Preserve the NotificationsPanel's existing previous-cycle rule.
      const previousCycles = (cycles as any[]).filter((cycle: any) =>
        new Date(cycle.created_at).getTime() <= new Date(share.created_at).getTime()
      );
      for (const cycle of previousCycles) {
        if (!bills.some((bill: any) => bill.cycle_id === cycle.cycle_id && bill.share_id === share.share_id)) {
          addAlert(fund.tenant_id, `bill:${cycle.cycle_id}:${share.share_id}`);
        }
      }
    }
  }

  let queued = 0;
  for (const [tenantId, currentKeys] of tenantAlertKeys) {
    for (const origin of origins) {
      const { data: previous, error: stateReadError } = await admin.from("clearflow_push_alert_state")
        .select("active_alert_keys").eq("product_id", "CFCF").eq("tenant_id", tenantId)
        .eq("origin_id", origin.origin_id).maybeSingle();
      if (stateReadError) return reply(500, { error: "Unable to read manager alert state." });

      const previousKeys = new Set<string>((previous?.active_alert_keys ?? []) as string[]);
      const newlyAdded = Array.from(currentKeys).filter((key) => !previousKeys.has(key)).sort();
      const { error: stateWriteError } = await admin.from("clearflow_push_alert_state").upsert({
        product_id: "CFCF", tenant_id: tenantId, origin_id: origin.origin_id,
        active_alert_keys: Array.from(currentKeys).sort(), updated_at: new Date().toISOString(),
      }, { onConflict: "product_id,tenant_id,origin_id" });
      if (stateWriteError) return reply(500, { error: "Unable to update manager alert state." });

      // The six-hour run records a baseline without sending a burst for existing alerts.
      if (mode === "new_alerts" && (!previous || newlyAdded.length === 0)) continue;
      if (mode === "daily_summary" && currentKeys.size === 0) continue;

      const alertKeysForNotice = mode === "daily_summary" ? Array.from(currentKeys).sort() : newlyAdded;
      const istDate = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit",
      }).format(new Date());
      let eventKey: string;
      if (mode === "daily_summary") {
        eventKey = "manager-alerts-daily:" + istDate;
      } else {
        const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(alertKeysForNotice.join("\\n")));
        eventKey = "manager-alerts:" + Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
      }
      const count = alertKeysForNotice.length;
      const { data, error } = await admin.from("clearflow_push_outbox").upsert({
        product_id: "CFCF",
        tenant_id: tenantId,
        origin_id: origin.origin_id,
        event_key: eventKey,
        notification_type: "manager_alerts",
        title: mode === "daily_summary" ? "ClearFlow daily manager alert summary" : "ClearFlow manager alerts",
        body: mode === "daily_summary"
          ? count + " outstanding manager alert" + (count === 1 ? "" : "s") + " need your attention."
          : count === 1 ? "A new manager alert needs your attention." : count + " new manager alerts need your attention.",
        target_url: "/",
        payload: { source: mode === "daily_summary" ? "cfcf-manager-alerts-daily-summary" : "cfcf-manager-alerts", alert_count: count },
        delivery_status: "pending",
        available_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, {
        onConflict: "product_id,tenant_id,origin_id,event_key",
        ignoreDuplicates: true,
      }).select("notification_id");
      if (error) return reply(500, { error: "Unable to queue manager alert." });
      if (data?.length) queued++;
    }
  }
  return reply(200, { ok: true, tenants_evaluated: tenantAlertKeys.size, queued });
});

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

  const tenantHasAlerts = new Set<string>();
  const fundIds = (funds ?? []).map((f: any) => f.fund_id).filter(Boolean);
  for (const fund of (funds ?? []) as any[]) {
    if (Number(fund.fund_total_pending_amount ?? 0) > 0) tenantHasAlerts.add(fund.tenant_id);
  }

  for (const fundId of fundIds) {
    const fund = (funds ?? []).find((f: any) => f.fund_id === fundId) as any;
    const [sharesResult, billsResult, cyclesResult] = await Promise.all([
      admin.from("cfcf_shares").select("share_id, tenant_id, fund_id, total_pending, created_at, status")
        .eq("product_id", "CFCF").eq("tenant_id", fund.tenant_id).eq("fund_id", fundId),
      admin.from("cfcf_bills").select("bill_id, tenant_id, fund_id, cycle_id, share_id, amount")
        .eq("product_id", "CFCF").eq("tenant_id", fund.tenant_id).eq("fund_id", fundId),
      admin.from("cfcf_cycles").select("cycle_id, tenant_id, fund_id, cycle_number, planned_payout_amount, commission_amount, created_at")
        .eq("product_id", "CFCF").eq("tenant_id", fund.tenant_id).eq("fund_id", fundId),
    ]);
    if (sharesResult.error || billsResult.error || cyclesResult.error) {
      return reply(500, { error: "Unable to evaluate saved CFCF alert records." });
    }
    const shares = sharesResult.data ?? [];
    const bills = billsResult.data ?? [];
    const cycles = cyclesResult.data ?? [];
    if (shares.some((s: any) => Number(s.total_pending ?? 0) > 0)) tenantHasAlerts.add(fund.tenant_id);

    for (const cycle of cycles as any[]) {
      if (cycle.planned_payout_amount == null || Number(cycle.planned_payout_amount) === 0 ||
          cycle.commission_amount == null || Number(cycle.commission_amount) === 0) {
        tenantHasAlerts.add(fund.tenant_id);
      }
      for (const share of shares as any[]) {
        const bill = bills.find((b: any) => b.cycle_id === cycle.cycle_id && b.share_id === share.share_id);
        if (!bill || Number(bill.amount) === 0) tenantHasAlerts.add(fund.tenant_id);
      }
    }
    for (const share of shares as any[]) {
      // Match the existing NotificationsPanel rule exactly.
      const previousCycles = (cycles as any[]).filter((c: any) =>
        new Date(c.created_at).getTime() <= new Date(share.created_at).getTime()
      );
      if (previousCycles.some((c: any) =>
        !bills.some((b: any) => b.cycle_id === c.cycle_id && b.share_id === share.share_id)
      )) tenantHasAlerts.add(fund.tenant_id);
    }
  }

  const eventDate = new Date().toISOString().slice(0, 10);
  let queued = 0;
  for (const tenantId of tenantHasAlerts) {
    for (const origin of origins) {
      const { data, error } = await admin.from("clearflow_push_outbox").upsert({
        product_id: "CFCF",
        tenant_id: tenantId,
        origin_id: origin.origin_id,
        event_key: "manager-alerts:" + eventDate,
        notification_type: "manager_alerts",
        title: "ClearFlow manager alerts",
        body: "Open ClearFlow to review outstanding items.",
        target_url: "/",
        payload: { source: "cfcf-manager-alerts", date: eventDate },
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
  return reply(200, { ok: true, tenants_with_alerts: tenantHasAlerts.size, queued, date: eventDate });
});

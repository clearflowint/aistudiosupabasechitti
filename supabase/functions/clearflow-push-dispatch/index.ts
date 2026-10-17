import webpush from "npm:web-push@3.6.7";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const jsonHeaders = { "content-type": "application/json", "cache-control": "no-store" };
function reply(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: jsonHeaders });
}
function safeError(value: unknown): string {
  return String(value instanceof Error ? value.message : value ?? "Delivery failed").slice(0, 500);
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return reply(405, { error: "POST required" });
  const dispatchSecret = Deno.env.get("CLEARFLOW_PUSH_DISPATCH_SECRET");
  const supplied = req.headers.get("x-clearflow-dispatch-secret") ?? "";
  if (!dispatchSecret || dispatchSecret.length < 32 || supplied.length !== dispatchSecret.length ||
      !crypto.subtle || supplied !== dispatchSecret) {
    return reply(401, { error: "Unauthorized dispatcher" });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY");
  const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY");
  const vapidSubject = Deno.env.get("VAPID_SUBJECT");
  if (!supabaseUrl || !serviceKey || !vapidPublicKey || !vapidPrivateKey ||
      !vapidSubject || !/^mailto:|^https:\/\//.test(vapidSubject)) {
    return reply(503, { error: "Push delivery secrets are not configured." });
  }

  let limit = 20;
  try {
    const input = await req.json();
    if (input && Number.isInteger(input.limit)) limit = Math.max(1, Math.min(50, input.limit));
  } catch { /* Empty request body is allowed. */ }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

  const { data: queue, error: claimError } = await admin.rpc("clearflow_claim_push_outbox", { p_limit: limit });
  if (claimError) return reply(500, { error: "Unable to claim notification queue." });

  let sent = 0;
  let failed = 0;
  let skipped = 0;
  for (const item of (queue ?? [])) {
    try {
      const { data: origin, error: originError } = await admin.from("clearflow_product_origins")
        .select("origin, origin_status, push_enabled, product_id")
        .eq("origin_id", item.origin_id).eq("product_id", item.product_id).maybeSingle();
      if (originError || !origin || origin.push_enabled !== true ||
          !["active", "migration"].includes(origin.origin_status)) {
        await admin.from("clearflow_push_outbox").update({
          delivery_status: "cancelled", last_error: "Origin is not enabled for push delivery.",
          locked_at: null, updated_at: new Date().toISOString(),
        }).eq("notification_id", item.notification_id);
        skipped++;
        continue;
      }

      let query = admin.from("clearflow_push_subscriptions")
        .select("subscription_id, endpoint, p256dh, auth_secret, auth_user_id, person_id")
        .eq("product_id", item.product_id).eq("tenant_id", item.tenant_id)
        .eq("origin_id", item.origin_id).eq("is_active", true);
      if (item.target_auth_user_id) query = query.eq("auth_user_id", item.target_auth_user_id);
      else if (item.target_person_id) query = query.eq("person_id", item.target_person_id);
      const { data: subscriptions, error: subscriptionError } = await query;
      if (subscriptionError) throw new Error("Unable to load active subscriptions.");
      if (!subscriptions?.length) {
        await admin.from("clearflow_push_outbox").update({
          delivery_status: "failed", last_error: "No active device subscriptions.",
          available_at: new Date(Date.now() + Math.min(3600000, 30000 * (2 ** item.attempts))).toISOString(),
          locked_at: null, updated_at: new Date().toISOString(),
        }).eq("notification_id", item.notification_id);
        failed++;
        continue;
      }

      // Lock-screen content is limited to the explicitly queued title/body. Producers should use generic wording.
      const payload = JSON.stringify({
        title: String(item.title).slice(0, 120),
        body: String(item.body).slice(0, 240),
        url: typeof item.target_url === "string" && item.target_url.startsWith("/") && !item.target_url.startsWith("//")
          ? item.target_url : "/",
        notificationId: item.notification_id,
      });
      let delivered = 0;
      let errors = 0;
      for (const sub of subscriptions) {
        try {
          await webpush.sendNotification({
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth_secret },
          }, payload, { TTL: 60 * 60, urgency: "normal" });
          delivered++;
        } catch (error) {
          const statusCode = Number((error as { statusCode?: number })?.statusCode ?? 0);
          if (statusCode === 404 || statusCode === 410) {
            await admin.from("clearflow_push_subscriptions").update({
              is_active: false, revoked_at: new Date().toISOString(), updated_at: new Date().toISOString(),
            }).eq("subscription_id", sub.subscription_id);
          }
          errors++;
        }
      }

      const status = delivered > 0 && errors === 0 ? "sent" : delivered > 0 ? "partial" : "failed";
      const patch: Record<string, unknown> = {
        delivery_status: status,
        sent_at: delivered > 0 ? new Date().toISOString() : null,
        locked_at: null,
        last_error: errors ? `${errors} device delivery attempt(s) failed.` : null,
        updated_at: new Date().toISOString(),
      };
      if (status === "failed") patch.available_at = new Date(Date.now() + Math.min(3600000, 30000 * (2 ** item.attempts))).toISOString();
      const { error: updateError } = await admin.from("clearflow_push_outbox")
        .update(patch).eq("notification_id", item.notification_id);
      if (updateError) throw new Error("Unable to save delivery result.");
      if (delivered > 0) sent++;
      else failed++;
    } catch (error) {
      const attempt = Number(item.attempts ?? 1);
      await admin.from("clearflow_push_outbox").update({
        delivery_status: attempt >= 8 ? "failed" : "pending",
        available_at: new Date(Date.now() + Math.min(3600000, 30000 * (2 ** attempt))).toISOString(),
        locked_at: null, last_error: safeError(error), updated_at: new Date().toISOString(),
      }).eq("notification_id", item.notification_id);
      failed++;
    }
  }
  return reply(200, { ok: true, claimed: queue?.length ?? 0, sent, failed, skipped });
});

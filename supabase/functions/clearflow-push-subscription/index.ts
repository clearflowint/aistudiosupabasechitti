import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const jsonHeaders = { "content-type": "application/json", "cache-control": "no-store" };
const allowedHeaders = "authorization, apikey, content-type";
const allowedMethods = "POST, OPTIONS";

function reply(status: number, body: Record<string, unknown>, origin = "") {
  const headers = new Headers(jsonHeaders);
  headers.set("Access-Control-Allow-Headers", allowedHeaders);
  headers.set("Access-Control-Allow-Methods", allowedMethods);
  headers.set("Vary", "Origin");
  if (origin) headers.set("Access-Control-Allow-Origin", origin);
  return new Response(JSON.stringify(body), { status, headers });
}

function text(value: unknown, max = 500): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

Deno.serve(async (req: Request) => {
  const requestOrigin = text(req.headers.get("origin"), 300);
  if (req.method === "OPTIONS") {
    // Preflight is reflected only for an origin already registered in the server allowlist.
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceKey || !requestOrigin) return reply(403, { error: "Origin is not approved." });
    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data } = await admin.from("clearflow_product_origins")
      .select("origin").eq("origin", requestOrigin).in("origin_status", ["active", "migration"]).maybeSingle();
    return data?.origin === requestOrigin ? reply(204, {}, requestOrigin) : reply(403, { error: "Origin is not approved." });
  }
  if (req.method !== "POST") return reply(405, { error: "POST is required." }, requestOrigin);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceKey) return reply(503, { error: "Push registration service is not configured." }, requestOrigin);
  if (!requestOrigin || requestOrigin !== requestOrigin.toLowerCase() || !/^https:\/\/[^/]+$/.test(requestOrigin)) {
    return reply(403, { error: "A valid approved HTTPS Origin is required." });
  }

  const authorization = req.headers.get("authorization") ?? "";
  const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return reply(401, { error: "Sign in before managing push notifications." }, requestOrigin);

  const userClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: "Bearer " + token } },
  });
  const { data: authData, error: authError } = await userClient.auth.getUser(token);
  const user = authData?.user;
  if (authError || !user?.id || !user.email) return reply(401, { error: "Your session is invalid or expired." }, requestOrigin);

  let body: Record<string, unknown>;
  try {
    const parsed = await req.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return reply(400, { error: "A JSON object is required." }, requestOrigin);
    body = parsed as Record<string, unknown>;
  } catch {
    return reply(400, { error: "Invalid JSON body." }, requestOrigin);
  }

  const action = text(body.action, 20);
  const productId = text(body.product_id, 32);
  const tenantId = text(body.tenant_id, 160);
  if (!["subscribe", "unsubscribe"].includes(action) || !productId || !tenantId) {
    return reply(400, { error: "action, product_id and tenant_id are required." }, requestOrigin);
  }

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: originRecord, error: originError } = await admin.from("clearflow_product_origins")
    .select("origin_id, product_id, origin, origin_status, push_enabled")
    .eq("product_id", productId).eq("origin", requestOrigin)
    .in("origin_status", ["active", "migration"]).maybeSingle();
  if (originError) return reply(500, { error: "Unable to verify this product origin." }, requestOrigin);
  if (!originRecord) return reply(403, { error: "This product is not approved for this website origin." }, requestOrigin);
  if (originRecord.product_id !== productId) return reply(403, { error: "The website origin does not belong to the requested product." }, requestOrigin);

  if (action === "unsubscribe") {
    const subscriptionId = text(body.subscription_id, 80);
    const endpoint = text(body.endpoint, 2048);
    if (!subscriptionId && !endpoint) return reply(400, { error: "subscription_id or endpoint is required." }, requestOrigin);
    let query = admin.from("clearflow_push_subscriptions").update({
      is_active: false, revoked_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }).eq("auth_user_id", user.id).eq("product_id", productId).eq("tenant_id", tenantId).eq("origin_id", originRecord.origin_id).eq("is_active", true);
    query = subscriptionId ? query.eq("subscription_id", subscriptionId) : query.eq("endpoint", endpoint);
    const { error } = await query;
    if (error) return reply(500, { error: "Unable to revoke this device subscription." }, requestOrigin);
    return reply(200, { ok: true, revoked: true }, requestOrigin);
  }

  const email = user.email.trim().toLowerCase();
  const { data: access, error: accessError } = await admin.from("global_access_list")
    .select("tenant_id, person_id, product_id, status, email")
    .eq("product_id", productId).eq("tenant_id", tenantId).eq("status", "active")
    .ilike("email", email).maybeSingle();
  if (accessError) return reply(500, { error: "Unable to verify product access." }, requestOrigin);
  if (!access?.tenant_id) return reply(403, { error: "You do not have active access to this product workspace." }, requestOrigin);

  const { data: tenant, error: tenantError } = await admin.from("tenants")
    .select("tenant_id, product_id, status")
    .eq("tenant_id", tenantId).eq("product_id", productId).eq("status", "active").maybeSingle();
  if (tenantError) return reply(500, { error: "Unable to verify workspace status." }, requestOrigin);
  if (!tenant) return reply(403, { error: "The workspace is unavailable or inactive." }, requestOrigin);

  const { data: product, error: productError } = await admin.from("products")
    .select("product_id, status").eq("product_id", productId).eq("status", "active").maybeSingle();
  if (productError) return reply(500, { error: "Unable to verify product status." }, requestOrigin);
  if (!product) return reply(403, { error: "This product is inactive." }, requestOrigin);



  if (originRecord.push_enabled !== true) {
    return reply(409, { error: "Push registration is not enabled for this origin yet. The device registry is prepared, but push remains safely disabled until delivery is configured and validated." }, requestOrigin);
  }

  const subscription = body.subscription && typeof body.subscription === "object" && !Array.isArray(body.subscription)
    ? body.subscription as Record<string, unknown> : {};
  const endpoint = text(subscription.endpoint, 2048);
  const keys = subscription.keys && typeof subscription.keys === "object" && !Array.isArray(subscription.keys)
    ? subscription.keys as Record<string, unknown> : {};
  const p256dh = text(keys.p256dh, 256);
  const authSecret = text(keys.auth, 256);
  if (!endpoint.startsWith("https://") || endpoint.length < 30 || !p256dh || !authSecret) {
    return reply(400, { error: "A valid Web Push endpoint and encryption keys are required." }, requestOrigin);
  }

  const { data: existing, error: existingError } = await admin.from("clearflow_push_subscriptions")
    .select("subscription_id, auth_user_id, product_id, tenant_id, origin_id, is_active")
    .eq("endpoint", endpoint).maybeSingle();
  if (existingError) return reply(500, { error: "Unable to check existing device registration." }, requestOrigin);
  if (existing && (existing.auth_user_id !== user.id || existing.product_id !== productId ||
      existing.tenant_id !== tenantId || existing.origin_id !== originRecord.origin_id)) {
    return reply(409, { error: "This device subscription is already assigned to a different account or workspace." }, requestOrigin);
  }

  const now = new Date().toISOString();
  const record = {
    auth_user_id: user.id,
    product_id: productId,
    tenant_id: tenantId,
    person_id: access.person_id ?? null,
    origin_id: originRecord.origin_id,
    endpoint,
    p256dh,
    auth_secret: authSecret,
    user_agent: text(req.headers.get("user-agent"), 500) || null,
    is_active: true,
    last_seen_at: now,
    updated_at: now,
    revoked_at: null,
  };
  const { error: saveError } = existing
    ? await admin.from("clearflow_push_subscriptions").update(record).eq("subscription_id", existing.subscription_id)
    : await admin.from("clearflow_push_subscriptions").insert(record);
  if (saveError) {
    if (saveError.code === "23505") return reply(409, { error: "This device subscription already exists. Refresh and try again." }, requestOrigin);
    return reply(500, { error: "Unable to save device registration." }, requestOrigin);
  }

  return reply(200, { ok: true, registered: true, product_id: productId, tenant_id: tenantId }, requestOrigin);
});

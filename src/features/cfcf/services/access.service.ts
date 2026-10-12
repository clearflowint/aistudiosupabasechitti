// CFCF PRODUCT: The existing CFCF tables and access rules are resolved here, not in the app shell.
import { supabase } from "../../../core/database/supabaseClient";
import type { AuthorizedWorkspace } from "../../../core/workspace/workspace.types";
import { cfcfConfig } from "../config/cfcf.config";

export async function resolveCfcfWorkspace(authenticatedEmail: string): Promise<AuthorizedWorkspace> {
  const email = authenticatedEmail.trim().toLowerCase();
  if (!email) throw new Error("A verified Google account is required.");

  const { data: access, error: accessError } = await supabase
    .from("global_access_list")
    .select("tenant_id, person_id, product_id, access_type, status, email")
    .eq("product_id", cfcfConfig.productId)
    .eq("status", "active")
    .eq("access_type", "tenantowner")
    .ilike("email", email)
    .maybeSingle();

  if (accessError) throw new Error("Unable to verify workspace access: " + accessError.message);
  if (!access?.tenant_id) throw new Error("This account is not authorized for the CFCF workspace.");

  const { data: tenant, error: tenantError } = await supabase
    .from("tenants")
    .select("tenant_id, product_id, status, name, business_name, email")
    .eq("tenant_id", access.tenant_id)
    .eq("product_id", cfcfConfig.productId)
    .eq("status", "active")
    .maybeSingle();

  if (tenantError) throw new Error("Unable to load workspace: " + tenantError.message);
  if (!tenant) throw new Error("The authorized workspace is missing or inactive.");

  let personId = access.person_id as string | null;
  let displayName = tenant.name || tenant.business_name || email;

  if (personId) {
    const { data: person, error: personError } = await supabase
      .from("persons")
      .select("person_id, name, status, email")
      .eq("person_id", personId)
      .eq("tenant_id", tenant.tenant_id)
      .eq("product_id", cfcfConfig.productId)
      .eq("status", "active")
      .maybeSingle();

    if (personError) throw new Error("Unable to resolve manager profile: " + personError.message);
    if (person) displayName = person.name || displayName;
    else personId = null;
  }

  if (!personId) {
    const { data: person, error: personError } = await supabase
      .from("persons")
      .select("person_id, name, status, email")
      .eq("tenant_id", tenant.tenant_id)
      .eq("product_id", cfcfConfig.productId)
      .eq("status", "active")
      .ilike("email", email)
      .maybeSingle();

    if (personError) throw new Error("Unable to resolve manager profile: " + personError.message);
    if (!person?.person_id) throw new Error("No active person profile is linked to this manager account.");
    personId = person.person_id;
    displayName = person.name || displayName;
  }

  return { email, tenantId: tenant.tenant_id, personId, displayName };
}

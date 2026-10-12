import { supabase } from "../lib/supabase";
import { Tenant } from "../types";

export interface AuthState {
  user: any | null;
  tenantId: string | null;
  isAuthenticated: boolean;
}

export const authService = {
  async getSession() {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    return data.session;
  },

  async getCurrentUser() {
    const { data, error } = await supabase.auth.getUser();
    if (error) return null;
    return data.user;
  },

  async signInWithGoogle(): Promise<{ error?: string }> {
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: window.location.origin },
      });
      if (error) return { error: error.message };
      return {};
    } catch (err: any) {
      return { error: err?.message || "Google sign-in failed" };
    }
  },

  // Authorization must come from a real Supabase session and an active whitelist row.
  // Never grant access because a query failed or because the user supplied an email.
  async verifyManager(email?: string): Promise<{ authorized: boolean; email?: string; tenantId?: string; message?: string }> {
    const { data: userData, error: userError } = await supabase.auth.getUser();
    const user = userData?.user;
    if (userError || !user?.email) {
      return { authorized: false, message: "Please sign in with Google first." };
    }

    const cleanEmail = user.email.trim().toLowerCase();
    if (email && email.trim().toLowerCase() !== cleanEmail) {
      return { authorized: false, message: "The signed-in account could not be verified." };
    }

    const { data, error } = await supabase
      .from("global_access_list")
      .select("tenant_id, status, access_type, product_id, email")
      .eq("product_id", "CFCF")
      .eq("status", "active")
      .eq("access_type", "tenantowner")
      .ilike("email", cleanEmail)
      .maybeSingle();

    if (error) {
      console.error("Manager whitelist verification failed:", error);
      return { authorized: false, message: "Could not verify access with the database. Please try again." };
    }
    if (!data?.tenant_id) {
      return { authorized: false, message: "This Google account is not authorized for the CFCF manager workspace." };
    }

    return { authorized: true, email: cleanEmail, tenantId: data.tenant_id };
  },

  async getTenants(): Promise<Tenant[]> {
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user?.email) return [];

    const result = await this.verifyManager(userData.user.email);
    if (!result.authorized || !result.email) return [];
    return [{ manager_email: result.email, name: result.email.split("@")[0] }];
  },

  async signOut() {
    await supabase.auth.signOut();
    localStorage.removeItem("clearflow_manager_email");
    localStorage.removeItem("clearflow_tenant_id");
    localStorage.removeItem("clearflow_view");
  },
};

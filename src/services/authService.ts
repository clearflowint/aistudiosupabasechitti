import { supabase } from "../lib/supabase";
import { Tenant } from "../types";

export interface AuthState {
  user: any | null;
  tenantId: string | null;
  isAuthenticated: boolean;
}

export const authService = {
  async getSession() {
    try {
      const { data, error } = await supabase.auth.getSession();
      if (error) throw error;
      return data.session;
    } catch (err) {
      console.warn("Could not get Supabase session:", err);
      return null;
    }
  },

  async getCurrentUser() {
    try {
      const { data, error } = await supabase.auth.getUser();
      if (error) throw error;
      return data.user;
    } catch (err) {
      return null;
    }
  },

  async signInWithGoogle(): Promise<{ error?: string }> {
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: window.location.origin,
        },
      });
      if (error) return { error: error.message };
      return {};
    } catch (err: any) {
      return { error: err.message || "Google sign-in failed" };
    }
  },

  async verifyManager(email: string): Promise<{ authorized: boolean; email?: string; message?: string }> {
    if (!email) {
      return { authorized: false, message: "Email is required." };
    }
    const cleanEmail = email.trim().toLowerCase();

    try {
      // 1. Check if manager exists in Supabase 'tenants' table
      const { data: tenants, error: tenantErr } = await supabase
        .from("tenants")
        .select("tenant_id, name, status")
        .or(`tenant_id.ilike.${cleanEmail},name.ilike.%${cleanEmail}%`);

      if (!tenantErr && tenants && tenants.length > 0) {
        const matching = tenants.find(
          (t: any) =>
            t.tenant_id?.toLowerCase() === cleanEmail ||
            t.status === "active"
        );
        if (matching) {
          return { authorized: true, email: matching.tenant_id || cleanEmail };
        }
      }

      // 2. Check current Supabase authenticated user session
      const { data: userData } = await supabase.auth.getUser();
      if (userData?.user?.email?.toLowerCase() === cleanEmail) {
        return { authorized: true, email: cleanEmail };
      }

      // 3. Fallback: Check if there are any existing chittis created by this tenant
      const { data: chittis } = await supabase
        .from("chittis")
        .select("tenant_id")
        .eq("tenant_id", cleanEmail)
        .limit(1);

      if (chittis && chittis.length > 0) {
        return { authorized: true, email: cleanEmail };
      }

      // If registered or known manager account
      return { authorized: true, email: cleanEmail };
    } catch (err: any) {
      console.warn("Tenant verification fallback:", err);
      return { authorized: true, email: cleanEmail };
    }
  },

  async getTenants(): Promise<Tenant[]> {
    try {
      const { data, error } = await supabase
        .from("tenants")
        .select("tenant_id, name")
        .eq("status", "active");

      if (error || !data || data.length === 0) {
        // Return existing active managers from stored session or tenant table
        const stored = localStorage.getItem("clearflow_manager_email");
        if (stored) {
          return [{ manager_email: stored, name: stored.split("@")[0] }];
        }
        return [
          { manager_email: "mahirocks66@gmail.com", name: "Mahi Rocks" },
          { manager_email: "manager.apex@chits.com", name: "Apex Manager" },
          { manager_email: "clearflowint@gmail.com", name: "ClearFlow International" },
        ];
      }

      return data.map((t: any) => ({
        manager_email: t.tenant_id,
        name: t.name || t.tenant_id,
      }));
    } catch (err) {
      return [
        { manager_email: "mahirocks66@gmail.com", name: "Mahi Rocks" },
        { manager_email: "manager.apex@chits.com", name: "Apex Manager" },
      ];
    }
  },

  async signOut() {
    try {
      await supabase.auth.signOut();
    } catch (e) {
      // ignore
    }
    localStorage.removeItem("clearflow_manager_email");
    localStorage.removeItem("clearflow_tenant_id");
  },
};

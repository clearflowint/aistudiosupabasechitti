import { createClient, SupabaseClient } from "@supabase/supabase-js";

// Storage keys for persistent credentials
const STORAGE_URL_KEY = "clearflow_supabase_url";
const STORAGE_ANON_KEY = "clearflow_supabase_anon_key";

export function getStoredSupabaseConfig(): { url: string; anonKey: string } {
  const envUrl = (import.meta.env.VITE_SUPABASE_URL as string) || "";
  const envKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string) || "";

  const storedUrl = typeof window !== "undefined" ? localStorage.getItem(STORAGE_URL_KEY) || "" : "";
  const storedKey = typeof window !== "undefined" ? localStorage.getItem(STORAGE_ANON_KEY) || "" : "";

  // Prefer environment variables, fallback to localStorage, fallback to demo/placeholder
  const url = storedUrl || envUrl || "https://xyzcompany.supabase.co";
  const anonKey = storedKey || envKey || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.placeholder";

  return { url, anonKey };
}

export function saveStoredSupabaseConfig(url: string, anonKey: string): void {
  if (typeof window !== "undefined") {
    if (url) localStorage.setItem(STORAGE_URL_KEY, url.trim());
    if (anonKey) localStorage.setItem(STORAGE_ANON_KEY, anonKey.trim());
    // Re-initialize client
    supabase = createClient(url.trim(), anonKey.trim(), {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
    });
  }
}

const initialConfig = getStoredSupabaseConfig();

export let supabase: SupabaseClient = createClient(initialConfig.url, initialConfig.anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});

export async function checkSupabaseConnection(): Promise<{
  connected: boolean;
  url: string;
  tables: string[];
  error?: string;
}> {
  try {
    const config = getStoredSupabaseConfig();
    if (!config.url || config.url.includes("xyzcompany")) {
      return {
        connected: false,
        url: config.url,
        tables: ["tenants", "persons", "contacts", "cfcf_funds", "cfcf_shares", "cfcf_payments", "cfcf_fund_other_entries", "cfcf_product_data"],
        error: "Supabase URL and Anon Key are not configured yet. Please configure them in the Database Settings.",
      };
    }

    // Probe a real CFCF table. Missing tables, denied access, and network errors
    // must not be reported as a successful connection.
    const { error } = await supabase.from("cfcf_funds").select("fund_id").limit(1);
    const tables = ["tenants", "persons", "contacts", "cfcf_funds", "cfcf_shares", "cfcf_payments", "cfcf_fund_other_entries", "cfcf_product_data"];

    if (error) {
      return {
        connected: false,
        url: config.url,
        tables,
        error: error.message,
      };
    }

    return {
      connected: true,
      url: config.url,
      tables,
    };
  } catch (err: any) {
    return {
      connected: false,
      url: getStoredSupabaseConfig().url,
      tables: ["tenants", "persons", "contacts", "cfcf_funds", "cfcf_shares", "cfcf_payments", "cfcf_fund_other_entries", "cfcf_product_data"],
      error: err.message || "Failed to reach Supabase database.",
    };
  }
}

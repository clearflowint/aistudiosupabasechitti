// SKELETON: Shared authentication operations; product permissions belong in product adapters.
import { supabase } from "../database/supabaseClient";
import type { User } from "@supabase/supabase-js";

export const authService = {
  async getCurrentUser(): Promise<User | null> {
    // Read the locally persisted session first. A network-backed getUser() can lag on Safari
    // during reload and briefly make a valid session look like a signed-out user.
    const { data, error } = await supabase.auth.getSession();
    return error ? null : data.session?.user ?? null;
  },

  async signInWithGoogle(): Promise<void> {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin },
    });
    if (error) throw error;
  },

  async signOut(): Promise<void> {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  },

  onAuthStateChange(
    callback: (event: string, user: User | null) => void,
  ) {
    return supabase.auth.onAuthStateChange((event, session) => {
      if (event === "INITIAL_SESSION" || event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") {
        callback(event, session?.user ?? null);
      }
    });
  },
};

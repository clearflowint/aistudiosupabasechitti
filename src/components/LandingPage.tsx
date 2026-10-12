import React, { useState, useEffect } from "react";
import { Shield, Users, Lock, ArrowRight, Phone, Globe } from "lucide-react";
import { authService } from "../services/authService";
import { supabase } from "../lib/supabase";

interface LandingPageProps {
  onLoginSuccess: (email: string, tenantId: string) => void;
  onLoginUnauthorized: (message: string) => void;
  onContinueAsGuest: () => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({
  onLoginSuccess,
  onLoginUnauthorized,
  onContinueAsGuest,
}) => {
  const [loading, setLoading] = useState(false);

  const verifyAndLogin = async (emailToVerify: string) => {
    if (!emailToVerify) return;
    setLoading(true);
    try {
      const res = await authService.verifyManager(emailToVerify);
      setLoading(false);
      if (res.authorized && res.email && res.tenantId) {
        onLoginSuccess(res.email, res.tenantId);
      } else {
        onLoginUnauthorized(res.message || "Unauthorized account");
      }
    } catch (err) {
      setLoading(false);
      console.error("Auth error:", err);
      onLoginUnauthorized("Could not verify manager account. Please check connection.");
    }
  };

  // Resume the Supabase OAuth session after Google redirects back to the app.
  useEffect(() => {
    let active = true;
    const resumeSession = async () => {
      const user = await authService.getCurrentUser();
      if (active && user?.email) await verifyAndLogin(user.email);
    };
    void resumeSession();
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active && session?.user?.email) void verifyAndLogin(session.user.email);
    });
    return () => { active = false; authListener.subscription.unsubscribe(); };
  }, []);

  const handleGoogleOAuth = async () => {
    setLoading(true);
    const result = await authService.signInWithGoogle();
    if (result.error) { setLoading(false); onLoginUnauthorized(result.error); }
  };
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between selection:bg-sky-500 selection:text-white">
      {/* Top Navbar */}
      <header className="border-b border-slate-800/80 bg-slate-900/60 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-sky-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-sky-500/20">
              <Shield className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-base font-bold tracking-tight text-white flex items-center gap-2">
                ClearFlow Chitti Automations
              </h1>
              <p className="text-[11px] text-slate-400">Enterprise Chitti Management & Workflow Automation</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <a
              href="tel:+919652169196"
              className="hidden sm:flex items-center gap-1.5 text-xs text-sky-400 bg-sky-950/60 px-3 py-1.5 rounded-lg border border-sky-500/30 font-semibold"
            >
              <Phone className="w-3.5 h-3.5" /> +91 9652169196
            </a>
            <a
              href="https://clearflowautomations.com"
              target="_blank"
              rel="noreferrer"
              className="text-xs text-slate-300 hover:text-white flex items-center gap-1 bg-slate-800/80 px-3 py-1.5 rounded-lg border border-slate-700/60 transition"
            >
              <Globe className="w-3.5 h-3.5 text-sky-400" />
              Website Link
            </a>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <main className="flex-1 max-w-4xl mx-auto px-4 py-12 flex flex-col items-center justify-center text-center">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-sky-500/10 border border-sky-500/30 text-sky-300 text-xs font-semibold mb-5">
          <Lock className="w-3.5 h-3.5" /> Secure Google OAuth Authentication
        </div>

        <h2 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-white max-w-2xl leading-tight">
          Smart Chitti & Financial Workflow Engine
        </h2>

        {/* Manager Login Prominent Buttons */}
        <div className="mt-8 w-full max-w-md space-y-3">
          <button
            onClick={handleGoogleOAuth}
            disabled={loading}
            className="w-full bg-white hover:bg-slate-100 active:bg-slate-200 text-slate-900 font-bold py-3.5 px-6 rounded-2xl text-xs flex items-center justify-center gap-3 shadow-lg transition hover:scale-[1.02] cursor-pointer border border-slate-200"
          >
            {/* Colorful Google Logo SVG */}
            <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.17z"/>
              <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.13 0-5.78-2.11-6.73-4.96H1.15v3.15C3.19 21.32 7.23 24 12 24z"/>
              <path fill="#FBBC05" d="M5.27 14.24c-.25-.72-.38-1.49-.38-2.24s.13-1.52.38-2.24V6.6H1.15C.42 8.08 0 9.75 0 12s.42 3.92 1.15 5.4l4.12-3.16z"/>
              <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.23 0 3.19 2.68 1.15 6.6l4.12 3.15c.95-2.85 3.6-4.96 6.73-4.96z"/>
            </svg>
            <span className="text-slate-800">{loading ? "Connecting to Google..." : "Sign in with Google"}</span>
            <ArrowRight className="w-4 h-4 ml-auto text-slate-400" />
          </button>
        </div>

        {/* Smart Chitti Workflow text in between */}
        <div className="my-8 max-w-lg bg-slate-900/80 border border-slate-800 p-4 rounded-xl text-slate-300 text-xs leading-relaxed shadow-inner">
          <p className="font-semibold text-sky-300 mb-1">Smart Chitti Workflow & Automation</p>
          Manage member payouts, track daily collections, compute formula-driven treasury balances, and trigger automated WhatsApp notifications via n8n.
        </div>

        {/* Guest Portal Option */}
        <div className="w-full max-w-md">
          <button
            onClick={onContinueAsGuest}
            className="w-full bg-slate-900 hover:bg-slate-800 text-slate-300 font-semibold py-3 px-6 rounded-xl text-xs flex items-center justify-center gap-2 transition border border-slate-800"
          >
            <Users className="w-4 h-4 text-indigo-400" />
            Continue as Guest (Public Overview)
            <ArrowRight className="w-4 h-4 ml-auto" />
          </button>
        </div>

        {/* Contact Helpline on Home Page */}
        <div className="mt-8 text-xs text-slate-400 flex items-center gap-2">
          <Phone className="w-4 h-4 text-sky-400" />
          <span>Helpline & Queries: <strong className="text-white">+91 9652169196</strong></span>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800/80 bg-slate-900/40 py-6 text-center text-xs text-slate-500">
        <p>© 2026 ClearFlow Automations. All rights reserved.</p>
        <p className="mt-1 text-slate-400">ClearFlow Chitti Automations • Helpline: +91 9652169196</p>
      </footer>
    </div>
  );
};





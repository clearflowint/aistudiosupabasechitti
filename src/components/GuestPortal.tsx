import React from "react";
import { Users, ArrowLeft, Shield, Globe, Phone } from "lucide-react";

interface GuestPortalProps {
  onBackToHome: () => void;
  onLoginClick: () => void;
}

export const GuestPortal: React.FC<GuestPortalProps> = ({
  onBackToHome,
  onLoginClick,
}) => {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between selection:bg-sky-500 selection:text-white">
      {/* Top Navbar */}
      <header className="border-b border-slate-800/80 bg-slate-900/60 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={onBackToHome}
              className="text-slate-400 hover:text-white p-2 rounded-lg bg-slate-800/80 border border-slate-700/60 transition"
              title="Back to Landing Page"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div className="w-9 h-9 rounded-xl bg-indigo-600/20 text-indigo-400 flex items-center justify-center border border-indigo-500/30">
              <Users className="w-4 h-4" />
            </div>
            <div>
              <h1 className="text-sm font-bold text-white">Guest Portal</h1>
              <p className="text-[11px] text-slate-400">ClearFlow Chitti Automations</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={onLoginClick}
              className="text-xs bg-sky-600 hover:bg-sky-500 text-white px-3.5 py-2 rounded-xl font-semibold shadow-sm transition"
            >
              Manager Login
            </button>
          </div>
        </div>
      </header>

      {/* Guest Main View */}
      <main className="flex-1 max-w-3xl mx-auto px-4 py-12 text-center">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-xl space-y-6">
          <div className="w-12 h-12 rounded-xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center mx-auto border border-indigo-500/30">
            <Users className="w-6 h-6" />
          </div>

          <div>
            <h2 className="text-2xl font-extrabold text-white">Welcome to Guest View</h2>
            <p className="text-xs sm:text-sm text-slate-400 mt-2 max-w-lg mx-auto leading-relaxed">
              You are currently browsing the public guest information portal for ClearFlow Chitti Automations. Manager ledgers, member details, and payout controls are restricted to authorized manager accounts.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-left pt-4">
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
              <h4 className="text-xs font-bold text-sky-400 uppercase tracking-wider mb-1">Automated Workflows</h4>
              <p className="text-xs text-slate-400">Seamless n8n WhatsApp reminders and automated daily ledger calculations.</p>
            </div>
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
              <h4 className="text-xs font-bold text-sky-400 uppercase tracking-wider mb-1">Enterprise Security</h4>
              <p className="text-xs text-slate-400">Google OAuth verification with predefined authorized manager whitelists.</p>
            </div>
          </div>

          <div className="pt-4 flex flex-col sm:flex-row items-center justify-center gap-3">
            <button
              onClick={onLoginClick}
              className="w-full sm:w-auto bg-sky-600 hover:bg-sky-500 text-white font-semibold py-2.5 px-6 rounded-xl text-xs transition shadow-sm"
            >
              Sign In as Manager
            </button>
            <button
              onClick={onBackToHome}
              className="w-full sm:w-auto bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold py-2.5 px-6 rounded-xl text-xs transition border border-slate-700"
            >
              Return to Home
            </button>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800/80 bg-slate-900/40 py-6 text-center text-xs text-slate-500">
        <p>© 2026 ClearFlow Automations. All rights reserved.</p>
        <p className="mt-1 flex items-center justify-center gap-1.5 text-slate-400">
          <Phone className="w-3.5 h-3.5 text-sky-400" /> Helpline: +91 9652169196
        </p>
      </footer>
    </div>
  );
};

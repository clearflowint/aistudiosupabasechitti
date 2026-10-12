import React from "react";
import { Shield, ArrowRight, LogOut, CheckCircle2, LayoutDashboard, Phone, Database } from "lucide-react";

interface ManagerDashboardProps {
  managerEmail: string;
  onGoToChittis: () => void;
  onSignOut: () => void;
  onOpenDatabase: () => void;
}

export const ManagerDashboard: React.FC<ManagerDashboardProps> = ({
  managerEmail,
  onGoToChittis,
  onSignOut,
  onOpenDatabase,
}) => {
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
              <h1 className="text-base font-bold tracking-tight text-white">
                Manager Portal
              </h1>
              <p className="text-[11px] text-slate-400">ClearFlow Chitti Automations</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={onOpenDatabase}
              className="text-xs bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 px-3.5 py-2 rounded-xl border border-emerald-500/30 flex items-center gap-1.5 transition font-medium cursor-pointer"
            >
              <Database className="w-3.5 h-3.5" /> Supabase Connected
            </button>
            <button
              onClick={onSignOut}
              className="text-xs bg-slate-800 hover:bg-slate-700 text-rose-300 px-3.5 py-2 rounded-xl border border-slate-700/80 flex items-center gap-1.5 transition"
            >
              <LogOut className="w-3.5 h-3.5" /> Sign Out
            </button>
          </div>
        </div>
      </header>

      {/* Main Content: Clean Dashboard without any running chittis or create options */}
      <main className="flex-1 max-w-3xl mx-auto px-4 py-16 flex flex-col items-center justify-center text-center">
        <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 flex items-center justify-center mb-6 shadow-xl shadow-emerald-500/10">
          <CheckCircle2 className="w-8 h-8" />
        </div>

        <span className="text-xs font-semibold px-3 py-1 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 mb-3">
          Authorized Manager Verified
        </span>

        <h2 className="text-2xl sm:text-4xl font-extrabold text-white tracking-tight">
          Welcome, {managerEmail || "Manager"}
        </h2>

        <p className="text-sm sm:text-base text-slate-400 max-w-lg mt-3 leading-relaxed">
          You are securely logged into ClearFlow Chitti Management system. Click below to proceed to your Chitti workspaces, math templates, member shares, and ledger controls.
        </p>

        {/* Go to Chittis Button */}
        <div className="mt-8 w-full max-w-sm">
          <button
            onClick={onGoToChittis}
            className="w-full bg-sky-600 hover:bg-sky-500 active:bg-sky-700 text-white font-bold py-4 px-6 rounded-2xl text-sm flex items-center justify-center gap-3 shadow-lg shadow-sky-600/30 transition hover:scale-[1.02]"
          >
            <LayoutDashboard className="w-5 h-5" />
            Go to Chittis Workspace
            <ArrowRight className="w-5 h-5 ml-1" />
          </button>
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

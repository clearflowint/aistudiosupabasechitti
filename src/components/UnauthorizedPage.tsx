import React from "react";
import { AlertCircle, Phone, ArrowLeft, ShieldAlert } from "lucide-react";

interface UnauthorizedPageProps {
  message?: string;
  onBackToHome: () => void;
}

export const UnauthorizedPage: React.FC<UnauthorizedPageProps> = ({
  message,
  onBackToHome,
}) => {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between selection:bg-rose-500 selection:text-white">
      {/* Top Navbar */}
      <header className="border-b border-slate-800/80 bg-slate-900/60 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-rose-600/20 text-rose-400 flex items-center justify-center border border-rose-500/30">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-sm font-bold text-white">Access Restricted</h1>
              <p className="text-[11px] text-slate-400">ClearFlow Chitti Automations</p>
            </div>
          </div>
          <div>
            <button
              onClick={onBackToHome}
              className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 px-3.5 py-2 rounded-xl border border-slate-700 flex items-center gap-1.5 transition"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Back to Home
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-xl mx-auto px-4 py-16 flex flex-col items-center justify-center text-center">
        <div className="w-16 h-16 rounded-2xl bg-rose-500/10 text-rose-400 border border-rose-500/30 flex items-center justify-center mb-6 shadow-xl shadow-rose-500/10">
          <AlertCircle className="w-8 h-8" />
        </div>

        <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
          Unauthorized Account
        </h2>

        <div className="bg-slate-900 border border-rose-500/30 rounded-2xl p-6 mt-6 shadow-xl space-y-4 w-full text-center">
          <p className="text-sm sm:text-base font-semibold text-slate-200 leading-relaxed">
            {message || "Please call ClearFlow Automations +919652169196 for any queries. Thankyou"}
          </p>

          <div className="pt-2">
            <a
              href="tel:+919652169196"
              className="inline-flex items-center justify-center gap-2 bg-sky-600 hover:bg-sky-500 text-white font-semibold py-3 px-6 rounded-xl text-xs transition shadow-sm w-full sm:w-auto"
            >
              <Phone className="w-4 h-4" /> Call +91 9652169196
            </a>
          </div>
        </div>

        <div className="mt-8">
          <button
            onClick={onBackToHome}
            className="text-xs text-slate-400 hover:text-white underline transition"
          >
            Return to Landing Page
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

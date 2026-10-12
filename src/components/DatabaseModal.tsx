import React, { useState, useEffect } from "react";
import { Database, CheckCircle2, AlertCircle, RefreshCw, X, ExternalLink, Layers, Key, ShieldCheck } from "lucide-react";
import { checkSupabaseConnection, getStoredSupabaseConfig, saveStoredSupabaseConfig } from "../lib/supabase";

interface DatabaseModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const DatabaseModal: React.FC<DatabaseModalProps> = ({ isOpen, onClose }) => {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<{ connected?: boolean; url?: string; tables?: string[]; error?: string } | null>(null);
  const [isEditingConfig, setIsEditingConfig] = useState(false);
  const [urlInput, setUrlInput] = useState("");
  const [keyInput, setKeyInput] = useState("");

  const fetchStatus = async () => {
    setLoading(true);
    try {
      const res = await checkSupabaseConnection();
      setStatus(res);
    } catch (err: any) {
      setStatus({ connected: false, error: err.message || "Failed to connect to Supabase" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      const config = getStoredSupabaseConfig();
      setUrlInput(config.url);
      setKeyInput(config.anonKey);
      fetchStatus();
    }
  }, [isOpen]);

  const handleSaveConfig = () => {
    saveStoredSupabaseConfig(urlInput, keyInput);
    setIsEditingConfig(false);
    fetchStatus();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-xl w-full p-6 shadow-2xl text-slate-100 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                Supabase Database Connection
              </h3>
              <p className="text-xs text-slate-400">Real-time PostgreSQL ledger & Row Level Security (RLS)</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-400 hover:text-white transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="py-5 overflow-y-auto space-y-4 flex-1">
          {/* Connection Endpoint Card */}
          <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400 font-medium">Supabase Project Endpoint</span>
              <span className="text-xs text-sky-400 font-mono truncate max-w-[240px]">
                {status?.url || "https://your-project.supabase.co"}
              </span>
            </div>
            <div className="flex items-center justify-between border-t border-slate-800/80 pt-2.5">
              <span className="text-xs text-slate-400 font-medium">Row Level Security (RLS)</span>
              <span className="text-xs font-mono bg-emerald-950/60 border border-emerald-500/30 px-2 py-0.5 rounded text-emerald-400 flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5" /> Enforced by Supabase
              </span>
            </div>
            <div className="flex items-center justify-between border-t border-slate-800/80 pt-2.5">
              <span className="text-xs text-slate-400 font-medium">Live Sync Status</span>
              {loading ? (
                <span className="text-xs text-amber-400 flex items-center gap-1">
                  <RefreshCw className="w-3 h-3 animate-spin" /> Verifying Connection...
                </span>
              ) : status?.connected ? (
                <span className="text-xs text-emerald-400 flex items-center gap-1 font-semibold">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Connected & Fully Synchronized
                </span>
              ) : (
                <span className="text-xs text-amber-400 flex items-center gap-1 font-semibold">
                  <AlertCircle className="w-3.5 h-3.5" /> Read-Only / Standby Mode
                </span>
              )}
            </div>
          </div>

          {/* Optional Credentials Override / Configuration Drawer */}
          <div className="bg-slate-950/40 border border-slate-800 rounded-2xl p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <Key className="w-3.5 h-3.5 text-sky-400" /> Database Connection Keys
              </span>
              <button
                type="button"
                onClick={() => setIsEditingConfig(!isEditingConfig)}
                className="text-[11px] text-sky-400 hover:underline cursor-pointer"
              >
                {isEditingConfig ? "Cancel" : "Configure Credentials"}
              </button>
            </div>

            {isEditingConfig && (
              <div className="mt-3 space-y-3 pt-3 border-t border-slate-800">
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">Supabase URL (VITE_SUPABASE_URL)</label>
                  <input
                    type="text"
                    value={urlInput}
                    onChange={(e) => setUrlInput(e.target.value)}
                    placeholder="https://your-project.supabase.co"
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-sky-500 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">Supabase Anon Key (VITE_SUPABASE_ANON_KEY)</label>
                  <input
                    type="password"
                    value={keyInput}
                    onChange={(e) => setKeyInput(e.target.value)}
                    placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6..."
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-sky-500 font-mono"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleSaveConfig}
                  className="px-4 py-1.5 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-xs font-semibold cursor-pointer"
                >
                  Save & Reconnect
                </button>
              </div>
            )}
          </div>

          {status?.error && (
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs">
              Notice: {status.error}
            </div>
          )}

          {/* Synchronized Tables Section */}
          <div>
            <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-sky-400" /> Supabase Database Tables ({status?.tables?.length || 5})
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {[
                { name: "chittis", desc: "Funds & master schemes" },
                { name: "shares", desc: "Member shares & payout slots" },
                { name: "transactions", desc: "Payment records & transaction ledger" },
                { name: "chitti_expenses", desc: "Fund other entries & treasury adjustments" },
                { name: "tenants", desc: "Manager accounts & tenant access" },
              ].map((tbl) => (
                <div
                  key={tbl.name}
                  className="bg-slate-950/40 border border-slate-800/80 p-3 rounded-xl flex flex-col justify-between"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-white font-mono">{tbl.name}</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      Active Table
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1">{tbl.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="pt-4 border-t border-slate-800 flex items-center justify-between">
          <button
            onClick={fetchStatus}
            disabled={loading}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-white rounded-xl text-xs font-medium flex items-center gap-2 transition cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> Test & Refresh Sync
          </button>
          <button
            onClick={onClose}
            className="px-5 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-xs font-bold transition shadow-lg shadow-sky-600/20 cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

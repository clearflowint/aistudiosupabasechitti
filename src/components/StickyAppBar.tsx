import React from "react";
import { MathTemplate, ChittiMaster } from "../types";
import { Mail, FunctionSquare, Layers, Calendar, DollarSign, AlertTriangle, Zap, Database } from "lucide-react";

interface StickyAppBarProps {
  currentTenantId: string;
  mathTemplates: MathTemplate[];
  currentFormulaId: string;
  onSelectFormula: (formulaId: string) => void;
  chittis: ChittiMaster[];
  currentChittiId: string;
  onSelectChitti: (chittiId: string) => void;
  activeMonth: number;
  totalMonths: number;
  monthPayout: number;
  totalPending: number;
  onOpenCreateChitti: () => void;
  onOpenDatabase: () => void;
  isDbOffline?: boolean;
}

export const StickyAppBar: React.FC<StickyAppBarProps> = ({
  currentTenantId,
  mathTemplates,
  currentFormulaId,
  onSelectFormula,
  chittis,
  currentChittiId,
  onSelectChitti,
  activeMonth,
  totalMonths,
  monthPayout,
  totalPending,
  onOpenCreateChitti,
  onOpenDatabase,
  isDbOffline = false,
}) => {
  // Filter chittis based on selected math engine template
  const filteredChittis = (chittis || []).filter(
    (c) => !currentFormulaId || c.formula_id === currentFormulaId
  );

  const uniqueMathTemplates = Array.from(
    new Map((mathTemplates || []).map(m => [m.formula_id, m])).values()
  );
  const uniqueFilteredChittis = Array.from(
    new Map((filteredChittis || []).map(c => [c.chitti_id, c])).values()
  );

  return (
    <header className="relative bg-slate-900 text-white shadow-lg border-b border-slate-800">
      {/* Top Branding Bar */}
      <div className="bg-slate-950 px-3 py-1 flex items-center justify-between border-b border-slate-800/80 text-[11px]">
        <div className="flex items-center gap-3">
          <span className="font-bold tracking-wide text-slate-300 flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-sky-400" />
            {new Date().toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" })}
          </span>
          <button
            onClick={() => {
              if (isDbOffline) {
                alert("Database is currently offline. Scheme creation is paused to protect ledger integrity.");
                return;
              }
              onOpenCreateChitti();
            }}
            disabled={isDbOffline}
            className={`px-2 py-0.5 rounded font-medium text-[10px] transition shadow-sm ${
              isDbOffline
                ? "bg-slate-700 text-slate-400 cursor-not-allowed"
                : "bg-sky-600 hover:bg-sky-500 text-white cursor-pointer"
            }`}
          >
            + New Chitti
          </button>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={onOpenDatabase}
            className={`flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-md transition font-medium cursor-pointer border ${
              isDbOffline
                ? "bg-rose-500/15 text-rose-400 border-rose-500/30 hover:bg-rose-500/25"
                : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/20"
            }`}
          >
            <Database className="w-3 h-3" /> {isDbOffline ? "DB Offline (Read-Only)" : "DB Connected"}
          </button>
          <span className="text-slate-400 hidden sm:flex items-center gap-1 font-medium">
            <Zap className="w-3 h-3 text-amber-400" /> ClearFlow Automations
          </span>
        </div>
      </div>

      {/* 3-Tier Hierarchy App Bar: Manager Name -> Math Formula -> Chitti Group */}
      <div className="px-3 py-2.5 flex flex-col gap-2 border-b border-slate-800 text-xs">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          {/* Tier 1: Manager Isolated ID (Static Display) */}
          <div className="flex items-center gap-1.5 bg-slate-800 px-2.5 py-1.5 rounded-lg border border-slate-700">
            <Mail className="w-3.5 h-3.5 text-sky-400 shrink-0" />
            <span className="text-[10px] text-slate-400 font-medium">Manager:</span>
            <span className="text-white font-semibold truncate max-w-[200px]">
              {currentTenantId || "Not Logged In"}
            </span>
          </div>
        </div>

        <div className="space-y-2">
          {/* Tier 2: Math Formula Template Filter */}
          <div className="flex items-center gap-1.5 bg-slate-800 px-2.5 py-1.5 rounded-lg border border-slate-700">
            <FunctionSquare className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span className="text-[10px] text-slate-400 font-medium shrink-0">Math Engine:</span>
            <select
              value={currentFormulaId}
              onChange={(e) => onSelectFormula(e.target.value)}
              className="bg-transparent text-white font-medium focus:outline-none cursor-pointer w-full truncate"
            >
              {uniqueMathTemplates.map((m, idx) => (
                <option key={`${m.formula_id}-${idx}`} value={m.formula_id} className="bg-slate-800 text-white">
                  {m.name}
                </option>
              ))}
            </select>
          </div>

          {/* Tier 3: Filtered Chitti Group / Scheme Level - Tab Selection */}
          <div className="flex flex-col gap-1.5 bg-slate-800/90 px-3 py-2 rounded-lg border border-slate-700">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-slate-400 font-medium flex items-center gap-1">
                <Layers className="w-3.5 h-3.5 text-emerald-400" /> Chitti Schemes (Click to switch):
              </span>
              <span className="text-[10px] text-sky-400 font-mono">
                {uniqueFilteredChittis.length} Active
              </span>
            </div>
            <div className="flex items-center gap-1.5 overflow-x-auto py-0.5 scrollbar-thin">
              {uniqueFilteredChittis.length > 0 ? (
                uniqueFilteredChittis.map((c, idx) => {
                  const isSelected = c.chitti_id === currentChittiId;
                  return (
                    <button
                      key={`${c.chitti_id}-${idx}`}
                      onClick={() => onSelectChitti(c.chitti_id)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition cursor-pointer flex items-center gap-1.5 shadow-sm ${
                        isSelected
                          ? "bg-sky-600 text-white border border-sky-400 ring-2 ring-sky-500/20"
                          : "bg-slate-900 text-slate-300 hover:bg-slate-700 border border-slate-700"
                      }`}
                    >
                      <span className={`w-2 h-2 rounded-full ${isSelected ? "bg-emerald-300 animate-pulse" : "bg-slate-500"}`}></span>
                      {c.name}
                      <span className={`text-[10px] font-mono ${isSelected ? "text-sky-200" : "text-slate-400"}`}>({c.chitti_id})</span>
                    </button>
                  );
                })
              ) : (
                <div className="text-slate-400 text-xs py-1 italic">
                  No chittis available for this math engine template. Click "+ New Chitti" above.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Key Metrics Ticker (3-column horizontal pill) */}
      <div className="grid grid-cols-3 gap-1 p-2 bg-slate-950/60 text-center">
        {/* Calendar Derived Active Month */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-lg p-1.5 flex flex-col items-center justify-center">
          <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold flex items-center gap-0.5">
            <Calendar className="w-3 h-3 text-sky-400" /> Active Month
          </span>
          {currentChittiId ? (
            <span className="text-sm font-bold text-sky-400 mt-0.5">
              M{activeMonth}<span className="text-xs text-slate-500 font-normal">/{totalMonths}</span>
            </span>
          ) : (
            <span className="text-xs font-medium text-slate-400 mt-0.5">
              No Chitti Active
            </span>
          )}
        </div>

        {/* Month Payout */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-lg p-1.5 flex flex-col items-center justify-center">
          <span className="text-[10px] text-emerald-400 uppercase tracking-wider font-semibold flex items-center gap-0.5">
            <DollarSign className="w-3 h-3" /> {currentChittiId ? `Payout M${activeMonth}` : "Payout"}
          </span>
          <span className="text-sm font-bold text-emerald-300 mt-0.5">
            {currentChittiId ? `₹${monthPayout?.toLocaleString("en-IN") || 0}` : "—"}
          </span>
        </div>

        {/* Total Pending / Arrears */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-lg p-1.5 flex flex-col items-center justify-center">
          <span className="text-[10px] text-rose-400 uppercase tracking-wider font-semibold flex items-center gap-0.5">
            <AlertTriangle className="w-3 h-3" /> Arrears
          </span>
          <span className="text-sm font-bold text-rose-300 mt-0.5">
            {currentChittiId ? `₹${totalPending?.toLocaleString("en-IN") || 0}` : "—"}
          </span>
        </div>
      </div>
    </header>
  );
};

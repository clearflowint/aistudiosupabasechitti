import React from "react";
import { MemberShare, ChittiMaster } from "../types";
import { X, FileText, CheckCircle2, AlertCircle, DollarSign, Calendar, User, Phone, Layers, ShieldCheck, Printer } from "lucide-react";

interface ShareStatementModalProps {
  share: MemberShare;
  chitti: ChittiMaster;
  activeMonth: number;
  onClose: () => void;
}

export const ShareStatementModal: React.FC<ShareStatementModalProps> = ({
  share,
  chitti,
  activeMonth,
  onClose,
}) => {
  const isDrawn = share.win_month !== null && share.win_month <= activeMonth;
  
  // Calculate payout received if drawn
  let drawnPayout = 0;
  if (isDrawn && share.win_month !== null) {
    const w = share.win_month;
    drawnPayout = ((w - 1) * (chitti.d_due - chitti.u_due)) + (chitti.total_members * chitti.u_due) - chitti.commission;
  }

  const monthsCompleted = activeMonth;
  const monthsLeft = Math.max(0, chitti.total_months - activeMonth);

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in duration-200 max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 bg-slate-900 text-white shrink-0">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-sky-400" />
            <div>
              <h3 className="font-bold text-xs">Official Share Account Statement</h3>
              <p className="text-[10px] text-slate-400">ClearFlow Automated Chitti Ledger</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => window.print()}
              className="bg-slate-800 hover:bg-slate-700 text-sky-300 px-2.5 py-1.5 rounded-lg text-xs flex items-center gap-1 border border-slate-700 transition"
              title="Print or Screenshot Statement"
            >
              <Printer className="w-3.5 h-3.5" /> Print / Save
            </button>
            <button onClick={onClose} className="p-1 rounded-lg text-slate-400 hover:text-white transition">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="p-5 overflow-y-auto space-y-4 text-xs">
          {/* Statement Issuer & Chitti Meta */}
          <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 grid grid-cols-2 gap-3">
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block">Chitti Group</span>
              <span className="font-bold text-slate-900 text-sm">{chitti.name}</span>
              <div className="text-[11px] text-slate-500 font-mono mt-0.5">ID: {chitti.chitti_id}</div>
              <div className="text-[11px] text-slate-600 font-medium mt-1">Start Date: <span className="font-semibold text-slate-900">{chitti.start_date || 'N/A'}</span></div>
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block">Manager Account</span>
              <span className="font-semibold text-slate-800 flex items-center gap-1 truncate">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span className="truncate">{chitti.tenant_id}</span>
              </span>
              <div className="text-[11px] text-slate-600 font-medium mt-1">Report Date: <span className="font-semibold text-slate-900">{new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span></div>
            </div>
          </div>

          {/* Member Meta */}
          <div className="bg-sky-50/50 p-3.5 rounded-xl border border-sky-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-sky-600 text-white font-bold flex items-center justify-center text-sm shadow-sm">
                {share.share_id}
              </div>
              <div>
                <div className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-sky-600" /> {share.member_name}
                </div>
                <div className="text-slate-600 font-mono text-[11px] flex items-center gap-1 mt-0.5">
                  <Phone className="w-3 h-3 text-slate-400" /> {share.phone}
                </div>
              </div>
            </div>
            <div>
              <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full font-semibold text-xs ${
                isDrawn ? "bg-emerald-100 text-emerald-800 border border-emerald-200" : "bg-amber-100 text-amber-800 border border-amber-200"
              }`}>
                {isDrawn ? `Drawn in M${share.win_month}` : "Undrawn Status"}
              </span>
            </div>
          </div>

          {/* Timeline & Progress */}
          <div className="grid grid-cols-3 gap-2 text-center bg-slate-50 p-3 rounded-xl border border-slate-200">
            <div>
              <span className="text-slate-500 block text-[10px]">Active Month (t)</span>
              <span className="font-bold text-slate-900 text-sm">Month {activeMonth} / {chitti.total_months}</span>
            </div>
            <div>
              <span className="text-slate-500 block text-[10px]">Months Completed</span>
              <span className="font-bold text-slate-800 text-sm">{monthsCompleted} M</span>
            </div>
            <div>
              <span className="text-slate-500 block text-[10px]">Months Left</span>
              <span className="font-bold text-slate-800 text-sm">{monthsLeft} M</span>
            </div>
          </div>

          {/* Financial Ledger Summary */}
          <div className="grid grid-cols-4 gap-2 text-center">
            <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200">
              <span className="text-slate-500 block text-[10px]">Current Due</span>
              <span className="font-bold text-slate-800 text-xs">₹{share.monthly_due_current.toLocaleString("en-IN")}</span>
            </div>
            <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200">
              <span className="text-slate-500 block text-[10px]">Total Billed</span>
              <span className="font-bold text-slate-800 text-xs">₹{share.total_billed.toLocaleString("en-IN")}</span>
            </div>
            <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200">
              <span className="text-slate-500 block text-[10px]">Total Paid</span>
              <span className="font-bold text-emerald-700 text-xs">₹{share.total_paid.toLocaleString("en-IN")}</span>
            </div>
            <div className={`p-2.5 rounded-xl border ${
              share.net_balance >= 0 ? "bg-emerald-50 border-emerald-200 text-emerald-800" : "bg-rose-50 border-rose-200 text-rose-800"
            }`}>
              <span className="block text-[10px] opacity-80">{share.net_balance >= 0 ? "Advance" : "Pending Due"}</span>
              <span className="font-bold text-xs">₹{Math.abs(share.net_balance).toLocaleString("en-IN")}</span>
            </div>
          </div>

          {/* Drawn Payout Details if Won */}
          {isDrawn && (
            <div className="bg-emerald-50 border border-emerald-200 p-3 rounded-xl flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-emerald-900 block">Auction Winner Payout Received</span>
                <span className="text-[11px] text-emerald-700">Won in Month {share.win_month} (Due rate switched from U to D)</span>
              </div>
              <span className="font-extrabold text-emerald-900 text-sm">₹{drawnPayout.toLocaleString("en-IN")}</span>
            </div>
          )}
        </div>

        <div className="p-3.5 bg-slate-50 border-t border-slate-200 flex justify-between items-center shrink-0">
          <span className="text-[10px] text-slate-400">Tip: Manager can screenshot this statement to share on WhatsApp.</span>
          <button
            onClick={onClose}
            className="bg-slate-900 hover:bg-slate-800 text-white font-semibold px-4 py-2 rounded-xl text-xs transition shadow-sm"
          >
            Close Statement
          </button>
        </div>
      </div>
    </div>
  );
};

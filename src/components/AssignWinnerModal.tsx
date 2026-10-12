import React, { useState } from "react";
import { MemberShare } from "../types";
import { X, Award, RotateCcw, Loader2 } from "lucide-react";

interface AssignWinnerModalProps {
  share: MemberShare;
  activeMonth: number;
  totalMonths: number;
  onClose: () => void;
  onSubmit: (shareId: string, winMonth: number | null) => void;
}

export const AssignWinnerModal: React.FC<AssignWinnerModalProps> = ({
  share,
  activeMonth,
  totalMonths,
  onClose,
  onSubmit,
}) => {
  const [winMonth, setWinMonth] = useState<string>(share.win_month ? share.win_month.toString() : "");
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setIsSubmitting(true);
    const val = winMonth === "" ? null : Number(winMonth);
    try {
      await onSubmit(share.share_id, val);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRevoke = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      await onSubmit(share.share_id, null);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Only allow selecting months from 1 up to activeMonth (prevent future/unspawnned months)
  const availableMonths = Array.from({ length: activeMonth }, (_, i) => i + 1);

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm border border-slate-200 overflow-hidden animate-in fade-in zoom-in duration-200">
        {/* Processing Spinner Overlay */}
        {isSubmitting && (
          <div className="absolute inset-0 z-20 bg-slate-950/80 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center space-y-3 text-white">
            <div className="relative flex items-center justify-center">
              <div className="w-14 h-14 rounded-full border-4 border-amber-500/20 border-t-amber-400 animate-spin"></div>
              <Loader2 className="w-7 h-7 text-amber-400 animate-spin absolute" />
            </div>
            <div className="space-y-1">
              <h4 className="text-sm font-bold text-white">
                Updating Winner Status...
              </h4>
              <p className="text-xs text-slate-300">
                Recalculating dividend dues and updating Supabase records for {share.member_name}.
              </p>
              <p className="text-[10px] text-amber-300 font-medium pt-1">
                ⏳ Synchronizing chitti disbursements...
              </p>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between px-4 py-3 bg-slate-900 text-white">
          <div className="flex items-center gap-2">
            <Award className="w-4 h-4 text-amber-400" />
            <h3 className="font-bold text-sm">Assign or Revoke Winner Status</h3>
          </div>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="p-1 rounded-lg text-slate-400 hover:text-white transition disabled:opacity-30 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tag Banner showing Tenant ID / Manager ID, Chitti ID, Share ID */}
        <div className="bg-slate-100 px-4 py-2.5 border-b border-slate-200 text-[11px] font-mono text-slate-700 space-y-0.5">
          <div><strong className="text-slate-900">Tenant / Manager ID:</strong> {share.tenant_id}</div>
          <div><strong className="text-slate-900">Chitti ID:</strong> {share.chitti_id}</div>
          <div><strong className="text-slate-900">Share ID:</strong> {share.share_id}</div>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs">
            <div className="flex justify-between font-semibold text-slate-800 mb-1">
              <span>{share.member_name}</span>
              <span className="font-mono bg-slate-200 px-1.5 py-0.5 rounded">{share.share_id}</span>
            </div>
            <p className="text-slate-500">
              Select a month up to Active Month (M{activeMonth}) to assign win status, or revoke draw status in case of wrong entry.
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Winning Month (M1 to M{activeMonth})</label>
            <select
              value={winMonth}
              onChange={(e) => setWinMonth(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 font-medium focus:outline-none focus:ring-2 focus:ring-sky-500 text-xs cursor-pointer"
            >
              <option value="">-- Undrawn (No Win Yet) --</option>
              {availableMonths.map((m) => (
                <option key={m} value={m}>
                  Month {m}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2 pt-2">
            {share.win_month !== null && (
              <button
                type="button"
                onClick={handleRevoke}
                className="bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-semibold py-2.5 px-3 rounded-xl text-xs transition flex items-center justify-center gap-1"
                title="Revoke wrong draw entry"
              >
                <RotateCcw className="w-3.5 h-3.5" /> Revoke Draw
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold py-2.5 rounded-xl text-xs transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 bg-sky-600 hover:bg-sky-500 active:bg-sky-700 text-white font-semibold py-2.5 rounded-xl text-xs transition shadow-sm disabled:opacity-50"
            >
              {isSubmitting ? "Saving..." : "Save Winner"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

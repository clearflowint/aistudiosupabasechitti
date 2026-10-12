import React, { useState } from "react";
import { MemberShare } from "../types";
import { X, CreditCard, DollarSign, PlusCircle, MinusCircle, Loader2 } from "lucide-react";

interface RecordPaymentModalProps {
  share: MemberShare;
  onClose: () => void;
  onSubmit: (shareId: string, amount: number, paymentMode: string) => void;
}

export const RecordPaymentModal: React.FC<RecordPaymentModalProps> = ({
  share,
  onClose,
  onSubmit,
}) => {
  const [amount, setAmount] = useState<string>(share.monthly_due_current.toString());
  const [paymentMode, setPaymentMode] = useState<string>("UPI");
  const [txType, setTxType] = useState<"credit" | "debit">("credit");
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    const num = Number(amount);
    if (!num || num <= 0) return;
    setIsSubmitting(true);
    // If debit (correction), submit negative amount
    const finalAmount = txType === "debit" ? -Math.abs(num) : Math.abs(num);
    try {
      await onSubmit(share.share_id, finalAmount, paymentMode);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm border border-slate-200 overflow-hidden animate-in fade-in zoom-in duration-200">
        {/* Processing Spinner Overlay */}
        {isSubmitting && (
          <div className="absolute inset-0 z-20 bg-slate-950/80 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center space-y-3 text-white">
            <div className="relative flex items-center justify-center">
              <div className="w-14 h-14 rounded-full border-4 border-emerald-500/20 border-t-emerald-400 animate-spin"></div>
              <Loader2 className="w-7 h-7 text-emerald-400 animate-spin absolute" />
            </div>
            <div className="space-y-1">
              <h4 className="text-sm font-bold text-white">
                Updating Supabase Ledger...
              </h4>
              <p className="text-xs text-slate-300">
                Recording {txType === "credit" ? "payment" : "correction"} of ₹{Number(amount || 0).toLocaleString()} for {share.member_name}.
              </p>
              <p className="text-[10px] text-amber-300 font-medium pt-1">
                ⏳ Recomputing member balance & total arrears...
              </p>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between px-4 py-3 bg-slate-900 text-white">
          <div className="flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-sky-400" />
            <h3 className="font-bold text-sm">Record Payment / Correction</h3>
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

        <form onSubmit={handleSubmit} className="p-4 space-y-3.5">
          <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs">
            <div className="flex justify-between font-semibold text-slate-800 mb-1">
              <span>{share.member_name}</span>
              <span className="font-mono bg-slate-200 px-1.5 py-0.5 rounded">{share.share_id}</span>
            </div>
            <p className="text-slate-500">Current Monthly Due: ₹{share.monthly_due_current.toLocaleString("en-IN")}</p>
          </div>

          {/* Transaction Type Toggle: Credit (Payment) vs Debit (Correction / Refund) */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Record Type</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setTxType("credit")}
                className={`py-2 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition ${
                  txType === "credit"
                    ? "bg-emerald-600 text-white shadow-sm"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                <PlusCircle className="w-3.5 h-3.5" /> Credit (Payment)
              </button>
              <button
                type="button"
                onClick={() => setTxType("debit")}
                className={`py-2 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition ${
                  txType === "debit"
                    ? "bg-rose-600 text-white shadow-sm"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                <MinusCircle className="w-3.5 h-3.5" /> Debit (Correction)
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Amount ({txType === "credit" ? "+" : "-"}₹)
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400 text-sm">
                <DollarSign className="w-4 h-4" />
              </span>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
                className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 font-semibold focus:outline-none focus:ring-2 focus:ring-sky-500 text-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Payment / Adjustment Mode</label>
            <select
              value={paymentMode}
              onChange={(e) => setPaymentMode(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 font-medium focus:outline-none focus:ring-2 focus:ring-sky-500 text-xs cursor-pointer"
            >
              <option value="UPI">UPI / Google Pay / PhonePe</option>
              <option value="Bank">Bank Transfer (NEFT/IMPS)</option>
              <option value="Cash">Cash Deposit</option>
              <option value="Correction">Correction / Manual Adjustment</option>
            </select>
          </div>

          <div className="flex items-center gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="w-1/2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold py-2.5 rounded-xl text-xs transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className={`w-1/2 text-white font-semibold py-2.5 rounded-xl text-xs transition shadow-sm disabled:opacity-50 ${
                txType === "credit" ? "bg-sky-600 hover:bg-sky-500 active:bg-sky-700" : "bg-rose-600 hover:bg-rose-500 active:bg-rose-700"
              }`}
            >
              {isSubmitting ? "Processing..." : `Confirm ${txType === "credit" ? "Payment" : "Correction"}`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

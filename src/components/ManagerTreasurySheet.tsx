import React, { useState, useEffect } from "react";
import { TreasuryData, ChittiExpense } from "../types";
import { ChevronUp, ChevronDown, Wallet, ArrowUpRight, ShieldCheck, DollarSign, CheckCircle2, Download, FileCode, Trash2, Plus, Receipt, AlertTriangle, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { otherEntriesService } from "../services/otherEntriesService";

interface ManagerTreasurySheetProps {
  chittiId: string;
  tenantId: string;
  chittiName: string;
  activeMonth: number;
  treasury: TreasuryData;
  payoutT: number;
  onDownloadStatement: () => void;
  onDownloadHtml: () => void;
  onDeleteChitti: () => Promise<void> | void;
  isDeleting?: boolean;
  isReadOnly?: boolean;
}

export const ManagerTreasurySheet: React.FC<ManagerTreasurySheetProps> = ({
  chittiId,
  tenantId,
  chittiName,
  activeMonth,
  treasury,
  payoutT,
  onDownloadStatement,
  onDownloadHtml,
  onDeleteChitti,
  isDeleting = false,
  isReadOnly = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);

  // Others (Credit / Debit) state
  const [expenses, setExpenses] = useState<ChittiExpense[]>([]);
  const [totalCredit, setTotalCredit] = useState(0);
  const [totalDebit, setTotalDebit] = useState(0);
  const [netExpenses, setNetExpenses] = useState(0);

  const [expTitle, setExpTitle] = useState("");
  const [expType, setExpType] = useState<"credit" | "debit">("debit");
  const [expAmount, setExpAmount] = useState("");

  // Multi-step delete sequence state
  // 0: Initial "Delete Chitti"
  // 1: Second click confirmation prompt
  // 2: Popup modal with options: [Download CSV] or [Delete Permanently]
  // 3: Final confirmation dialog before actual deletion
  const [deleteStage, setDeleteStage] = useState<0 | 1 | 2 | 3>(0);

  useEffect(() => {
    if (!chittiId || !tenantId) return;
    otherEntriesService.getOtherEntries(chittiId, tenantId)
      .then((data) => {
        setExpenses(data.expenses || []);
        setTotalCredit(data.total_credit || 0);
        setTotalDebit(data.total_debit || 0);
        setNetExpenses(data.net_expenses || 0);
      })
      .catch((err) => console.error("Error fetching chitti others:", err));
  }, [chittiId, tenantId]);

  const handleAddExpense = async (e?: React.FormEvent | React.MouseEvent) => {
    e?.preventDefault?.();
    if (!expTitle.trim() || !expAmount) return;
    if (!chittiId || !tenantId) return;
    try {
      await otherEntriesService.addOtherEntry(
        chittiId,
        tenantId,
        expTitle,
        expType,
        Number(expAmount)
      );
      setExpTitle("");
      setExpAmount("");
      const data = await otherEntriesService.getOtherEntries(chittiId, tenantId);
      setExpenses(data.expenses || []);
      setTotalCredit(data.total_credit || 0);
      setTotalDebit(data.total_debit || 0);
      setNetExpenses(data.net_expenses || 0);
    } catch (err) {
      console.error("Error adding other record:", err);
    }
  };

  const handleDeleteTrigger = () => {
    if (deleteStage === 0) {
      setDeleteStage(1); // Step 2: Ask for second click
    } else if (deleteStage === 1) {
      setDeleteStage(2); // Step 3: Popup with options [Download CSV] or [Delete Permanently]
    }
  };

  if (!treasury) return null;

  const isSurplus = treasury.net_cashflow >= 0;

  return (
    <div className="bg-slate-900 text-white shadow-lg rounded-2xl border border-slate-800 transition-all mt-4 mb-4 overflow-hidden">
      {/* Collapsible Bar Header (Always Visible) */}
      <div
        onClick={() => setIsOpen(!isOpen)}
        className="px-4 py-3.5 flex items-center justify-between cursor-pointer bg-slate-900 hover:bg-slate-800/90 transition select-none"
      >
        <div className="flex items-center gap-2.5 overflow-hidden">
          <div className="p-2 bg-sky-600/20 text-sky-400 rounded-lg border border-sky-500/30 shrink-0">
            <Wallet className="w-4 h-4" />
          </div>
          <div className="truncate">
            <div className="flex items-center gap-2 truncate">
              <h4 className="text-sm font-bold text-white truncate">
                Chitti Ledger: {chittiName || "Active Chitti"}
              </h4>
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${
                isSurplus ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30" : "bg-rose-500/20 text-rose-300 border border-rose-500/30"
              }`}>
                {isSurplus ? "Surplus" : "Deficit"}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Net Cashflow Position: <span className="text-emerald-400 font-semibold">₹{treasury.closing_ledger_balance?.toLocaleString("en-IN") || 0}</span> (M1–M{activeMonth})
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <div className="text-right hidden sm:block">
            <span className="text-[10px] text-slate-400 block">Net Cashflow</span>
            <span className={`text-xs font-bold ${isSurplus ? "text-emerald-400" : "text-rose-400"}`}>
              {isSurplus ? "+" : ""}₹{treasury.net_cashflow?.toLocaleString("en-IN") || 0}
            </span>
          </div>
          <button className="p-1.5 rounded-lg bg-slate-800 text-slate-300 hover:text-white transition">
            {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Expandable Drawer Content */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden bg-slate-950 border-t border-slate-800 px-4 py-4 space-y-4"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              {/* Actual Cash Collected */}
              <div className="bg-slate-900/90 p-3 rounded-xl border border-slate-800">
                <span className="text-slate-400 flex items-center gap-1 mb-1">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> Total Actual Cash Collected
                </span>
                <span className="text-base font-bold text-emerald-300">
                  ₹{treasury.actual_cash_collected?.toLocaleString("en-IN") || 0}
                </span>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Sum of all actual member payments recorded (M1 to M{activeMonth})
                </p>
              </div>

              {/* Cumulative Disbursed */}
              <div className="bg-slate-900/90 p-3 rounded-xl border border-slate-800">
                <span className="text-slate-400 flex items-center gap-1 mb-1">
                  <ArrowUpRight className="w-3.5 h-3.5 text-rose-400" /> Cumulative Disbursed (M1–M{activeMonth})
                </span>
                <span className="text-base font-bold text-white">
                  ₹{treasury.cumulative_disbursement?.toLocaleString("en-IN") || 0}
                </span>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Total prize money paid out to winners up to Month {activeMonth}
                </p>
              </div>

              {/* Cumulative Commission */}
              <div className="bg-slate-900/90 p-3 rounded-xl border border-slate-800">
                <span className="text-slate-400 flex items-center gap-1 mb-1">
                  <ShieldCheck className="w-3.5 h-3.5 text-sky-400" /> Cumulative Commission ({activeMonth} Months)
                </span>
                <span className="text-base font-bold text-sky-300">
                  ₹{treasury.cumulative_commission?.toLocaleString("en-IN") || 0}
                </span>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  ({activeMonth} months × ₹{treasury.flat_commission?.toLocaleString("en-IN")} flat)
                </p>
              </div>

              {/* Up-to-date Net Cashflow (Single clean instance) */}
              <div className="bg-slate-900/90 p-3 rounded-xl border border-slate-800">
                <span className="text-slate-400 flex items-center gap-1 mb-1">
                  <DollarSign className="w-3.5 h-3.5 text-amber-400" /> Up-to-date Net Cashflow Position
                </span>
                <span className={`text-base font-bold ${isSurplus ? "text-emerald-400" : "text-rose-400"}`}>
                  {isSurplus ? "+" : ""}₹{treasury.net_cashflow?.toLocaleString("en-IN") || 0}
                </span>
                <p className="text-[11px] text-slate-400 mt-0.5">Actual Cash Collected - Disbursed - Commission</p>
              </div>
            </div>

            {/* Others (Credit / Debit) Section */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Receipt className="w-4 h-4 text-purple-400" />
                  <h5 className="text-xs font-bold text-white uppercase tracking-wider">Others (Credit / Debit)</h5>
                </div>
                <div className="text-[11px] font-semibold text-purple-300">
                  Net (Credit - Debit): <span className={netExpenses >= 0 ? "text-emerald-400" : "text-rose-400"}>₹{netExpenses.toLocaleString("en-IN")}</span>
                </div>
              </div>

              {/* Add Entry Form */}
              <form onSubmit={handleAddExpense} className="grid grid-cols-1 sm:grid-cols-4 gap-2 pt-1">
                <input
                  type="text"
                  placeholder="Record title / description"
                  value={expTitle}
                  onChange={(e) => setExpTitle(e.target.value)}
                  className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-purple-500 sm:col-span-2"
                />
                <select
                  value={expType}
                  onChange={(e) => setExpType(e.target.value as "credit" | "debit")}
                  className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-purple-500"
                >
                  <option value="debit">Debit (-)</option>
                  <option value="credit">Credit (+)</option>
                </select>
                <div className="flex gap-1.5">
                  <input
                    type="number"
                    placeholder="Amount (₹)"
                    value={expAmount}
                    onChange={(e) => setExpAmount(e.target.value)}
                    className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-purple-500 w-full"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (isReadOnly) {
                        alert("Database is currently offline. Adding records is paused to protect ledger integrity.");
                        return;
                      }
                      handleAddExpense();
                    }}
                    disabled={isReadOnly}
                    className={`p-1.5 rounded-lg shrink-0 transition ${
                      isReadOnly
                        ? "bg-slate-800 text-slate-500 cursor-not-allowed"
                        : "bg-purple-600 hover:bg-purple-500 active:bg-purple-700 text-white cursor-pointer"
                    }`}
                    title={isReadOnly ? "Locked: Database offline" : "Add Entry"}
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </form>
            </div>

            {/* Multi-Step Chitti Deletion Trigger */}
            <div className="pt-2 border-t border-slate-800 flex items-center justify-between">
              <span className="text-[11px] text-slate-400">Danger Zone: Remove this Chitti ID</span>
              <button
                onClick={() => {
                  if (isReadOnly) {
                    alert("Database is currently offline. Deleting chitti is disabled.");
                    return;
                  }
                  handleDeleteTrigger();
                }}
                disabled={isReadOnly}
                className={`text-xs font-bold px-3 py-2 rounded-xl transition ${
                  isReadOnly
                    ? "bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed"
                    : deleteStage === 0
                    ? "bg-rose-950/60 hover:bg-rose-900 text-rose-300 border border-rose-500/40 cursor-pointer"
                    : "bg-amber-600 hover:bg-amber-500 text-white animate-pulse cursor-pointer"
                }`}
              >
                {deleteStage === 0 && "🗑️ Delete Chitti"}
                {deleteStage === 1 && "⚠️ Click again to open delete options"}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Stage 3 Popup Modal: Options [Download CSV File] or [Delete Permanently] */}
      {deleteStage === 2 && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 max-w-sm w-full shadow-2xl space-y-4 text-center">
            <div className="w-12 h-12 bg-rose-500/20 text-rose-400 rounded-full flex items-center justify-center mx-auto border border-rose-500/30">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Chitti Deletion Options</h3>
              <p className="text-xs text-slate-400 mt-1">
                You are about to delete <span className="text-white font-semibold">{chittiName}</span>. Would you like to download your CSV record before erasing?
              </p>
            </div>

            <div className="space-y-2 pt-2">
              <button
                onClick={onDownloadStatement}
                className="w-full bg-sky-600 hover:bg-sky-500 text-white font-semibold py-2.5 rounded-xl text-xs flex items-center justify-center gap-2 transition shadow-sm"
              >
                <Download className="w-4 h-4" />
                Download CSV File
              </button>

              <button
                onClick={() => setDeleteStage(3)} // Move to final confirmation
                className="w-full bg-rose-600 hover:bg-rose-500 text-white font-bold py-2.5 rounded-xl text-xs flex items-center justify-center gap-2 transition shadow-sm"
              >
                <Trash2 className="w-4 h-4" />
                Delete Permanently
              </button>

              <button
                onClick={() => setDeleteStage(0)}
                className="w-full bg-slate-800 hover:bg-slate-700 text-slate-300 py-2 rounded-xl text-xs transition"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Stage 4 Final Confirmation Modal */}
      {deleteStage === 3 && (
        <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="relative bg-slate-900 border border-rose-500/40 rounded-2xl p-6 max-w-sm w-full shadow-2xl space-y-4 text-center overflow-hidden">
            {/* Round Circling Processing Overlay during deletion */}
            {isDeleting && (
              <div className="absolute inset-0 z-30 bg-slate-950/95 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center space-y-4 text-white">
                <div className="relative flex items-center justify-center">
                  <div className="w-16 h-16 rounded-full border-4 border-rose-500/20 border-t-rose-500 animate-spin"></div>
                  <Loader2 className="w-8 h-8 text-rose-500 animate-spin absolute" />
                </div>
                <div className="space-y-1.5 max-w-xs">
                  <h4 className="text-base font-bold text-white">
                    Permanently Erasing Chitti Scheme...
                  </h4>
                  <p className="text-xs text-slate-300">
                    Deleting all member shares, payments, expenses, and ledger entries from Supabase.
                  </p>
                  <div className="pt-2 text-[11px] text-amber-300 font-medium bg-amber-950/60 border border-amber-800/50 rounded-lg px-3 py-1.5">
                    ⏳ Please wait, do not close or interrupt this window.
                  </div>
                </div>
              </div>
            )}

            <div className="w-12 h-12 bg-rose-600 text-white rounded-full flex items-center justify-center mx-auto shadow-lg animate-bounce">
              <Trash2 className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-sm font-extrabold text-rose-400">Final Confirmation Required</h3>
              <p className="text-xs text-slate-300 mt-1.5">
                This action is irreversible. All member shares, payments, and others data for <span className="text-white font-bold">{chittiName}</span> will be permanently destroyed.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-2">
              <button
                disabled={isDeleting}
                onClick={() => setDeleteStage(0)}
                className="bg-slate-800 hover:bg-slate-700 text-slate-300 py-2.5 rounded-xl text-xs font-medium transition disabled:opacity-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                disabled={isDeleting}
                onClick={async () => {
                  try {
                    await onDeleteChitti();
                  } finally {
                    setDeleteStage(0);
                  }
                }}
                className="bg-rose-600 hover:bg-rose-500 active:bg-rose-700 text-white py-2.5 rounded-xl text-xs font-bold shadow-lg transition disabled:opacity-50 flex items-center justify-center gap-1.5 cursor-pointer"
              >
                {isDeleting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Erasing...</span>
                  </>
                ) : (
                  <span>Yes, Delete</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Chitti Up-to-Date Statement Options at Bottom */}
      <div className="p-3 bg-slate-950 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-2.5">
        <div className="text-xs text-slate-400 text-center sm:text-left">
          Export full ledger & member status report
        </div>
        <div className="flex items-center gap-2 whitespace-nowrap overflow-x-auto w-full sm:w-auto justify-end">
          <button
            onClick={onDownloadHtml}
            className="bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white font-semibold px-3 py-2 rounded-xl text-xs flex items-center gap-1.5 transition shadow-sm"
            title="Download interactive HTML report (opens in any browser on phone without Excel/Sheets)"
          >
            <FileCode className="w-3.5 h-3.5" />
            View/Save Web Report (.html)
          </button>
          
          <button
            onClick={onDownloadStatement}
            className="bg-sky-600 hover:bg-sky-500 active:bg-sky-700 text-white font-semibold px-3 py-2 rounded-xl text-xs flex items-center gap-1.5 transition shadow-sm"
            title="Download CSV for Excel / Google Sheets"
          >
            <Download className="w-3.5 h-3.5" />
            CSV (Excel)
          </button>
        </div>
      </div>
    </div>
  );
};

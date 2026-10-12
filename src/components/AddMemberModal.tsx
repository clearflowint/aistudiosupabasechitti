import React, { useState } from "react";
import { X, UserPlus, Phone, User } from "lucide-react";

interface AddMemberModalProps {
  totalMonths: number;
  onClose: () => void;
  onSubmit: (memberName: string, phone: string, winMonth: number | null) => void;
}

export const AddMemberModal: React.FC<AddMemberModalProps> = ({
  totalMonths,
  onClose,
  onSubmit,
}) => {
  const [memberName, setMemberName] = useState("");
  const [phone, setPhone] = useState("");
  const [winMonth, setWinMonth] = useState<string>("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!memberName.trim()) return;
    onSubmit(
      memberName.trim(),
      phone.trim() || "9800000000",
      winMonth === "" ? null : Number(winMonth)
    );
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm border border-slate-200 overflow-hidden animate-in fade-in zoom-in duration-200">
        <div className="flex items-center justify-between px-4 py-3 bg-slate-900 text-white">
          <div className="flex items-center gap-2">
            <UserPlus className="w-4 h-4 text-emerald-400" />
            <h3 className="font-bold text-sm">Add New Member Share</h3>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-slate-400 hover:text-white transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Member Name</label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400 text-sm">
                <User className="w-4 h-4" />
              </span>
              <input
                type="text"
                value={memberName}
                onChange={(e) => setMemberName(e.target.value)}
                placeholder="e.g. Ramesh Kumar"
                required
                className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 font-medium focus:outline-none focus:ring-2 focus:ring-sky-500 text-xs"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Phone Number</label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400 text-sm">
                <Phone className="w-4 h-4" />
              </span>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="9876543210"
                className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 font-medium focus:outline-none focus:ring-2 focus:ring-sky-500 text-xs"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Winning Month (Optional)</label>
            <select
              value={winMonth}
              onChange={(e) => setWinMonth(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 font-medium focus:outline-none focus:ring-2 focus:ring-sky-500 text-xs cursor-pointer"
            >
              <option value="">-- Undrawn (No Win Yet) --</option>
              {Array.from({ length: totalMonths }, (_, i) => i + 1).map((m) => (
                <option key={m} value={m}>
                  Month {m}
                </option>
              ))}
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
              className="w-1/2 bg-sky-600 hover:bg-sky-500 active:bg-sky-700 text-white font-semibold py-2.5 rounded-xl text-xs transition shadow-sm"
            >
              Add Member
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

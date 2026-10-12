import React, { useState } from "react";
import { MemberShare } from "../types";
import { X, Phone, User, Edit3, Loader2 } from "lucide-react";

interface EditMemberModalProps {
  share: MemberShare;
  onClose: () => void;
  onSubmit: (shareId: string, memberName: string, phone: string) => Promise<void> | void;
  isSubmitting?: boolean;
}

export const EditMemberModal: React.FC<EditMemberModalProps> = ({
  share,
  onClose,
  onSubmit,
  isSubmitting: externalSubmitting = false,
}) => {
  const [memberName, setMemberName] = useState(share.member_name);
  // Clean phone number to 10 digits if +91 is present
  const cleanPhone = share.phone ? share.phone.replace(/^\+?91\s*/, "") : "";
  const [phone, setPhone] = useState(cleanPhone);
  const [isLocalSubmitting, setIsLocalSubmitting] = useState(false);

  const isSubmitting = externalSubmitting || isLocalSubmitting;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!memberName.trim() || isSubmitting) return;
    const cleanDigits = phone.trim().replace(/\D/g, "");
    if (cleanDigits.length !== 10) {
      alert("Phone number must be exactly 10 digits.");
      return;
    }
    const finalPhone = `+91${cleanDigits}`;
    setIsLocalSubmitting(true);
    try {
      await onSubmit(share.share_id, memberName.trim(), finalPhone);
    } finally {
      setIsLocalSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm border border-slate-200 overflow-hidden animate-in fade-in zoom-in duration-200">
        {/* Processing Spinner Overlay */}
        {isSubmitting && (
          <div className="absolute inset-0 z-20 bg-slate-950/80 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center space-y-3 text-white">
            <div className="relative flex items-center justify-center">
              <div className="w-14 h-14 rounded-full border-4 border-sky-500/20 border-t-sky-400 animate-spin"></div>
              <Loader2 className="w-7 h-7 text-sky-400 animate-spin absolute" />
            </div>
            <div className="space-y-1">
              <h4 className="text-sm font-bold text-white">
                Saving Member Profile...
              </h4>
              <p className="text-xs text-slate-300">
                Updating contact information and syncing with Supabase.
              </p>
              <p className="text-[10px] text-sky-300 font-medium pt-1">
                ⏳ Synchronizing database records...
              </p>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between px-4 py-3 bg-slate-900 text-white">
          <div className="flex items-center gap-2">
            <Edit3 className="w-4 h-4 text-sky-400" />
            <h3 className="font-bold text-sm">Edit Member Info</h3>
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
                required
                disabled={isSubmitting}
                className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 font-medium focus:outline-none focus:ring-2 focus:ring-sky-500 text-xs disabled:opacity-50"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Phone Number / WhatsApp</label>
            <div className="flex rounded-xl overflow-hidden border border-slate-300 bg-slate-50 focus-within:ring-2 focus-within:ring-sky-500">
              <div className="flex items-center gap-1.5 px-3 bg-slate-200 text-slate-700 font-bold text-xs select-none border-r border-slate-300">
                <Phone className="w-3.5 h-3.5 text-slate-500" />
                <span>+91</span>
              </div>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                placeholder="9876543210"
                maxLength={10}
                required
                disabled={isSubmitting}
                className="w-full px-3 py-2 bg-transparent text-slate-900 font-medium focus:outline-none text-xs disabled:opacity-50"
              />
            </div>
          </div>

          <div className="flex items-center gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="w-1/2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold py-2.5 rounded-xl text-xs transition disabled:opacity-50 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-1/2 bg-sky-600 hover:bg-sky-500 active:bg-sky-700 text-white font-semibold py-2.5 rounded-xl text-xs transition shadow-sm disabled:opacity-75 flex items-center justify-center gap-1.5 cursor-pointer"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <span>Save Changes</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};


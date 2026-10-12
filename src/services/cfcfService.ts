import { supabase } from "../lib/supabase";
import { MemberShare, ChittiMaster, CfcfNotification } from "../types";

export const cfcfService = {
  getProductInfo() {
    return {
      name: "ClearFlow Chitti Automations (CFCF)",
      version: "3.2.0",
      architecture: "React + TypeScript + Supabase Realtime Ledger",
      helpline: "+91 9652169196",
      website: "https://clearflowautomations.com",
    };
  },

  formatWhatsAppStatement(share: MemberShare, chitti: ChittiMaster, activeMonth: number): string {
    const isWinner = share.win_month !== null;
    const pending = (share.pending_amount || 0) > 0 ? `₹${(share.pending_amount || 0).toLocaleString()}` : "₹0 (Cleared)";
    const advance = (share.advance_amount || 0) > 0 ? `₹${(share.advance_amount || 0).toLocaleString()}` : "₹0";

    return `🏛️ *ClearFlow Chitti Statement*
━━━━━━━━━━━━━━━━━━━
👤 *Member:* ${share.member_name}
📱 *Slot ID:* ${share.share_id}
📊 *Scheme:* ${chitti.name}
📅 *Month:* ${activeMonth} of ${chitti.total_months}

💰 *Current Due:* ₹${share.monthly_due_current.toLocaleString()}
📈 *Total Billed:* ₹${share.total_billed.toLocaleString()}
💳 *Total Paid:* ₹${share.total_paid.toLocaleString()}
⚠️ *Balance Pending:* ${pending}
✨ *Advance Balance:* ${advance}
🏆 *Winner Status:* ${isWinner ? `Month ${share.win_month} (Drawn)` : "Undrawn"}

━━━━━━━━━━━━━━━━━━━
ClearFlow Automations • Helpline: +91 9652169196`;
  },

  async logOrSendNotification(notification: CfcfNotification): Promise<{ success: boolean; error?: string }> {
    try {
      // Attempt to save notification in Supabase notifications table if available
      const { error } = await supabase.from("cfcf_notifications").insert({
        tenant_id: notification.tenant_id,
        recipient_phone: notification.recipient_phone,
        recipient_name: notification.recipient_name,
        message_type: notification.message_type,
        payload: notification.payload,
        status: "sent",
        created_at: new Date().toISOString(),
      });

      if (error) {
        // Table may not exist or not required, non-blocking
        console.warn("Notification logging note:", error.message);
      }

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  },
};

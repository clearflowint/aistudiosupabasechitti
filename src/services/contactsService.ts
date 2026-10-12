import { supabase } from "../lib/supabase";
import { Contact } from "../types";

export const contactsService = {
  async getContacts(tenantId: string): Promise<Contact[]> {
    if (!tenantId) return [];

    try {
      // 1. Check if a dedicated contacts table exists
      const { data: contactsData, error: contactsErr } = await supabase
        .from("contacts")
        .select("*")
        .eq("tenant_id", tenantId);

      if (!contactsErr && contactsData && contactsData.length > 0) {
        return contactsData.map((c: any) => ({
          contact_id: c.contact_id || c.id,
          tenant_id: c.tenant_id,
          name: c.name,
          phone: c.phone,
          email: c.email,
          notes: c.notes,
          created_at: c.created_at,
        }));
      }

      // 2. Derive unique contacts from shares table
      const { data: sharesData, error: sharesErr } = await supabase
        .from("shares")
        .select("member_name, phone, tenant_id")
        .eq("tenant_id", tenantId);

      if (!sharesErr && sharesData) {
        const contactMap = new Map<string, Contact>();
        sharesData.forEach((s: any) => {
          const key = s.phone ? s.phone.trim() : s.member_name.trim();
          if (key && !contactMap.has(key)) {
            contactMap.set(key, {
              contact_id: `cnt_${Math.random().toString(36).substring(2, 7)}`,
              tenant_id: s.tenant_id,
              name: s.member_name,
              phone: s.phone,
            });
          }
        });
        return Array.from(contactMap.values());
      }
    } catch (err) {
      console.warn("Error fetching contacts:", err);
    }

    return [];
  },
};

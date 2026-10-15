// CFCF PRODUCT: Contact reads and writes for the existing public.contacts table.
// MIX: Uses the shared Supabase client; tenant identity is supplied by the authorized workspace.

import { supabase } from "../../../core/database/supabaseClient";
import { cfcfConfig } from "../config/cfcf.config";
import type { CfcfContactRow } from "../types/database.types";

export interface CreateContactInput {
  name: string;
  phone: string;
  email?: string;
}

const CONTACT_FIELDS =
  "contact_id, product_id, tenant_id, name, phone, email, created_at, updated_at";

export async function listCfcfContacts(tenantId: string): Promise<CfcfContactRow[]> {
  const { data, error } = await supabase
    .from("contacts")
    .select(CONTACT_FIELDS)
    .eq("product_id", cfcfConfig.productId)
    .eq("tenant_id", tenantId)
    .order("name", { ascending: true }).order("phone", { ascending: true });

  if (error) throw new Error("Unable to load contacts: " + error.message);
  return (data ?? []) as CfcfContactRow[];
}

export async function createCfcfContact(
  tenantId: string,
  input: CreateContactInput,
): Promise<CfcfContactRow> {
  const name = input.name.trim();
  if (!name) throw new Error("Enter the contact's name.");

  const phone = normalizeIndianPhone(input.phone);
  const email = input.email?.trim().toLowerCase() || null;
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Enter a valid email address or leave it blank.");
  }

  const payload = {
    // CFCF PRODUCT: contact_id has no database default, so this service supplies an alphanumeric UUID.
    // CFCF PRODUCT: Product and tenant are set here, never supplied as editable form fields.
    contact_id: crypto.randomUUID().replace(/-/g, "").toUpperCase(),
    product_id: cfcfConfig.productId,
    tenant_id: tenantId,
    name,
    phone,
    email,
  };

  const { data, error } = await supabase
    .from("contacts")
    .insert(payload)
    .select(CONTACT_FIELDS)
    .single();

  if (error) {
    if (error.code === "23505") {
      throw new Error("A contact with this mobile number already exists in this workspace.");
    }
    if (error.code === "42501") {
      throw new Error("Supabase did not permit this contact to be added. Check the workspace access policy.");
    }
    throw new Error("Unable to add contact: " + error.message);
  }

  return data as CfcfContactRow;
}

export async function updateCfcfContact(
  tenantId: string,
  contactId: string,
  input: CreateContactInput,
): Promise<CfcfContactRow> {
  const name = input.name.trim();
  if (!name) throw new Error("Enter the contact's name.");

  const phone = normalizeIndianPhone(input.phone);
  const email = input.email?.trim().toLowerCase() || null;
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Enter a valid email address or leave it blank.");
  }

  const { data, error } = await supabase
    .from("contacts")
    .update({
      name,
      phone,
      email,
    })
    .eq("product_id", cfcfConfig.productId)
    .eq("tenant_id", tenantId)
    .eq("contact_id", contactId)
    .select(CONTACT_FIELDS)
    .single();

  if (error) {
    if (error.code === "23505") {
      throw new Error("A contact with this mobile number already exists in this workspace.");
    }
    if (error.code === "42501") {
      throw new Error("Supabase did not permit this contact to be updated. Check the workspace access policy.");
    }
    throw new Error("Unable to update contact: " + error.message);
  }

  return data as CfcfContactRow;
}


/** Contacts with at least one Share in this tenant are shareholders and must be retained. */
export async function listCfcfShareholderContactIds(tenantId: string): Promise<Set<string>> {
  const { data, error } = await supabase
    .from("cfcf_shares")
    .select("contact_id")
    .eq("product_id", cfcfConfig.productId)
    .eq("tenant_id", tenantId)
    .not("contact_id", "is", null);

  if (error) throw new Error("Unable to determine shareholder contacts: " + error.message);
  return new Set((data ?? [])
    .map((row) => row.contact_id)
    .filter((contactId): contactId is string => typeof contactId === "string" && contactId.length > 0));
}

export async function deleteCfcfContact(
  tenantId: string,
  contactId: string,
): Promise<void> {
  const { data: linkedShares, error: sharesError } = await supabase
    .from("cfcf_shares")
    .select("share_id")
    .eq("product_id", cfcfConfig.productId)
    .eq("tenant_id", tenantId)
    .eq("contact_id", contactId)
    .limit(1);

  if (sharesError) throw new Error("Unable to check whether this contact is in use: " + sharesError.message);
  if (linkedShares && linkedShares.length > 0) {
    throw new Error("This contact is linked to one or more Shares. Keep the contact to preserve existing records.");
  }

  const { data, error } = await supabase
    .from("contacts")
    .delete()
    .eq("product_id", cfcfConfig.productId)
    .eq("tenant_id", tenantId)
    .eq("contact_id", contactId)
    .select("contact_id")
    .maybeSingle();

  if (error) {
    if (error.code === "23503") {
      throw new Error("This contact is linked to existing records and cannot be deleted.");
    }
    if (error.code === "42501") {
      throw new Error("Supabase did not permit this contact to be deleted. Check the workspace access policy.");
    }
    throw new Error("Unable to delete contact: " + error.message);
  }
  if (!data) throw new Error("Contact was not found or is no longer available in this workspace.");
}

function normalizeIndianPhone(value: string): string {
  let digits = value.replace(/\D/g, "");

  if (digits.length === 12 && digits.startsWith("91")) digits = digits.slice(2);
  if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);

  if (!/^[6-9]\d{9}$/.test(digits)) {
    throw new Error("Enter a valid 10-digit Indian mobile number.");
  }

  return "+91" + digits;
}

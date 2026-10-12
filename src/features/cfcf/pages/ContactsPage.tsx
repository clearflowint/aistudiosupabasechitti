// CFCF PRODUCT: Contacts screen wired to the existing Supabase contacts table.
// MIX: Reuses the shared Modal and the workspace identity supplied by the neutral app shell.

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { ContactRound, Mail, MessageCircle, Phone, Plus, RefreshCw, Search, UsersRound, Pencil, Trash2 } from "lucide-react";
import type { AuthorizedWorkspace } from "../../../core/workspace/workspace.types";
import { Modal } from "../../../components/ui/Modal";
import type { CfcfContactRow } from "../types/database.types";
import { createCfcfContact, deleteCfcfContact, listCfcfContacts, updateCfcfContact } from "../services/contacts.service";
import { ContactGroupsPanel } from "./ContactGroupsPanel";

interface ContactsPageProps {
  workspace: AuthorizedWorkspace;
}

const emptyForm = { name: "", phone: "", email: "", remarks: "" };

export function ContactsPage({ workspace }: ContactsPageProps) {
  const [contacts, setContacts] = useState<CfcfContactRow[]>([]);
  const contactsRequestId = useRef(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<CfcfContactRow | null>(null);
  const [deletingContact, setDeletingContact] = useState<CfcfContactRow | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [acknowledgement, setAcknowledgement] = useState<{ title: string; message: string } | null>(null);
  const supportsContactPicker = typeof navigator !== "undefined"
    && "contacts" in navigator
    && typeof window !== "undefined"
    && "ContactsManager" in window;

  async function loadContacts(showRefreshState = false) {
    const requestId = ++contactsRequestId.current;
    if (showRefreshState) setIsRefreshing(true);
    else setIsLoading(true);
    setLoadError(null);

    try {
      const rows = await listCfcfContacts(workspace.tenantId);
      if (requestId === contactsRequestId.current) setContacts(rows);
    } catch (error) {
      if (requestId === contactsRequestId.current) {
        setContacts([]);
        setLoadError(error instanceof Error ? error.message : "Unable to load contacts.");
      }
    } finally {
      if (requestId === contactsRequestId.current) {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    }
  }

  // MIX: A tenant change clears the previous tenant's visible rows before reading again.
  useEffect(() => {
    setContacts([]);
    setNotice(null);
    void loadContacts();
    // loadContacts intentionally depends only on the authorized tenant identifier.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace.tenantId]);

  const filteredContacts = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return contacts;

    return contacts.filter((contact) =>
      [contact.name, contact.phone, contact.email ?? "", contact.remarks ?? ""]
        .some((value) => value.toLowerCase().includes(query)),
    );
  }, [contacts, search]);

  function closeModal() {
    if (isSaving) return;
    setIsModalOpen(false);
    setEditingContact(null);
    setForm(emptyForm);
    setFormError(null);
  }

  function openCreateModal() {
    setNotice(null);
    setFormError(null);
    setEditingContact(null);
    setForm(emptyForm);
    setIsModalOpen(true);
  }

  function openEditModal(contact: CfcfContactRow) {
    setNotice(null);
    setFormError(null);
    setEditingContact(contact);
    setForm({
      name: contact.name,
      phone: contact.phone,
      email: contact.email ?? "",
      remarks: contact.remarks ?? "",
    });
    setIsModalOpen(true);
  }

  async function handleDeleteContact() {
    if (!deletingContact || isDeleting) return;
    setDeleteError(null);
    setIsDeleting(true);
    try {
      await deleteCfcfContact(workspace.tenantId, deletingContact.contact_id);
      setContacts((current) => current.filter((contact) => contact.contact_id !== deletingContact.contact_id));
      setNotice(null);
      setDeletingContact(null);
      setAcknowledgement({ title: "Contact deleted", message: "Supabase confirmed the delete request. The contact has been removed from this workspace." });
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : "Unable to delete contact.");
    } finally {
      setIsDeleting(false);
    }
  }

  async function handleImportContacts() {
    const picker = (navigator as Navigator & {
      contacts?: {
        select: (
          fields: Array<"name" | "tel" | "email">,
          options?: { multiple?: boolean },
        ) => Promise<Array<{ name?: string[]; tel?: string[]; email?: string[] }>>;
      };
    }).contacts;

    if (!picker || !supportsContactPicker || isImporting) return;
    setNotice(null);
    setIsImporting(true);
    let added = 0;
    let skipped = 0;
    let failed = 0;

    try {
      const selected = await picker.select(["name", "tel", "email"], { multiple: true });
      for (const item of selected) {
        const name = item.name?.find((value) => value.trim())?.trim();
        const phone = item.tel?.find((value) => value.trim())?.trim();
        const email = item.email?.find((value) => value.trim())?.trim() ?? "";

        if (!name || !phone) {
          skipped += 1;
          continue;
        }

        try {
          await createCfcfContact(workspace.tenantId, { name, phone, email });
          added += 1;
        } catch (error) {
          if (error instanceof Error && /already exists|valid 10-digit/i.test(error.message)) {
            skipped += 1;
          } else {
            failed += 1;
          }
        }
      }

      if (added > 0) await loadContacts(true);
      setNotice(
        added + " contact" + (added === 1 ? "" : "s") + " imported."
        + (skipped ? " " + skipped + " skipped (duplicate or missing/invalid details)." : "")
        + (failed ? " " + failed + " could not be imported." : ""),
      );
    } catch (error) {
      // Closing the native picker is a normal user cancellation, not a failed import.
      const message = error instanceof Error ? error.message : "";
      if (!/cancel|abort/i.test(message)) {
        setNotice("The phone contact picker could not be opened. You can still add contacts manually.");
      }
    } finally {
      setIsImporting(false);
    }
  }

  async function handleSaveContact(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setIsSaving(true);

    try {
      if (editingContact) {
        const updated = await updateCfcfContact(workspace.tenantId, editingContact.contact_id, form);
        setContacts((current) => current
          .map((contact) => contact.contact_id === updated.contact_id ? updated : contact)
          .sort((a, b) => a.name.localeCompare(b.name)));
        setNotice(null);
        setAcknowledgement({ title: "Contact updated", message: "Supabase returned the updated contact record. Your changes are saved." });
      } else {
        const created = await createCfcfContact(workspace.tenantId, form);
        setContacts((current) =>
          [...current, created].sort((a, b) => a.name.localeCompare(b.name)),
        );
        setNotice(null);
        setAcknowledgement({ title: "Contact added", message: "Supabase returned the new contact record. The contact is saved in this workspace." });
      }
      setIsModalOpen(false);
      setEditingContact(null);
      setForm(emptyForm);
      setSearch("");
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Unable to add contact.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="min-w-0 space-y-4">
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <UsersRound size={16} className="text-sky-700" />
              Contact directory
            </div>
            <h2 className="mt-2 text-xl font-semibold tracking-tight text-slate-900">Your contacts</h2>
            <p className="mt-1 text-sm leading-6 text-slate-500">
              Keep contact details in one place to reuse them in your CFCF workspace.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void handleImportContacts()}
              disabled={!supportsContactPicker || isImporting}
              title={supportsContactPicker ? "Import contacts using your phone's contact picker" : "Available on supported Android browsers"}
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2.5 text-sm font-semibold text-sky-800 transition hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <ContactRound size={17} /> {isImporting ? "Importing…" : "Import from phone"}
            </button>
            <button
              type="button"
              onClick={openCreateModal}
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-700"
            >
              <Plus size={17} /> Add contact
            </button>
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <label className="relative block w-full sm:max-w-md">
            <Search size={17} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search name, phone, email or notes"
              className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
            />
          </label>
          <div className="flex items-center justify-between gap-3 text-sm text-slate-500 sm:justify-end">
            <span>{contacts.length} {contacts.length === 1 ? "contact" : "contacts"}</span>
            <button
              type="button"
              onClick={() => void loadContacts(true)}
              disabled={isLoading || isRefreshing}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RefreshCw size={15} className={isRefreshing ? "animate-spin" : ""} />
              Refresh
            </button>
          </div>
        </div>
      </section>

      <ContactGroupsPanel workspace={workspace} contacts={contacts} contactsLoaded={!isLoading && !loadError} />

      {notice && (
        <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {notice}
        </div>
      )}

      {loadError && (
        <section role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-900">
          <p className="font-semibold">Contacts could not be loaded</p>
          <p className="mt-1 leading-6">{loadError}</p>
          <button type="button" onClick={() => void loadContacts()} className="mt-3 font-semibold underline">
            Try again
          </button>
        </section>
      )}

      {isLoading ? (
        <section aria-live="polite" className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
          Loading contacts…
        </section>
      ) : !loadError && filteredContacts.length === 0 ? (
        <section className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-sky-50 text-sky-700">
            <UsersRound size={22} />
          </div>
          <h3 className="mt-4 font-semibold text-slate-900">
            {search.trim() ? "No matching contacts" : "No contacts yet"}
          </h3>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">
            {search.trim()
              ? "Try another name, phone number, email address or note."
              : "Add your first contact. Their details will be saved to this authorized workspace."}
          </p>
          {!search.trim() && (
            <button
              type="button"
              onClick={openCreateModal}
              className="mt-5 inline-flex items-center gap-2 rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-700"
            >
              <Plus size={16} /> Add first contact
            </button>
          )}
        </section>
      ) : !loadError ? (
        <section className="grid min-w-0 grid-cols-1 gap-2.5 sm:grid-cols-2">
          {filteredContacts.map((contact) => (
            <article key={contact.contact_id} className="min-w-0 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
              <div className="flex min-w-0 items-start gap-3">
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-sky-50 text-sky-700">
                  <UsersRound size={20} />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="break-words text-base font-semibold text-slate-950">{contact.name}</h3>
                  <p className="mt-1 break-words text-xs leading-5 text-slate-400">
                    Added {new Date(contact.created_at).toLocaleDateString("en-IN")}
                  </p>
                </div>
              </div>

              <div className="mt-3 space-y-1.5 border-t border-slate-100 pt-2.5">
                <p className="flex min-w-0 items-start gap-2 break-all text-sm text-slate-700">
                  <Phone size={15} className="mt-0.5 shrink-0 text-slate-400" />
                  <span>{contact.phone}</span>
                </p>
                {contact.email && (
                  <p className="flex min-w-0 items-start gap-2 break-all text-sm text-slate-600">
                    <Mail size={15} className="mt-0.5 shrink-0 text-slate-400" />
                    <span>{contact.email}</span>
                  </p>
                )}
                {contact.remarks && (
                  <p className="break-words text-sm leading-5 text-slate-500">{contact.remarks}</p>
                )}
              </div>

              <div className="mt-3 grid grid-cols-4 gap-1.5">
                <button
                  type="button"
                  onClick={() => openEditModal(contact)}
                  aria-label={"Edit " + contact.name}
                  title="Edit contact"
                  className="inline-flex min-h-10 min-w-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 px-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
                >
                  <Pencil size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => { setDeleteError(null); setDeletingContact(contact); }}
                  aria-label={"Delete " + contact.name}
                  title="Delete contact"
                  className="inline-flex min-h-10 min-w-0 items-center justify-center rounded-xl border border-rose-200 bg-rose-50 px-1 text-xs font-semibold text-rose-800 transition hover:bg-rose-100"
                >
                  <Trash2 size={16} />
                </button>
                <a
                  href={"tel:" + contact.phone}
                  aria-label={"Call " + contact.name}
                  title="Call contact"
                  className="inline-flex min-h-10 min-w-0 items-center justify-center rounded-xl border border-blue-200 bg-blue-50 px-1 text-xs font-semibold text-blue-800 transition hover:bg-blue-100"
                >
                  <Phone size={16} />
                </a>
                <a
                  href={"https://wa.me/" + contact.phone.replace(/\D/g, "")}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={"WhatsApp " + contact.name}
                  title="Message on WhatsApp"
                  className="inline-flex min-h-10 min-w-0 items-center justify-center rounded-xl bg-emerald-600 px-1 text-sm font-semibold text-white transition hover:bg-emerald-700"
                >
                  <MessageCircle size={16} />
                </a>
              </div>
            </article>
          ))}
          {search.trim() && (
            <p className="col-span-full px-1 py-2 text-xs text-slate-500">
              Showing {filteredContacts.length} matching {filteredContacts.length === 1 ? "contact" : "contacts"}.
            </p>
          )}
        </section>
      ) : null}

      <Modal
        isOpen={isModalOpen}
        title={editingContact ? "Edit contact" : "Add a contact"}
        description="Contact details are saved to the current authorized workspace."
        onClose={closeModal}
      >
        <form onSubmit={(event) => void handleSaveContact(event)} className="space-y-4">
          <div>
            <label htmlFor="contact-name" className="mb-1.5 block text-sm font-medium text-slate-700">Full name <span className="text-rose-500">*</span></label>
            <input
              id="contact-name"
              value={form.name}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              required
              autoFocus
              maxLength={120}
              placeholder="Enter contact name"
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
            />
          </div>
          <div>
            <label htmlFor="contact-phone" className="mb-1.5 block text-sm font-medium text-slate-700">Mobile number <span className="text-rose-500">*</span></label>
            <div className="flex overflow-hidden rounded-xl border border-slate-200 focus-within:border-sky-400 focus-within:ring-4 focus-within:ring-sky-100">
              <span className="flex items-center border-r border-slate-200 bg-slate-50 px-3 text-sm text-slate-500">+91</span>
              <input
                id="contact-phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel-national"
                value={form.phone}
                onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))}
                required
                maxLength={16}
                placeholder="98765 43210"
                className="min-w-0 flex-1 px-3 py-2.5 text-sm outline-none"
              />
            </div>
            <p className="mt-1.5 text-xs text-slate-500">Enter the 10-digit Indian mobile number. We store it in +91 format.</p>
          </div>
          <div>
            <label htmlFor="contact-email" className="mb-1.5 block text-sm font-medium text-slate-700">Email <span className="text-slate-400">(optional)</span></label>
            <input
              id="contact-email"
              type="email"
              autoComplete="email"
              value={form.email}
              onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
              maxLength={254}
              placeholder="name@example.com"
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
            />
          </div>
          <div>
            <label htmlFor="contact-remarks" className="mb-1.5 block text-sm font-medium text-slate-700">Notes <span className="text-slate-400">(optional)</span></label>
            <textarea
              id="contact-remarks"
              value={form.remarks}
              onChange={(event) => setForm((current) => ({ ...current, remarks: event.target.value }))}
              rows={3}
              maxLength={1000}
              placeholder="Add any useful context"
              className="w-full resize-y rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
            />
          </div>

          {formError && (
            <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm leading-5 text-rose-800">
              {formError}
            </div>
          )}

          <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
            <button type="button" onClick={closeModal} disabled={isSaving} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">
              Cancel
            </button>
            <button type="submit" disabled={isSaving} className="inline-flex items-center gap-2 rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60">
              {editingContact ? <Pencil size={16} /> : <Plus size={16} />} {isSaving ? <><RefreshCw size={16} className="animate-spin" /> Waiting for Supabase…</> : editingContact ? "Save changes" : "Save contact"}
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={Boolean(acknowledgement)}
        title={acknowledgement?.title ?? "Database confirmation"}
        description="Confirmed by Supabase"
        onClose={() => setAcknowledgement(null)}
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-900">
            <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-emerald-100"><UsersRound size={16} /></span>
            <p className="text-sm leading-6">{acknowledgement?.message}</p>
          </div>
          <div className="flex justify-end border-t border-slate-100 pt-4">
            <button type="button" autoFocus onClick={() => setAcknowledgement(null)} className="min-h-11 rounded-xl bg-sky-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-sky-700">OK</button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={Boolean(deletingContact)}
        title="Delete contact?"
        description="This permanently removes the contact only if no existing Share uses it."
        onClose={() => { if (!isDeleting) { setDeletingContact(null); setDeleteError(null); } }}
      >
        <div className="space-y-4">
          <p className="text-sm leading-6 text-slate-600">
            {deletingContact ? <>Delete <strong className="text-slate-900">{deletingContact.name}</strong> from this workspace?</> : "Choose a contact to delete."}
            {" "}Contacts linked to existing Shares cannot be deleted, so their records remain intact.
          </p>
          {deleteError && (
            <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm leading-5 text-rose-800">
              {deleteError}
            </div>
          )}
          <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
            <button
              type="button"
              onClick={() => { setDeletingContact(null); setDeleteError(null); }}
              disabled={isDeleting}
              className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleDeleteContact()}
              disabled={isDeleting}
              className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isDeleting ? <RefreshCw size={16} className="animate-spin" /> : <Trash2 size={16} />} {isDeleting ? "Waiting for Supabase…" : "Delete contact"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

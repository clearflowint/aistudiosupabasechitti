// CFCF PRODUCT: Contacts screen wired to the existing Supabase contacts table.
// MIX: Reuses the shared Modal and the workspace identity supplied by the neutral app shell.

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { ContactRound, Plus, RefreshCw, Search, UsersRound, Pencil, Trash2 } from "lucide-react";
import type { AuthorizedWorkspace } from "../../../core/workspace/workspace.types";
import { Modal } from "../../../components/ui/Modal";
import type { CfcfContactRow } from "../types/database.types";
import { createCfcfContact, deleteCfcfContact, listCfcfContacts, listCfcfShareholderContactIds, updateCfcfContact } from "../services/contacts.service";
import { ContactGroupsPanel } from "./ContactGroupsPanel";

interface ContactsPageProps {
  workspace: AuthorizedWorkspace;
}

const emptyForm = { name: "", phone: "", email: "", remarks: "" };

export function ContactsPage({ workspace }: ContactsPageProps) {
  const [contacts, setContacts] = useState<CfcfContactRow[]>([]);
  const [shareholderContactIds, setShareholderContactIds] = useState<Set<string>>(() => new Set());
  const contactsRequestId = useRef(0);
  const savingContactRef = useRef(false);
  const deletingContactRef = useRef(false);
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
      const [rows, shareholderIds] = await Promise.all([
        listCfcfContacts(workspace.tenantId),
        listCfcfShareholderContactIds(workspace.tenantId),
      ]);
      if (requestId === contactsRequestId.current) {
        setContacts(rows);
        setShareholderContactIds(shareholderIds);
      }
    } catch (error) {
      if (requestId === contactsRequestId.current) {
        setContacts([]);
        setShareholderContactIds(new Set());
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
    if (!deletingContact || isDeleting || deletingContactRef.current) return;
    if (shareholderContactIds.has(deletingContact.contact_id)) {
      setDeleteError("This contact is a Shareholder because they have one or more Shares. Deletion is disabled.");
      return;
    }
    deletingContactRef.current = true;
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
      deletingContactRef.current = false;
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
    if (savingContactRef.current || isSaving) return;
    const digits = form.phone.replace(/\D/g, "");
    const normalizedDigits = digits.length === 12 && digits.startsWith("91") ? digits.slice(2) : digits.length === 11 && digits.startsWith("0") ? digits.slice(1) : digits;
    if (!form.name.trim() || !/^[6-9]\d{9}$/.test(normalizedDigits)) {
      setFormError(!form.name.trim() ? "Enter the contact's name." : "Enter a valid 10-digit Indian mobile number.");
      return;
    }
    if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      setFormError("Enter a valid email address or leave it blank.");
      return;
    }
    savingContactRef.current = true;
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
      savingContactRef.current = false;
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

      </section>

      <ContactGroupsPanel workspace={workspace} contacts={contacts} contactsLoaded={!isLoading && !loadError} />

      {notice && (
        <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {notice}
        </div>
      )}

      <section aria-label="Contact list" className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex min-w-0 items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-sky-50 text-sky-700">
              <UsersRound size={20} />
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-bold tracking-tight text-slate-950">Contact list</h2>
              <p className="mt-0.5 text-sm text-slate-500">{contacts.length} {contacts.length === 1 ? "contact" : "contacts"}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void loadContacts(true)}
            disabled={isLoading || isRefreshing}
            aria-label="Refresh contacts"
            title="Refresh contacts"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:border-sky-200 hover:bg-sky-50 hover:text-sky-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCw size={17} className={isRefreshing ? "animate-spin" : ""} />
          </button>
        </div>
        <label className="relative mt-4 block w-full border-t border-slate-100 pt-4">
          <Search size={17} className="pointer-events-none absolute left-3 top-[calc(50%+8px)] -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search name, phone, email or notes"
            className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
          />
        </label>
      </section>

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
        <section aria-live="polite" className="flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
          <RefreshCw size={17} className="animate-spin" /> Loading contacts from Supabase…
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
        <section aria-label="Saved contacts" className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <ul className="divide-y divide-slate-100">
            {filteredContacts.map((contact) => (
              <li key={contact.contact_id} className="flex min-w-0 flex-col gap-2.5 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-sky-50 text-sky-700">
                    <UsersRound size={19} />
                  </div>
                  <div className="min-w-0">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <h3 className="break-words text-sm font-semibold text-slate-950">{contact.name}</h3>
                      {shareholderContactIds.has(contact.contact_id) && (
                        <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">Shareholder</span>
                      )}
                    </div>
                    <p className="mt-0.5 break-all text-sm text-slate-600">{contact.phone}</p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center justify-end gap-2 self-end sm:self-auto">
                  <button
                    type="button"
                    onClick={() => openEditModal(contact)}
                    aria-label={"Edit " + contact.name}
                    title="Edit contact"
                    className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 bg-slate-50 text-slate-700 transition hover:bg-slate-100"
                  >
                    <Pencil size={17} />
                  </button>
                  <button
                    type="button"
                    onClick={() => { setDeleteError(null); setDeletingContact(contact); }}
                    disabled={shareholderContactIds.has(contact.contact_id)}
                    aria-label={shareholderContactIds.has(contact.contact_id) ? contact.name + " is a Shareholder and cannot be deleted" : "Delete " + contact.name}
                    title={shareholderContactIds.has(contact.contact_id) ? "Shareholder contacts cannot be deleted" : "Delete contact"}
                    className="grid h-10 w-10 place-items-center rounded-xl border border-rose-200 bg-rose-50 text-rose-800 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-rose-50"
                  >
                    <Trash2 size={17} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
          {search.trim() && (
            <p className="border-t border-slate-100 px-4 py-3 text-xs text-slate-500">
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
                inputMode="numeric"
                autoComplete="tel-national"
                value={form.phone}
                onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value.replace(/\D/g, "").slice(0, 10) }))}
                required
                maxLength={10}
                pattern="[6-9][0-9]{9}"
                title="Enter exactly 10 digits for an Indian mobile number"
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
            <button type="submit" disabled={isSaving || !form.name.trim() || !/^[6-9]\\d{9}$/.test(form.phone.replace(/\\D/g, "").replace(/^91(?=\\d{10}$)/, "").replace(/^0(?=\\d{10}$)/, ""))} className="inline-flex items-center gap-2 rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60">
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
        description="Shareholder contacts cannot be deleted because their existing Shares reference them."
        onClose={() => { if (!isDeleting) { setDeletingContact(null); setDeleteError(null); } }}
      >
        <div className="space-y-4">
          <p className="text-sm leading-6 text-slate-600">
            {deletingContact ? <>Delete <strong className="text-slate-900">{deletingContact.name}</strong> from this workspace?</> : "Choose a contact to delete."}
            {" "}Contacts linked to one or more Shares are tagged as Shareholder and cannot be deleted, so their records remain intact.
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

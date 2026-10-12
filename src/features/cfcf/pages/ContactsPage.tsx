// CFCF PRODUCT: Contacts screen wired to the existing Supabase contacts table.
// MIX: Reuses the shared Modal and the workspace identity supplied by the neutral app shell.

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Mail, MessageCircle, Phone, Plus, RefreshCw, Search, UsersRound } from "lucide-react";
import type { AuthorizedWorkspace } from "../../../core/workspace/workspace.types";
import { Modal } from "../../../components/ui/Modal";
import type { CfcfContactRow } from "../types/database.types";
import { createCfcfContact, listCfcfContacts } from "../services/contacts.service";

interface ContactsPageProps {
  workspace: AuthorizedWorkspace;
}

const emptyForm = { name: "", phone: "", email: "", remarks: "" };

export function ContactsPage({ workspace }: ContactsPageProps) {
  const [contacts, setContacts] = useState<CfcfContactRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  async function loadContacts(showRefreshState = false) {
    if (showRefreshState) setIsRefreshing(true);
    else setIsLoading(true);
    setLoadError(null);

    try {
      const rows = await listCfcfContacts(workspace.tenantId);
      setContacts(rows);
    } catch (error) {
      setContacts([]);
      setLoadError(error instanceof Error ? error.message : "Unable to load contacts.");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
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
    setForm(emptyForm);
    setFormError(null);
  }

  async function handleCreateContact(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setIsSaving(true);

    try {
      const created = await createCfcfContact(workspace.tenantId, form);
      setContacts((current) =>
        [...current, created].sort((a, b) => a.name.localeCompare(b.name)),
      );
      setNotice("Contact added successfully.");
      setIsModalOpen(false);
      setForm(emptyForm);
      setSearch("");
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Unable to add contact.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
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
          <button
            type="button"
            onClick={() => { setNotice(null); setFormError(null); setIsModalOpen(true); }}
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-700"
          >
            <Plus size={17} /> Add contact
          </button>
        </div>

        <div className="mt-5 flex flex-col gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:items-center sm:justify-between">
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
              onClick={() => setIsModalOpen(true)}
              className="mt-5 inline-flex items-center gap-2 rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-700"
            >
              <Plus size={16} /> Add first contact
            </button>
          )}
        </section>
      ) : !loadError ? (
        <section className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
          {filteredContacts.map((contact) => (
            <article key={contact.contact_id} className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
              <div className="flex min-w-0 items-start gap-3">
                <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-sky-50 text-sky-700">
                  <UsersRound size={20} />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="break-words text-base font-semibold text-slate-950">{contact.name}</h3>
                  <p className="mt-1 break-words text-xs leading-5 text-slate-400">
                    Added {new Date(contact.created_at).toLocaleDateString("en-IN")}
                  </p>
                </div>
              </div>

              <div className="mt-4 space-y-2 border-t border-slate-100 pt-3">
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

              <div className="mt-4 grid grid-cols-2 gap-2">
                <a
                  href={"tel:" + contact.phone}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 px-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  <Phone size={15} /> Call
                </a>
                <a
                  href={"https://wa.me/" + contact.phone.replace(/\\D/g, "")}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-2 text-sm font-semibold text-white transition hover:bg-emerald-700"
                >
                  <MessageCircle size={15} /> WhatsApp
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
        title="Add a contact"
        description="Contact details are saved to the current authorized CFCF workspace."
        onClose={closeModal}
      >
        <form onSubmit={(event) => void handleCreateContact(event)} className="space-y-4">
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
              <Plus size={16} /> {isSaving ? "Saving…" : "Save contact"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

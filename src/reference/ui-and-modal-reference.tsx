// SKELETON REFERENCE ONLY: main.tsx mounts this demo at /ui-reference, outside the live workspace.
// Use it to discuss styling and modal structure. Buttons below never save data.
import { useState, type ReactNode } from "react";
import { BookOpen, CreditCard, Plus, UserRound, XCircle } from "lucide-react";
import { Modal } from "../components/ui/Modal";

type ModalExample = "new-record" | "payment-entry" | "confirmation" | null;

export function UiAndModalReference() {
  const [activeExample, setActiveExample] = useState<ModalExample>(null);

  const closeModal = () => setActiveExample(null);

  const modalContent: Record<Exclude<ModalExample, null>, { title: string; description: string; content: ReactNode; size?: "medium" | "large" }> = {
    "new-record": {
      title: "Add a contact",
      description: "Form layout reference only — no record is created.",
      content: (
        <form onSubmit={(event) => event.preventDefault()} className="space-y-4">
          <FormField label="Full name" placeholder="Enter a name" />
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Phone number" placeholder="Enter phone number" />
            <FormField label="Email (optional)" placeholder="name@example.com" />
          </div>
          <FormField label="Notes (optional)" placeholder="Add a short note" />
          <ReferenceActions onCancel={closeModal} primaryLabel="Preview only" />
        </form>
      ),
    },
    "payment-entry": {
      title: "Record an entry",
      description: "Example financial-entry form. It does not calculate or save anything.",
      size: "large",
      content: (
        <form onSubmit={(event) => event.preventDefault()} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Entry amount" placeholder="0.00" inputMode="decimal" />
            <FormField label="Entry date" placeholder="YYYY-MM-DD" />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Entry type</label>
            <select defaultValue="" className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-100">
              <option value="" disabled>Select an entry type</option>
              <option value="credit">Credit</option>
              <option value="debit">Debit</option>
            </select>
          </div>
          <FormField label="Reference / notes" placeholder="Optional description" />
          <ReferenceActions onCancel={closeModal} primaryLabel="Preview only" />
        </form>
      ),
    },
    confirmation: {
      title: "Confirm action",
      description: "Use a confirmation step for actions that cannot be easily undone.",
      content: (
        <div>
          <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
            <XCircle size={18} className="mt-0.5 shrink-0 text-amber-700" />
            <p>Example: confirm that you really want to close or reverse a record before a trusted service performs the change.</p>
          </div>
          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <button type="button" onClick={closeModal} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50">Cancel</button>
            <button type="button" onClick={closeModal} className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800">Dismiss preview</button>
          </div>
        </div>
      ),
    },
  };

  const currentExample = activeExample ? modalContent[activeExample] : null;

  return (
    <main className="min-h-screen bg-slate-100 p-4 text-slate-900 sm:p-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="rounded-3xl bg-slate-950 p-6 text-white sm:p-8">
          <div className="flex items-center gap-2 text-sm text-sky-200"><BookOpen size={17} /> Design reference</div>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">Workspace UI and modal patterns</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">Reference components only. Reuse the layout, field spacing, border, and button styles; replace the sample fields with the selected product’s real fields and wired service actions.</p>
          <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-amber-200">No database writes · Not part of the live workspace</p>
        </header>

        <section className="grid gap-4 md:grid-cols-3">
          <ReferenceCard icon={<UserRound size={20} />} title="New record modal" description="Compact form with a clear title, short helper text, and grouped fields." onOpen={() => setActiveExample("new-record")} />
          <ReferenceCard icon={<CreditCard size={20} />} title="Transaction modal" description="More room for structured fields without squeezing labels." onOpen={() => setActiveExample("payment-entry")} />
          <ReferenceCard icon={<XCircle size={20} />} title="Confirmation modal" description="Separate a destructive decision from the main form." onOpen={() => setActiveExample("confirmation")} />
        </section>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 text-sm leading-6 text-slate-600">
          <div className="flex items-center gap-2 font-semibold text-slate-900"><Plus size={17} /> Reuse rule</div>
          <p className="mt-2">The shared Modal handles only the overlay, dialog semantics, close button, Escape key, and optional footer. Validation, saving, tenant checks, and transaction logic belong to the specific feature module.</p>
        </div>
      </div>

      {currentExample && (
        <Modal
          isOpen={Boolean(activeExample)}
          title={currentExample.title}
          description={currentExample.description}
          size={currentExample.size}
          onClose={closeModal}
        >
          {currentExample.content}
        </Modal>
      )}
    </main>
  );
}

function ReferenceCard({ icon, title, description, onOpen }: { icon: ReactNode; title: string; description: string; onOpen: () => void }) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="grid h-10 w-10 place-items-center rounded-xl bg-sky-50 text-sky-700">{icon}</div>
      <h2 className="mt-4 font-semibold">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-slate-500">{description}</p>
      <button type="button" onClick={onOpen} className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-sky-700 hover:text-sky-900">
        Preview pattern <Plus size={15} />
      </button>
    </article>
  );
}

function FormField({ label, placeholder, inputMode }: { label: string; placeholder: string; inputMode?: "text" | "decimal" }) {
  const id = label.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-slate-700">{label}</label>
      <input id={id} inputMode={inputMode} placeholder={placeholder} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition placeholder:text-slate-400 focus:border-sky-400 focus:ring-4 focus:ring-sky-100" />
    </div>
  );
}

function ReferenceActions({ onCancel, primaryLabel }: { onCancel: () => void; primaryLabel: string }) {
  return (
    <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
      <button type="button" onClick={onCancel} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50">Cancel</button>
      <button type="button" onClick={onCancel} className="rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-700">{primaryLabel}</button>
    </div>
  );
}

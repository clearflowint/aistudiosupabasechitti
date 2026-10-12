// SKELETON: Product-neutral mobile home. Keep it focused on the two primary destinations.
// MIX: The product provides destination metadata; navigation remains owned by the shared shell.

import { ArrowRight, ContactRound, ShieldCheck, WalletCards } from "lucide-react";
import type { ProductDefinition } from "../../core/products/product.types";
import type { AuthorizedWorkspace } from "../../core/workspace/workspace.types";

interface WorkspaceHomePageProps {
  product: ProductDefinition;
  workspace: AuthorizedWorkspace;
  onNavigate: (pageId: string) => void;
}

export function WorkspaceHomePage({ product, workspace, onNavigate }: WorkspaceHomePageProps) {
  const crm = product.navigation.find(({ id }) => id === "crm");
  const workspacePage = product.navigation.find(({ id }) => id === "workspace");

  return (
    <div className="min-w-0 space-y-4">
      <section className="overflow-hidden rounded-3xl bg-slate-950 p-5 text-white shadow-sm sm:p-7">
        <div className="inline-flex items-center gap-2 rounded-full border border-sky-300/20 bg-sky-300/10 px-3 py-1.5 text-xs font-medium text-sky-200">
          <ShieldCheck size={14} /> Workspace access verified
        </div>
        <h2 className="mt-5 break-words text-2xl font-bold tracking-tight sm:text-3xl">
          Welcome, {workspace.displayName}.
        </h2>
        <p className="mt-2 max-w-lg break-words text-sm leading-6 text-slate-300">
          Everything you need, with fewer screens and no side menu.
        </p>
        <div className="mt-4 border-t border-white/10 pt-3">
          <p className="break-all text-xs text-slate-400">{workspace.email}</p>
        </div>
      </section>

      <section aria-label="Quick access" className="space-y-3">
        {crm && (
          <button
            type="button"
            onClick={() => onNavigate(crm.id)}
            className="flex min-h-28 w-full min-w-0 items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-sky-200 hover:shadow-md sm:p-5"
          >
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-sky-50 text-sky-700">
              <ContactRound size={23} />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-base font-bold text-slate-950">CRM</h3>
              <p className="mt-1 break-words text-sm leading-5 text-slate-500">Manage contacts and keep their details ready for your funds.</p>
            </div>
            <ArrowRight size={19} className="shrink-0 text-sky-700" />
          </button>
        )}

        {workspacePage && (
          <button
            type="button"
            onClick={() => onNavigate(workspacePage.id)}
            className="flex min-h-32 w-full min-w-0 items-center gap-4 rounded-2xl bg-sky-600 p-4 text-left text-white shadow-sm transition hover:bg-sky-700 sm:p-5"
          >
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white/15 text-white">
              <WalletCards size={24} />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-lg font-bold">Enter workspace</h3>
              <p className="mt-1 break-words text-sm leading-5 text-sky-100">Open all funds, cycles, shares, and ledger entries in one place.</p>
            </div>
            <ArrowRight size={20} className="shrink-0" />
          </button>
        )}
      </section>

      <p className="px-1 text-center text-xs leading-5 text-slate-500">
        ClearFlow · Designed for quick, one-hand mobile use.
      </p>
    </div>
  );
}

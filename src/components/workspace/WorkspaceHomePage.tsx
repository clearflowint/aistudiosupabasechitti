// SKELETON: Product-neutral mobile home. Keep it focused on the two primary destinations.
// MIX: The product provides destination metadata; navigation remains owned by the shared shell.

import { ArrowRight, History, ShieldCheck, WalletCards } from "lucide-react";
import { ContactsPage } from "../../features/cfcf/pages/ContactsPage";
import type { ProductDefinition } from "../../core/products/product.types";
import type { AuthorizedWorkspace } from "../../core/workspace/workspace.types";

interface WorkspaceHomePageProps {
  product: ProductDefinition;
  workspace: AuthorizedWorkspace;
  onNavigate: (pageId: string) => void;
}

export function WorkspaceHomePage({ product, workspace, onNavigate }: WorkspaceHomePageProps) {
  const workspacePage = product.navigation.find(({ id }) => id === "workspace");
  const activityPage = product.navigation.find(({ id }) => id === "activity");

  return (
    <div className="min-w-0 space-y-4">
      <section className="overflow-hidden rounded-3xl border border-sky-100 bg-gradient-to-br from-white via-white to-sky-50 p-4 text-slate-900 shadow-sm sm:p-6">
        <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800">
          <ShieldCheck size={14} /> Workspace access verified
        </div>
        <h2 className="mt-3 break-words text-xl font-bold tracking-tight sm:text-2xl">
          Welcome, {workspace.displayName}.
        </h2>
        <p className="mt-1 max-w-lg break-words text-sm leading-5 text-slate-600">
          Everything you need, with fewer screens and no side menu.
        </p>
        <div className="mt-3 border-t border-slate-200 pt-3">
          <p className="break-all text-xs text-slate-500">{workspace.email}</p>
        </div>
      </section>

      <section aria-label="Quick access" className="space-y-3">
        {workspacePage && (
          <button
            type="button"
            onClick={() => onNavigate(workspacePage.id)}
            className="flex min-h-24 w-full min-w-0 items-center gap-3 rounded-2xl border border-sky-200 bg-sky-600 p-3 text-left text-white shadow-sm transition hover:bg-sky-700 sm:p-4"
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
        {activityPage && (
          <button
            type="button"
            onClick={() => onNavigate(activityPage.id)}
            className="flex min-h-20 w-full min-w-0 items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 text-left text-slate-900 shadow-sm transition hover:bg-slate-50 sm:p-4"
          >
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-700">
              <History size={22} />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-base font-bold">Manager Activity Log</h3>
              <p className="mt-1 break-words text-sm leading-5 text-slate-600">Review the latest 500 recorded actions, newest first.</p>
            </div>
            <ArrowRight size={20} className="shrink-0 text-slate-500" />
          </button>
        )}
      </section>

      <ContactsPage workspace={workspace} />

      <p className="px-1 text-center text-xs leading-5 text-slate-500">
        ClearFlow · Designed for quick, one-hand mobile use.
      </p>
    </div>
  );
}

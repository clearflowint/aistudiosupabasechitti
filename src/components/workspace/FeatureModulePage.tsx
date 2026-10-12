// SKELETON: Shared feature landing pattern. A product can replace it with a dedicated page anytime.
import { ArrowRight, Construction, Layers3 } from "lucide-react";
import type { WorkspaceNavigationItem } from "../../core/products/product.types";
import type { AuthorizedWorkspace } from "../../core/workspace/workspace.types";

interface FeatureModulePageProps {
  navigationItem: WorkspaceNavigationItem;
  workspace: AuthorizedWorkspace;
}

export function FeatureModulePage({ navigationItem, workspace }: FeatureModulePageProps) {
  const Icon = navigationItem.icon;

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
          <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-sky-50 text-sky-700">
            <Icon size={23} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800">
              <Construction size={13} /> Skeleton page
            </div>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight text-slate-900">{navigationItem.label}</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">{navigationItem.description} This is the reusable starting point; no records are read or written by this placeholder.</p>
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-2">
          <h3 className="font-semibold text-slate-900">Implementation checklist</h3>
          <ul className="mt-4 space-y-3 text-sm leading-6 text-slate-600">
            <li className="flex gap-3"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-sky-500" /><span>Confirm the exact fields already present in Supabase. Do not create a new schema just to fit the UI.</span></li>
            <li className="flex gap-3"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-sky-500" /><span>Build a product-specific service that scopes every query to the authorized tenant and product.</span></li>
            <li className="flex gap-3"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-sky-500" /><span>Add typed loading, empty, error, and success states before adding mutations.</span></li>
          </ul>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-slate-950 p-5 text-slate-200 shadow-sm">
          <div className="flex items-center gap-2 font-semibold text-white"><Layers3 size={17} className="text-sky-300" /> Workspace context</div>
          <p className="mt-2 text-xs leading-5 text-slate-400">Safe display fields supplied by the shared shell.</p>
          <div className="mt-4 border-t border-white/10 pt-4">
            <p className="text-sm font-medium text-white">{workspace.displayName}</p>
            <p className="mt-1 break-all text-xs text-slate-400">{workspace.email}</p>
          </div>
          <div className="mt-4 flex items-center gap-2 text-xs text-emerald-200">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Access verified
          </div>
        </article>
      </section>

      <div className="flex items-start gap-3 rounded-xl border border-sky-100 bg-sky-50 p-4 text-sm leading-6 text-sky-950">
        <ArrowRight size={17} className="mt-0.5 shrink-0 text-sky-700" />
        <p>Next step: implement this module in its product folder, then register the real page renderer in that product’s definition. The shared app shell does not need to change.</p>
      </div>
    </div>
  );
}

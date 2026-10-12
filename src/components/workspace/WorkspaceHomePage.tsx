// SKELETON: Product-neutral home page. It presents navigation, not invented financial metrics.
import { ArrowUpRight, CheckCircle2, Layers3, ShieldCheck } from "lucide-react";
import type { ProductDefinition, WorkspaceNavigationItem } from "../../core/products/product.types";
import type { AuthorizedWorkspace } from "../../core/workspace/workspace.types";

interface WorkspaceHomePageProps {
  product: ProductDefinition;
  workspace: AuthorizedWorkspace;
  onNavigate: (pageId: string) => void;
}

export function WorkspaceHomePage({ product, workspace, onNavigate }: WorkspaceHomePageProps) {
  const modules = product.navigation.filter(({ isHome }) => !isHome);

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-3xl bg-slate-950 p-6 text-white shadow-sm sm:p-8">
        <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
          <div className="max-w-2xl">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-sky-300/20 bg-sky-300/10 px-3 py-1.5 text-xs font-medium text-sky-200">
              <Layers3 size={14} /> {product.name}
            </div>
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              Welcome, {workspace.displayName}.
            </h2>
            <p className="mt-3 max-w-xl text-sm leading-6 text-slate-300 sm:text-base">
              {product.description} Choose a module below to get started.
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs text-emerald-200">
            <CheckCircle2 size={16} /> Workspace access verified
          </div>
        </div>
      </section>

      <section aria-labelledby="modules-heading">
        <div className="mb-4 flex items-end justify-between gap-4">
          <div>
            <h2 id="modules-heading" className="text-lg font-semibold tracking-tight text-slate-900">Your workspace</h2>
            <p className="mt-1 text-sm text-slate-500">Modules are independent and can be built one at a time.</p>
          </div>
          <span className="hidden rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-500 sm:inline-flex">
            {modules.length} modules
          </span>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {modules.map((module) => (
            <ModuleCard key={module.id} module={module} onOpen={() => onNavigate(module.id)} />
          ))}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2 font-semibold text-slate-900">
            <ShieldCheck size={18} className="text-emerald-600" /> Secure workspace
          </div>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            Your signed-in email has been checked against the product access rules. Database policies remain the final data-access boundary.
          </p>
          <div className="mt-4 border-t border-slate-100 pt-4">
            <p className="text-sm font-medium text-slate-800">{workspace.displayName}</p>
            <p className="mt-1 break-all text-sm text-slate-500">{workspace.email}</p>
          </div>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="font-semibold text-slate-900">A simple build order</h2>
          <ol className="mt-3 space-y-3 text-sm text-slate-600">
            <li className="flex gap-3"><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-sky-50 text-xs font-semibold text-sky-700">1</span><span>Agree on the screen and modal design.</span></li>
            <li className="flex gap-3"><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-sky-50 text-xs font-semibold text-sky-700">2</span><span>Connect each feature to existing database fields and access rules.</span></li>
            <li className="flex gap-3"><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-sky-50 text-xs font-semibold text-sky-700">3</span><span>Add validated writes only after the read flow is verified.</span></li>
          </ol>
        </article>
      </section>
    </div>
  );
}

function ModuleCard({ module, onOpen }: { module: WorkspaceNavigationItem; onOpen: () => void }) {
  const Icon = module.icon;

  return (
    <article className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-sky-200 hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div className="grid h-11 w-11 place-items-center rounded-xl bg-sky-50 text-sky-700">
          <Icon size={21} />
        </div>
        <button
          type="button"
          onClick={onOpen}
          aria-label={"Open " + module.label}
          className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-sky-700"
        >
          <ArrowUpRight size={18} />
        </button>
      </div>
      <h3 className="mt-4 font-semibold text-slate-900">{module.label}</h3>
      <p className="mt-1 min-h-12 text-sm leading-6 text-slate-500">{module.description}</p>
      <button type="button" onClick={onOpen} className="mt-4 text-sm font-semibold text-sky-700 hover:text-sky-900">
        Open module <span aria-hidden="true">→</span>
      </button>
    </article>
  );
}

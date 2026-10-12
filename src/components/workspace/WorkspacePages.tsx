import {
  Activity,
  BriefcaseBusiness,
  ChevronRight,
  CreditCard,
  ShieldCheck,
  Users,
} from "lucide-react";
import type { AuthorizedWorkspace } from "../../core/workspace/workspace.types";
import type { WorkspacePage } from "./workspace.types";

type WorkspaceSection = {
  label: string;
  description: string;
  icon: typeof BriefcaseBusiness;
};

export function WorkspacePlaceholder({
  section,
  workspace,
}: {
  section: WorkspaceSection;
  workspace: AuthorizedWorkspace;
}) {
  const Icon = section.icon;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
      <div className="mb-5 grid h-12 w-12 place-items-center rounded-xl bg-sky-50 text-sky-700">
        <Icon size={23} />
      </div>
      <p className="text-xs font-semibold uppercase tracking-[0.15em] text-sky-700">Feature module</p>
      <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">{section.label}</h2>
      <p className="mt-2 max-w-xl text-sm leading-6 text-slate-500">
        {section.description}. Implement this module independently with its own types, service layer, and UI.
      </p>
      <WorkspaceIdentity workspace={workspace} />
    </section>
  );
}

export function WorkspaceIdentity({ workspace }: { workspace: AuthorizedWorkspace }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex items-center gap-2 font-semibold">
        <ShieldCheck size={18} className="text-emerald-600" />
        Authorized workspace
      </div>
      <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <div className="text-xs text-slate-500">Manager</div>
          <div className="mt-1 font-medium">{workspace.managerName}</div>
          <div className="text-slate-500">{workspace.email}</div>
        </div>
        <div>
          <div className="text-xs text-slate-500">Tenant ID</div>
          <div className="mt-1 break-all font-mono text-xs">{workspace.tenantId}</div>
        </div>
      </div>
    </section>
  );
}

export function OverviewPage({
  workspace,
  onNavigate,
}: {
  workspace: AuthorizedWorkspace;
  onNavigate: (page: WorkspacePage) => void;
}) {
  const cards = [
    {
      id: "contacts",
      title: "Contacts",
      description: "Manage contact records through a dedicated CRM module.",
      icon: Users,
      color: "bg-sky-50 text-sky-700",
    },
    {
      id: "funds",
      title: "Funds",
      description: "Manage funds and cycle details against the existing database schema.",
      icon: BriefcaseBusiness,
      color: "bg-indigo-50 text-indigo-700",
    },
    {
      id: "payments",
      title: "Payments & ledger",
      description: "Keep financial workflows separate and tenant-aware.",
      icon: CreditCard,
      color: "bg-emerald-50 text-emerald-700",
    },
  ] as const;

  return (
    <div className="space-y-6">
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {cards.map(({ id, title, description, icon: Icon, color }) => (
          <article key={id} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className={`grid h-10 w-10 place-items-center rounded-xl ${color}`}>
              <Icon size={20} />
            </div>
            <h2 className="mt-4 font-semibold">{title}</h2>
            <p className="mt-1 text-sm leading-6 text-slate-500">{description}</p>
            <button
              onClick={() => onNavigate(id)}
              className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-sky-700"
            >
              Open {title.toLowerCase()} <ChevronRight size={15} />
            </button>
          </article>
        ))}
      </section>
      <WorkspaceIdentity workspace={workspace} />
    </div>
  );
}

export function LoadingScreen({ message }: { message: string }) {
  return (
    <main className="grid min-h-screen place-items-center bg-slate-950 text-slate-200">
      <div className="flex items-center gap-3 text-sm">
        <Activity className="animate-pulse text-sky-400" size={20} />
        {message}
      </div>
    </main>
  );
}

export function DatabaseStatus({ connected }: { connected: boolean }) {
  return (
    <div className={`hidden items-center gap-2 rounded-full px-3 py-1.5 text-xs sm:flex ${connected ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${connected ? "bg-emerald-500" : "bg-amber-500"}`} />
      {connected ? "Database connected" : "Database unavailable"}
    </div>
  );
}

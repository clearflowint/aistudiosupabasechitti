import { useEffect, useState } from "react";
import { Activity, BookOpen, BriefcaseBusiness, ChevronRight, CircleHelp, ContactRound, CreditCard, Database, LayoutDashboard, LogOut, Menu, Settings2, ShieldCheck, Users, X } from "lucide-react";
import { LandingPage } from "./components/LandingPage";
import { authService } from "./core/auth/auth.service";
import { checkTenantDatabaseConnection, type ConnectionStatus } from "./core/database/connection.service";
import { resolveCfcfWorkspace, type AuthorizedWorkspace } from "./features/cfcf/services/access.service";

type PageId = "dashboard" | "contacts" | "funds" | "payments" | "reports" | "settings";

const navigation: { id: PageId; label: string; icon: typeof LayoutDashboard; description: string }[] = [
  { id: "dashboard", label: "Overview", icon: LayoutDashboard, description: "Your workspace at a glance" },
  { id: "contacts", label: "Contacts", icon: ContactRound, description: "Customer and business relationships" },
  { id: "funds", label: "Funds", icon: BriefcaseBusiness, description: "Fund records and cycle details" },
  { id: "payments", label: "Payments & ledger", icon: CreditCard, description: "Recorded transactions and entries" },
  { id: "reports", label: "Reports", icon: BookOpen, description: "Workspace reports" },
  { id: "settings", label: "Settings", icon: Settings2, description: "Workspace configuration" },
];

function FeaturePlaceholder({ page, workspace }: { page: PageId; workspace: AuthorizedWorkspace }) {
  const item = navigation.find((entry) => entry.id === page) ?? navigation[0];
  const Icon = item.icon;
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
      <div className="mb-5 grid h-12 w-12 place-items-center rounded-xl bg-sky-50 text-sky-700"><Icon size={23} /></div>
      <p className="text-xs font-semibold uppercase tracking-[0.15em] text-sky-700">Feature module</p>
      <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">{item.label}</h2>
      <p className="mt-2 max-w-xl text-sm leading-6 text-slate-500">{item.description}. This page is intentionally a clean skeleton placeholder while the feature's types, service layer, and UI are implemented separately.</p>
      <div className="mt-6 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">
        <div className="font-medium text-slate-800">Workspace context is verified</div>
        <div className="mt-1">Product: CFCF · Tenant: {workspace.tenantId}</div>
        <div>Manager: {workspace.managerName} · Person ID: {workspace.personId}</div>
      </div>
    </section>
  );
}

export default function App() {
  const [authUser, setAuthUser] = useState<{ id: string; email?: string } | null>(null);
  const [workspace, setWorkspace] = useState<AuthorizedWorkspace | null>(null);
  const [page, setPage] = useState<PageId>("dashboard");
  const [loading, setLoading] = useState(true);
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connection, setConnection] = useState<ConnectionStatus | null>(null);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    let active = true;
    void authService.getCurrentUser().then((user) => {
      if (active) setAuthUser(user ? { id: user.id, email: user.email } : null);
    }).finally(() => {
      if (active) setLoading(false);
    });
    const subscription = authService.onAuthStateChange((user) => {
      if (active) {
        setAuthUser(user ? { id: user.id, email: user.email } : null);
        setWorkspace(null);
        setError(null);
      }
    });
    return () => {
      active = false;
      subscription.data.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    let active = true;
    if (!authUser?.email) {
      setWorkspace(null);
      setConnection(null);
      return;
    }
    setLoading(true);
    void resolveCfcfWorkspace(authUser.email).then(async (resolved) => {
      if (!active) return;
      setWorkspace(resolved);
      const status = await checkTenantDatabaseConnection(resolved.tenantId);
      if (active) setConnection(status);
    }).catch((reason: unknown) => {
      if (active) {
        setWorkspace(null);
        setError(reason instanceof Error ? reason.message : "Unable to authorize this workspace.");
      }
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [authUser?.email]);

  const handleSignIn = async () => {
    setSigningIn(true);
    setError(null);
    try {
      await authService.signInWithGoogle();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Google sign-in failed.");
      setSigningIn(false);
    }
  };

  const handleSignOut = async () => {
    setLoading(true);
    try {
      await authService.signOut();
      setAuthUser(null);
      setWorkspace(null);
      setPage("dashboard");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Sign-out failed.");
    } finally {
      setLoading(false);
    }
  };

  if (loading && !workspace && !error) {
    return <main className="grid min-h-screen place-items-center bg-slate-950 text-slate-200"><div className="flex items-center gap-3 text-sm"><Activity className="animate-pulse text-sky-400" size={20} /> Restoring secure session…</div></main>;
  }

  if (!authUser) return <LandingPage onSignIn={handleSignIn} loading={signingIn} error={error} />;

  if (error && !workspace) {
    return <main className="grid min-h-screen place-items-center bg-slate-950 p-6 text-slate-100"><section className="w-full max-w-lg rounded-2xl border border-rose-300/20 bg-slate-900 p-7"><ShieldCheck className="mb-4 text-rose-300" size={28} /><h1 className="text-xl font-semibold">Workspace access not granted</h1><p className="mt-3 text-sm leading-6 text-slate-300">{error}</p><div className="mt-6 flex gap-3"><button onClick={() => { setError(null); setLoading(true); void authService.getCurrentUser().then(user => setAuthUser(user ? { id: user.id, email: user.email } : null)).finally(() => setLoading(false)); }} className="rounded-lg bg-sky-500 px-4 py-2 text-sm font-semibold text-white">Try again</button><button onClick={() => void handleSignOut()} className="rounded-lg border border-white/15 px-4 py-2 text-sm">Sign out</button></div></section></main>;
  }

  if (!workspace) return <main className="grid min-h-screen place-items-center bg-slate-950 text-slate-200">Loading authorized workspace…</main>;

  const activePage = navigation.find((item) => item.id === page) ?? navigation[0];
  const ActiveIcon = activePage.icon;

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      {mobileNavOpen && <button aria-label="Close navigation overlay" onClick={() => setMobileNavOpen(false)} className="fixed inset-0 z-40 bg-slate-950/50 lg:hidden" />}
      <aside className={`fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-slate-800 bg-slate-950 text-slate-200 transition-transform lg:translate-x-0 ${mobileNavOpen ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="flex h-20 items-center gap-3 border-b border-white/10 px-6">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-sky-500/15 text-sky-300"><Layers3Icon /></div>
          <div><div className="font-semibold tracking-tight text-white">ClearFlow</div><div className="text-xs text-slate-400">Workspace platform</div></div>
          <button aria-label="Close menu" onClick={() => setMobileNavOpen(false)} className="ml-auto rounded-lg p-2 hover:bg-white/10 lg:hidden"><X size={18} /></button>
        </div>
        <div className="px-4 py-5"><div className="rounded-xl border border-white/10 bg-white/[0.04] p-3"><div className="text-xs text-slate-400">Signed in as</div><div className="mt-1 truncate text-sm font-medium text-white">{workspace.managerName}</div><div className="truncate text-xs text-slate-400">{workspace.email}</div></div></div>
        <nav aria-label="Main navigation" className="flex-1 space-y-1 px-3">
          {navigation.map((item) => {
            const Icon = item.icon;
            const selected = page === item.id;
            return <button key={item.id} onClick={() => { setPage(item.id); setMobileNavOpen(false); }} className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm transition ${selected ? "bg-sky-500/15 font-medium text-sky-200" : "text-slate-400 hover:bg-white/[0.05] hover:text-white"}`}><Icon size={18} /><span>{item.label}</span>{selected && <ChevronRight className="ml-auto" size={16} />}</button>;
          })}
        </nav>
        <div className="border-t border-white/10 p-4"><button onClick={() => void handleSignOut()} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm text-slate-400 hover:bg-rose-500/10 hover:text-rose-200"><LogOut size={18} /> Sign out</button><div className="mt-3 flex items-center gap-2 px-3 text-xs text-slate-500"><ShieldCheck size={14} /> Access verified by Supabase</div></div>
      </aside>

      <div className="min-h-screen lg:pl-72">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-slate-200 bg-white/90 px-4 backdrop-blur sm:px-7">
          <div className="flex items-center gap-3"><button aria-label="Open navigation" onClick={() => setMobileNavOpen(true)} className="rounded-lg p-2 hover:bg-slate-100 lg:hidden"><Menu size={20} /></button><div><div className="flex items-center gap-2 text-sm font-semibold"><ActiveIcon size={17} className="text-sky-700" />{activePage.label}</div><div className="hidden text-xs text-slate-500 sm:block">{activePage.description}</div></div></div>
          <div className="flex items-center gap-3"><div className={`hidden items-center gap-2 rounded-full px-3 py-1.5 text-xs sm:flex ${connection?.connected ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}><span className={`h-1.5 w-1.5 rounded-full ${connection?.connected ? "bg-emerald-500" : "bg-amber-500"}`} />{connection?.connected ? "Database connected" : "Database unavailable"}</div><button onClick={() => void handleSignOut()} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50">Sign out</button></div>
        </header>
        <main className="mx-auto max-w-7xl space-y-6 p-4 sm:p-7">
          {connection && !connection.connected && <div role="status" className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><Database size={19} className="mt-0.5 shrink-0" /><div><div className="font-semibold">Database connection needs attention</div><div className="mt-1">{connection.message}</div></div><button onClick={() => void checkTenantDatabaseConnection(workspace.tenantId).then(setConnection)} className="ml-auto shrink-0 font-semibold underline">Retry</button></div>}
          <div><p className="text-sm text-slate-500">CFCF workspace</p><h1 className="mt-1 text-2xl font-semibold tracking-tight">{page === "dashboard" ? `Welcome, ${workspace.managerName}` : activePage.label}</h1><p className="mt-2 text-sm text-slate-500">Reusable platform shell · Feature modules are kept separate from shared infrastructure.</p></div>
          {page === "dashboard" ? <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3"><div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><div className="grid h-10 w-10 place-items-center rounded-xl bg-sky-50 text-sky-700"><Users size={20} /></div><h2 className="mt-4 font-semibold">Contacts</h2><p className="mt-1 text-sm leading-6 text-slate-500">A dedicated CRM module will manage contact records through its own types and service layer.</p><button onClick={() => setPage("contacts")} className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-sky-700">Open contacts <ChevronRight size={15} /></button></div><div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><div className="grid h-10 w-10 place-items-center rounded-xl bg-indigo-50 text-indigo-700"><BriefcaseBusiness size={20} /></div><h2 className="mt-4 font-semibold">Funds</h2><p className="mt-1 text-sm leading-6 text-slate-500">Fund, share, and cycle workflows will be implemented against the canonical database schema.</p><button onClick={() => setPage("funds")} className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-sky-700">Open funds <ChevronRight size={15} /></button></div><div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><div className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-50 text-emerald-700"><CreditCard size={20} /></div><h2 className="mt-4 font-semibold">Payments & ledger</h2><p className="mt-1 text-sm leading-6 text-slate-500">Financial workflows will use trusted operations and tenant-aware database policies.</p><button onClick={() => setPage("payments")} className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-sky-700">Open ledger <ChevronRight size={15} /></button></div></section> : <FeaturePlaceholder page={page} workspace={workspace} />}
          <section className="rounded-2xl border border-slate-200 bg-white p-5"><div className="flex items-center gap-2 font-semibold"><ShieldCheck size={18} className="text-emerald-600" /> Workspace authorization</div><div className="mt-3 grid gap-3 text-sm sm:grid-cols-2"><div><div className="text-xs text-slate-500">Manager</div><div className="mt-1 font-medium">{workspace.managerName}</div><div className="text-slate-500">{workspace.email}</div></div><div><div className="text-xs text-slate-500">Tenant ID</div><div className="mt-1 break-all font-mono text-xs">{workspace.tenantId}</div><div className="mt-1 text-xs text-slate-500">Person ID: {workspace.personId}</div></div></div></section>
        </main>
        <footer className="border-t border-slate-200 px-7 py-5 text-xs text-slate-500">ClearFlow · Reusable PWA skeleton</footer>
      </div>
    </div>
  );
}

function Layers3Icon() {
  return <Database size={21} />;
}

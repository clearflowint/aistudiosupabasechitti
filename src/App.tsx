import { useEffect, useRef, useState } from "react";
import {
  Activity,
  BookOpen,
  BriefcaseBusiness,
  ChevronRight,
  ContactRound,
  CreditCard,
  Database,
  LayoutDashboard,
  Layers3,
  LogOut,
  Menu,
  Settings2,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";
import { LandingPage } from "./components/LandingPage";
import { authService } from "./core/auth/auth.service";
import {
  checkTenantDatabaseConnection,
  type ConnectionStatus,
} from "./core/database/connection.service";
import {
  resolveCfcfWorkspace,
  type AuthorizedWorkspace,
} from "./features/cfcf/services/access.service";

type WorkspacePage = "overview" | "contacts" | "funds" | "payments" | "reports" | "settings";
type AuthenticatedUser = { email: string };

const navigation = [
  { id: "overview", label: "Overview", icon: LayoutDashboard, description: "Your workspace at a glance" },
  { id: "contacts", label: "Contacts", icon: ContactRound, description: "Customer and business relationships" },
  { id: "funds", label: "Funds", icon: BriefcaseBusiness, description: "Fund records and cycle details" },
  { id: "payments", label: "Payments & ledger", icon: CreditCard, description: "Recorded transactions and entries" },
  { id: "reports", label: "Reports", icon: BookOpen, description: "Workspace reports" },
  { id: "settings", label: "Settings", icon: Settings2, description: "Workspace configuration" },
] as const;

function WorkspacePlaceholder({
  page,
  workspace,
}: {
  page: Exclude<WorkspacePage, "overview">;
  workspace: AuthorizedWorkspace;
}) {
  const section = navigation.find((item) => item.id === page)!;
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

function WorkspaceIdentity({ workspace }: { workspace: AuthorizedWorkspace }) {
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
          <div className="mt-1 text-xs text-slate-500">Person ID: {workspace.personId}</div>
        </div>
      </div>
    </section>
  );
}

function OverviewPage({
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

function LoadingScreen({ message }: { message: string }) {
  return (
    <main className="grid min-h-screen place-items-center bg-slate-950 text-slate-200">
      <div className="flex items-center gap-3 text-sm">
        <Activity className="animate-pulse text-sky-400" size={20} />
        {message}
      </div>
    </main>
  );
}

export default function App() {
  const [user, setUser] = useState<AuthenticatedUser | null>(null);\n  const currentEmail = useRef<string | null>(null);
  const [workspace, setWorkspace] = useState<AuthorizedWorkspace | null>(null);
  const [activePage, setActivePage] = useState<WorkspacePage>("overview");
  const [isRestoringSession, setIsRestoringSession] = useState(true);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [databaseStatus, setDatabaseStatus] = useState<ConnectionStatus | null>(null);
  const [isMobileNavigationOpen, setIsMobileNavigationOpen] = useState(false);

  useEffect(() => {
    let isMounted = true;

    void authService.getCurrentUser().then((currentUser) => {
      if (isMounted) setUser(toAuthenticatedUser(currentUser));
    }).finally(() => {
      if (isMounted) setIsRestoringSession(false);
    });

    const { data } = authService.onAuthStateChange((currentUser) => {
      if (!isMounted) return;
      setUser(toAuthenticatedUser(currentUser));
      setWorkspace(null);
      setDatabaseStatus(null);
      setErrorMessage(null);
    });

    return () => {
      isMounted = false;
      data.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!user?.email) {
      setWorkspace(null);
      setDatabaseStatus(null);
      return;
    }

    let isMounted = true;
    setIsRestoringSession(true);
    setErrorMessage(null);

    void resolveCfcfWorkspace(user.email)
      .then(async (authorizedWorkspace) => {
        if (!isMounted) return;
        setWorkspace(authorizedWorkspace);
        const status = await checkTenantDatabaseConnection(authorizedWorkspace.tenantId);
        if (isMounted) setDatabaseStatus(status);
      })
      .catch((error: unknown) => {
        if (!isMounted) return;
        setWorkspace(null);
        setErrorMessage(getErrorMessage(error, "Unable to authorize this workspace."));
      })
      .finally(() => {
        if (isMounted) setIsRestoringSession(false);
      });

    return () => {
      isMounted = false;
    };
  }, [user?.email]);

  async function handleSignIn() {
    setIsSigningIn(true);
    setErrorMessage(null);

    try {
      await authService.signInWithGoogle();
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "Google sign-in failed."));
      setIsSigningIn(false);
    }
  }

  async function handleSignOut() {
    setIsRestoringSession(true);

    try {
      await authService.signOut();
      setUser(null);
      setWorkspace(null);
      setActivePage("overview");
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "Sign-out failed."));
    } finally {
      setIsRestoringSession(false);
    }
  }

  async function retryWorkspaceAuthorization() {
    setErrorMessage(null);
    setIsRestoringSession(true);
    const currentUser = await authService.getCurrentUser();
    setUser(toAuthenticatedUser(currentUser));
    setIsRestoringSession(false);
  }

  if (isRestoringSession && !workspace && !errorMessage) {
    return <LoadingScreen message="Restoring secure session…" />;
  }

  if (!user) {
    return (
      <LandingPage
        onSignIn={handleSignIn}
        isLoading={isSigningIn}
        errorMessage={errorMessage}
      />
    );
  }

  if (errorMessage && !workspace) {
    return (
      <main className="grid min-h-screen place-items-center bg-slate-950 p-6 text-slate-100">
        <section className="w-full max-w-lg rounded-2xl border border-rose-300/20 bg-slate-900 p-7">
          <ShieldCheck className="mb-4 text-rose-300" size={28} />
          <h1 className="text-xl font-semibold">Workspace access not granted</h1>
          <p className="mt-3 text-sm leading-6 text-slate-300">{errorMessage}</p>
          <div className="mt-6 flex gap-3">
            <button onClick={() => void retryWorkspaceAuthorization()} className="rounded-lg bg-sky-500 px-4 py-2 text-sm font-semibold text-white">
              Try again
            </button>
            <button onClick={() => void handleSignOut()} className="rounded-lg border border-white/15 px-4 py-2 text-sm">
              Sign out
            </button>
          </div>
        </section>
      </main>
    );
  }

  if (isRestoringSession || !workspace) {
    return <LoadingScreen message="Loading authorized workspace…" />;
  }

  const selectedSection = navigation.find((item) => item.id === activePage)!;
  const SelectedIcon = selectedSection.icon;

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      {isMobileNavigationOpen && (
        <button
          aria-label="Close navigation overlay"
          onClick={() => setIsMobileNavigationOpen(false)}
          className="fixed inset-0 z-40 bg-slate-950/50 lg:hidden"
        />
      )}

      <aside className={`fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-slate-800 bg-slate-950 text-slate-200 transition-transform lg:translate-x-0 ${isMobileNavigationOpen ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="flex h-20 items-center gap-3 border-b border-white/10 px-6">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-sky-500/15 text-sky-300">
            <Layers3 size={21} />
          </div>
          <div>
            <div className="font-semibold tracking-tight text-white">ClearFlow</div>
            <div className="text-xs text-slate-400">Workspace platform</div>
          </div>
          <button
            aria-label="Close menu"
            onClick={() => setIsMobileNavigationOpen(false)}
            className="ml-auto rounded-lg p-2 hover:bg-white/10 lg:hidden"
          >
            <X size={18} />
          </button>
        </div>

        <div className="px-4 py-5">
          <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
            <div className="text-xs text-slate-400">Signed in as</div>
            <div className="mt-1 truncate text-sm font-medium text-white">{workspace.managerName}</div>
            <div className="truncate text-xs text-slate-400">{workspace.email}</div>
          </div>
        </div>

        <nav aria-label="Main navigation" className="flex-1 space-y-1 px-3">
          {navigation.map(({ id, label, icon: Icon }) => {
            const isSelected = activePage === id;
            return (
              <button
                key={id}
                onClick={() => {
                  setActivePage(id);
                  setIsMobileNavigationOpen(false);
                }}
                aria-current={isSelected ? "page" : undefined}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm transition ${isSelected ? "bg-sky-500/15 font-medium text-sky-200" : "text-slate-400 hover:bg-white/[0.05] hover:text-white"}`}
              >
                <Icon size={18} />
                <span>{label}</span>
                {isSelected && <ChevronRight className="ml-auto" size={16} />}
              </button>
            );
          })}
        </nav>

        <div className="border-t border-white/10 p-4">
          <button
            onClick={() => void handleSignOut()}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm text-slate-400 hover:bg-rose-500/10 hover:text-rose-200"
          >
            <LogOut size={18} /> Sign out
          </button>
          <div className="mt-3 flex items-center gap-2 px-3 text-xs text-slate-500">
            <ShieldCheck size={14} /> Access verified by Supabase
          </div>
        </div>
      </aside>

      <div className="min-h-screen lg:pl-72">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-slate-200 bg-white/90 px-4 backdrop-blur sm:px-7">
          <div className="flex items-center gap-3">
            <button
              aria-label="Open navigation"
              onClick={() => setIsMobileNavigationOpen(true)}
              className="rounded-lg p-2 hover:bg-slate-100 lg:hidden"
            >
              <Menu size={20} />
            </button>
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold">
                <SelectedIcon size={17} className="text-sky-700" />
                {selectedSection.label}
              </div>
              <div className="hidden text-xs text-slate-500 sm:block">{selectedSection.description}</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <DatabaseStatus status={databaseStatus} />
            <button
              onClick={() => void handleSignOut()}
              className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50"
            >
              Sign out
            </button>
          </div>
        </header>

        <main className="mx-auto max-w-7xl space-y-6 p-4 sm:p-7">
          {databaseStatus && !databaseStatus.connected && (
            <div role="status" className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              <Database size={19} className="mt-0.5 shrink-0" />
              <div>
                <div className="font-semibold">Database connection needs attention</div>
                <div className="mt-1">{databaseStatus.message}</div>
              </div>
              <button
                onClick={() => void checkTenantDatabaseConnection(workspace.tenantId).then(setDatabaseStatus)}
                className="ml-auto shrink-0 font-semibold underline"
              >
                Retry
              </button>
            </div>
          )}

          <div>
            <p className="text-sm text-slate-500">{workspace.productName}</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">
              {activePage === "overview" ? `Welcome, ${workspace.managerName}` : selectedSection.label}
            </h1>
            <p className="mt-2 text-sm text-slate-500">
              Reusable platform shell · Feature modules stay separate from shared infrastructure.
            </p>
          </div>

          {activePage === "overview" ? (
            <OverviewPage
              workspace={workspace}
              onNavigate={(page) => setActivePage(page)}
            />
          ) : (
            <WorkspacePlaceholder page={activePage} workspace={workspace} />
          )}
        </main>

        <footer className="border-t border-slate-200 px-7 py-5 text-xs text-slate-500">
          ClearFlow · Reusable PWA skeleton
        </footer>
      </div>
    </div>
  );
}

function DatabaseStatus({ status }: { status: ConnectionStatus | null }) {
  const isConnected = status?.connected === true;
  return (
    <div className={`hidden items-center gap-2 rounded-full px-3 py-1.5 text-xs sm:flex ${isConnected ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${isConnected ? "bg-emerald-500" : "bg-amber-500"}`} />
      {isConnected ? "Database connected" : "Database unavailable"}
    </div>
  );
}

function toAuthenticatedUser(user: { email?: string } | null): AuthenticatedUser | null {
  return user?.email ? { email: user.email } : null;
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

// SKELETON: Generic navigation frame. It knows product metadata, not product database details.
import { useState, type ReactNode } from "react";
import { Database, Layers3, LogOut, Menu, ShieldCheck, X } from "lucide-react";
import type { ProductDefinition, WorkspaceNavigationItem } from "../../core/products/product.types";
import type { AuthorizedWorkspace } from "../../core/workspace/workspace.types";
import type { ConnectionStatus } from "../../core/database/connection.service";

interface WorkspaceLayoutProps {
  product: ProductDefinition;
  workspace: AuthorizedWorkspace;
  activePage: WorkspaceNavigationItem;
  children: ReactNode;
  databaseStatus: ConnectionStatus | null;
  onNavigate: (pageId: string) => void;
  onSignOut: () => void;
  onRetryConnection: () => void;
  isSigningOut: boolean;
}

export function WorkspaceLayout({
  product,
  workspace,
  activePage,
  children,
  databaseStatus,
  onNavigate,
  onSignOut,
  onRetryConnection,
  isSigningOut,
}: WorkspaceLayoutProps) {
  const [isMobileNavigationOpen, setIsMobileNavigationOpen] = useState(false);
  const ActiveIcon = activePage.icon;

  function navigateTo(pageId: string) {
    onNavigate(pageId);
    setIsMobileNavigationOpen(false);
  }

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      {isMobileNavigationOpen && (
        <button
          type="button"
          aria-label="Close navigation overlay"
          onClick={() => setIsMobileNavigationOpen(false)}
          className="fixed inset-0 z-40 bg-slate-950/50 lg:hidden"
        />
      )}

      <aside className={[
        "fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-slate-800 bg-slate-950 text-slate-200 transition-transform",
        "lg:translate-x-0",
        isMobileNavigationOpen ? "translate-x-0" : "-translate-x-full",
      ].join(" ")}>
        <div className="flex h-20 items-center gap-3 border-b border-white/10 px-6">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-sky-500/15 text-sky-300">
            <Layers3 size={21} />
          </div>
          <div className="min-w-0">
            <div className="font-semibold tracking-tight text-white">ClearFlow</div>
            <div className="truncate text-xs text-slate-400">{product.name}</div>
          </div>
          <button
            type="button"
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
            <div className="mt-1 truncate text-sm font-medium text-white">{workspace.displayName}</div>
            <div className="truncate text-xs text-slate-400">{workspace.email}</div>
          </div>
        </div>

        <nav aria-label="Workspace navigation" className="flex-1 space-y-1 overflow-y-auto px-3 pb-4">
          {product.navigation.map((item) => {
            const isSelected = activePage.id === item.id;
            const Icon = item.icon;
            return (
              <button
                type="button"
                key={item.id}
                onClick={() => navigateTo(item.id)}
                aria-current={isSelected ? "page" : undefined}
                className={[
                  "flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm transition",
                  isSelected
                    ? "bg-sky-500/15 font-medium text-sky-200"
                    : "text-slate-400 hover:bg-white/[0.05] hover:text-white",
                ].join(" ")}
              >
                <Icon size={18} />
                <span>{item.label}</span>
                {isSelected && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-sky-300" />}
              </button>
            );
          })}
        </nav>

        <div className="border-t border-white/10 p-4">
          <button
            type="button"
            disabled={isSigningOut}
            onClick={onSignOut}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm text-slate-400 hover:bg-rose-500/10 hover:text-rose-200 disabled:opacity-50"
          >
            <LogOut size={18} /> {isSigningOut ? "Signing out…" : "Sign out"}
          </button>
          <div className="mt-3 flex items-center gap-2 px-3 text-xs text-slate-500">
            <ShieldCheck size={14} /> Access verified by Supabase
          </div>
        </div>
      </aside>

      <div className="min-h-screen lg:pl-72">
        <header className="sticky top-0 z-30 flex min-h-16 items-center justify-between gap-4 border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur sm:px-7">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              aria-label="Open navigation"
              onClick={() => setIsMobileNavigationOpen(true)}
              className="rounded-lg p-2 hover:bg-slate-100 lg:hidden"
            >
              <Menu size={20} />
            </button>
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <ActiveIcon size={17} className="shrink-0 text-sky-700" />
                <span className="truncate">{activePage.label}</span>
              </div>
              <div className="hidden truncate text-xs text-slate-500 sm:block">{activePage.description}</div>
            </div>
          </div>
          <DatabaseStatus status={databaseStatus} onRetry={onRetryConnection} />
        </header>

        <main className="mx-auto max-w-7xl space-y-6 p-4 sm:p-7">
          {databaseStatus && !databaseStatus.connected && (
            <div role="status" className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              <Database size={19} className="mt-0.5 shrink-0" />
              <div className="min-w-0">
                <div className="font-semibold">Database connection needs attention</div>
                <div className="mt-1 break-words">{databaseStatus.message}</div>
              </div>
              <button type="button" onClick={onRetryConnection} className="ml-auto shrink-0 font-semibold underline">
                Retry
              </button>
            </div>
          )}

          <div className="flex flex-col gap-1">
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-sky-700">{product.name}</p>
            <h1 className="text-2xl font-semibold tracking-tight">{activePage.isHome ? "Home" : activePage.label}</h1>
          </div>
          {children}
        </main>
      </div>
    </div>
  );
}

function DatabaseStatus({ status, onRetry }: { status: ConnectionStatus | null; onRetry: () => void }) {
  if (!status) {
    return (
      <div className="hidden items-center gap-2 rounded-full bg-slate-100 px-3 py-1.5 text-xs text-slate-500 sm:flex">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-slate-400" /> Checking database
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span className={[
        "hidden items-center gap-2 rounded-full px-3 py-1.5 text-xs sm:inline-flex",
        status.connected ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800",
      ].join(" ")}>
        <span className={["h-1.5 w-1.5 rounded-full", status.connected ? "bg-emerald-500" : "bg-amber-500"].join(" ")} />
        {status.connected ? "Database connected" : "Database unavailable"}
      </span>
      {!status.connected && (
        <button type="button" onClick={onRetry} className="text-xs font-semibold text-sky-700 hover:underline sm:hidden">
          Retry
        </button>
      )}
    </div>
  );
}

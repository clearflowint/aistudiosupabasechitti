// SKELETON: Shared mobile-first application frame. No sidebar; only the registered top-level destinations.
// MIX: Product navigation supplies the three destinations while shared auth/database controls remain here.

import type { ReactNode } from "react";
import { Database, Layers3, LogOut } from "lucide-react";
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
  const ActiveIcon = activePage.icon;

  return (
    <div className="min-h-screen overflow-x-hidden bg-slate-100 text-slate-900">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex min-h-16 max-w-3xl items-center gap-3 px-4 py-3 sm:px-5">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-950 text-sky-300">
            <Layers3 size={20} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-bold tracking-tight text-slate-950">ClearFlow</div>
            <div className="truncate text-xs text-slate-500">{activePage.label} · {product.name}</div>
          </div>
          <DatabaseStatus status={databaseStatus} onRetry={onRetryConnection} />
          <button
            type="button"
            onClick={onSignOut}
            disabled={isSigningOut}
            aria-label={isSigningOut ? "Signing out" : "Sign out"}
            className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
          >
            <LogOut size={16} />
            <span className="hidden sm:inline">{isSigningOut ? "Signing out…" : "Sign out"}</span>
          </button>
        </div>
        {databaseStatus && !databaseStatus.connected && (
          <div role="status" className="border-t border-amber-200 bg-amber-50 px-4 py-3">
            <div className="mx-auto flex max-w-3xl items-start gap-2 text-xs leading-5 text-amber-900">
              <Database size={16} className="mt-0.5 shrink-0" />
              <p className="min-w-0 flex-1 break-words">{databaseStatus.message}</p>
              <button type="button" onClick={onRetryConnection} className="min-h-8 shrink-0 font-semibold underline">Retry</button>
            </div>
          </div>
        )}
      </header>

      <main className="mx-auto min-h-[calc(100dvh-8rem)] w-full max-w-3xl min-w-0 px-3 pb-28 pt-4 sm:px-5 sm:pt-6">
        <div className="mb-4 flex min-w-0 items-center gap-2">
          <ActiveIcon size={17} className="shrink-0 text-sky-700" />
          <div className="min-w-0">
            <p className="break-words text-xs font-semibold uppercase tracking-[0.12em] text-sky-800">{product.name}</p>
            <h1 className="break-words text-xl font-bold tracking-tight text-slate-950 sm:text-2xl">
              {activePage.isHome ? "Home" : activePage.label}
            </h1>
          </div>
        </div>
        {children}
      </main>

      <nav
        aria-label="Main navigation"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 shadow-[0_-8px_24px_rgba(15,23,42,0.06)] backdrop-blur"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="mx-auto grid min-h-16 max-w-3xl grid-cols-3 gap-1 px-2 py-1.5 sm:px-5">
          {product.navigation.map((item) => {
            const isSelected = activePage.id === item.id;
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onNavigate(item.id)}
                aria-current={isSelected ? "page" : undefined}
                className={[
                  "flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-1 text-[11px] font-semibold transition sm:text-xs",
                  isSelected
                    ? "bg-sky-50 text-sky-800"
                    : "text-slate-500 hover:bg-slate-50 hover:text-slate-900",
                ].join(" ")}
              >
                <Icon size={19} />
                <span className="max-w-full truncate">{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

function DatabaseStatus({ status, onRetry }: { status: ConnectionStatus | null; onRetry: () => void }) {
  if (!status) {
    return (
      <div className="hidden items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-2 text-[11px] text-slate-500 md:flex">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-slate-400" />
        Checking DB
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <span className={[
        "hidden items-center gap-1.5 rounded-full px-2.5 py-2 text-[11px] font-medium md:inline-flex",
        status.connected ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800",
      ].join(" ")}>
        <span className={["h-1.5 w-1.5 rounded-full", status.connected ? "bg-emerald-500" : "bg-amber-500"].join(" ")} />
        {status.connected ? "Connected" : "Unavailable"}
      </span>
      {!status.connected && (
        <button type="button" onClick={onRetry} className="min-h-10 rounded-lg px-2 text-xs font-semibold text-sky-700 hover:bg-sky-50 md:hidden">
          Retry
        </button>
      )}
    </div>
  );
}

// SKELETON: Shared mobile-first application frame. No sidebar; only the registered top-level destinations.
// MIX: Product navigation supplies the three destinations while shared auth/database controls remain here.

import { useState, useSyncExternalStore, type ReactNode } from "react";
import { getActiveRequestCount, subscribeToRequestActivity } from "../../core/async/requestActivity";
import { Bell, Database, LogOut, Smartphone, X } from "lucide-react";
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
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isInstallHelpOpen, setIsInstallHelpOpen] = useState(false);
  const activeRequestCount = useSyncExternalStore(subscribeToRequestActivity, getActiveRequestCount, () => 0);

  return (
    <div className="min-h-screen overflow-x-hidden bg-slate-100 text-slate-900">
      <header className="relative z-30 border-b border-slate-200 bg-white">
        <div className="mx-auto flex min-h-16 max-w-3xl items-center gap-2 px-3 py-3 sm:gap-3 sm:px-5">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <button type="button" onClick={() => onNavigate(activePage.isHome ? (product.navigation.find((item) => item.id === "workspace")?.id ?? product.navigation.find((item) => !item.isHome)?.id ?? activePage.id) : (product.navigation.find((item) => item.isHome)?.id ?? activePage.id))} className="inline-flex min-h-11 min-w-0 max-w-full items-center justify-center rounded-xl border border-emerald-200 bg-emerald-50 px-3 text-xs font-semibold text-emerald-800 transition hover:bg-emerald-100 sm:px-4 sm:text-sm">
              <span className="whitespace-nowrap">{activePage.isHome ? "Go to Workspace" : "Go to Home / Contacts"}</span>
            </button>
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
            <button type="button" onClick={() => setIsNotificationsOpen((open) => !open)} aria-label={isNotificationsOpen ? "Close notifications" : "Open notifications"} aria-expanded={isNotificationsOpen} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:border-sky-200 hover:bg-sky-50 hover:text-sky-800 sm:h-11 sm:w-11">
              <Bell size={19} />
            </button>
            <button type="button" onClick={() => setIsInstallHelpOpen(true)} aria-label="How to install ClearFlow on this phone" title="Add ClearFlow to your phone" className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:border-sky-200 hover:bg-sky-50 hover:text-sky-800 sm:h-11 sm:w-11">
              <Smartphone size={19} />
            </button>
            <button type="button" onClick={onSignOut} disabled={isSigningOut} aria-label={isSigningOut ? "Signing out" : `Sign out ${workspace.displayName || workspace.email}`} className="inline-flex min-h-11 max-w-[min(37vw,12rem)] shrink-0 items-center justify-center gap-1.5 rounded-xl border border-rose-200 bg-rose-600 px-2.5 text-[11px] font-semibold text-white transition hover:bg-rose-700 disabled:opacity-50 sm:max-w-[48%] sm:px-3 sm:text-xs">
              <LogOut size={15} className="shrink-0" />
              <span className="truncate">{isSigningOut ? "Signing out…" : `Sign out · ${workspace.displayName || workspace.email}`}</span>
            </button>
            {activeRequestCount > 0 && (
              <div role="status" aria-live="polite" className="hidden min-h-9 shrink-0 items-center gap-1.5 rounded-full bg-sky-50 px-2.5 text-[11px] font-semibold text-sky-800 md:inline-flex">
                <span className="h-2 w-2 animate-spin rounded-full border-2 border-sky-600 border-t-transparent" />
                Syncing
                <span className="sr-only">{activeRequestCount} requests in progress</span>
              </div>
            )}
            <DatabaseStatus status={databaseStatus} onRetry={onRetryConnection} />
          </div>
        </div>
        {isNotificationsOpen && (
          <div className="relative">
            {product.renderNotifications ? product.renderNotifications(workspace) : (
              <section aria-label="Notifications" className="mx-auto max-w-3xl border-t border-slate-100 bg-sky-50/70 px-4 py-3 sm:px-5">
                <div className="flex items-start gap-3">
                  <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white text-sky-700"><Bell size={17} /></div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-900">Notifications</p>
                    <p className="mt-0.5 text-xs leading-5 text-slate-600">No notifications are available for this product yet.</p>
                  </div>
                </div>
              </section>
            )}
            <div className="mx-auto max-w-3xl border-b border-slate-100 bg-white px-3 pb-3 text-right sm:px-5">
              <button type="button" onClick={() => setIsNotificationsOpen(false)} className="min-h-9 rounded-lg px-3 text-xs font-semibold text-slate-600 hover:bg-slate-100">Close notifications</button>
            </div>
          </div>
        )}
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

      <main className="mx-auto min-h-[calc(100dvh-8rem)] w-full max-w-3xl min-w-0 px-3 pb-8 pt-4 sm:px-5 sm:pt-6">
        {!activePage.isHome && (
          <div className="mb-4 flex min-w-0 items-center gap-2">
            <ActiveIcon size={17} className="shrink-0 text-sky-700" />
            <div className="min-w-0">
              <p className="break-words text-xs font-semibold uppercase tracking-[0.12em] text-sky-800">{product.name}</p>
              <h1 className="break-words text-xl font-bold tracking-tight text-slate-950 sm:text-2xl">
                {activePage.label}
              </h1>
            </div>
          </div>
        )}
        {children}
      </main>

      <footer className="mx-auto max-w-3xl px-3 pb-5 pt-3 text-center sm:px-5">
        <p className="text-xs text-slate-400">Powered by ClearFlow Automation</p>
      </footer>

      {isInstallHelpOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 p-3 sm:items-center" onClick={() => setIsInstallHelpOpen(false)}>
          <section role="dialog" aria-modal="true" aria-labelledby="install-help-title" className="max-h-[85dvh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-5 shadow-xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="grid h-11 w-11 place-items-center rounded-xl bg-sky-50 text-sky-700"><Smartphone size={22} /></div>
                <div>
                  <h2 id="install-help-title" className="text-lg font-semibold text-slate-950">Add ClearFlow to your phone</h2>
                  <p className="mt-0.5 text-sm text-slate-500">Open it like a regular app.</p>
                </div>
              </div>
              <button type="button" onClick={() => setIsInstallHelpOpen(false)} aria-label="Close installation instructions" className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-slate-500 hover:bg-slate-100"><X size={19} /></button>
            </div>
            <div className="mt-5 space-y-4">
              <section className="rounded-xl border border-slate-200 p-3">
                <h3 className="font-semibold text-slate-900">iPhone or iPad · Safari</h3>
                <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-sm leading-5 text-slate-600">
                  <li>Open ClearFlow in Safari.</li>
                  <li>Tap the <strong>Share</strong> button (square with an upward arrow).</li>
                  <li>Scroll and tap <strong>Add to Home Screen</strong>.</li>
                  <li>Tap <strong>Add</strong>.</li>
                </ol>
              </section>
              <section className="rounded-xl border border-slate-200 p-3">
                <h3 className="font-semibold text-slate-900">Android · Chrome</h3>
                <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-sm leading-5 text-slate-600">
                  <li>Open ClearFlow in Chrome.</li>
                  <li>Tap the <strong>⋮</strong> menu.</li>
                  <li>Tap <strong>Install app</strong> or <strong>Add to Home screen</strong>.</li>
                  <li>Confirm <strong>Install</strong> or <strong>Add</strong>.</li>
                </ol>
              </section>
              <p className="text-xs leading-5 text-slate-500">If the option is missing, open the site in Safari on iPhone or Chrome on Android, then check the browser menu again.</p>
            </div>
            <button type="button" onClick={() => setIsInstallHelpOpen(false)} className="mt-5 min-h-11 w-full rounded-xl bg-sky-600 px-4 text-sm font-semibold text-white hover:bg-sky-700">Got it</button>
          </section>
        </div>
      )}
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

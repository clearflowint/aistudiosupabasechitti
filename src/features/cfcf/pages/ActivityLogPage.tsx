// CFCF PRODUCT: Read-only manager activity log for the current authorized tenant.
// MIX: Uses the shared authorized workspace identity; database RLS limits rows to the tenant owner.

import { useCallback, useEffect, useState } from "react";
import { ChevronDown, ChevronUp, RefreshCw } from "lucide-react";
import type { AuthorizedWorkspace } from "../../../core/workspace/workspace.types";
import { listCfcfActivityLog } from "../services/workspace.service";
import type { CfcfActivityLogRow } from "../types/database.types";

interface ActivityLogPageProps {
  workspace: AuthorizedWorkspace;
}

function formatTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: true, timeZone: "Asia/Kolkata",
  }).format(date);
}

function readableAction(row: CfcfActivityLogRow): string {
  const action = row.action_type.replaceAll("_", " ").replace(/ (insert|update|delete)$/i, "");
  const verb = /_insert$/i.test(row.action_type) ? "added"
    : /_update$/i.test(row.action_type) ? "updated"
    : /_delete$/i.test(row.action_type) ? "deleted" : "changed";
  const title = action.replace(/ (insert|update|delete)$/i, "");
  return title.charAt(0).toUpperCase() + title.slice(1) + " " + verb;
}

function details(value: Record<string, unknown> | null): string {
  if (!value) return "No saved details.";
  const safe = { ...value };
  delete safe.tenant_id;
  delete safe.product_id;
  delete safe.person_id;
  return JSON.stringify(safe, null, 2);
}

export function ActivityLogPage({ workspace }: ActivityLogPageProps) {
  const [rows, setRows] = useState<CfcfActivityLogRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRows(await listCfcfActivityLog(workspace.tenantId));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load activity log.");
    } finally {
      setLoading(false);
    }
  }, [workspace.tenantId]);

  useEffect(() => { void refresh(); }, [refresh]);

  return (
    <main className="min-w-0 space-y-4 pb-6">
      <header className="flex min-w-0 items-center justify-end gap-2">
        <button type="button" onClick={() => void refresh()} disabled={loading} aria-label="Refresh activity log" className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-slate-200 bg-white text-sky-700 disabled:opacity-50">
          <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
        </button>
      </header>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-lg font-bold text-slate-950">Manager Activity Log</h2>
        <p className="mt-1 text-sm leading-5 text-slate-600">Successful changes recorded by the database. Newest first, with India Standard Time timestamps. The log keeps the latest 500 actions for this tenant.</p>
        <p className="mt-2 text-xs text-slate-500">{rows.length} of up to 500 retained actions · {workspace.displayName}</p>
      </section>

      {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}<button type="button" onClick={() => void refresh()} className="ml-2 font-semibold underline">Retry</button></div>}
      {loading ? <div className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-500">Loading activity…</div>
        : rows.length === 0 ? <div className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-500">No manager actions have been recorded yet.</div>
        : <section className="space-y-2" aria-label="Activity records">
          {rows.map((row) => {
            const isOpen = expanded === row.action_id;
            return <article key={row.action_id} className="min-w-0 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
              <button type="button" onClick={() => setExpanded(isOpen ? null : row.action_id)} aria-expanded={isOpen} className="flex w-full min-w-0 items-start gap-3 text-left">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-slate-100 text-xs font-bold text-slate-600">#{row.action_id}</span>
                <span className="min-w-0 flex-1">
                  <span className="block break-words text-sm font-semibold text-slate-900">{readableAction(row)}</span>
                  <span className="mt-1 block break-words text-xs text-slate-600">{row.description}{row.entity_id ? " · ID " + row.entity_id : ""}</span>
                  <span className="mt-1.5 block text-xs text-slate-500">{formatTimestamp(row.created_at)}</span>
                </span>
                {isOpen ? <ChevronUp size={17} className="mt-1 shrink-0 text-slate-500"/> : <ChevronDown size={17} className="mt-1 shrink-0 text-slate-500"/>}
              </button>
              {isOpen && <div className="mt-3 space-y-3 border-t border-slate-100 pt-3">
                <div><p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Previous values</p><pre className="max-h-56 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-slate-50 p-2 text-xs text-slate-700">{details(row.before_data)}</pre></div>
                <div><p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Saved values</p><pre className="max-h-56 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-slate-50 p-2 text-xs text-slate-700">{details(row.after_data)}</pre></div>
              </div>}
            </article>;
          })}
        </section>}
    </main>
  );
}

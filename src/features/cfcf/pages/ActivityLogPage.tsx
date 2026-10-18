// CFCF PRODUCT: Read-only manager activity log for the current authorized tenant.
// MIX: Uses the shared authorized workspace identity; database RLS limits rows to the tenant owner.
// Display safety: show concise action summaries only; never render raw audit JSON.

import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
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

function actionVerb(action: string): string {
  const value = action.toLowerCase();
  if (value.includes("insert") || value.includes("create")) return "created";
  if (value.includes("delete") || value.includes("remove")) return "deleted";
  if (value.includes("archive")) return "archived";
  if (value.includes("update") || value.includes("edit")) return "updated";
  return action.replace(/_/g, " ");
}

function recordTitle(row: CfcfActivityLogRow): string {
  const entity = row.entity_type.replace(/_/g, " ");
  return row.description || `${entity} ${actionVerb(row.action_type)}`;
}

export function ActivityLogPage({ workspace }: ActivityLogPageProps) {
  const [rows, setRows] = useState<CfcfActivityLogRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

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
          {rows.map((row) => (
            <article key={row.action_id} className="flex min-w-0 items-start gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-slate-100 text-xs font-bold text-slate-600">#{row.action_id}</span>
              <div className="min-w-0 flex-1">
                <p className="break-words text-sm font-semibold text-slate-900">{recordTitle(row)}</p>
                <p className="mt-1 break-words text-xs text-slate-600">{row.entity_type.replace(/_/g, " ")} · {actionVerb(row.action_type)}</p>
                <p className="mt-1.5 text-xs text-slate-500">{formatTimestamp(row.created_at)}</p>
              </div>
            </article>
          ))}
        </section>}
    </main>
  );
}

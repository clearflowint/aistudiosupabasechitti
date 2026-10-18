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
  return row.description || (row.entity_type + " " + row.action_type);
}

const HIDDEN_FIELDS = new Set([
  "tenant_id", "product_id", "person_id", "actor_person_id", "created_at", "updated_at",
  "fund_id", "share_id", "cycle_id", "bill_id", "payment_id", "entry_id",
]);

function fieldLabel(key: string): string {
  const labels: Record<string, string> = {
    status: "Status", fund_name: "Fund name", start_date: "Start date",
    number_of_cycles: "Planned cycles", current_cycle: "Current cycle",
    fund_net_balance: "Net balance", fund_total_billed_amount: "Total billed",
    fund_total_pending_amount: "Pending", fund_total_advance: "Advance",
    fund_net_payment_received: "Net payments received", fund_total_withdrawn: "Total withdrawn",
    fund_total_commissions: "Total commission", share_number: "Share number",
    amount: "Amount", entry_type: "Entry type", payment_type: "Payment method",
    entry_date: "Date", payout_status: "Payout status", withdrawn_amount: "Payout amount",
    payout_cycle_number: "Payout cycle", remarks: "Remarks", archived_at: "Archived at",
    other_amount: "Other amount",
  };
  if (labels[key]) return labels[key];
  return key.replace(/_id$/i, "").replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function displayValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "Not set";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return Number.isFinite(value) ? value.toLocaleString("en-IN") : "Not set";
  if (typeof value === "string") {
    if (/^\d{4}-\d{2}-\d{2}T/.test(value)) return formatTimestamp(value);
    if (value === "active") return "Active";
    if (value === "inactive") return "Inactive";
    if (value === "archived") return "Archived";
    return value;
  }
  return "";
}

function meaningfulFields(value: Record<string, unknown> | null): Array<[string, string]> {
  if (!value) return [];
  return Object.entries(value)
    .filter(([key, item]) => !HIDDEN_FIELDS.has(key) && !key.endsWith("_id") && item !== undefined)
    .map(([key, item]) => [fieldLabel(key), displayValue(item)] as [string, string])
    .filter(([, text]) => text !== "");
}

function changedDetails(row: CfcfActivityLogRow): Array<{ label: string; before: string; after: string }> {
  const before = row.before_data ?? {};
  const after = row.after_data ?? {};
  const keys = Array.from(new Set([...Object.keys(before), ...Object.keys(after)]));
  return keys
    .filter((key) => !HIDDEN_FIELDS.has(key) && !key.endsWith("_id"))
    .map((key) => ({
      label: fieldLabel(key),
      before: displayValue(before[key]),
      after: displayValue(after[key]),
    }))
    .filter((item) => item.before !== item.after && (item.before !== "" || item.after !== ""));
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
  const verb = actionVerb(row.action_type);
  const values = row.after_data ?? row.before_data;
  const name = values && (values.fund_name || values.share_number || values.name || values.contact_name);
  return String(name ? `${entity} ${verb} · ${name}` : row.description || `${entity} ${verb}`);
}

function RecordDetails({ row }: { row: CfcfActivityLogRow }) {
  const changes = changedDetails(row);
  const current = meaningfulFields(row.after_data);
  if (changes.length > 0) {
    return <dl className="space-y-2">{changes.map((item) => <div key={item.label} className="rounded-lg bg-slate-50 p-3">
      <dt className="text-xs font-semibold text-slate-500">{item.label}</dt>
      <dd className="mt-1 break-words text-sm text-slate-800">{item.before} <span className="px-1 text-slate-400">→</span> <strong>{item.after}</strong></dd>
    </div>)}</dl>;
  }
  if (current.length > 0) {
    return <dl className="space-y-2">{current.map(([label, value]) => <div key={label} className="flex items-start justify-between gap-3 rounded-lg bg-slate-50 p-3">
      <dt className="text-xs text-slate-500">{label}</dt><dd className="break-words text-right text-sm font-medium text-slate-800">{value}</dd>
    </div>)}</dl>;
  }
  return <p className="text-sm text-slate-500">No additional user-facing details for this action.</p>;
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
                  <span className="block break-words text-sm font-semibold text-slate-900">{recordTitle(row)}</span>
                  <span className="mt-1 block break-words text-xs text-slate-600">{row.description}</span>
                  <span className="mt-1.5 block text-xs text-slate-500">{formatTimestamp(row.created_at)}</span>
                </span>
                {isOpen ? <ChevronUp size={17} className="mt-1 shrink-0 text-slate-500"/> : <ChevronDown size={17} className="mt-1 shrink-0 text-slate-500"/>}
              </button>
              {isOpen && <div className="mt-3 space-y-3 border-t border-slate-100 pt-3">
                <div><p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">What changed</p><RecordDetails row={row} /></div>
              </div>}
            </article>;
          })}
        </section>}
    </main>
  );
}

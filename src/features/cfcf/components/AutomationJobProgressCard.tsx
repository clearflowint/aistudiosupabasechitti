// CFCF PRODUCT: Mobile-first, read-only manager view of automation job progress.
import { useCallback, useEffect, useState } from "react";
import { Activity, AlertTriangle, Clock3, RefreshCw } from "lucide-react";
import { listCfcfAutomationJobProgress, type CfcfAutomationJobProgress } from "../services/automation-jobs.service";
import type { AuthorizedWorkspace } from "../../../core/workspace/workspace.types";

interface AutomationJobProgressCardProps {
  workspace: AuthorizedWorkspace;
}

const enabled = import.meta.env.VITE_CFCF_JOB_PROGRESS_ENABLED === "true";

const statusLabels: Record<CfcfAutomationJobProgress["status"], string> = {
  queued: "Queued",
  processing: "In progress",
  completed: "Completed",
  partial: "Partial",
  failed: "Failed",
  uncertain: "Needs review",
  cancelled: "Cancelled",
};

function safeCount(summary: CfcfAutomationJobProgress["progress_summary"], key: string): number | null {
  const value = summary?.[key];
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function formatTime(value: string): string {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return "Time unavailable";
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(timestamp);
}

function statusStyle(status: CfcfAutomationJobProgress["status"]): string {
  if (status === "completed") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (status === "failed" || status === "uncertain" || status === "partial") return "border-amber-200 bg-amber-50 text-amber-900";
  if (status === "processing") return "border-sky-200 bg-sky-50 text-sky-800";
  return "border-slate-200 bg-slate-100 text-slate-700";
}

export function AutomationJobProgressCard({ workspace }: AutomationJobProgressCardProps) {
  const [jobs, setJobs] = useState<CfcfAutomationJobProgress[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    setFailed(false);
    try {
      const result = await listCfcfAutomationJobProgress(workspace.tenantId);
      setJobs(result);
      setLoaded(true);
    } catch {
      // Do not expose raw provider/database errors or any job payload to the manager UI.
      setFailed(true);
      setLoaded(true);
    } finally {
      setLoading(false);
    }
  }, [workspace.tenantId]);

  useEffect(() => {
    if (enabled) void refresh();
  }, [refresh]);

  return (
    <section aria-label="Automation progress" className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex min-w-0 items-start gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-indigo-50 text-indigo-700"><Activity size={20} /></div>
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-bold text-slate-900">Automation progress</h3>
          <p className="mt-1 text-sm leading-5 text-slate-600">Recent reminders, reports, and other approved jobs.</p>
        </div>
        {enabled && <button type="button" onClick={() => void refresh()} disabled={loading} aria-label="Refresh automation progress" className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50"><RefreshCw size={17} className={loading ? "animate-spin" : ""} /></button>}
      </div>

      {!enabled ? (
        <div className="mt-3 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-3">
          <p className="text-sm font-semibold text-slate-800">Setup pending</p>
          <p className="mt-1 text-sm leading-5 text-slate-600">Progress will appear after the registry is approved, applied, and enabled for this environment. No job data has been requested.</p>
        </div>
      ) : loading && !loaded ? (
        <p role="status" className="mt-3 flex items-center gap-2 rounded-xl bg-slate-50 p-3 text-sm text-slate-600"><RefreshCw size={16} className="animate-spin" /> Loading saved progress…</p>
      ) : failed ? (
        <div role="status" className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm leading-5 text-amber-900">Progress is temporarily unavailable. No job was changed, retried, or resent. Refresh after the registry read view is verified.</div>
      ) : jobs.length === 0 ? (
        <p className="mt-3 rounded-xl bg-slate-50 p-3 text-sm leading-5 text-slate-600">{loaded ? "No automation jobs found for this workspace yet." : "Progress has not been loaded."}</p>
      ) : (
        <div className="mt-3 space-y-2">
          {jobs.map((job) => {
            const processed = safeCount(job.progress_summary, "processed_count");
            const total = safeCount(job.progress_summary, "recipient_count");
            const uncertain = safeCount(job.progress_summary, "uncertain_count") ?? 0;
            const needsReview = job.needs_review || job.status === "uncertain" || uncertain > 0;
            return (
              <article key={job.job_id} className="min-w-0 rounded-xl border border-slate-200 p-3">
                <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-bold text-slate-900">Job #{job.job_id}</p>
                  <span className={"rounded-full border px-2.5 py-1 text-xs font-semibold " + statusStyle(job.status)}>{statusLabels[job.status] ?? job.status}</span>
                </div>
                <p className="mt-1 break-words text-xs text-slate-600">{job.job_type.replaceAll("_", " ")}</p>
                {processed !== null && total !== null && <p className="mt-2 text-sm font-medium text-slate-800">{processed} / {total} recipients processed</p>}
                <p className="mt-2 flex items-start gap-1.5 text-xs leading-5 text-slate-500"><Clock3 size={14} className="mt-0.5 shrink-0" /> Last updated {formatTime(job.last_safe_update_at)}</p>
                {needsReview && <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-amber-50 p-2 text-xs font-semibold leading-5 text-amber-900"><AlertTriangle size={14} className="mt-0.5 shrink-0" /> Manual review required. Do not resend automatically.</p>}
              </article>
            );
          })}
        </div>
      )}
      <p className="mt-3 text-[11px] leading-4 text-slate-500">Read-only status from saved progress. Provider acceptance does not prove delivery or read.</p>
    </section>
  );
}

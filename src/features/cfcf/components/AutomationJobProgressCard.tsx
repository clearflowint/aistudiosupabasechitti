// CFCF PRODUCT: Simple, read-only manager view of recent automation job status.
import { useCallback, useEffect, useRef, useState } from "react";
import { Activity, RefreshCw } from "lucide-react";
import { listCfcfAutomationJobStatus, type CfcfAutomationJobStatus } from "../services/automation-jobs.service";
import type { AuthorizedWorkspace } from "../../../core/workspace/workspace.types";

interface AutomationJobProgressCardProps {
  workspace: AuthorizedWorkspace;
}

const enabled = import.meta.env.VITE_CFCF_JOB_PROGRESS_ENABLED !== "false";

const statusLabels: Record<CfcfAutomationJobStatus["status"], string> = {
  queued: "Queued",
  processing: "In progress",
  completed: "Completed",
  failed: "Failed",
  cancelled: "Cancelled",
};

function formatTime(value: string | null | undefined): string {
  if (!value) return "Pending";
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return "Time unavailable";
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(timestamp);
}

function statusStyle(status: CfcfAutomationJobStatus["status"]): string {
  if (status === "completed") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (status === "failed") return "border-amber-200 bg-amber-50 text-amber-900";
  if (status === "processing") return "border-sky-200 bg-sky-50 text-sky-800";
  return "border-slate-200 bg-slate-100 text-slate-700";
}

function jobTypeLabel(jobType: string): string {
  const labels: Record<string, string> = {
    pending_reminder_campaign: "Pending Reminder",
    share_report_campaign: "Share Report",
    send_campaign: "WhatsApp Message",
  };
  return labels[jobType] ?? jobType.replaceAll("_", " ");
}

function countLabel(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value) ? String(value) : "—";
}

export function AutomationJobProgressCard({ workspace }: AutomationJobProgressCardProps) {
  const [jobs, setJobs] = useState<CfcfAutomationJobStatus[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const requestVersion = useRef(0);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    const version = ++requestVersion.current;
    const requestedTenantId = workspace.tenantId;
    setLoading(true);
    setFailed(false);
    try {
      const nextJobs = await listCfcfAutomationJobStatus(requestedTenantId);
      // Ignore a late response from a previous tenant or superseded refresh.
      if (version !== requestVersion.current) return;
      setJobs(nextJobs);
      setLoaded(true);
    } catch {
      if (version !== requestVersion.current) return;
      setFailed(true);
      setLoaded(true);
    } finally {
      if (version === requestVersion.current) setLoading(false);
    }
  }, [workspace.tenantId]);

  useEffect(() => {
    // Never carry the previous tenant's status rows into a new workspace.
    setJobs([]);
    setLoaded(false);
    setFailed(false);
    if (enabled) void refresh();
    return () => {
      // Invalidate any request still in flight when tenant scope changes/unmounts.
      requestVersion.current += 1;
    };
  }, [refresh]);

  useEffect(() => {
    const handleQueuedJob = () => { if (enabled) void refresh(); };
    window.addEventListener("clearflow:cfcf-job-queued", handleQueuedJob);
    return () => window.removeEventListener("clearflow:cfcf-job-queued", handleQueuedJob);
  }, [refresh]);

  useEffect(() => {
    // Poll status while the workspace is open so n8n's asynchronous outcome appears
    // without requiring a manual refresh. Skip network work while the tab is hidden.
    const interval = window.setInterval(() => {
      if (enabled && document.visibilityState === "visible") void refresh();
    }, 30_000);
    return () => window.clearInterval(interval);
  }, [refresh]);

  return (
    <section aria-label="Automation progress" className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex min-w-0 items-start gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-indigo-50 text-indigo-700"><Activity size={20} /></div>
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-bold text-slate-900">Automation progress</h3>
          <p className="mt-1 text-sm leading-5 text-slate-600">Recent WhatsApp communication outcomes. WAHA acceptance does not confirm recipient delivery.</p>
        </div>
        {enabled && <button type="button" onClick={() => void refresh()} disabled={loading} aria-label="Refresh automation progress" className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50"><RefreshCw size={17} className={loading ? "animate-spin" : ""} /></button>}
      </div>

      {!enabled ? (
        <div className="mt-3 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-3">
          <p className="text-sm font-semibold text-slate-800">Setup pending</p>
          <p className="mt-1 text-sm leading-5 text-slate-600">Status appears after job storage is configured and verified. No job data has been requested.</p>
        </div>
      ) : loading && !loaded ? (
        <p role="status" className="mt-3 flex items-center gap-2 rounded-xl bg-slate-50 p-3 text-sm text-slate-600"><RefreshCw size={16} className="animate-spin" /> Loading saved status…</p>
      ) : failed ? (
        <div role="status" className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm leading-5 text-amber-900">Status is temporarily unavailable. No job was changed or resent. Check the connection and refresh.</div>
      ) : jobs.length === 0 ? (
        <p className="mt-3 rounded-xl bg-slate-50 p-3 text-sm leading-5 text-slate-600">{loaded ? "No automation jobs found for this workspace yet." : "Status has not been loaded."}</p>
      ) : (
        <div className="mt-3 space-y-2">
          {jobs.map((job) => (
            <article key={job.communication_id} className="min-w-0 rounded-xl border border-slate-200 p-3">
              <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="break-words text-sm font-bold text-slate-900">{jobTypeLabel(job.job_type)}</p>
                  <p className="mt-0.5 text-xs text-slate-500">Communication #{job.communication_id}{job.job_id != null ? ` · Job #${job.job_id}` : ""} · {job.source_type.replaceAll("_", " ")}</p>
                </div>
                <span className={"shrink-0 rounded-full border px-2.5 py-1 text-xs font-semibold " + statusStyle(job.status)}>{statusLabels[job.status] ?? job.status}</span>
              </div>
              <div className="mt-3 grid grid-cols-4 gap-2">
                <div className="min-w-0"><p className="text-lg font-bold leading-5 text-slate-900">{countLabel(job.recipient_count)}</p><p className="mt-1 text-[11px] text-slate-500">Recipients</p></div>
                <div className="min-w-0"><p className="text-lg font-bold leading-5 text-emerald-700">{countLabel(job.sent_count)}</p><p className="mt-1 text-[11px] text-slate-500">Accepted by WAHA</p></div>
                <div className="min-w-0"><p className="text-lg font-bold leading-5 text-slate-900">{countLabel(job.failed_count)}</p><p className="mt-1 text-[11px] text-slate-500">Failed</p></div>
                <div className="min-w-0"><p className="text-lg font-bold leading-5 text-slate-900">{countLabel(job.uncertain_count)}</p><p className="mt-1 text-[11px] text-slate-500">Uncertain</p></div>
              </div>
              <div className="mt-2 border-t border-slate-100 pt-2 text-[10px] leading-4 text-slate-500">
                <p>Created: {formatTime(job.created_at)}</p>
                <p>Completed: {job.completed_at ? formatTime(job.completed_at) : "Pending"}</p>
              </div>
            </article>
          ))}
        </div>
      )}
      <p className="mt-3 text-[11px] leading-4 text-slate-500">Read-only aggregate outcomes. “Accepted by WAHA” means the server accepted the request; it does not confirm delivery to a recipient. Unknown outcomes are not automatically resent.</p>
    </section>
  );
}

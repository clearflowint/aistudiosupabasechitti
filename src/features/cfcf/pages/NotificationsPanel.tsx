// CFCF PRODUCT: Displays campaign acknowledgement and delivery status from persisted tenant notifications.
// MIX: Rendered by the universal shell through the product's optional notification slot.

import { useCallback, useEffect, useState } from "react";
import { Bell, RefreshCw, CheckCircle2, CircleAlert, Clock3, XCircle } from "lucide-react";
import type { AuthorizedWorkspace } from "../../../core/workspace/workspace.types";
import { listCfcfNotifications, type CfcfNotification } from "../services/notifications.service";
import { listCfcfFunds, listCfcfShares, listCfcfBills, listCfcfCycles } from "../services/workspace.service";

interface NotificationsPanelProps {
  workspace: AuthorizedWorkspace;
  onNavigate: (pageId: string) => void;
}

interface PreviousBillAlert {
  fundId: string;
  fundName: string;
  shareId: string;
  cycleNumbers: number[];
}

function statusStyle(status: string) {
  if (status === "sent") return "bg-emerald-50 text-emerald-800";
  if (status === "partial") return "bg-amber-50 text-amber-900";
  if (status === "failed") return "bg-rose-50 text-rose-800";
  return "bg-sky-50 text-sky-800";
}

function StatusIcon({ status }: { status: string }) {
  if (status === "sent") return <CheckCircle2 size={16} />;
  if (status === "partial") return <CircleAlert size={16} />;
  if (status === "failed") return <XCircle size={16} />;
  return <Clock3 size={16} className={status === "submitting" || status === "accepted" || status === "ack_timeout" ? "animate-pulse" : ""} />;
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    submitting: "Submitting",
    ack_timeout: "Acknowledgement delayed · checking for final result",
    accepted: "Accepted by n8n · processing",
    sent: "Delivery completed",
    partial: "Partially delivered",
    failed: "Failed",
  };
  return labels[status] ?? status.replace(/_/g, " ");
}

export function NotificationsPanel({ workspace, onNavigate }: NotificationsPanelProps) {
  const [items, setItems] = useState<CfcfNotification[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [previousBillAlerts, setPreviousBillAlerts] = useState<PreviousBillAlert[]>([]);
  const [billAlertsError, setBillAlertsError] = useState<string | null>(null);
  const [managerAlerts, setManagerAlerts] = useState<Array<{ key: string; label: string; fundId: string; fundName: string; detail: string; shareId?: string; cycleNumber?: number; kind: "fund-dues" | "share-dues" | "bill" | "cycle" }>>([]);
  const [dismissedNotificationIds, setDismissedNotificationIds] = useState<string[]>(() => {
    try {
      const saved = window.localStorage.getItem("clearflow:cfcf-dismissed-notifications:v1:" + workspace.tenantId);
      const parsed: unknown = saved ? JSON.parse(saved) : [];
      return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
    } catch { return []; }
  });
  const notificationKey = (item: CfcfNotification, index: number) => String(item.id ?? item.campaign_id ?? [item.type, item.title, item.created_at, index].join(":"));
  const dismissNotification = (key: string) => {
    setDismissedNotificationIds((current) => {
      const next = current.includes(key) ? current : [...current, key];
      try { window.localStorage.setItem("clearflow:cfcf-dismissed-notifications:v1:" + workspace.tenantId, JSON.stringify(next)); } catch { /* Current-session dismiss still works if storage is unavailable. */ }
      return next;
    });
  };
  const clearInformationalNotifications = () => {
    const keys = items.map((item, index) => notificationKey(item, index));
    setDismissedNotificationIds((current) => {
      const next = Array.from(new Set([...current, ...keys]));
      try { window.localStorage.setItem("clearflow:cfcf-dismissed-notifications:v1:" + workspace.tenantId, JSON.stringify(next)); } catch { /* Current-session clear still works if storage is unavailable. */ }
      return next;
    });
  };


  const refresh = useCallback(async () => {
    setError(null);
    try {
      const rows = await listCfcfNotifications(workspace.tenantId);
      setItems(rows);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load Notifications.");
    } finally {
      setIsLoading(false);
    }
  }, [workspace.tenantId]);

  useEffect(() => {
    let isCurrent = true;
    let interval: ReturnType<typeof setInterval> | undefined;
    const load = async () => {
      try {
        const rows = await listCfcfNotifications(workspace.tenantId);
        if (isCurrent) {
          setItems(rows);
          setError(null);
        }
      } catch (loadError) {
        if (isCurrent) setError(loadError instanceof Error ? loadError.message : "Unable to load Notifications.");
      } finally {
        if (isCurrent) setIsLoading(false);
      }
      try {
        const funds = await listCfcfFunds(workspace.tenantId);
        const alerts: PreviousBillAlert[] = [];
        for (const fund of funds) {
          const [fundShares, fundBills, cycles] = await Promise.all([
            listCfcfShares(workspace.tenantId, fund.fund_id),
            listCfcfBills(workspace.tenantId, fund.fund_id),
            listCfcfCycles(workspace.tenantId, fund.fund_id),
          ]);
          for (const share of fundShares) {
            const previousCycles = cycles.filter((cycle) => new Date(cycle.created_at).getTime() <= new Date(share.created_at).getTime());
            const cycleNumbers = previousCycles.filter((cycle) => {
              const bill = fundBills.find((item) => item.cycle_id === cycle.cycle_id && item.share_id === share.share_id);
              return !bill;
            }).map((cycle) => cycle.cycle_number).sort((a, b) => a - b);
            if (cycleNumbers.length) alerts.push({ fundId: fund.fund_id, fundName: fund.fund_name, shareId: share.share_id, cycleNumbers });
          }
        }
        if (isCurrent) { setPreviousBillAlerts(alerts); setBillAlertsError(null); }

        const managerRows: Array<{ key: string; label: string; fundId: string; fundName: string; detail: string; shareId?: string; cycleNumber?: number; kind: "fund-dues" | "share-dues" | "bill" | "cycle" }> = [];
        for (const fund of funds) {
          const [fundCycles, fundBills, fundShares] = await Promise.all([
            listCfcfCycles(workspace.tenantId, fund.fund_id),
            listCfcfBills(workspace.tenantId, fund.fund_id),
            listCfcfShares(workspace.tenantId, fund.fund_id),
          ]);
          const fundPending = Number(fund.fund_total_pending_amount ?? 0);
          if (Number.isFinite(fundPending) && fundPending > 0) managerRows.push({ key: fund.fund_id + ":fund-pending", label: "Fund pending dues", fundId: fund.fund_id, fundName: fund.fund_name, detail: "₹" + fundPending.toLocaleString("en-IN"), kind: "fund-dues" });
          for (const share of fundShares) {
            const pending = Number(share.total_pending ?? 0);
            if (Number.isFinite(pending) && pending > 0) managerRows.push({ key: fund.fund_id + ":" + share.share_id + ":share-pending", label: "Share pending dues", fundId: fund.fund_id, fundName: fund.fund_name, detail: "Share " + share.share_id + " · ₹" + pending.toLocaleString("en-IN"), shareId: share.share_id, kind: "share-dues" });
          }
          for (const cycle of fundCycles) {
            if (cycle.planned_payout_amount == null || Number(cycle.planned_payout_amount) === 0) managerRows.push({ key: fund.fund_id + ":" + cycle.cycle_number + ":payout", label: cycle.planned_payout_amount == null ? "Planned payout · Not Set" : "Planned payout · Zero Amount", fundId: fund.fund_id, fundName: fund.fund_name, detail: "Cycle " + cycle.cycle_number, cycleNumber: cycle.cycle_number, kind: "cycle" });
            if (cycle.commission_amount == null || Number(cycle.commission_amount) === 0) managerRows.push({ key: fund.fund_id + ":" + cycle.cycle_number + ":commission", label: cycle.commission_amount == null ? "Commission · Not Set" : "Commission · Zero Amount", fundId: fund.fund_id, fundName: fund.fund_name, detail: "Cycle " + cycle.cycle_number, cycleNumber: cycle.cycle_number, kind: "cycle" });
            for (const share of fundShares) {
              const bill = fundBills.find((item) => item.cycle_id === cycle.cycle_id && item.share_id === share.share_id);
              if (!bill || Number(bill.amount) === 0) managerRows.push({ key: fund.fund_id + ":" + cycle.cycle_number + ":" + share.share_id + ":bill", label: bill ? "Bill · Zero Amount" : "Bill · Not Set / Missing", fundId: fund.fund_id, fundName: fund.fund_name, detail: "Cycle " + cycle.cycle_number + " · Share " + share.share_id, shareId: share.share_id, cycleNumber: cycle.cycle_number, kind: "bill" });
            }
          }
        }
        if (isCurrent) setManagerAlerts(managerRows);
      } catch (loadError) {
        if (isCurrent) setBillAlertsError(loadError instanceof Error ? loadError.message : "Unable to refresh manager alerts.");
      }
    };
    void load();
    interval = setInterval(() => { void load(); }, 7000);
    return () => {
      isCurrent = false;
      if (interval) clearInterval(interval);
    };
  }, [workspace.tenantId]);

  return (
    <section aria-label="Notifications" className="mx-auto max-w-3xl border-t border-slate-100 bg-sky-50/70 px-3 py-3 sm:px-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white text-sky-700"><Bell size={17} /></div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-900">Notifications</p>
            <p className="text-xs text-slate-500">Campaign acknowledgements and delivery updates</p>
          </div>
        </div>
        <button type="button" onClick={() => void refresh()} disabled={isLoading} aria-label="Refresh notifications" className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-50">
          <RefreshCw size={15} className={isLoading ? "animate-spin" : ""} />
        </button>
      </div>

      <section aria-label="Manager alerts" className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0"><h3 className="text-sm font-bold text-amber-950">Manager Alerts <span className="ml-1 rounded-full bg-amber-200 px-2 py-0.5 text-xs">{managerAlerts.length}</span></h3><p className="mt-1 text-xs leading-5 text-amber-900">Cycle entries and pending dues across all active Funds. Closing this panel does not dismiss alerts; they remain until the underlying saved records are corrected.</p></div>
          <button type="button" onClick={() => { if (!("Notification" in window)) return; if (!window.isSecureContext) return; void Notification.requestPermission(); }} className="min-h-9 shrink-0 rounded-lg border border-amber-300 bg-white px-2 text-xs font-semibold text-amber-950">Enable phone alerts</button>
        </div>
        {managerAlerts.length === 0 ? <p className="mt-3 rounded-lg bg-white p-3 text-xs text-slate-600">No outstanding manager alerts.</p> : <div className="mt-3 max-h-[45vh] space-y-2 overflow-y-auto">
          {managerAlerts.slice(0, 40).map((alert) => <button key={alert.key} type="button" onClick={() => {
            try { window.localStorage.setItem("clearflow:cfcf-open-manager-alert:v1:" + workspace.tenantId, JSON.stringify({ fundId: alert.fundId, shareId: alert.shareId, cycleNumber: alert.cycleNumber, kind: alert.kind })); } catch { /* Navigation still works without storage. */ }
            if (alert.kind === "bill" && alert.shareId && alert.cycleNumber !== undefined) {
              try { window.localStorage.setItem("clearflow:cfcf-open-previous-bills:v1:" + workspace.tenantId, JSON.stringify({ fundId: alert.fundId, shareId: alert.shareId, cycleNumbers: [alert.cycleNumber] })); } catch { /* Navigation still works without storage. */ }
              window.dispatchEvent(new Event("clearflow:cfcf-open-previous-bills"));
            }
            onNavigate("workspace");
          }} className="flex min-h-11 w-full items-start justify-between gap-2 rounded-lg border border-amber-200 bg-white p-3 text-left"><span className="min-w-0"><span className="block break-words text-xs font-semibold text-slate-900">{alert.label}</span><span className="mt-1 block break-words text-xs text-slate-600">{alert.fundName} · {alert.detail}</span></span><span className="shrink-0 text-xs font-semibold text-amber-800">Review ↗</span></button>)}
          {managerAlerts.length > 40 && <p className="text-xs text-amber-900">Showing 40 of {managerAlerts.length} alerts.</p>}
        </div>}
      </section>

      {error && <p role="alert" className="mt-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">{error}</p>}
      {billAlertsError && <p role="alert" className="mt-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">{billAlertsError}</p>}
      {previousBillAlerts.length > 0 && (
        <section aria-label="Previous Cycle bills needing attention" className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
          <div className="flex items-start gap-2">
            <div className="mt-0.5 rounded-lg bg-white p-2 text-amber-800"><CircleAlert size={17} /></div>
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-bold text-amber-950">Previous Cycle bills need attention</h3>
              <p className="mt-1 text-xs leading-5 text-amber-900">Missing bill records for Shares added after these Cycles were created.</p>
            </div>
          </div>
          <div className="mt-3 space-y-2">
            {previousBillAlerts.map((alert) => (
              <article key={alert.fundId + ":" + alert.shareId} className="rounded-lg border border-amber-200 bg-white p-3">
                <p className="break-words text-sm font-semibold text-slate-900">{alert.fundName}</p>
                <p className="mt-1 break-all text-xs text-slate-600">Share ID · {alert.shareId}</p>
                <p className="mt-1 text-xs text-amber-900">Bills to review: {alert.cycleNumbers.map((number) => "Cycle " + number).join(", ")}</p>
                <button type="button" onClick={() => {
                  try {
                    window.localStorage.setItem("clearflow:cfcf-open-previous-bills:v1:" + workspace.tenantId, JSON.stringify({ fundId: alert.fundId, shareId: alert.shareId, cycleNumbers: alert.cycleNumbers }));
                  } catch { /* The alert remains visible if browser storage is unavailable. */ }
                  window.dispatchEvent(new Event("clearflow:cfcf-open-previous-bills"));
                  onNavigate("workspace");
                }} className="mt-3 min-h-10 w-full rounded-lg bg-amber-700 px-3 text-xs font-semibold text-white hover:bg-amber-800">Open Share Bills</button>
              </article>
            ))}
          </div>
        </section>
      )}

      {isLoading ? (
        <p aria-live="polite" className="mt-3 rounded-xl bg-white/80 p-4 text-center text-sm text-slate-500"><RefreshCw size={15} className="mr-2 inline animate-spin" />Loading Notifications…</p>
      ) : items.length === 0 ? (
        <p className="mt-3 rounded-xl bg-white/80 p-4 text-center text-sm text-slate-500">No notifications yet. Campaign receipts and delivery outcomes will appear here.</p>
      ) : (
        <div className="mt-3 max-h-[55vh] space-y-2 overflow-y-auto">
          {items.slice(0, 30).map((item, index) => {
            const status = String(item.status ?? "info").toLowerCase();
            return (
              <article key={item.campaign_id ?? item.id ?? String(index)} className="min-w-0 rounded-xl border border-slate-200 bg-white p-3">
                <div className="flex items-start gap-2">
                  <div className={"mt-0.5 shrink-0 rounded-lg p-2 " + statusStyle(status)}><StatusIcon status={status} /></div>
                  <div className="min-w-0 flex-1">
                    <h3 className="break-words text-sm font-semibold text-slate-900">{item.title || "Workspace notification"}</h3>
                    <p className="mt-1 break-words text-xs leading-5 text-slate-600">{item.message || "Status update received."}</p>
                    <p className="mt-2 text-[11px] text-slate-500">
                      {item.recipient_count !== undefined ? item.recipient_count + " recipients" : ""}
                      {item.channels?.length ? (item.recipient_count !== undefined ? " · " : "") + item.channels.join(", ") : ""}
                      {(item.updated_at || item.created_at) ? " · " + new Date(item.updated_at ?? item.created_at ?? "").toLocaleString("en-IN") : ""}
                    </p>
                    <div className={"mt-2 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold " + statusStyle(status)}>
                      <StatusIcon status={status} /> {statusLabel(status)}
                    </div>
                    {item.error && <p className="mt-2 break-words text-xs text-rose-700">{item.error}</p>}
                    {item.delivery_summary && <p className="mt-2 break-words text-xs text-slate-600">Delivery summary: {Object.entries(item.delivery_summary).map(([key, value]) => key + " " + String(value)).join(" · ")}</p>}
                    {item.campaign_id && <p className="mt-1 break-all font-mono text-[10px] text-slate-400">{item.campaign_id}</p>}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

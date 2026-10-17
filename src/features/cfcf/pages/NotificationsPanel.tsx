// CFCF PRODUCT: Displays campaign acknowledgement and delivery status from persisted tenant notifications.
// MIX: Rendered by the universal shell through the product's optional notification slot.

import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, RefreshCw, CircleAlert } from "lucide-react";
import type { AuthorizedWorkspace } from "../../../core/workspace/workspace.types";
import { listCfcfNotifications, type CfcfNotification } from "../services/notifications.service";
import { listCfcfFunds, listCfcfShares, listCfcfBills, listCfcfCycles } from "../services/workspace.service";

interface NotificationsPanelProps {
  workspace: AuthorizedWorkspace;
  onNavigate: (pageId: string) => void;
  onCountChange?: (count: number) => void;
}

interface PreviousBillAlert {
  fundId: string;
  fundName: string;
  shareId: string;
  cycleNumbers: number[];
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

export function NotificationsPanel({ workspace, onNavigate, onCountChange }: NotificationsPanelProps) {
  const [items, setItems] = useState<CfcfNotification[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [previousBillAlerts, setPreviousBillAlerts] = useState<PreviousBillAlert[]>([]);
  const [billAlertsError, setBillAlertsError] = useState<string | null>(null);
  const [phoneAlertMessage, setPhoneAlertMessage] = useState<string | null>(null);
  const [phonePermission, setPhonePermission] = useState<NotificationPermission | "unsupported">(() => typeof window !== "undefined" && "Notification" in window ? Notification.permission : "unsupported");
  const seenAlertKeys = useRef<Set<string> | null>(null);
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


  const visibleInformationalCount = items.filter((item, index) => !dismissedNotificationIds.includes(notificationKey(item, index))).length;

  useEffect(() => {
    onCountChange?.(managerAlerts.length + previousBillAlerts.length + visibleInformationalCount);
  }, [managerAlerts.length, previousBillAlerts.length, visibleInformationalCount, onCountChange]);

  const enablePhoneAlerts = async () => {
    if (!("Notification" in window) || !window.isSecureContext) {
      setPhonePermission("unsupported");
      setPhoneAlertMessage("This browser context does not support phone notifications. On iPhone, open ClearFlow from the Home Screen web app in a supported iOS version; on Android, use Chrome and allow notifications for this site.");
      return;
    }
    try {
      const permission = await Notification.requestPermission();
      setPhonePermission(permission);
      if (permission !== "granted") {
        setPhoneAlertMessage(permission === "denied"
          ? "Notifications are blocked for this site. Change the site notification permission in your browser or phone settings, then try again."
          : "Notification permission was not granted. Tap Enable phone alerts and choose Allow to enable alerts.");
        return;
      }
      try {
        if ("serviceWorker" in navigator) {
          const registration = await navigator.serviceWorker.getRegistration();
          if (registration?.showNotification) {
            await registration.showNotification("ClearFlow phone alerts enabled", { body: "You will receive alerts while this app can deliver browser notifications." });
          } else {
            new Notification("ClearFlow phone alerts enabled", { body: "Browser notifications are enabled while ClearFlow is open." });
          }
        } else {
          new Notification("ClearFlow phone alerts enabled", { body: "Browser notifications are enabled while ClearFlow is open." });
        }
        setPhoneAlertMessage("Permission granted. Test notification sent. New Manager Alerts can notify you while ClearFlow is open; alerts when the app is closed require push-service setup.");
      } catch {
        setPhoneAlertMessage("Permission is granted, but this browser could not display a test notification. On iPhone, install ClearFlow to the Home Screen and open that app; otherwise check browser/phone notification settings.");
      }
    } catch {
      setPhoneAlertMessage("Could not request notification permission in this browser. Check site permissions and try again.");
    }
  };

  useEffect(() => {
    const keys = new Set(managerAlerts.map((alert) => alert.key));
    if (seenAlertKeys.current === null) {
      seenAlertKeys.current = keys;
      return;
    }
    const newlyAdded = managerAlerts.filter((alert) => !seenAlertKeys.current?.has(alert.key));
    seenAlertKeys.current = keys;
    if (phonePermission !== "granted" || newlyAdded.length === 0 || !("Notification" in window)) return;
    const first = newlyAdded[0];
    const title = newlyAdded.length === 1 ? first.label : newlyAdded.length + " new Manager Alerts";
    const body = newlyAdded.length === 1 ? first.fundName + " · " + first.detail : "Open ClearFlow to review the new operational alerts.";
    void (async () => {
      try {
        if ("serviceWorker" in navigator) {
          const registration = await navigator.serviceWorker.getRegistration();
          if (registration?.showNotification) {
            await registration.showNotification(title, { body, tag: "clearflow-manager-alerts" });
            return;
          }
        }
        new Notification(title, { body });
      } catch {
        setPhoneAlertMessage("Browser permission is granted, but a new alert could not be shown as a phone notification.");
      }
    })();
  }, [managerAlerts, phonePermission]);

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
          <button type="button" onClick={() => void enablePhoneAlerts()} className="min-h-9 shrink-0 rounded-lg border border-amber-300 bg-white px-2 text-xs font-semibold text-amber-950">{phonePermission === "granted" ? "Test phone alerts" : "Enable phone alerts"}</button>
        </div>
        {phoneAlertMessage && <p role="status" className="mt-2 rounded-lg border border-amber-200 bg-white p-2 text-xs leading-5 text-amber-950">{phoneAlertMessage}</p>}
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

      <section aria-label="Informational notifications" className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
        <div className="flex items-center justify-between gap-2">
          <div><h3 className="text-sm font-bold text-slate-900">Notifications</h3><p className="mt-1 text-xs text-slate-600">Campaign receipts and delivery updates. These can be dismissed independently of Manager Alerts.</p></div>
          <button type="button" onClick={clearInformationalNotifications} className="min-h-9 rounded-lg border border-slate-300 bg-white px-2 text-xs font-semibold text-slate-700">Clear all</button>
        </div>
        {items.filter((item, index) => !dismissedNotificationIds.includes(notificationKey(item, index))).map((item) => {
          const index = items.indexOf(item);
          const key = notificationKey(item, index);
          const status = String(item.status ?? "info").toLowerCase();
          return <article key={key} className="mt-2 rounded-xl border border-slate-200 bg-white p-3">
            <h3 className="text-sm font-semibold">{item.title || "Workspace notification"}</h3>
            <p className="mt-1 text-xs text-slate-600">{item.message || "Status update received."}</p>
            <p className="mt-1 text-xs text-slate-500">{statusLabel(status)}</p>
            <button type="button" onClick={() => dismissNotification(key)} className="mt-2 min-h-9 rounded-lg border px-3 text-xs">Dismiss</button>
          </article>;
        })}
        {!isLoading && items.every((item, index) => dismissedNotificationIds.includes(notificationKey(item, index))) && <p className="mt-3 text-xs text-slate-600">No informational notifications. Manager Alerts remain separate above.</p>}
      </section>
    </section>
  );
}

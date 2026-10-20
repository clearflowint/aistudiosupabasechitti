// SKELETON: Product-neutral mobile home. Keep it focused on the two primary destinations.
// MIX: The product provides destination metadata; navigation remains owned by the shared shell.

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { ArrowRight, CheckCircle2, History, RefreshCw, ShieldCheck, WalletCards, CreditCard } from "lucide-react";
import { Modal } from "../ui/Modal";
import { listCfcfContacts } from "../../features/cfcf/services/contacts.service";
import { listCfcfGlobalWhatsAppJobs, type CfcfGlobalWhatsAppJob } from "../../features/cfcf/services/notifications.service";
import { listCfcfFunds, listCfcfShares, recordCfcfSharePayment } from "../../features/cfcf/services/workspace.service";
import type { CfcfContactRow, CfcfFundRow, CfcfShareRow } from "../../features/cfcf/types/database.types";
import { ContactsPage } from "../../features/cfcf/pages/ContactsPage";
import type { ProductDefinition } from "../../core/products/product.types";
import type { AuthorizedWorkspace } from "../../core/workspace/workspace.types";

interface WorkspaceHomePageProps {
  product: ProductDefinition;
  workspace: AuthorizedWorkspace;
  onNavigate: (pageId: string) => void;
}

export function WorkspaceHomePage({ product, workspace, onNavigate }: WorkspaceHomePageProps) {
  const workspacePage = product.navigation.find(({ id }) => id === "workspace");
  const [quickPaymentOpen, setQuickPaymentOpen] = useState(false);
  const [automationJobs, setAutomationJobs] = useState<CfcfGlobalWhatsAppJob[]>([]);
  const [automationJobsLoading, setAutomationJobsLoading] = useState(true);
  const [automationJobsError, setAutomationJobsError] = useState<string | null>(null);
  const [quickFunds, setQuickFunds] = useState<CfcfFundRow[]>([]);
  const [quickContacts, setQuickContacts] = useState<CfcfContactRow[]>([]);
  const [quickShares, setQuickShares] = useState<CfcfShareRow[]>([]);
  const [quickContactId, setQuickContactId] = useState("");
  const [quickFundId, setQuickFundId] = useState("");
  const [quickShareId, setQuickShareId] = useState("");
  const [quickEntryType, setQuickEntryType] = useState<"credit" | "debit">("credit");
  const [quickAmount, setQuickAmount] = useState("");
  const [quickMode, setQuickMode] = useState<"UPI" | "Cash" | "Other">("UPI");
  const [quickRemarks, setQuickRemarks] = useState("");
  const [quickSearch, setQuickSearch] = useState("");
  const [quickLoading, setQuickLoading] = useState(false);
  const [quickSaving, setQuickSaving] = useState(false);
  const [quickReview, setQuickReview] = useState(false);
  const [quickError, setQuickError] = useState<string | null>(null);
  const [quickSuccess, setQuickSuccess] = useState<string | null>(null);
  const quickSavingRef = useRef(false);
  const quickPaymentRequestRef = useRef<string | null>(null);
  const sharesRequestRef = useRef(0);
  const selectedFund = quickFunds.find((fund) => fund.fund_id === quickFundId) ?? null;
  const filteredContacts = useMemo(() => {
    const query = quickSearch.trim().toLowerCase();
    return quickContacts.filter((contact) => !query || [contact.name, contact.phone, contact.email].some((value) => value?.toLowerCase().includes(query)));
  }, [quickContacts, quickSearch]);
  const contactShares = quickShares.filter((share) => share.contact_id === quickContactId);
  const contactFunds = quickFunds.filter((fund) => contactShares.some((share) => share.fund_id === fund.fund_id));
  const selectedShare = contactShares.find((share) => share.share_id === quickShareId && share.fund_id === quickFundId) ?? null;
  const selectedContact = quickContacts.find((contact) => contact.contact_id === quickContactId) ?? null;
  const validAmount = quickAmount.trim() !== "" && Number.isSafeInteger(Number(quickAmount)) && Number(quickAmount) > 0 && Number(quickAmount) <= 2147483647;

  const loadAutomationJobs = async () => {
    setAutomationJobsLoading(true);
    setAutomationJobsError(null);
    try {
      const jobs = await listCfcfGlobalWhatsAppJobs(workspace.tenantId);
      setAutomationJobs(jobs);
    } catch (error) {
      setAutomationJobsError(error instanceof Error ? error.message : "Unable to load automation job history.");
    } finally {
      setAutomationJobsLoading(false);
    }
  };

  useEffect(() => {
    void loadAutomationJobs();
    // Job history is loaded on entry; refresh is explicit to avoid background polling.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace.tenantId]);

  useEffect(() => {
    if (!quickPaymentOpen) return;
    let active = true;
    setQuickLoading(true); setQuickError(null);
    Promise.all([listCfcfFunds(workspace.tenantId), listCfcfContacts(workspace.tenantId)])
      .then(([funds, contacts]) => {
        if (!active) return;
        setQuickFunds(funds); setQuickContacts(contacts);
      })
      .catch((error: unknown) => { if (active) setQuickError(error instanceof Error ? error.message : "Unable to load Funds and Contacts from Supabase."); })
      .finally(() => { if (active) setQuickLoading(false); });
    return () => { active = false; };
  }, [quickPaymentOpen, workspace.tenantId]);

  useEffect(() => {
    const requestId = ++sharesRequestRef.current;
    if (!quickPaymentOpen || !quickContactId) { setQuickShares([]); setQuickFundId(""); setQuickShareId(""); return; }
    let active = true;
    setQuickLoading(true); setQuickError(null);
    Promise.all(quickFunds.map((fund) => listCfcfShares(workspace.tenantId, fund.fund_id)))
      .then((groups) => {
        if (!active || requestId !== sharesRequestRef.current) return;
        setQuickShares(groups.flat().filter((share) => share.contact_id === quickContactId));
        setQuickFundId(""); setQuickShareId("");
      })
      .catch((error: unknown) => { if (active) setQuickError(error instanceof Error ? error.message : "Unable to load this contact’s Shares from Supabase."); })
      .finally(() => { if (active && requestId === sharesRequestRef.current) setQuickLoading(false); });
    return () => { active = false; };
  }, [quickPaymentOpen, quickContactId, quickFunds, workspace.tenantId]);

  function closeQuickPayment() {
    if (quickSavingRef.current) return;
    setQuickPaymentOpen(false); setQuickReview(false); quickPaymentRequestRef.current = null; setQuickError(null); setQuickSearch(""); setQuickAmount(""); setQuickRemarks(""); setQuickContactId(""); setQuickFundId(""); setQuickShareId(""); setQuickEntryType("credit"); setQuickMode("UPI");
  }

  async function handleQuickPaymentSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (quickSavingRef.current || !selectedFund || !selectedShare || !validAmount) return;
    if (!quickReview) { quickPaymentRequestRef.current = crypto.randomUUID(); setQuickReview(true); setQuickError(null); return; }
    quickSavingRef.current = true; setQuickSaving(true); setQuickError(null); setQuickSuccess(null);
    try {
      const now = new Date();
      const today = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
      const savedPayment = await recordCfcfSharePayment(workspace.tenantId, selectedFund.fund_id, selectedShare.share_id, workspace.personId, quickEntryType, Number(quickAmount), today, quickMode, quickRemarks, quickPaymentRequestRef.current ?? crypto.randomUUID());
      setQuickPaymentOpen(false); setQuickReview(false); quickPaymentRequestRef.current = null;
      setQuickSuccess((savedPayment.duplicate ? "Payment already saved" : (quickEntryType === "credit" ? "Payment recorded" : "Debit correction recorded")) + " successfully in Supabase for " + (selectedContact?.name ?? "the selected contact") + " · Share " + selectedShare.share_id + " · Payment ID " + savedPayment.payment_id + (savedPayment.duplicate ? " (no duplicate created)." : "."));
      setQuickSearch(""); setQuickAmount(""); setQuickRemarks(""); setQuickContactId(""); setQuickFundId(""); setQuickShareId("");
    } catch (error) {
      setQuickError(error instanceof Error ? error.message : "Supabase did not confirm the payment. Check the Payments ledger before retrying.");
    } finally { quickSavingRef.current = false; setQuickSaving(false); }
  }

  const activityPage = product.navigation.find(({ id }) => id === "activity");

  return (
    <div className="min-w-0 space-y-4">
      <section className="overflow-hidden rounded-3xl border border-sky-100 bg-gradient-to-br from-white via-white to-sky-50 p-4 text-slate-900 shadow-sm sm:p-6">
        <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800">
          <ShieldCheck size={14} /> Workspace access verified
        </div>
        <h2 className="mt-3 break-words text-xl font-bold tracking-tight sm:text-2xl">
          Welcome, {workspace.displayName}.
        </h2>
        <p className="mt-1 max-w-lg break-words text-sm leading-5 text-slate-600">
          Everything you need, with fewer screens and no side menu.
        </p>
        <div className="mt-3 border-t border-slate-200 pt-3">
          <p className="break-all text-xs text-slate-500">{workspace.email}</p>
        </div>
      </section>

      <section aria-label="Quick access" className="space-y-3">
        {workspacePage && (
          <button
            type="button"
            onClick={() => onNavigate(workspacePage.id)}
            className="flex min-h-24 w-full min-w-0 items-center gap-3 rounded-2xl border border-sky-200 bg-sky-600 p-3 text-left text-white shadow-sm transition hover:bg-sky-700 sm:p-4"
          >
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white/15 text-white">
              <WalletCards size={24} />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-lg font-bold">Enter workspace</h3>
              <p className="mt-1 break-words text-sm leading-5 text-sky-100">Open all funds, cycles, shares, and ledger entries in one place.</p>
            </div>
            <ArrowRight size={20} className="shrink-0" />
          </button>
        )}
        <button type="button" onClick={() => { setQuickPaymentOpen(true); setQuickSuccess(null); setQuickError(null); quickPaymentRequestRef.current = null; quickPaymentRequestRef.current = null; }} className="flex min-h-20 w-full min-w-0 items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-left text-slate-900 shadow-sm transition hover:bg-emerald-100 sm:p-4">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-emerald-600 text-white"><CreditCard size={22} /></div>
          <div className="min-w-0 flex-1"><h3 className="text-base font-bold">Record Payment (Quick)</h3><p className="mt-1 break-words text-sm leading-5 text-slate-600">Record a credit or debit against one Share without opening the full workspace.</p></div>
          <ArrowRight size={20} className="shrink-0 text-emerald-700" />
        </button>
        {quickSuccess && <p role="status" className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800"><CheckCircle2 size={18} className="mt-0.5 shrink-0" /> {quickSuccess}</p>}
        {activityPage && (
          <button
            type="button"
            onClick={() => onNavigate(activityPage.id)}
            className="flex min-h-20 w-full min-w-0 items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 text-left text-slate-900 shadow-sm transition hover:bg-slate-50 sm:p-4"
          >
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-700">
              <History size={22} />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-base font-bold">Manager Activity Log</h3>
              <p className="mt-1 break-words text-sm leading-5 text-slate-600">Review the latest 500 recorded actions, newest first.</p>
            </div>
            <ArrowRight size={20} className="shrink-0 text-slate-500" />
          </button>
        )}
      </section>

      <section aria-labelledby="automation-centre-heading" className="space-y-3 rounded-2xl border border-violet-100 bg-white p-3 shadow-sm sm:p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 id="automation-centre-heading" className="text-base font-bold text-slate-900">Automation Centre</h3>
            <p className="mt-1 text-sm leading-5 text-slate-600">WhatsApp job progress and recent results for this tenant.</p>
          </div>
          <button type="button" onClick={() => void loadAutomationJobs()} disabled={automationJobsLoading} aria-label="Refresh automation jobs" className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-700 disabled:opacity-50">
            <RefreshCw size={15} className={automationJobsLoading ? "animate-spin" : ""} /> Refresh
          </button>
        </div>
        {(() => {
          const activeCount = automationJobs.filter((job) => ["registered", "picked_up"].includes(job.job_status)).length;
          const completedCount = automationJobs.filter((job) => job.job_status === "completed").length;
          const acceptedCount = automationJobs.reduce((sum, job) => sum + Number(job.sent_to_server_count ?? 0), 0);
          const reviewCount = automationJobs.filter((job) => ["failed", "timed_out"].includes(job.job_status) || Number(job.failed_count ?? 0) > 0 || Number(job.uncertain_count ?? 0) > 0).length;
          return (
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs font-medium text-slate-500">In progress</p><p className="mt-1 text-xl font-bold tabular-nums text-slate-900">{automationJobsLoading ? "—" : activeCount}</p></div>
              <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs font-medium text-slate-500">Completed jobs</p><p className="mt-1 text-xl font-bold tabular-nums text-slate-900">{automationJobsLoading ? "—" : completedCount}</p></div>
              <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs font-medium text-slate-500">Accepted by WAHA</p><p className="mt-1 text-xl font-bold tabular-nums text-slate-900">{automationJobsLoading ? "—" : acceptedCount}</p><p className="mt-1 text-xs text-slate-500">Server acceptance, not delivery/read</p></div>
              <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs font-medium text-slate-500">Needs review</p><p className="mt-1 text-xl font-bold tabular-nums text-slate-900">{automationJobsLoading ? "—" : reviewCount}</p><p className="mt-1 text-xs text-slate-500">Failed, uncertain or timed out</p></div>
            </div>
          );
        })()}
        {automationJobsError && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{automationJobsError}</p>}
        {!automationJobsError && !automationJobsLoading && automationJobs.length === 0 && <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600">No registered WhatsApp jobs yet. Start Pending or Report from the Fund workspace; jobs will appear here after registry-backed history is available.</p>}
        {automationJobsLoading && <p role="status" className="text-sm text-slate-500">Loading saved job history…</p>}
        {!automationJobsLoading && automationJobs.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-semibold text-slate-800">Recent jobs</h4>
            {automationJobs.slice(0, 5).map((job) => {
              const status = ({
                registered: "Queued",
                picked_up: "Processing",
                completed: "Completed",
                failed: "Failed",
                timed_out: "Timed out · review",
              } as Record<string, string>)[job.job_status] ?? job.job_status.replace(/_/g, " ");
              const type = ({
                manual_campaign: "Campaign",
                pending_reminder: "Pending reminder",
                report: "Report",
              } as Record<string, string>)[job.job_type] ?? job.job_type.replace(/_/g, " ");
              const hasReview = job.job_status === "timed_out" || job.job_status === "failed" || job.failed_count > 0 || job.uncertain_count > 0;
              return (
                <article key={job.n8n_global_job_id} className="rounded-xl border border-slate-200 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="break-words text-sm font-semibold text-slate-900">{type} · Job {job.n8n_global_job_id}</p>
                      <p className="mt-1 text-xs text-slate-500">Created {job.created_at ? new Date(job.created_at).toLocaleString() : "time unavailable"}</p>
                    </div>
                    <span className={"shrink-0 rounded-full px-2 py-1 text-xs font-semibold " + (hasReview ? "bg-amber-100 text-amber-900" : job.job_status === "completed" ? "bg-emerald-100 text-emerald-800" : "bg-sky-100 text-sky-800")}>{status}</span>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-slate-600">
                    <p>Recipients: <strong className="tabular-nums text-slate-900">{job.recipient_count}</strong></p>
                    <p>Queued: <strong className="tabular-nums text-slate-900">{job.queued_count}</strong></p>
                    <p>Accepted by WAHA: <strong className="tabular-nums text-slate-900">{job.sent_to_server_count}</strong></p>
                    <p>Failed: <strong className="tabular-nums text-slate-900">{job.failed_count}</strong></p>
                    <p>Uncertain: <strong className="tabular-nums text-slate-900">{job.uncertain_count}</strong></p>
                    <p>Skipped: <strong className="tabular-nums text-slate-900">{job.skipped_count}</strong></p>
                  </div>
                  {(job.uncertain_count > 0 || job.job_status === "timed_out") && <p className="mt-2 rounded-lg bg-amber-50 p-2 text-xs leading-5 text-amber-900">Outcome needs manual review. Do not resend automatically; WAHA acceptance may be uncertain.</p>}
                </article>
              );
            })}
          </div>
        )}
        <p className="text-xs leading-5 text-slate-500">Counts reflect saved registry state. “Accepted by WAHA” does not mean delivered or read. Scheduled/manual origin is not shown until the registry stores a reliable trigger-source field; scheduled handoff is not yet active.</p>
      </section>

      <Modal isOpen={quickPaymentOpen} title="Record Payment (Quick)" description="Contact first → Fund → Share → amount. Payments remain independent of Cycle billing and payouts." onClose={closeQuickPayment}>
        <form onSubmit={(event) => void handleQuickPaymentSubmit(event)} className="space-y-3">
          {quickReview && <div role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-3"><p className="font-semibold text-amber-900">Second confirmation required</p><p className="mt-1 text-sm text-amber-800">{quickEntryType === "credit" ? "Credit payment" : "Debit correction"} · {selectedContact?.name} · {selectedFund?.fund_name} (ID {selectedFund?.fund_id}) · Share {selectedShare?.share_id} · {"₹" + Number(quickAmount).toLocaleString("en-IN")} · {quickMode}. Date is automatic. This entry is not linked to a Cycle or payout.</p><button type="button" onClick={() => { setQuickReview(false); quickPaymentRequestRef.current = null; }} className="mt-2 min-h-9 text-sm font-semibold underline">Back to edit</button></div>}
          {quickLoading && <div role="status" className="flex items-center gap-2 rounded-lg bg-sky-50 p-2 text-sm text-sky-800"><RefreshCw size={16} className="animate-spin" /> Loading saved contacts and Shares…</div>}
          <label className="block"><span className="mb-1 block text-sm font-medium">1. Search contact</span><input autoFocus value={quickSearch} onChange={(event) => { setQuickSearch(event.target.value); setQuickContactId(""); setQuickFundId(""); setQuickShareId(""); }} disabled={quickLoading || quickSaving || quickReview} placeholder="Name or phone number" className="min-h-11 w-full rounded-xl border border-slate-200 px-3 text-sm" /></label>
          {quickSearch.trim() && !quickContactId && <div className="max-h-32 space-y-1 overflow-y-auto rounded-xl border border-slate-200 p-1">{filteredContacts.length ? filteredContacts.slice(0, 8).map((contact) => <button type="button" key={contact.contact_id} disabled={quickSaving || quickReview} onClick={() => { setQuickContactId(contact.contact_id); setQuickSearch(contact.name + (contact.phone ? " · " + contact.phone : "")); setQuickFundId(""); setQuickShareId(""); }} className="flex min-h-11 w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-50"><span className="min-w-0"><span className="block truncate font-medium">{contact.name}</span><span className="block truncate text-xs text-slate-500">{contact.phone || contact.email || "No contact details"}</span></span><ArrowRight size={16} className="shrink-0" /></button>) : <p className="p-2 text-sm text-slate-500">No matching contacts.</p>}</div>}
          {selectedContact && <div className="flex items-center justify-between gap-2 rounded-xl bg-sky-50 p-2 text-sm"><span className="min-w-0"><span className="block font-semibold">{selectedContact.name}</span><span className="block text-xs text-slate-600">{selectedContact.phone || "No phone recorded"}</span></span><button type="button" disabled={quickSaving || quickReview} onClick={() => { setQuickContactId(""); setQuickFundId(""); setQuickShareId(""); setQuickSearch(""); setQuickAmount(""); }} className="shrink-0 text-xs font-semibold text-sky-800 underline">Change</button></div>}
          {quickContactId && <section className="space-y-2"><span className="block text-sm font-medium">2. Select Fund</span><div className="flex flex-wrap gap-2">{contactFunds.length ? contactFunds.map((fund) => <button type="button" key={fund.fund_id} disabled={quickSaving || quickReview} onClick={() => { setQuickFundId(fund.fund_id); setQuickShareId(""); }} aria-pressed={quickFundId === fund.fund_id} className={"min-h-10 rounded-xl border px-3 py-2 text-left text-xs font-semibold " + (quickFundId === fund.fund_id ? "border-sky-600 bg-sky-600 text-white" : "border-slate-200 bg-white text-slate-700")}><span className="block">{fund.fund_name}</span><span className={"mt-0.5 block " + (quickFundId === fund.fund_id ? "text-sky-100" : "text-slate-500")}>ID · {fund.fund_id}</span></button>) : !quickLoading && <p className="text-sm text-slate-500">This contact has no Shares in the available Funds.</p>}</div></section>}
          {quickFundId && <section className="space-y-2"><span className="block text-sm font-medium">3. Select Share</span><div className="flex flex-wrap gap-2">{contactShares.filter((share) => share.fund_id === quickFundId).map((share) => <button type="button" key={share.share_id} disabled={quickSaving || quickReview} onClick={() => setQuickShareId(share.share_id)} aria-pressed={quickShareId === share.share_id} className={"min-h-12 rounded-xl border px-3 py-2 text-left text-sm " + (quickShareId === share.share_id ? "border-emerald-600 bg-emerald-600 text-white" : "border-slate-200 bg-white text-slate-700")}><span className="block font-semibold">Share · {share.share_id}</span><span className={"mt-1 block text-xs font-medium " + (quickShareId === share.share_id ? "text-emerald-50" : "text-slate-600")}>Pending: ₹{Number(share.total_pending ?? 0).toLocaleString("en-IN")}{Number(share.total_advance ?? 0) > 0 ? " · Advance: ₹" + Number(share.total_advance).toLocaleString("en-IN") : ""}</span></button>)}</div></section>}
          {selectedShare && selectedFund && <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-2 text-xs text-emerald-900">Selected: <strong>{selectedContact?.name}</strong> · {selectedFund.fund_name} (ID {selectedFund.fund_id}) · Share ID {selectedShare.share_id} · Pending ₹{Number(selectedShare.total_pending ?? 0).toLocaleString("en-IN")}{Number(selectedShare.total_advance ?? 0) > 0 ? " · Advance ₹" + Number(selectedShare.total_advance).toLocaleString("en-IN") : ""}</div>}
          {selectedShare && <div className="space-y-3 border-t border-slate-100 pt-3">
            <div><span className="mb-1 block text-sm font-medium">4. Entry type</span><div className="grid grid-cols-2 gap-2"><button type="button" disabled={quickSaving || quickReview} onClick={() => setQuickEntryType("credit")} aria-pressed={quickEntryType === "credit"} className={"min-h-10 rounded-xl px-3 text-sm font-semibold " + (quickEntryType === "credit" ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-700")}>Credit · Payment</button><button type="button" disabled={quickSaving || quickReview} onClick={() => setQuickEntryType("debit")} aria-pressed={quickEntryType === "debit"} className={"min-h-10 rounded-xl px-3 text-sm font-semibold " + (quickEntryType === "debit" ? "bg-rose-600 text-white" : "bg-slate-100 text-slate-700")}>Debit · Correction</button></div></div>
            <label className="block"><span className="mb-1 block text-sm font-medium">5. Amount (₹)</span><input type="number" inputMode="numeric" min="1" max="2147483647" step="1" required value={quickAmount} disabled={quickSaving || quickReview} onChange={(event) => setQuickAmount(event.target.value)} placeholder="Whole rupees" className="min-h-11 w-full rounded-xl border border-slate-200 px-3 text-lg font-semibold" /></label>
            <div><span className="mb-1 block text-sm font-medium">Payment mode</span><div className="grid grid-cols-3 gap-2">{(["UPI", "Cash", "Other"] as const).map((mode) => <button type="button" key={mode} disabled={quickSaving || quickReview} onClick={() => setQuickMode(mode)} aria-pressed={quickMode === mode} className={"min-h-10 rounded-xl border px-2 text-sm font-medium " + (quickMode === mode ? "border-sky-600 bg-sky-50 text-sky-800" : "border-slate-200 bg-white text-slate-700")}>{mode}</button>)}</div></div>
            <label className="block"><span className="mb-1 block text-sm font-medium">Remarks <span className="font-normal text-slate-500">(optional)</span></span><input value={quickRemarks} maxLength={500} disabled={quickSaving || quickReview} onChange={(event) => setQuickRemarks(event.target.value)} placeholder="Optional note" className="min-h-10 w-full rounded-xl border border-slate-200 px-3 text-sm" /></label>
          </div>}
          {quickError && <p role="alert" className="rounded-lg bg-rose-50 p-2 text-sm text-rose-800">{quickError}</p>}
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-3"><button type="button" disabled={quickSaving} onClick={closeQuickPayment} className="min-h-10 rounded-xl border border-slate-200 px-4 text-sm">Cancel</button><button type="submit" disabled={quickSaving || quickLoading || !selectedFund || !selectedShare || !validAmount} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 text-sm font-semibold text-white disabled:opacity-50">{quickSaving ? <><RefreshCw size={16} className="animate-spin" /> Waiting for Supabase…</> : quickReview ? "Confirm and record payment" : "Review payment"}</button></div>
        </form>
      </Modal>

      <ContactsPage workspace={workspace} />

      <p className="px-1 text-center text-xs leading-5 text-slate-500">
        ClearFlow · Designed for quick, one-hand mobile use.
      </p>
    </div>
  );
}

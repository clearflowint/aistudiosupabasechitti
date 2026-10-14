// SKELETON: Product-neutral mobile home. Keep it focused on the two primary destinations.
// MIX: The product provides destination metadata; navigation remains owned by the shared shell.

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { ArrowRight, CheckCircle2, History, RefreshCw, ShieldCheck, WalletCards, CreditCard } from "lucide-react";
import { Modal } from "../ui/Modal";
import { listCfcfContacts } from "../../features/cfcf/services/contacts.service";
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
  const [quickFunds, setQuickFunds] = useState<CfcfFundRow[]>([]);
  const [quickContacts, setQuickContacts] = useState<CfcfContactRow[]>([]);
  const [quickShares, setQuickShares] = useState<CfcfShareRow[]>([]);
  const [quickFundId, setQuickFundId] = useState("");
  const [quickShareId, setQuickShareId] = useState("");
  const [quickEntryType, setQuickEntryType] = useState<"credit" | "debit">("credit");
  const [quickAmount, setQuickAmount] = useState("");
  const [quickMode, setQuickMode] = useState<"UPI" | "Cash" | "Other">("UPI");
  const [quickRemarks, setQuickRemarks] = useState("");
  const [quickSearch, setQuickSearch] = useState("");
  const [quickLoading, setQuickLoading] = useState(false);
  const [quickSaving, setQuickSaving] = useState(false);
  const [quickError, setQuickError] = useState<string | null>(null);
  const [quickSuccess, setQuickSuccess] = useState<string | null>(null);
  const quickSavingRef = useRef(false);
  const sharesRequestRef = useRef(0);
  const selectedFund = quickFunds.find((fund) => fund.fund_id === quickFundId) ?? null;
  const filteredShares = useMemo(() => {
    const query = quickSearch.trim().toLowerCase();
    return quickShares.filter((share) => {
      const contact = quickContacts.find((row) => row.contact_id === share.contact_id);
      return !query || [contact?.name, contact?.phone, share.share_id].some((value) => value?.toLowerCase().includes(query));
    });
  }, [quickShares, quickContacts, quickSearch]);
  const selectedShare = quickShares.find((share) => share.share_id === quickShareId) ?? null;
  const selectedContact = quickContacts.find((contact) => contact.contact_id === selectedShare?.contact_id) ?? null;
  const validAmount = quickAmount.trim() !== "" && Number.isSafeInteger(Number(quickAmount)) && Number(quickAmount) > 0 && Number(quickAmount) <= 2147483647;

  useEffect(() => {
    if (!quickPaymentOpen) return;
    let active = true;
    setQuickLoading(true); setQuickError(null);
    Promise.all([listCfcfFunds(workspace.tenantId), listCfcfContacts(workspace.tenantId)])
      .then(([funds, contacts]) => {
        if (!active) return;
        setQuickFunds(funds); setQuickContacts(contacts);
        setQuickFundId((current) => funds.some((fund) => fund.fund_id === current) ? current : funds[0]?.fund_id ?? "");
      })
      .catch((error: unknown) => { if (active) setQuickError(error instanceof Error ? error.message : "Unable to load Funds and Contacts from Supabase."); })
      .finally(() => { if (active) setQuickLoading(false); });
    return () => { active = false; };
  }, [quickPaymentOpen, workspace.tenantId]);

  useEffect(() => {
    const requestId = ++sharesRequestRef.current;
    if (!quickPaymentOpen || !quickFundId) { setQuickShares([]); setQuickShareId(""); return; }
    let active = true; setQuickLoading(true); setQuickError(null);
    listCfcfShares(workspace.tenantId, quickFundId)
      .then((shares) => {
        if (!active || requestId !== sharesRequestRef.current) return;
        setQuickShares(shares); setQuickShareId("");
      })
      .catch((error: unknown) => { if (active) setQuickError(error instanceof Error ? error.message : "Unable to load Shares from Supabase."); })
      .finally(() => { if (active && requestId === sharesRequestRef.current) setQuickLoading(false); });
    return () => { active = false; };
  }, [quickPaymentOpen, quickFundId, workspace.tenantId]);

  function closeQuickPayment() {
    if (quickSavingRef.current) return;
    setQuickPaymentOpen(false); setQuickError(null); setQuickSearch(""); setQuickAmount(""); setQuickRemarks(""); setQuickShareId("");
  }

  async function handleQuickPaymentSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (quickSavingRef.current || !selectedFund || !selectedShare || !validAmount) return;
    quickSavingRef.current = true; setQuickSaving(true); setQuickError(null); setQuickSuccess(null);
    try {
      const now = new Date();
      const today = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
      await recordCfcfSharePayment(workspace.tenantId, selectedFund.fund_id, selectedShare.share_id, workspace.personId, quickEntryType, Number(quickAmount), today, quickMode, quickRemarks);
      setQuickPaymentOpen(false);
      setQuickSuccess((quickEntryType === "credit" ? "Payment recorded" : "Debit correction recorded") + " successfully in Supabase for " + (selectedContact?.name ?? "the selected Share") + ".");
      setQuickSearch(""); setQuickAmount(""); setQuickRemarks(""); setQuickShareId("");
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
        <button type="button" onClick={() => { setQuickPaymentOpen(true); setQuickSuccess(null); setQuickError(null); }} className="flex min-h-20 w-full min-w-0 items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-left text-slate-900 shadow-sm transition hover:bg-emerald-100 sm:p-4">
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

      <Modal isOpen={quickPaymentOpen} title="Record Payment (Quick)" description="Record one Share-level payment or debit correction. Payments are independent of Cycle billing and payouts." onClose={closeQuickPayment}>
        <form onSubmit={(event) => void handleQuickPaymentSubmit(event)} className="space-y-3">
          {quickLoading && <div role="status" className="flex items-center gap-2 rounded-lg bg-sky-50 p-2 text-sm text-sky-800"><RefreshCw size={16} className="animate-spin" /> Loading stored Funds and Shares…</div>}
          <label className="block"><span className="mb-1 block text-sm font-medium">Fund</span><select required value={quickFundId} disabled={quickLoading || quickSaving || !quickFunds.length} onChange={(event) => { setQuickFundId(event.target.value); setQuickShareId(""); setQuickSearch(""); }} className="min-h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm"><option value="">Select Fund</option>{quickFunds.map((fund) => <option key={fund.fund_id} value={fund.fund_id}>{fund.fund_name}</option>)}</select></label>
          <label className="block"><span className="mb-1 block text-sm font-medium">Search by contact name, phone or Share ID</span><input value={quickSearch} onChange={(event) => { setQuickSearch(event.target.value); setQuickShareId(""); }} disabled={!quickFundId || quickLoading || quickSaving} placeholder="Search within selected Fund" className="min-h-10 w-full rounded-xl border border-slate-200 px-3 text-sm" /></label>
          <label className="block"><span className="mb-1 block text-sm font-medium">Share</span><select required value={quickShareId} disabled={!quickFundId || quickLoading || quickSaving || !filteredShares.length} onChange={(event) => setQuickShareId(event.target.value)} className="min-h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm"><option value="">Select exactly one Share</option>{filteredShares.map((share) => { const contact = quickContacts.find((row) => row.contact_id === share.contact_id); return <option key={share.share_id} value={share.share_id}>{contact?.name ?? "Contact"} · {contact?.phone ?? "No phone"} · {share.share_id}</option>; })}</select></label>
          {selectedShare && <div className="rounded-lg bg-slate-50 p-2 text-xs text-slate-600">Selected: <span className="font-semibold">{selectedContact?.name ?? "Contact"}</span> · Share ID {selectedShare.share_id}</div>}
          <div><span className="mb-1 block text-sm font-medium">Entry type</span><div className="grid grid-cols-2 gap-2"><button type="button" disabled={quickSaving} onClick={() => setQuickEntryType("credit")} aria-pressed={quickEntryType === "credit"} className={"min-h-10 rounded-xl px-3 text-sm font-semibold " + (quickEntryType === "credit" ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-700")}>Credit (Payment)</button><button type="button" disabled={quickSaving} onClick={() => setQuickEntryType("debit")} aria-pressed={quickEntryType === "debit"} className={"min-h-10 rounded-xl px-3 text-sm font-semibold " + (quickEntryType === "debit" ? "bg-rose-600 text-white" : "bg-slate-100 text-slate-700")}>Debit (Correction)</button></div></div>
          <label className="block"><span className="mb-1 block text-sm font-medium">Amount (₹)</span><input type="number" inputMode="numeric" min="1" max="2147483647" step="1" required value={quickAmount} disabled={quickSaving} onChange={(event) => setQuickAmount(event.target.value)} placeholder="Whole rupees" className="min-h-10 w-full rounded-xl border border-slate-200 px-3 text-sm" /></label>
          <label className="block"><span className="mb-1 block text-sm font-medium">Payment mode</span><select value={quickMode} disabled={quickSaving} onChange={(event) => setQuickMode(event.target.value as "UPI" | "Cash" | "Other")} className="min-h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm"><option value="UPI">UPI</option><option value="Cash">Cash</option><option value="Other">Other</option></select></label>
          <label className="block"><span className="mb-1 block text-sm font-medium">Remarks (optional)</span><input value={quickRemarks} maxLength={500} disabled={quickSaving} onChange={(event) => setQuickRemarks(event.target.value)} placeholder="Optional note" className="min-h-10 w-full rounded-xl border border-slate-200 px-3 text-sm" /></label>
          {quickError && <p role="alert" className="rounded-lg bg-rose-50 p-2 text-sm text-rose-800">{quickError}</p>}
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-3"><button type="button" disabled={quickSaving} onClick={closeQuickPayment} className="min-h-10 rounded-xl border border-slate-200 px-4 text-sm">Cancel</button><button type="submit" disabled={quickSaving || quickLoading || !selectedFund || !selectedShare || !validAmount} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 text-sm font-semibold text-white disabled:opacity-50">{quickSaving ? <><RefreshCw size={16} className="animate-spin" /> Waiting for Supabase…</> : "Confirm Payment"}</button></div>
        </form>
      </Modal>

      <ContactsPage workspace={workspace} />

      <p className="px-1 text-center text-xs leading-5 text-slate-500">
        ClearFlow · Designed for quick, one-hand mobile use.
      </p>
    </div>
  );
}

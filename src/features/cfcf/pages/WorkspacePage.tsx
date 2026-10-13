// CFCF PRODUCT: This entire page is the CFCF-specific Workspace UI boundary: funds, cycles, shares, and ledger.
// MIX: Receives the universal authorized workspace identity and calls CFCF-owned services.
// CFCF PRODUCT: Display stored financial values only; this page does not calculate balances or totals.

import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  CalendarDays,
  ChevronRight,
  CreditCard,
  Layers3,
  Plus,
  FileText,
  MessageCircle,

  RefreshCw,
  Search,
  UsersRound,
  WalletCards,
} from "lucide-react";
import type { AuthorizedWorkspace } from "../../../core/workspace/workspace.types";
import { Modal } from "../../../components/ui/Modal";
import { listCfcfContacts } from "../services/contacts.service";
import {
  createCfcfFund,
  createCfcfShare,
  recordCfcfSharePayment,
  recordCfcfCycleBilling,
  listCfcfFunds,
  listCfcfLedgerItems,
  listCfcfShares,
  setCfcfSharePayout,
  saveCfcfCycleValues,
  updateCfcfPlannedCycleCount,
  type CfcfLedgerItem,
} from "../services/workspace.service";
import type { CfcfContactRow, CfcfFundRow, CfcfShareRow } from "../types/database.types";

type WorkspaceTab = "funds" | "cycles" | "shares" | "ledger";
type ShareFilter = "all" | "pending" | "drawn" | "undrawn";

interface WorkspacePageProps {
  workspace: AuthorizedWorkspace;
}

const emptyFundForm = { fundName: "", startDate: "", numberOfCycles: "" };

interface SavedWorkspaceView {
  tab: WorkspaceTab;
  fundId: string;
}

function readSavedWorkspaceView(tenantId: string): SavedWorkspaceView {
  const fallback: SavedWorkspaceView = { tab: "cycles", fundId: "" };
  try {
    const raw = window.localStorage.getItem("clearflow:cfcf-workspace-view:v2:" + tenantId);
    if (!raw) return fallback;
    const saved = JSON.parse(raw) as { tab?: unknown; fundId?: unknown };
    const validTabs: WorkspaceTab[] = ["funds", "cycles", "shares", "ledger"];
    return {
      tab: typeof saved.tab === "string" && validTabs.includes(saved.tab as WorkspaceTab)
        ? saved.tab as WorkspaceTab
        : "cycles",
      fundId: typeof saved.fundId === "string" ? saved.fundId : "",
    };
  } catch {
    return fallback;
  }
}

const workspaceTabs: { id: WorkspaceTab; label: string; icon: typeof Layers3 }[] = [
  { id: "funds", label: "Funds", icon: Layers3 },
  { id: "cycles", label: "Cycles", icon: CalendarDays },
  { id: "shares", label: "Shares", icon: UsersRound },
  { id: "ledger", label: "Ledger", icon: CreditCard },
];

export function WorkspacePage({ workspace }: WorkspacePageProps) {
  const [funds, setFunds] = useState<CfcfFundRow[]>([]);
  const [initialSavedView] = useState(() => readSavedWorkspaceView(workspace.tenantId));
  const [selectedFundId, setSelectedFundId] = useState(initialSavedView.fundId);
  const [activeTab, setActiveTab] = useState<WorkspaceTab>(initialSavedView.tab);
  const [isLoadingFunds, setIsLoadingFunds] = useState(true);
  const [fundsError, setFundsError] = useState<string | null>(null);
  const [shares, setShares] = useState<CfcfShareRow[]>([]);
  const [shareSearch, setShareSearch] = useState("");
  const [shareFilter, setShareFilter] = useState<ShareFilter>("all");
  const [contacts, setContacts] = useState<CfcfContactRow[]>([]);
  const [ledgerItems, setLedgerItems] = useState<CfcfLedgerItem[]>([]);
  const [selectedShareId, setSelectedShareId] = useState<string | null>(null);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [fundReloadKey, setFundReloadKey] = useState(0);
  const [detailReloadKey, setDetailReloadKey] = useState(0);
  const [isFundModalOpen, setIsFundModalOpen] = useState(false);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [newShareContactId, setNewShareContactId] = useState("");
  const [shareFormError, setShareFormError] = useState<string | null>(null);
  const [isSavingShare, setIsSavingShare] = useState(false);
  const [paymentShare, setPaymentShare] = useState<CfcfShareRow | null>(null);
  const [paymentEntryType, setPaymentEntryType] = useState<"credit" | "debit">("credit");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [paymentMode, setPaymentMode] = useState<"UPI" | "Cash" | "Other">("UPI");
  const [paymentRemarks, setPaymentRemarks] = useState("");
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [isSavingPayment, setIsSavingPayment] = useState(false);
  const [statementShare, setStatementShare] = useState<CfcfShareRow | null>(null);
  const [cycleEditNumber, setCycleEditNumber] = useState<number | null>(null);
  const [cyclePayoutInput, setCyclePayoutInput] = useState("");
  const [cycleCommissionInput, setCycleCommissionInput] = useState("");
  const [cycleEditError, setCycleEditError] = useState<string | null>(null);
  const [isSavingCycle, setIsSavingCycle] = useState(false);
  const [plannedCycleInput, setPlannedCycleInput] = useState("");
  const [isSavingPlannedCount, setIsSavingPlannedCount] = useState(false);
  const [billingShare, setBillingShare] = useState<CfcfShareRow | null>(null);
  const [billingCycleNumber, setBillingCycleNumber] = useState("1");
  const [billingAmount, setBillingAmount] = useState("");
  const [billingError, setBillingError] = useState<string | null>(null);
  const [isSavingBilling, setIsSavingBilling] = useState(false);
  const [payoutShare, setPayoutShare] = useState<CfcfShareRow | null>(null);
  const [payoutCycleNumber, setPayoutCycleNumber] = useState("1");
  const [withdrawnAmount, setWithdrawnAmount] = useState("");
  const [payoutError, setPayoutError] = useState<string | null>(null);
  const [isSavingPayout, setIsSavingPayout] = useState(false);
  const [isSavingFund, setIsSavingFund] = useState(false);
  const [fundForm, setFundForm] = useState(emptyFundForm);
  const [fundFormError, setFundFormError] = useState<string | null>(null);
  const [fundNotice, setFundNotice] = useState<string | null>(null);
  const lastTenantId = useRef(workspace.tenantId);
  const hydratedViewTenantId = useRef<string | null>(null);

  const selectedFund = useMemo(
    () => funds.find((fund) => fund.fund_id === selectedFundId) ?? null,
    [funds, selectedFundId],
  );

  // MIX: Discard previous-tenant data and ignore stale responses after a tenant switch.
  useEffect(() => {
    let isCurrent = true;
    const tenantChanged = lastTenantId.current !== workspace.tenantId;
    lastTenantId.current = workspace.tenantId;

    if (tenantChanged) {
      setFunds([]);
      setShares([]);
      setContacts([]);
      setLedgerItems([]);
      setSelectedShareId(null);
      // The tenant-scoped saved view is restored below; never carry the previous tenant's selection across.
    }

    setIsLoadingFunds(true);
    setFundsError(null);
    void listCfcfFunds(workspace.tenantId)
      .then((rows) => {
        if (!isCurrent) return;
        setFunds(rows);
        setSelectedFundId((current) =>
          rows.some((fund) => fund.fund_id === current) ? current : rows[0]?.fund_id ?? "",
        );
      })
      .catch((error: unknown) => {
        if (!isCurrent) return;
        setFunds([]);
        setSelectedFundId("");
        setFundsError(error instanceof Error ? error.message : "Unable to load funds.");
      })
      .finally(() => {
        if (isCurrent) setIsLoadingFunds(false);
      });

    return () => { isCurrent = false; };
  }, [workspace.tenantId, fundReloadKey]);

  // MIX: Restore and persist the selected tab/fund per authorized tenant, so refresh returns to the same view.
  useEffect(() => {
    if (hydratedViewTenantId.current !== workspace.tenantId) {
      const savedView = readSavedWorkspaceView(workspace.tenantId);
      hydratedViewTenantId.current = workspace.tenantId;
      setActiveTab(savedView.tab);
      setSelectedFundId(savedView.fundId);
      return;
    }
    try {
      window.localStorage.setItem(
        "clearflow:cfcf-workspace-view:v2:" + workspace.tenantId,
        JSON.stringify({ tab: activeTab, fundId: selectedFundId }),
      );
    } catch {
      // Keep the workspace usable when browser storage is unavailable.
    }
  }, [workspace.tenantId, activeTab, selectedFundId]);

  // MIX: Every fund/tab transition clears fund-scoped client state before fetching.
  // CFCF PRODUCT: Shares and contact labels are reloaded for the selected fund; ledger is fetched when requested.
  useEffect(() => {
    let isCurrent = true;

    setShares([]);
    setContacts([]);
    setLedgerItems([]);
    setSelectedShareId(null);
    setDetailsError(null);

    if (!selectedFundId) {
      setIsLoadingDetails(false);
      return () => { isCurrent = false; };
    }

    setIsLoadingDetails(true);
    const loadDetails = async () => {
      try {
        const [shareRows, contactRows] = await Promise.all([
          listCfcfShares(workspace.tenantId, selectedFundId),
          listCfcfContacts(workspace.tenantId),
        ]);
        if (!isCurrent) return;
        setShares(shareRows);
        setContacts(contactRows);

        if (activeTab === "ledger") {
          const rows = await listCfcfLedgerItems(workspace.tenantId, selectedFundId);
          if (!isCurrent) return;
          setLedgerItems(rows);
        }
      } catch (error) {
        if (!isCurrent) return;
        setDetailsError(error instanceof Error ? error.message : "Unable to load workspace details.");
      } finally {
        if (isCurrent) setIsLoadingDetails(false);
      }
    };

    void loadDetails();
    return () => { isCurrent = false; };
  }, [workspace.tenantId, selectedFundId, activeTab, detailReloadKey]);

  // CFCF PRODUCT: Statement history loads on demand without forcing the workspace into the Ledger tab.
  useEffect(() => {
    if (!statementShare || !selectedFundId) return;
    let current = true;
    void listCfcfLedgerItems(workspace.tenantId, selectedFundId)
      .then((items) => { if (current) setLedgerItems(items); })
      .catch((error: unknown) => { if (current) setFundNotice(error instanceof Error ? error.message : "Unable to load statement transactions."); });
    return () => { current = false; };
  }, [statementShare?.share_id, selectedFundId, workspace.tenantId]);

  function printShareStatement() {
    const content = document.querySelector("[data-cfcf-share-statement]")?.innerHTML;
    if (!content) { setFundNotice("Statement content is not ready to print."); return; }
    const printWindow = window.open("", "_blank", "width=900,height=700");
    if (!printWindow) { setFundNotice("Allow pop-ups to print or save the Share statement."); return; }
    printWindow.document.write("<!doctype html><html><head><title>ClearFlow Share Statement</title><meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"><style>body{font-family:Arial,sans-serif;color:#0f172a;padding:24px;max-width:900px;margin:auto}button{display:none!important}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}article,section{break-inside:avoid}p,h3,h4{margin-top:8px;margin-bottom:8px}.border{border:1px solid #cbd5e1}.rounded-xl{border-radius:12px}.p-3,.p-4{padding:12px}.bg-slate-50{background:#f8fafc}.text-xs{font-size:12px}.text-sm{font-size:14px}.font-bold,.font-semibold{font-weight:700}</style></head><body>" + content + "</body></html>");
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  }

  function highestCycleNumber(fund: CfcfFundRow | null, fundShares: CfcfShareRow[] = shares): number {
    if (!fund) return 0;
    const billingCycles = fundShares.flatMap((share) =>
      Object.keys(share.billing_entries ?? {}).map((key) => /^\\d+$/.test(key) ? Number(key) : 0),
    );
    return Math.max(
      0,
      fund.current_cycle ?? 0,
      fund.cycle_payout_amounts?.length ?? 0,
      fund.cycle_commissions?.length ?? 0,
      ...billingCycles,
    );
  }

  function openPayoutModal(share: CfcfShareRow) {
    const cycle = Math.max(1, highestCycleNumber(selectedFund));
    const cyclePayout = selectedFund?.cycle_payout_amounts?.[cycle - 1];
    setPayoutShare(share);
    setPayoutCycleNumber(String(share.payout_cycle_number ?? cycle));
    setWithdrawnAmount(String(share.withdrawn_amount || (typeof cyclePayout === "number" ? cyclePayout : "")));
    setPayoutError(null);
  }

  async function handleSavePayout(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!payoutShare || !selectedFund || isSavingPayout) return;
    const cycle = Number(payoutCycleNumber);
    const amount = Number(withdrawnAmount);
    if (!Number.isSafeInteger(cycle) || cycle < 1) {
      setPayoutError("Choose a valid Cycle number.");
      return;
    }
    if (withdrawnAmount.trim() === "" || !Number.isSafeInteger(amount) || amount < 0 || amount > 2147483647) {
      setPayoutError("Enter a whole-rupee withdrawn amount.");
      return;
    }
    setIsSavingPayout(true);
    setPayoutError(null);
    try {
      await setCfcfSharePayout(workspace.tenantId, selectedFund.fund_id, payoutShare.share_id, "drawn", cycle, amount);
      setPayoutShare(null);
      setFundNotice("Share marked drawn. No payment transaction was created.");
      setDetailReloadKey((current) => current + 1);
    } catch (error) {
      setPayoutError(error instanceof Error ? error.message : "Unable to update payout status.");
    } finally {
      setIsSavingPayout(false);
    }
  }

  function openCycleBilling(share: CfcfShareRow) {
    const cycle = Math.max(1, highestCycleNumber(selectedFund));
    setBillingShare(share);
    setBillingCycleNumber(String(cycle));
    setBillingAmount(String(share.billing_entries?.[String(cycle)] ?? 0));
    setBillingError(null);
  }

  async function handleSaveCycleBilling(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!billingShare || !selectedFund || isSavingBilling) return;
    const cycleNumber = Number(billingCycleNumber);
    const amount = Number(billingAmount);
    if (!Number.isSafeInteger(cycleNumber) || cycleNumber < 1) {
      setBillingError("Choose a valid positive Cycle number.");
      return;
    }
    if (billingAmount.trim() === "" || !Number.isSafeInteger(amount) || amount < 0 || amount > 2147483647) {
      setBillingError("Enter a whole-rupee billing amount of zero or more.");
      return;
    }
    setIsSavingBilling(true);
    setBillingError(null);
    try {
      await recordCfcfCycleBilling(workspace.tenantId, selectedFund.fund_id, billingShare.share_id, cycleNumber, amount);
      setBillingShare(null);
      setFundNotice("Cycle billing saved. Share and Fund summaries were updated by Supabase.");
      setDetailReloadKey((current) => current + 1);
      setFundReloadKey((current) => current + 1);
    } catch (error) {
      setBillingError(error instanceof Error ? error.message : "Unable to save cycle billing.");
    } finally {
      setIsSavingBilling(false);
    }
  }

  function openCycleEditor(cycleNumber: number) {
    setCycleEditNumber(cycleNumber);
    const payout = selectedFund?.cycle_payout_amounts?.[cycleNumber - 1];
    const commission = selectedFund?.cycle_commissions?.[cycleNumber - 1];
    setCyclePayoutInput(typeof payout === "number" ? String(payout) : "");
    setCycleCommissionInput(typeof commission === "number" ? String(commission) : "");
    setCycleEditError(null);
  }

  async function handleSaveCycleValues(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedFund || cycleEditNumber === null || isSavingCycle) return;
    const payout = cyclePayoutInput.trim() === "" ? null : Number(cyclePayoutInput);
    const commission = cycleCommissionInput.trim() === "" ? null : Number(cycleCommissionInput);
    for (const [label, value] of [["Payout", payout], ["Commission", commission]] as const) {
      if (value !== null && (!Number.isSafeInteger(value) || value < 0 || value > 2147483647)) {
        setCycleEditError(label + " must be a whole rupee amount or left blank.");
        return;
      }
    }
    setIsSavingCycle(true);
    setCycleEditError(null);
    try {
      await saveCfcfCycleValues(workspace.tenantId, selectedFund.fund_id, cycleEditNumber, payout, commission);
      setCycleEditNumber(null);
      setFundNotice("Cycle values saved.");
      setFundReloadKey((n) => n + 1);
      setDetailReloadKey((n) => n + 1);
    } catch (error) {
      setCycleEditError(error instanceof Error ? error.message : "Unable to save Cycle values.");
    } finally {
      setIsSavingCycle(false);
    }
  }

  async function handleSavePlannedCount() {
    if (!selectedFund || isSavingPlannedCount) return;
    const value = plannedCycleInput.trim() === "" ? null : Number(plannedCycleInput);
    if (value !== null && (!Number.isSafeInteger(value) || value < 0 || value > 2147483647)) {
      setFundNotice("Planned Cycle count must be zero or a positive whole number.");
      return;
    }
    setIsSavingPlannedCount(true);
    try {
      await updateCfcfPlannedCycleCount(workspace.tenantId, selectedFund.fund_id, value);
      setFundNotice("Planned Cycle count updated. It does not limit additional Cycles.");
      setFundReloadKey((n) => n + 1);
    } catch (error) {
      setFundNotice(error instanceof Error ? error.message : "Unable to update planned Cycle count.");
    } finally {
      setIsSavingPlannedCount(false);
    }
  }


  function openShareModal() {
    setNewShareContactId("");
    setShareFormError(null);
    setIsShareModalOpen(true);
  }

  async function handleCreateShare(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedFund || isSavingShare) return;
    if (!newShareContactId) { setShareFormError("Choose a Contact."); return; }
    setIsSavingShare(true);
    setShareFormError(null);
    try {
      await createCfcfShare(workspace.tenantId, selectedFund.fund_id, workspace.personId, newShareContactId);
      setIsShareModalOpen(false);
      setFundNotice("Share added to " + selectedFund.fund_name + ".");
      setDetailReloadKey((n) => n + 1);
      setFundReloadKey((n) => n + 1);
    } catch (error) {
      setShareFormError(error instanceof Error ? error.message : "Unable to add Share.");
    } finally { setIsSavingShare(false); }
  }

  function openPaymentModal(share: CfcfShareRow) {
    setPaymentShare(share);
    setPaymentEntryType("credit");
    setPaymentAmount("");
    setPaymentDate(new Date().toISOString().slice(0, 10));
    setPaymentMode("UPI");
    setPaymentRemarks("");
    setPaymentError(null);
  }

  async function handleRecordPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!paymentShare || !selectedFund || isSavingPayment) return;
    const amount = Number(paymentAmount);
    if (!paymentAmount.trim() || !Number.isSafeInteger(amount) || amount <= 0 || amount > 2147483647) {
      setPaymentError("Enter a positive whole-rupee amount."); return;
    }
    setIsSavingPayment(true); setPaymentError(null);
    try {
      await recordCfcfSharePayment(workspace.tenantId, selectedFund.fund_id, paymentShare.share_id, workspace.personId, paymentEntryType, amount, paymentDate, paymentMode, paymentRemarks);
      setPaymentShare(null);
      setFundNotice(paymentEntryType === "credit" ? "Payment recorded." : "Debit correction recorded.");
      setDetailReloadKey((n) => n + 1); setFundReloadKey((n) => n + 1);
    } catch (error) { setPaymentError(error instanceof Error ? error.message : "Unable to record transaction."); }
    finally { setIsSavingPayment(false); }
  }

  function openShareWhatsApp(share: CfcfShareRow, mode: "reminder" | "report") {
    const contact = contactById.get(share.contact_id);
    if (!contact?.phone) { setFundNotice("This Contact has no saved phone number."); return; }
    const phone = contact.phone.replace(/\\D/g, "");
    const completed = Object.keys(share.billing_entries ?? {}).filter((key) => /^\\d+$/.test(key)).length;
    const planned = selectedFund?.number_of_cycles;
    const cycleProgress = planned ? completed + "/" + planned : String(completed) + " recorded";
    const message = mode === "reminder"
      ? `Hello ${contact.name}, this is a reminder for your ClearFlow Share in ${selectedFund?.fund_name ?? "the Fund"}. Pending due: ${formatINR(share.total_pending)}. Total billed: ${formatINR(share.share_total_billed_amount)}. Please let us know when payment is convenient. Thank you.`
      : `ClearFlow Share Statement\\nFund: ${selectedFund?.fund_name ?? "—"}\\nMember: ${contact.name}\\nShare ID: ${share.share_id}\\nCycles completed/recorded: ${cycleProgress}\\nCurrent billed (highest recorded Cycle): ${formatINR(currentBilledForShare(share))}\\nTotal billed: ${formatINR(share.share_total_billed_amount)}\\nTotal paid (net): ${formatINR(share.share_net_payment_received)}\\nPending due: ${formatINR(share.total_pending)}\\nAdvance: ${formatINR(share.total_advance)}\\nPayout status: ${share.payout_status === "drawn" ? "Drawn" : "Undrawn"}`;
    window.open("https://wa.me/" + phone + "?text=" + encodeURIComponent(message), "_blank", "noopener,noreferrer");
  }

  function currentBilledForShare(share: CfcfShareRow): number {
    const cycleKeys = Object.keys(share.billing_entries ?? {}).filter((key) => /^\\d+$/.test(key)).map(Number);
    const highest = cycleKeys.length ? Math.max(...cycleKeys) : 0;
    const value = highest ? share.billing_entries[String(highest)] : 0;
    return typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) || 0 : 0;
  }

  function openFundModal() {
    setFundForm(emptyFundForm);
    setFundFormError(null);
    setFundNotice(null);
    setIsFundModalOpen(true);
  }

  function closeFundModal() {
    if (isSavingFund) return;
    setIsFundModalOpen(false);
    setFundForm(emptyFundForm);
    setFundFormError(null);
  }

  async function handleCreateFund(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFundFormError(null);

    const numberOfCycles = fundForm.numberOfCycles.trim() ? Number(fundForm.numberOfCycles) : null;
    const numberOfShares = null;

    if (numberOfCycles !== null && (!Number.isSafeInteger(numberOfCycles) || numberOfCycles < 1)) {
      setFundFormError("Cycle count must be a positive whole number.");
      return;
    }
     setIsSavingFund(true);
    try {
      const created = await createCfcfFund(workspace.tenantId, workspace.personId, {
        fundName: fundForm.fundName,
        startDate: fundForm.startDate,
        numberOfCycles,
        numberOfShares,
      });
      setFunds((current) => [created, ...current].sort((a, b) => b.created_at.localeCompare(a.created_at)));
      setSelectedFundId(created.fund_id);
      setActiveTab("funds");
      setFundNotice("Fund created successfully. Its stored details are shown below.");
      setIsFundModalOpen(false);
      setFundForm(emptyFundForm);
    } catch (error) {
      setFundFormError(error instanceof Error ? error.message : "Unable to create fund.");
    } finally {
      setIsSavingFund(false);
    }
  }

  function openFundTab(fundId: string, tab: WorkspaceTab) {
    setSelectedFundId(fundId);
    setSelectedShareId(null);
    setActiveTab(tab);
  }

  const selectedLedger = useMemo(
    () => selectedShareId
      ? ledgerItems.filter((item) => item.shareId === selectedShareId)
      : ledgerItems,
    [ledgerItems, selectedShareId],
  );

  const contactById = useMemo(
    () => new Map(contacts.map((contact) => [contact.contact_id, contact])),
    [contacts],
  );

  const filteredShares = useMemo(() => {
    const query = shareSearch.trim().toLocaleLowerCase();
    return shares.filter((share) => {
      if (shareFilter === "pending" && share.total_pending <= 0) return false;
      if (shareFilter === "drawn" && share.payout_status !== "drawn") return false;
      if (shareFilter === "undrawn" && share.payout_status !== "undrawn") return false;
      if (!query) return true;
      const contact = contactById.get(share.contact_id);
      return [contact?.name ?? "", contact?.phone ?? "", share.share_id]
        .some((value) => value.toLocaleLowerCase().includes(query));
    });
  }, [shares, contactById, shareSearch, shareFilter]);

  const shareFilterOptions: { id: ShareFilter; label: string; count: number }[] = [
    { id: "all", label: "All", count: shares.length },
    { id: "pending", label: "Pending", count: shares.filter((share) => share.total_pending > 0).length },
    { id: "drawn", label: "Drawn", count: shares.filter((share) => share.payout_status === "drawn").length },
    { id: "undrawn", label: "Undrawn", count: shares.filter((share) => share.payout_status === "undrawn").length },
  ];

  return (
    <div className="min-w-0 space-y-4 pb-2">
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <WalletCards size={16} className="shrink-0 text-sky-700" />
              Your funds
            </div>
            <h2 className="mt-1 break-words text-xl font-semibold tracking-tight text-slate-900">Funds, cycles and shares</h2>
            <p className="mt-1 text-sm leading-5 text-slate-500">
              Choose a fund, then open its cycles, shares, or ledger.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={openFundModal}
              className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-sky-600 px-3 text-sm font-semibold text-white transition hover:bg-sky-700"
            >
              <Plus size={16} /> New fund
            </button>
            <button
              type="button"
              onClick={() => setFundReloadKey((current) => current + 1)}
              disabled={isLoadingFunds}
              aria-label="Refresh funds"
              className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-slate-200 text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
            >
              <RefreshCw size={17} className={isLoadingFunds ? "animate-spin" : ""} />
            </button>
          </div>
        </div>

        <div role="tablist" aria-label="Workspace sections" className="mt-4 grid grid-cols-4 gap-1 rounded-2xl bg-slate-100 p-1">
          {workspaceTabs.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                type="button"
                role="tab"
                key={tab.id}
                aria-selected={active}
                onClick={() => { setSelectedShareId(null); setActiveTab(tab.id); }}
                className={[
                  "flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-1 py-2 text-[11px] font-semibold transition sm:text-xs",
                  active ? "bg-white text-sky-800 shadow-sm" : "text-slate-500 hover:text-slate-800",
                ].join(" ")}
              >
                <Icon size={17} />
                <span className="break-words text-center leading-4">{tab.label}</span>
              </button>
            );
          })}
        </div>
      </section>

      {fundNotice && (
        <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {fundNotice}
        </div>
      )}

      {fundsError && (
        <section role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
          <p className="font-semibold">Funds could not be loaded</p>
          <p className="mt-1 break-words leading-5">{fundsError}</p>
          <button type="button" onClick={() => setFundReloadKey((current) => current + 1)} className="mt-3 min-h-11 font-semibold underline">
            Try again
          </button>
        </section>
      )}

      {isLoadingFunds ? (
        <div aria-live="polite" className="rounded-2xl border border-slate-200 bg-white px-4 py-12 text-center text-sm text-slate-500">
          Loading funds…
        </div>
      ) : !fundsError && funds.length === 0 ? (
        <EmptyState
          icon={<WalletCards size={22} />}
          title="Your fund workspace is ready"
          description="Create your first fund. Cycle counts and share counts are saved as setup inputs; totals are not calculated by the screen."
          action={
            <button
              type="button"
              onClick={openFundModal}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-sky-600 px-4 text-sm font-semibold text-white hover:bg-sky-700"
            >
              <Plus size={16} /> Create first fund
            </button>
          }
        />
      ) : selectedFund ? (
        <>
          {activeTab !== "funds" && (
            <section className="rounded-2xl border border-sky-100 bg-sky-50 p-3">
              <label htmlFor="workspace-selected-fund" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-sky-900">
                Current fund
              </label>
              <select
                id="workspace-selected-fund"
                value={selectedFundId}
                onChange={(event) => {
                  setSelectedFundId(event.target.value);
                  setShareSearch("");
                  setShareFilter("all");
                  setSelectedShareId(null);
                }}
                className="min-h-12 w-full min-w-0 rounded-xl border border-sky-200 bg-white px-3 text-sm font-semibold text-slate-900 outline-none focus:ring-4 focus:ring-sky-100"
              >
                {funds.map((fund) => (
                  <option value={fund.fund_id} key={fund.fund_id}>{fund.fund_name}</option>
                ))}
              </select>
            </section>
          )}

          {activeTab === "funds" && (
            <section className="space-y-3">
              {funds.map((fund) => (
                <article
                  key={fund.fund_id}
                  className={[
                    "min-w-0 rounded-2xl border bg-white p-4 shadow-sm transition sm:p-5",
                    selectedFundId === fund.fund_id ? "border-sky-300 ring-1 ring-sky-100" : "border-slate-200",
                  ].join(" ")}
                >
                  <button
                    type="button"
                    onClick={() => setSelectedFundId(fund.fund_id)}
                    className="flex min-h-11 w-full min-w-0 items-start justify-between gap-3 text-left"
                  >
                    <div className="min-w-0 flex-1">
                      <h3 className="break-words text-base font-semibold text-slate-900">{fund.fund_name}</h3>
                      <p className="mt-1 break-all text-xs text-slate-400">Fund ID · {fund.fund_id}</p>
                    </div>
                    <span className={[
                      "shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold capitalize",
                      fund.status === "active" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600",
                    ].join(" ")}>
                      {fund.status}
                    </span>
                  </button>

                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <StoredValue label="Cycles configured" value={fund.number_of_cycles ?? "—"} />
                    <StoredValue label="Shares configured" value={fund.number_of_shares ?? "—"} />
                    <StoredValue label="Current cycle" value={fund.current_cycle} />
                    <StoredValue label="Start date" value={fund.start_date ? formatDate(fund.start_date) : "—"} />
                    <StoredValue label="Stored net balance" value={formatINR(fund.fund_net_balance)} />
                    <StoredValue label="Total billed" value={formatINR(fund.fund_total_billed_amount)} />
                    <StoredValue label="Total pending" value={formatINR(fund.fund_total_pending_amount)} />
                    <StoredValue label="Total advance" value={formatINR(fund.fund_total_advance)} />
                    <StoredValue label="Total withdrawn" value={formatINR(fund.fund_total_withdrawn)} />
                    <StoredValue label="Total commissions" value={formatINR(fund.fund_total_commissions)} />
                    <StoredValue label="Other amount" value={formatINR(fund.other_amount)} />
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => openFundTab(fund.fund_id, "cycles")}
                      className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-sky-600 px-2 text-sm font-semibold text-white transition hover:bg-sky-700"
                    >
                      Cycles <ChevronRight size={15} />
                    </button>
                    <button
                      type="button"
                      onClick={() => openFundTab(fund.fund_id, "shares")}
                      className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                    >
                      Shares <ChevronRight size={15} />
                    </button>
                  </div>
                </article>
              ))}
            </section>
          )}

          {activeTab === "cycles" && (
            <section className="space-y-3">
              <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Selected fund</p>
                <h3 className="mt-1 break-words text-lg font-semibold text-slate-900">{selectedFund.fund_name}</h3>
                <p className="mt-1 text-sm text-slate-500">
                  Cycle payout and commission are manually stored values. Planned Cycle count is editable and never blocks additional Cycles.
                </p>
                <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto]">
                  <label className="min-w-0">
                    <span className="mb-1 block text-xs font-semibold text-slate-600">Planned Cycle count</span>
                    <input type="number" min="0" step="1" value={plannedCycleInput !== "" ? plannedCycleInput : String(selectedFund.number_of_cycles ?? "")} onChange={(event) => setPlannedCycleInput(event.target.value)} placeholder="Optional" className="min-h-11 w-full rounded-xl border border-slate-200 px-3 text-sm" />
                  </label>
                  <button type="button" disabled={isSavingPlannedCount} onClick={() => void handleSavePlannedCount()} className="self-end min-h-11 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-700 disabled:opacity-50">{isSavingPlannedCount ? "Saving…" : "Save count"}</button>
                </div>
                <button type="button" onClick={() => openCycleEditor(highestCycleNumber(selectedFund) + 1)} disabled={highestCycleNumber(selectedFund) >= 500} className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-sky-600 px-3 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-50">
                  <Plus size={16} /> Create next Cycle
                </button>
              </section>
              {highestCycleNumber(selectedFund) > 0 ? (() => {
                const cycleNumber = highestCycleNumber(selectedFund);
                const payout = selectedFund.cycle_payout_amounts?.[cycleNumber - 1];
                const commission = selectedFund.cycle_commissions?.[cycleNumber - 1];
                return (
                  <article key={cycleNumber} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Cycle {cycleNumber}</p>
                        <h3 className="mt-1 text-base font-semibold text-slate-900">Highest Cycle</h3>
                      </div>
                      <span className="shrink-0 rounded-full bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-700">Latest</span>
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-2">
                      <StoredValue label="Stored payout" value={displayStoredAmount(payout)} />
                      <StoredValue label="Stored commission" value={displayStoredAmount(commission)} />
                    </div>
                    <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <button type="button" onClick={() => openCycleEditor(cycleNumber)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-sky-600 px-3 text-sm font-semibold text-white hover:bg-sky-700">Edit Cycle values</button>
                      <button type="button" onClick={() => setActiveTab("shares")} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">View fund shares <ChevronRight size={16} /></button>
                    </div>
                  </article>
                );
              })() : (
                <EmptyState icon={<CalendarDays size={22} />} title="No cycles recorded yet" description="Cycle cards will appear as cycle data is recorded for this Fund." />
              )}
                </section>
          )}

          {activeTab === "shares" && (
            <section className="space-y-3">
              <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
                <div className="flex items-center gap-2">
                  <label className="relative min-w-0 flex-1">
                    <Search size={17} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input type="search" value={shareSearch} onChange={(event) => setShareSearch(event.target.value)} placeholder="Search Contact, phone or Share ID" aria-label="Search Contact, phone or Share ID" className="min-h-11 w-full rounded-xl border border-slate-200 py-2 pl-10 pr-3 text-sm" />
                  </label>
                  <button type="button" onClick={() => setDetailReloadKey((n) => n + 1)} aria-label="Refresh Shares" className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-slate-200 text-sky-700"><RefreshCw size={17} /></button>
                </div>
                <button type="button" onClick={openShareModal} className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-sky-600 px-4 text-sm font-semibold text-white"><Plus size={16} /> Add Share to this Fund</button>
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {shareFilterOptions.map((option) => <button key={option.id} type="button" aria-pressed={shareFilter === option.id} onClick={() => setShareFilter(option.id)} className={["min-h-10 rounded-xl border px-2 text-xs font-semibold",shareFilter===option.id?"border-slate-900 bg-slate-900 text-white":"border-slate-200 bg-white text-slate-600"].join(" ")}>{option.label} ({option.count})</button>)}
                </div>
              </section>
              {isLoadingDetails ? <LoadingCard message="Loading Shares…" /> : detailsError ? <ErrorCard message={detailsError} onRetry={() => setDetailReloadKey((n) => n + 1)} /> : filteredShares.length === 0 ? (
                <EmptyState icon={<UsersRound size={22} />} title={shares.length ? "No matching Shares" : "No Shares in this Fund yet"} description={shares.length ? "Clear the search or change the status filter." : "Add a Share by selecting an existing Contact in this Fund."} action={!shares.length ? <button type="button" onClick={openShareModal} className="min-h-11 rounded-xl bg-sky-600 px-4 text-sm font-semibold text-white"><Plus size={16} className="mr-1 inline" /> Add Share</button> : undefined} />
              ) : filteredShares.map((share) => {
                const contact = contactById.get(share.contact_id);
                const highestCycle = Math.max(0,...Object.keys(share.billing_entries ?? {}).filter((k) => /^\\d+$/.test(k)).map(Number));
                const progress = selectedFund.number_of_cycles ? `${highestCycle}/${selectedFund.number_of_cycles} cycles` : `${highestCycle} cycles recorded`;
                return <article key={share.share_id} className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex min-w-0 items-start justify-between gap-2">
                    <div className="min-w-0"><p className="inline-block rounded-lg bg-slate-100 px-3 py-1 font-mono text-sm font-bold text-slate-700">{share.share_id}</p><h3 className="mt-2 break-words text-base font-semibold text-slate-900">{contact?.name ?? "Contact unavailable"}</h3><p className="mt-1 break-all text-sm text-slate-500">{contact?.phone ?? "No phone saved"}</p></div>
                    <div className="shrink-0 text-right"><p className={["text-sm font-bold",share.total_pending>0?"text-rose-700":"text-emerald-700"].join(" ")}>{share.total_pending>0?"−":""}{formatINR(share.total_pending)}</p><p className="text-xs text-slate-500">{share.total_pending>0?"Pending":"No pending due"}</p><span className={["mt-2 inline-block rounded-full px-2 py-1 text-xs font-semibold",share.payout_status==="drawn"?"bg-emerald-50 text-emerald-800":"bg-amber-50 text-amber-800"].join(" ")}>{share.payout_status==="drawn"?"Drawn":"Undrawn"}</span></div>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-2 rounded-xl bg-slate-50 p-2.5">
                    <StoredValue label="Current billed · Cycle ${highestCycle || "—"}" value={formatINR(currentBilledForShare(share))}/>
                    <StoredValue label="Total billed" value={formatINR(share.share_total_billed_amount)}/>
                    <StoredValue label="Total paid (net)" value={formatINR(share.share_net_payment_received)}/>
                    <StoredValue label="Pending due" value={formatINR(share.total_pending)}/>
                    <StoredValue label="Advance" value={formatINR(share.total_advance)}/>
                    <StoredValue label="Cycle progress" value={progress}/>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <button type="button" onClick={() => setStatementShare(share)} className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-2 text-sm font-semibold text-slate-800"><FileText size={16}/> Statement</button>
                    <button type="button" onClick={() => openShareWhatsApp(share,"report")} className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-2 text-sm font-semibold text-emerald-800"><MessageCircle size={16}/> Report</button>
                    <button type="button" onClick={() => openShareWhatsApp(share,"reminder")} className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-2 text-sm font-semibold text-white"><MessageCircle size={16}/> Reminder</button>
                    <button type="button" onClick={() => openPaymentModal(share)} className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-sky-600 px-2 text-sm font-semibold text-white"><CreditCard size={16}/> Record Payment</button>
                    <button type="button" onClick={() => openCycleBilling(share)} disabled={highestCycleNumber(selectedFund)<1 && !(selectedFund.number_of_cycles && selectedFund.number_of_cycles>0)} className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-violet-200 bg-violet-50 px-2 text-xs font-semibold text-violet-800 disabled:opacity-50"><CalendarDays size={14}/> Cycle billing</button>
                    <button type="button" onClick={() => openPayoutModal(share)} className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-2 text-xs font-semibold text-amber-800"><WalletCards size={14}/> {share.payout_status==="drawn"?"Edit payout":"Undrawn"}</button>
                  </div>
                </article>;
              })}
            </section>
          )}

          {activeTab === "ledger" && (
            <section className="space-y-3">
              {selectedShareId && (
                <button
                  type="button"
                  onClick={() => setSelectedShareId(null)}
                  className="min-h-11 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-sky-800"
                >
                  Show full fund ledger
                </button>
              )}
              {isLoadingDetails ? (
                <LoadingCard message="Loading ledger entries…" />
              ) : detailsError ? (
                <ErrorCard message={detailsError} onRetry={() => setDetailReloadKey((current) => current + 1)} />
              ) : selectedLedger.length === 0 ? (
                <EmptyState
                  icon={<CreditCard size={22} />}
                  title={selectedShareId ? "No ledger entries for this share" : "No ledger entries yet"}
                  description="Recorded payment rows and fund entries will appear here. This view shows stored entries and does not recalculate balances."
                />
              ) : (
                selectedLedger.map((item) => (
                  <article key={item.id} className="flex min-w-0 items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div className={[
                      "grid h-10 w-10 shrink-0 place-items-center rounded-xl",
                      item.entryType === "credit" ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700",
                    ].join(" ")}>
                      {item.entryType === "credit" ? <ArrowDownLeft size={19} /> : <ArrowUpRight size={19} />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 items-start justify-between gap-2">
                        <h3 className="break-words text-sm font-semibold capitalize text-slate-900">
                          {item.kind === "payment" ? "Payment" : "Fund entry"} · {item.entryType}
                        </h3>
                        <p className="shrink-0 text-sm font-bold text-slate-900">{formatINR(item.amount)}</p>
                      </div>
                      <p className="mt-1 break-words text-xs text-slate-500">
                        {formatDate(item.date)}{item.paymentType ? " · " + item.paymentType : ""}
                      </p>
                      {item.remarks && <p className="mt-2 break-words text-sm leading-5 text-slate-600">{item.remarks}</p>}
                      <p className="mt-2 break-all text-[11px] text-slate-400">Entry ID · {item.id}</p>
                    </div>
                  </article>
                ))
              )}
            </section>
          )}
        </>
      ) : null}

      <Modal
        isOpen={cycleEditNumber !== null}
        title={cycleEditNumber !== null && cycleEditNumber > highestCycleNumber(selectedFund) ? "Create Cycle " + cycleEditNumber : "Edit Cycle " + cycleEditNumber}
        description="Enter the payout and commission values to store for this Cycle. These are manual values, not payment transactions."
        onClose={() => { if (!isSavingCycle) { setCycleEditNumber(null); setCycleEditError(null); } }}
      >
        <form onSubmit={(event) => void handleSaveCycleValues(event)} className="space-y-4">
          <div className="rounded-xl bg-slate-50 p-3 text-sm font-semibold text-slate-700">Cycle {cycleEditNumber ?? ""}</div>
          <div>
            <label htmlFor="cycle-edit-payout" className="mb-1.5 block text-sm font-medium text-slate-700">Payout amount (₹)</label>
            <input id="cycle-edit-payout" type="number" min="0" max="2147483647" step="1" value={cyclePayoutInput} onChange={(event) => setCyclePayoutInput(event.target.value)} placeholder="Leave blank if not entered" className="min-h-11 w-full rounded-xl border border-slate-200 px-3 text-sm" />
          </div>
          <div>
            <label htmlFor="cycle-edit-commission" className="mb-1.5 block text-sm font-medium text-slate-700">Commission (₹)</label>
            <input id="cycle-edit-commission" type="number" min="0" max="2147483647" step="1" value={cycleCommissionInput} onChange={(event) => setCycleCommissionInput(event.target.value)} placeholder="Leave blank if not entered" className="min-h-11 w-full rounded-xl border border-slate-200 px-3 text-sm" />
          </div>
          {cycleEditError && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{cycleEditError}</div>}
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
            <button type="button" onClick={() => setCycleEditNumber(null)} disabled={isSavingCycle} className="min-h-11 rounded-xl border border-slate-200 px-4 text-sm">Cancel</button>
            <button type="submit" disabled={isSavingCycle} className="min-h-11 rounded-xl bg-sky-600 px-4 text-sm font-semibold text-white disabled:opacity-50">{isSavingCycle ? "Saving…" : "Save Cycle"}</button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={Boolean(payoutShare)}
        title="Update Share payout"
        description="Select the Cycle and review its stored payout amount. This changes payout status only; record actual money separately under Payments."
        onClose={() => { if (!isSavingPayout) { setPayoutShare(null); setPayoutError(null); } }}
      >
        <form onSubmit={(event) => void handleSavePayout(event)} className="space-y-4">
          <div>
            <label htmlFor="payout-cycle-number" className="mb-1.5 block text-sm font-medium text-slate-700">Payout Cycle</label>
            <select id="payout-cycle-number" value={payoutCycleNumber} onChange={(event) => {
              setPayoutCycleNumber(event.target.value);
              const savedPayout = selectedFund?.cycle_payout_amounts?.[Number(event.target.value) - 1];
              setWithdrawnAmount(typeof savedPayout === "number" ? String(savedPayout) : "");
            }} required className="min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm">
              {Array.from({ length: Math.min(Math.max(highestCycleNumber(selectedFund), Number(payoutCycleNumber) || 1), 500) }, (_, index) => index + 1).map((cycle) => (
                <option key={cycle} value={String(cycle)}>Cycle {cycle}</option>
              ))}
            </select>
          </div>
          <div className="rounded-xl bg-slate-50 p-3">
            <p className="text-xs font-medium text-slate-500">Payout amount stored on Cycle {payoutCycleNumber}</p>
            <p className="mt-1 text-lg font-semibold text-slate-900">{displayStoredAmount(selectedFund?.cycle_payout_amounts?.[Number(payoutCycleNumber) - 1])}</p>
          </div>
          <div>
            <label htmlFor="payout-withdrawn-amount" className="mb-1.5 block text-sm font-medium text-slate-700">Withdrawn amount (₹)</label>
            <input id="payout-withdrawn-amount" type="number" min="0" max="2147483647" step="1" required value={withdrawnAmount} onChange={(event) => setWithdrawnAmount(event.target.value)} className="min-h-11 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
            <p className="mt-1.5 text-xs text-slate-500">Prefilled from the Cycle payout amount, but editable to record the actual stored withdrawn amount.</p>
          </div>
          {payoutError && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-800">{payoutError}</div>}
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
            <button type="button" onClick={() => setPayoutShare(null)} disabled={isSavingPayout} className="min-h-11 rounded-xl border border-slate-200 px-4 text-sm">Cancel</button>
            <button type="submit" disabled={isSavingPayout} className="min-h-11 rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white disabled:opacity-50">{isSavingPayout ? "Saving…" : "Save drawn status"}</button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={Boolean(billingShare)}
        title="Enter cycle billing"
        description={billingShare ? "Save the manual billing amount for " + (contactById.get(billingShare.contact_id)?.name || "this Share") + ". Supabase will store the cycle entry and update the saved Share/Fund summaries atomically." : "Enter cycle billing."}
        onClose={() => { if (!isSavingBilling) { setBillingShare(null); setBillingError(null); } }}
      >
        <form onSubmit={(event) => void handleSaveCycleBilling(event)} className="space-y-4">
          <div>
            <label htmlFor="cycle-billing-cycle" className="mb-1.5 block text-sm font-medium text-slate-700">Cycle</label>
            <select
              id="cycle-billing-cycle"
              value={billingCycleNumber}
              onChange={(event) => {
                setBillingCycleNumber(event.target.value);
                const saved = billingShare?.billing_entries?.[event.target.value];
                setBillingAmount(typeof saved === "number" || typeof saved === "string" ? String(saved) : "");
              }}
              required
              className="min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
            >
              {Array.from({ length: Math.min(Math.max(selectedFund?.number_of_cycles ?? 0, highestCycleNumber(selectedFund)), 500) }, (_, index) => index + 1).map((cycle) => (
                <option key={cycle} value={String(cycle)}>Cycle {cycle}{cycle === selectedFund?.current_cycle ? " · Current" : ""}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="cycle-billing-amount" className="mb-1.5 block text-sm font-medium text-slate-700">Billing amount (₹)</label>
            <input
              id="cycle-billing-amount"
              type="number"
              inputMode="numeric"
              min="0"
              max="2147483647"
              step="1"
              required
              value={billingAmount}
              onChange={(event) => setBillingAmount(event.target.value)}
              placeholder="Enter amount manually"
              className="min-h-11 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
            />
            <p className="mt-1.5 text-xs leading-5 text-slate-500">This is a manual entry for the selected Share and Cycle. Saving an existing cycle amount replaces that cycle's previous billing entry.</p>
          </div>
          {billingError && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm leading-5 text-rose-800">{billingError}</div>}
          <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
            <button type="button" onClick={() => setBillingShare(null)} disabled={isSavingBilling} className="min-h-11 rounded-xl border border-slate-200 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">Cancel</button>
            <button type="submit" disabled={isSavingBilling} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-sky-600 px-4 text-sm font-semibold text-white hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60">
              <CalendarDays size={16} /> {isSavingBilling ? "Saving…" : "Save billing"}
            </button>
          </div>
        </form>
      </Modal>


      <Modal isOpen={isShareModalOpen} title="Add Share to Fund" description={selectedFund ? `Fund: ${selectedFund.fund_name}. Select an existing Contact.` : "Select a Contact for this Fund."} onClose={() => { if (!isSavingShare) setIsShareModalOpen(false); }}>
        <form onSubmit={(event) => void handleCreateShare(event)} className="space-y-4">
          <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">Fund</p><p className="font-semibold">{selectedFund?.fund_name ?? "No Fund selected"}</p></div>
          <label className="block"><span className="mb-1.5 block text-sm font-medium">Contact</span><select required value={newShareContactId} onChange={(event) => setNewShareContactId(event.target.value)} className="min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm"><option value="">Choose Contact</option>{contacts.map((contact) => <option key={contact.contact_id} value={contact.contact_id}>{contact.name} · {contact.phone}</option>)}</select></label>
          {!contacts.length && <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">No Contacts are available. Add a Contact first.</p>}
          {shareFormError && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800">{shareFormError}</p>}
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4"><button type="button" onClick={() => setIsShareModalOpen(false)} disabled={isSavingShare} className="min-h-11 rounded-xl border border-slate-200 px-4 text-sm">Cancel</button><button type="submit" disabled={isSavingShare || !contacts.length} className="min-h-11 rounded-xl bg-sky-600 px-4 text-sm font-semibold text-white disabled:opacity-50">{isSavingShare ? "Adding…" : "Add Share"}</button></div>
        </form>
      </Modal>

      <Modal isOpen={Boolean(paymentShare)} title="Record Payment / Correction" description="Actual transactions are stored separately from payout status. Saving updates the transaction and Share/Fund summaries atomically." onClose={() => { if (!isSavingPayment) setPaymentShare(null); }}>
        <form onSubmit={(event) => void handleRecordPayment(event)} className="space-y-4">
          <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">Manager ID: {workspace.tenantId}</p><p className="mt-1 text-xs text-slate-500">Fund: {selectedFund?.fund_name}</p><p className="mt-1 text-xs text-slate-500">Share ID: {paymentShare?.share_id}</p><p className="mt-2 font-semibold">{contactById.get(paymentShare?.contact_id ?? "")?.name ?? "Member"}</p><p className="mt-1 text-sm text-slate-500">Current billed: {paymentShare ? formatINR(currentBilledForShare(paymentShare)) : "—"}</p></div>
          <div><span className="mb-1.5 block text-sm font-medium">Record type</span><div className="grid grid-cols-2 gap-2"><button type="button" aria-pressed={paymentEntryType==="credit"} onClick={() => setPaymentEntryType("credit")} className={["min-h-11 rounded-xl px-2 text-sm font-semibold",paymentEntryType==="credit"?"bg-emerald-600 text-white":"bg-slate-100 text-slate-700"].join(" ")}>Credit (Payment)</button><button type="button" aria-pressed={paymentEntryType==="debit"} onClick={() => setPaymentEntryType("debit")} className={["min-h-11 rounded-xl px-2 text-sm font-semibold",paymentEntryType==="debit"?"bg-rose-600 text-white":"bg-slate-100 text-slate-700"].join(" ")}>Debit (Correction)</button></div></div>
          <label className="block"><span className="mb-1.5 block text-sm font-medium">Amount (₹)</span><input type="number" min="1" max="2147483647" step="1" required value={paymentAmount} onChange={(event) => setPaymentAmount(event.target.value)} className="min-h-11 w-full rounded-xl border border-slate-200 px-3 text-sm" placeholder="Enter amount"/></label>
          <label className="block"><span className="mb-1.5 block text-sm font-medium">Transaction date</span><input type="date" required value={paymentDate} onChange={(event) => setPaymentDate(event.target.value)} className="min-h-11 w-full rounded-xl border border-slate-200 px-3 text-sm"/></label>
          <label className="block"><span className="mb-1.5 block text-sm font-medium">Payment / Adjustment mode</span><select value={paymentMode} onChange={(event) => setPaymentMode(event.target.value as "UPI"|"Cash"|"Other")} className="min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm"><option value="UPI">UPI / Google Pay / PhonePe</option><option value="Cash">Cash</option><option value="Other">Other</option></select></label>
          <label className="block"><span className="mb-1.5 block text-sm font-medium">Remarks (optional)</span><textarea rows={2} value={paymentRemarks} onChange={(event) => setPaymentRemarks(event.target.value)} maxLength={500} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" placeholder="Reference or correction reason"/></label>
          {paymentError && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800">{paymentError}</p>}
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4"><button type="button" onClick={() => setPaymentShare(null)} disabled={isSavingPayment} className="min-h-11 rounded-xl border border-slate-200 px-4 text-sm">Cancel</button><button type="submit" disabled={isSavingPayment} className="min-h-11 rounded-xl bg-sky-600 px-4 text-sm font-semibold text-white">{isSavingPayment ? "Saving…" : paymentEntryType==="credit" ? "Confirm Payment" : "Confirm Correction"}</button></div>
        </form>
      </Modal>

      <Modal isOpen={Boolean(statementShare)} title="Official Share Account Statement" description="Share billing, payout status and previous transactions. Use Print / Save to export." size="large" onClose={() => setStatementShare(null)}>
        {statementShare && (() => {
          const contact = contactById.get(statementShare.contact_id);
          const history = ledgerItems.filter((item) => item.kind === "payment" && item.shareId === statementShare.share_id).sort((a,b) => b.date.localeCompare(a.date));
          const cycles = Object.entries(statementShare.billing_entries ?? {}).filter(([k]) => /^\d+$/.test(k)).sort(([a],[b]) => Number(a)-Number(b));
          return <div className="space-y-4 text-slate-900">
            <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4"><div><p className="text-xs font-bold uppercase tracking-wide text-slate-500">ClearFlow · Share Statement</p><h3 className="mt-1 text-lg font-bold">{selectedFund?.fund_name}</h3><p className="mt-1 text-sm">{contact?.name} · {contact?.phone}</p><p className="mt-1 break-all text-xs text-slate-500">Share ID: {statementShare.share_id}</p></div><button type="button" onClick={printShareStatement} className="min-h-10 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white">Print / Save</button></div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4"><StoredValue label="Current billed" value={formatINR(currentBilledForShare(statementShare))}/><StoredValue label="Total billed" value={formatINR(statementShare.share_total_billed_amount)}/><StoredValue label="Total paid (net)" value={formatINR(statementShare.share_net_payment_received)}/><StoredValue label="Pending due" value={formatINR(statementShare.total_pending)}/><StoredValue label="Advance" value={formatINR(statementShare.total_advance)}/><StoredValue label="Cycle progress" value={selectedFund?.number_of_cycles ? cycles.length+"/"+selectedFund.number_of_cycles : cycles.length+" recorded"}/><StoredValue label="Payout status" value={statementShare.payout_status}/><StoredValue label="Withdrawn amount" value={formatINR(statementShare.withdrawn_amount)}/></div>
            <section><h4 className="font-semibold">Cycle billing history</h4>{cycles.length ? <div className="mt-2 divide-y divide-slate-200 rounded-xl border border-slate-200">{cycles.map(([cycle,amount])=><div key={cycle} className="flex justify-between gap-3 p-3 text-sm"><span>Cycle {cycle}</span><strong>{displayStoredAmount(amount)}</strong></div>)}</div> : <p className="mt-2 text-sm text-slate-500">No cycle billing recorded.</p>}</section>
            <section><h4 className="font-semibold">Previous transactions</h4>{history.length ? <div className="mt-2 divide-y divide-slate-200 rounded-xl border border-slate-200">{history.map((item)=><div key={item.id} className="flex justify-between gap-3 p-3 text-sm"><div><p className="font-semibold capitalize">{item.entryType} · {formatDate(item.date)}</p><p className="text-xs text-slate-500">{item.paymentType ?? "—"}{item.remarks ? " · "+item.remarks : ""}</p></div><strong>{formatINR(item.amount)}</strong></div>)}</div> : <p className="mt-2 text-sm text-slate-500">No previous transactions loaded. Open Ledger once to load transaction history.</p>}</section>
          </div>;
        })()}
      </Modal>

      <Modal
        isOpen={isFundModalOpen}
        title="Create a fund"
        description="Enter the setup details that should be stored for this fund. You can review cycles and shares inside the workspace."
        onClose={closeFundModal}
      >
        <form onSubmit={(event) => void handleCreateFund(event)} className="space-y-4">
          <div>
            <label htmlFor="fund-name" className="mb-1.5 block text-sm font-medium text-slate-700">
              Fund name <span className="text-rose-500">*</span>
            </label>
            <input
              id="fund-name"
              value={fundForm.fundName}
              onChange={(event) => setFundForm((current) => ({ ...current, fundName: event.target.value }))}
              required
              autoFocus
              maxLength={120}
              placeholder="Enter a name for this fund"
              className="min-h-11 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
            />
          </div>
          <div>
            <label htmlFor="fund-start-date" className="mb-1.5 block text-sm font-medium text-slate-700">Start date <span className="text-slate-400">(optional)</span></label>
            <input
              id="fund-start-date"
              type="date"
              value={fundForm.startDate}
              onChange={(event) => setFundForm((current) => ({ ...current, startDate: event.target.value }))}
              className="min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
            />
          </div>
          <div className="grid grid-cols-1 gap-3">
            <div className="min-w-0">
              <label htmlFor="fund-cycle-count" className="mb-1.5 block text-sm font-medium text-slate-700">Cycle count</label>
              <input
                id="fund-cycle-count"
                type="number"
                inputMode="numeric"
                min="1"
                step="1"
                value={fundForm.numberOfCycles}
                onChange={(event) => setFundForm((current) => ({ ...current, numberOfCycles: event.target.value }))}
                placeholder="Optional"
                className="min-h-11 w-full min-w-0 rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
              />
            </div>
          </div>
          <p className="rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-500">
            These fields are saved as entered. ClearFlow does not calculate payout amounts, commissions, or balances when creating a fund.
          </p>
          {fundFormError && (
            <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm leading-5 text-rose-800">
              {fundFormError}
            </div>
          )}
          <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
            <button type="button" onClick={closeFundModal} disabled={isSavingFund} className="min-h-11 rounded-xl border border-slate-200 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">
              Cancel
            </button>
            <button type="submit" disabled={isSavingFund} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-sky-600 px-4 text-sm font-semibold text-white hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60">
              <Plus size={16} /> {isSavingFund ? "Saving…" : "Save fund"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

function StoredValue({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="min-w-0 rounded-xl bg-slate-50 p-3">
      <p className="break-words text-[11px] font-medium leading-4 text-slate-500">{label}</p>
      <p className="mt-1 break-words text-sm font-semibold capitalize text-slate-900">{value}</p>
    </div>
  );
}

function EmptyState({ icon, title, description, action }: { icon: ReactNode; title: string; description: string; action?: ReactNode }) {
  return (
    <section className="rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-10 text-center">
      <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-sky-50 text-sky-700">{icon}</div>
      <h3 className="mt-4 text-base font-semibold text-slate-900">{title}</h3>
      <p className="mx-auto mt-2 max-w-sm break-words text-sm leading-6 text-slate-500">{description}</p>
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </section>
  );
}

function LoadingCard({ message }: { message: string }) {
  return <div aria-live="polite" className="rounded-2xl border border-slate-200 bg-white px-4 py-12 text-center text-sm text-slate-500">{message}</div>;
}

function ErrorCard({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <section role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
      <p className="break-words leading-5">{message}</p>
      <button type="button" onClick={onRetry} className="mt-3 min-h-11 font-semibold underline">Try again</button>
    </section>
  );
}

function formatINR(value: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function displayStoredAmount(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) return formatINR(value);
  if (typeof value === "string" && value.trim()) return value;
  if (value && typeof value === "object") return "Stored details";
  return "Not entered";
}

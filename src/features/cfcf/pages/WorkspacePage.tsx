// CFCF PRODUCT: This entire page is the CFCF-specific Workspace UI boundary: funds, cycles, shares, and ledger.
// MIX: Receives the universal authorized workspace identity and calls CFCF-owned services.
// CFCF PRODUCT: Display stored financial values only; this page does not calculate balances or totals.

import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  CalendarDays,
  ChevronLeft,
  ChevronDown,
  RotateCcw,
  Pencil,
  CreditCard,
  Plus,
  FileText,
  MessageCircle,

  RefreshCw,
  Search,
  UsersRound,
  WalletCards,
  IndianRupee,
  Trash2,
} from "lucide-react";
import type { AuthorizedWorkspace } from "../../../core/workspace/workspace.types";
import { Modal } from "../../../components/ui/Modal";
import { listCfcfContacts } from "../services/contacts.service";
import {
  createCfcfFund,
  createCfcfShare,
  deleteCfcfShareWithHistory,
  deleteCfcfFundIfEmpty,
  recordCfcfSharePayment,
  recordCfcfFundOtherEntry,
  getCfcfFundOtherAdjustmentSummary,
  recordCfcfCycleBilling,
  listCfcfFunds,
  listCfcfLedgerItems,
  listCfcfShares,
  listCfcfBills,
  setCfcfSharePayout,
  saveCfcfCycleWorkspace,
  listCfcfCycles,
  addCfcfCycle,
  setCfcfCyclePlannedPayout,
  deleteHighestCfcfCycle,
  type CfcfCycleRow,
  getCfcfCycleSummary,
  type CfcfCycleSummary,
  updateCfcfFundDetails,
  type CfcfLedgerItem,
  type CfcfFundOtherAdjustmentSummary,
} from "../services/workspace.service";
import type { CfcfBillRow, CfcfContactRow, CfcfFundRow, CfcfShareRow } from "../types/database.types";

type WorkspaceTab = "shares" | "ledger";
type ShareFilter = "all" | "pending" | "drawn" | "undrawn";

interface WorkspacePageProps {
  workspace: AuthorizedWorkspace;
}

const MAX_CFCF_CYCLES = 100;
const emptyFundForm = { fundName: "", startDate: "", numberOfCycles: "" };

function localDateInputValue(): string {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

interface SavedWorkspaceView {
  tab: WorkspaceTab;
  fundId: string;
}

function readSavedWorkspaceView(tenantId: string): SavedWorkspaceView {
  const fallback: SavedWorkspaceView = { tab: "shares", fundId: "" };
  try {
    const raw = window.localStorage.getItem("clearflow:cfcf-workspace-view:v2:" + tenantId);
    if (!raw) return fallback;
    const saved = JSON.parse(raw) as { tab?: unknown; fundId?: unknown };
    const validTabs: WorkspaceTab[] = ["shares", "ledger"];
    return {
      tab: typeof saved.tab === "string" && validTabs.includes(saved.tab as WorkspaceTab)
        ? saved.tab as WorkspaceTab
        : "shares",
      fundId: typeof saved.fundId === "string" ? saved.fundId : "",
    };
  } catch {
    return fallback;
  }
}


export function WorkspacePage({ workspace }: WorkspacePageProps) {
  const [funds, setFunds] = useState<CfcfFundRow[]>([]);
  const [initialSavedView] = useState(() => readSavedWorkspaceView(workspace.tenantId));
  const [selectedFundId, setSelectedFundId] = useState(initialSavedView.fundId);
  const [, setActiveTab] = useState<WorkspaceTab>("shares");
  const [isLoadingFunds, setIsLoadingFunds] = useState(true);
  const [fundsError, setFundsError] = useState<string | null>(null);
  const [shares, setShares] = useState<CfcfShareRow[]>([]);
  const [bills, setBills] = useState<CfcfBillRow[]>([]);
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
  const [paymentDate, setPaymentDate] = useState(localDateInputValue()); // Automatic local date; never exposed as a user-editable field.
  const [paymentMode, setPaymentMode] = useState<"UPI" | "Cash" | "Other">("UPI");
  const [paymentRemarks, setPaymentRemarks] = useState("");
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [isSavingPayment, setIsSavingPayment] = useState(false);
  const [paymentReview, setPaymentReview] = useState(false);
  const paymentRequestRef = useRef<string | null>(null);
  const [isFundEntryModalOpen, setIsFundEntryModalOpen] = useState(false);
  const [fundEntryType, setFundEntryType] = useState<"credit" | "debit">("debit");
  const [fundEntryAmount, setFundEntryAmount] = useState("");
  const [fundEntryRemarks, setFundEntryRemarks] = useState("");
  const [fundEntryCategory, setFundEntryCategory] = useState<"" | "outside_money" | "commission" | "discount" | "stationery" | "others">("");
  const [fundEntryError, setFundEntryError] = useState<string | null>(null);
  const [isSavingFundEntry, setIsSavingFundEntry] = useState(false);
  const inFlightActions = useRef(new Set<string>());

  function beginAction(action: string): boolean {
    if (inFlightActions.current.has(action)) return false;
    inFlightActions.current.add(action);
    return true;
  }

  function endAction(action: string): void {
    inFlightActions.current.delete(action);
  }
  const [statementShare, setStatementShare] = useState<CfcfShareRow | null>(null);
  const statementRequestId = useRef(0);
  const [isLoadingStatement, setIsLoadingStatement] = useState(false);
  const [statementError, setStatementError] = useState<string | null>(null);
  const [cycleEditNumber, setCycleEditNumber] = useState<number | null>(null);
  const [cyclePayoutInput, setCyclePayoutInput] = useState("");
  const [cycleCommissionInput, setCycleCommissionInput] = useState("");
  const [cycleEditError, setCycleEditError] = useState<string | null>(null);
  const [cycleEditEnabled, setCycleEditEnabled] = useState(false);
  const [isSavingCycle, setIsSavingCycle] = useState(false);
  const [cycleReview, setCycleReview] = useState(false);
  const [billingShare, setBillingShare] = useState<CfcfShareRow | null>(null);
  const [billingCycleNumber, setBillingCycleNumber] = useState("1");
  const [billingAmount, setBillingAmount] = useState("");
  const [billingError, setBillingError] = useState<string | null>(null);
  const [billingEditEnabled, setBillingEditEnabled] = useState(false);
  const [isSavingBilling, setIsSavingBilling] = useState(false);
  const [billingReview, setBillingReview] = useState(false);
  const [payoutShare, setPayoutShare] = useState<CfcfShareRow | null>(null);
  const [payoutCycleNumber, setPayoutCycleNumber] = useState("1");
  const [withdrawnAmount, setWithdrawnAmount] = useState("");
  const [payoutError, setPayoutError] = useState<string | null>(null);
  const [isSavingPayout, setIsSavingPayout] = useState(false);
  const [payoutReview, setPayoutReview] = useState(false);
  const [undrawnReview, setUndrawnReview] = useState(false);
  const [isSavingFund, setIsSavingFund] = useState(false);
  const [fundForm, setFundForm] = useState(emptyFundForm);
  const [fundFormError, setFundFormError] = useState<string | null>(null);
  const [databaseResult, setDatabaseResult] = useState<{ status: "success" | "error"; message: string } | null>(null);

  function showDatabaseResult(message: string, status: "success" | "error" = "success"): void {
    setDatabaseResult({ status, message });
  }
  const [deleteTarget, setDeleteTarget] = useState<{ kind: "share" | "fund"; id: string; label: string; fundId?: string } | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteStep, setDeleteStep] = useState(1);
  const [deleteAcknowledged, setDeleteAcknowledged] = useState(false);
  const [deleteTypedId, setDeleteTypedId] = useState("");
  const [shareDeleteRecords, setShareDeleteRecords] = useState<{ bills: CfcfBillRow[]; payments: CfcfLedgerItem[] } | null>(null);
  const [isLoadingShareDeleteRecords, setIsLoadingShareDeleteRecords] = useState(false);
  const [selectedCycleNumber, setSelectedCycleNumber] = useState<number | null>(null);
  const [cycleRows, setCycleRows] = useState<CfcfCycleRow[]>([]);
  const [cycleBillInputs, setCycleBillInputs] = useState<Record<string, string>>({});
  const [cycleError, setCycleError] = useState<string | null>(null);
  const [isCycleBusy, setIsCycleBusy] = useState(false);
  const [plannedPayoutReview, setPlannedPayoutReview] = useState(false);
  const [cycleDeleteTarget, setCycleDeleteTarget] = useState<number | null>(null);
  const [cycleDeleteError, setCycleDeleteError] = useState<string | null>(null);
  const [plannedPayoutCycle, setPlannedPayoutCycle] = useState<number | null>(null);
  const [plannedPayoutInput, setPlannedPayoutInput] = useState("");
  const [plannedPayoutError, setPlannedPayoutError] = useState<string | null>(null);
  const [cycleSummary, setCycleSummary] = useState<CfcfCycleSummary | null>(null);
  const [isCycleStatementOpen, setIsCycleStatementOpen] = useState(false);
  const [isFundEditOpen, setIsFundEditOpen] = useState(false);
  const [isFundReportOpen, setIsFundReportOpen] = useState(false);
  const [isFullFundReportOpen, setIsFullFundReportOpen] = useState(false);
  const [isLoadingFullFundReport, setIsLoadingFullFundReport] = useState(false);
  const [fullFundReportError, setFullFundReportError] = useState<string | null>(null);
  const [fullFundReportAdjustmentsSummary, setFullFundReportAdjustmentsSummary] = useState<CfcfFundOtherAdjustmentSummary | null>(null);
  const [isAdjustmentsLedgerOpen, setIsAdjustmentsLedgerOpen] = useState(false);
  const [adjustmentsLedgerRows, setAdjustmentsLedgerRows] = useState<CfcfLedgerItem[]>([]);
  const [adjustmentsSummary, setAdjustmentsSummary] = useState<CfcfFundOtherAdjustmentSummary | null>(null);
  const [isLoadingAdjustmentsLedger, setIsLoadingAdjustmentsLedger] = useState(false);
  const [adjustmentsLedgerError, setAdjustmentsLedgerError] = useState<string | null>(null);
  const [fundEditForm, setFundEditForm] = useState({ fundName: "", startDate: "", numberOfCycles: "" });
  const [fundEditError, setFundEditError] = useState<string | null>(null);
  const [isSavingFundEdit, setIsSavingFundEdit] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const lastTenantId = useRef(workspace.tenantId);
  const hydratedViewTenantId = useRef<string | null>(null);

  const selectedFund = useMemo(
    () => funds.find((fund) => fund.fund_id === selectedFundId) ?? null,
    [funds, selectedFundId],
  );

  useEffect(() => {
    let cancelled = false;
    const summaryCycleNumber = selectedCycleNumber ?? cycleRows.at(-1)?.cycle_number ?? null;
    if (!selectedFund || summaryCycleNumber === null) { setCycleSummary(null); return; }
    getCfcfCycleSummary(workspace.tenantId, selectedFund.fund_id, summaryCycleNumber)
      .then((summary) => { if (!cancelled) setCycleSummary(summary); })
      .catch(() => { if (!cancelled) setCycleSummary(null); });
    return () => { cancelled = true; };
  }, [workspace.tenantId, selectedFund?.fund_id, selectedCycleNumber, cycleRows, detailReloadKey]);

  useEffect(() => {
    let cancelled = false;
    if (!selectedFund) { setCycleRows([]); return; }
    listCfcfCycles(workspace.tenantId, selectedFund.fund_id)
      .then((rows) => { if (!cancelled) { setCycleRows(rows); setCycleError(null); } })
      .catch((error: unknown) => { if (!cancelled) setCycleError(error instanceof Error ? error.message : "Unable to load Cycles."); });
    return () => { cancelled = true; };
  }, [workspace.tenantId, selectedFund?.fund_id, detailReloadKey, fundReloadKey]);

  // CFCF PRODUCT: Clear Fund-specific filters, unsaved inputs, and open financial modals on Fund/tenant changes.
  // This prevents a modal opened for one Fund from being accidentally submitted against another selected Fund.
  useEffect(() => {
    setShareSearch("");
    setShareFilter("all");
    setSelectedShareId(null);
    setPaymentShare(null);
    setBillingShare(null);
    setPayoutShare(null);
    setStatementShare(null);
    setIsShareModalOpen(false);
    setIsFundEntryModalOpen(false);
    setCycleEditNumber(null);
    setCyclePayoutInput("");
    setCycleCommissionInput("");
    setPaymentError(null);
    setBillingError(null);
    setPayoutError(null);
    setFundEntryError(null);
  }, [selectedFundId, workspace.tenantId]);


  // MIX: Discard previous-tenant data and ignore stale responses after a tenant switch.
  useEffect(() => {
    let isCurrent = true;
    const tenantChanged = lastTenantId.current !== workspace.tenantId;
    lastTenantId.current = workspace.tenantId;

    if (tenantChanged) {
      setFunds([]);
      setShares([]);
      setBills([]);
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
      setActiveTab("shares");
      setSelectedFundId(savedView.fundId);
      return;
    }
    try {
      window.localStorage.setItem(
        "clearflow:cfcf-workspace-view:v2:" + workspace.tenantId,
        JSON.stringify({ tab: "shares", fundId: selectedFundId }),
      );
    } catch {
      // Keep the workspace usable when browser storage is unavailable.
    }
  }, [workspace.tenantId, selectedFundId]);

  // MIX: Every fund/tab transition clears fund-scoped client state before fetching.
  // CFCF PRODUCT: Shares, contacts and ledger entries are loaded together for the selected Fund.
  useEffect(() => {
    let isCurrent = true;

    setShares([]);
    setBills([]);
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
        const [shareRows, billRows, contactRows] = await Promise.all([
          listCfcfShares(workspace.tenantId, selectedFundId),
          listCfcfBills(workspace.tenantId, selectedFundId),
          listCfcfContacts(workspace.tenantId),
        ]);
        if (!isCurrent) return;
        setShares(shareRows);
        setBills(billRows);
        setContacts(contactRows);
        // Keep an open Share statement aligned with the latest saved billing/payout fields.
        setStatementShare((currentStatement) => currentStatement
          ? shareRows.find((share) => share.share_id === currentStatement.share_id) ?? null
          : null);

        const rows = await listCfcfLedgerItems(workspace.tenantId, selectedFundId);
        if (!isCurrent) return;
        setLedgerItems(rows);
      } catch (error) {
        if (!isCurrent) return;
        setDetailsError(error instanceof Error ? error.message : "Unable to load workspace details.");
      } finally {
        if (isCurrent) setIsLoadingDetails(false);
      }
    };

    void loadDetails();
    return () => { isCurrent = false; };
  }, [workspace.tenantId, selectedFundId, detailReloadKey]);

  // CFCF PRODUCT: Statement history loads on demand without forcing the workspace into the Ledger tab.
  useEffect(() => {
    if (!statementShare || !selectedFundId) return;
    let current = true;
    void listCfcfLedgerItems(workspace.tenantId, selectedFundId)
      .then((items) => { if (current) setLedgerItems(items); })
      .catch((error: unknown) => { if (current) showDatabaseResult(error instanceof Error ? error.message : "Unable to load statement transactions.", "error"); });
    return () => { current = false; };
  }, [statementShare?.share_id, selectedFundId, workspace.tenantId, detailReloadKey]);

  function printShareStatement() {
    const content = document.querySelector("[data-cfcf-share-statement]")?.innerHTML;
    if (!content) { showDatabaseResult("Statement content is not ready to print."); return; }
    const printWindow = window.open("", "_blank", "width=900,height=700");
    if (!printWindow) { showDatabaseResult("Allow pop-ups to print or save the Share statement."); return; }
    printWindow.document.write("<!doctype html><html><head><title>ClearFlow Share Statement</title><meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"><style>body{font-family:Arial,sans-serif;color:#0f172a;padding:24px;max-width:900px;margin:auto}button{display:none!important}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}article,section{break-inside:avoid}p,h3,h4{margin-top:8px;margin-bottom:8px}.border{border:1px solid #cbd5e1}.rounded-xl{border-radius:12px}.p-3,.p-4{padding:12px}.bg-slate-50{background:#f8fafc}.text-xs{font-size:12px}.text-sm{font-size:14px}.font-bold,.font-semibold{font-weight:700}</style></head><body>" + content + "</body></html>");
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  }

  async function openAdjustmentsLedger() {
    if (!selectedFund) return;
    setIsAdjustmentsLedgerOpen(true);
    setIsLoadingAdjustmentsLedger(true);
    setAdjustmentsLedgerError(null);
    try {
      const [allLedgerItems, summary] = await Promise.all([
        listCfcfLedgerItems(workspace.tenantId, selectedFund.fund_id),
        getCfcfFundOtherAdjustmentSummary(workspace.tenantId, selectedFund.fund_id),
      ]);
      setAdjustmentsLedgerRows(allLedgerItems.filter((item) => item.kind === "fund-entry"));
      setAdjustmentsSummary(summary);
    } catch (error) {
      setAdjustmentsLedgerError(error instanceof Error ? error.message : "Unable to load Other Adjustments ledger.");
    } finally {
      setIsLoadingAdjustmentsLedger(false);
    }
  }

  function printAdjustmentsLedger() {
    const content = document.querySelector("[data-cfcf-adjustments-report]")?.innerHTML;
    if (!content) { setAdjustmentsLedgerError("Adjustment report content is not ready to print."); return; }
    const printWindow = window.open("", "_blank", "width=900,height=700");
    if (!printWindow) { setAdjustmentsLedgerError("Allow pop-ups to print or save the adjustment report."); return; }
    printWindow.document.write("<!doctype html><html><head><title>ClearFlow Other Adjustments Ledger</title><meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"><style>body{font-family:Arial,sans-serif;color:#0f172a;padding:24px;max-width:1000px;margin:auto}button{display:none!important}.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}table{width:100%;border-collapse:collapse;font-size:12px}th,td{border:1px solid #cbd5e1;padding:8px;text-align:left;vertical-align:top}th{background:#f1f5f9}tr{break-inside:avoid}p,h2,h3,h4{margin:8px 0}.border{border:1px solid #cbd5e1}.rounded-xl{border-radius:12px}.p-3,.p-4{padding:12px}.bg-slate-50{background:#f8fafc}.text-xs{font-size:12px}.text-sm{font-size:14px}.font-bold,.font-semibold{font-weight:700}</style></head><body>" + content + "</body></html>");
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  }

  async function openFullFundReport() {
    if (!selectedFund || isLoadingFullFundReport) return;
    const requestedFundId = selectedFund.fund_id;
    const requestedTenantId = workspace.tenantId;
    setIsLoadingFullFundReport(true);
    setFullFundReportError(null);
    setFullFundReportAdjustmentsSummary(null);
    try {
      // Refresh every report section from the authorized tenant-scoped services before rendering.
      const [freshShares, freshContacts, freshBills, freshLedger, freshCycles, adjustmentsSummary] = await Promise.all([
        listCfcfShares(requestedTenantId, requestedFundId),
        listCfcfContacts(requestedTenantId),
        listCfcfBills(requestedTenantId, requestedFundId),
        listCfcfLedgerItems(requestedTenantId, requestedFundId),
        listCfcfCycles(requestedTenantId, requestedFundId),
        getCfcfFundOtherAdjustmentSummary(requestedTenantId, requestedFundId),
      ]);
      if (workspace.tenantId !== requestedTenantId || selectedFundId !== requestedFundId) return;
      setShares(freshShares);
      setContacts(freshContacts);
      setBills(freshBills);
      setLedgerItems(freshLedger);
      setCycleRows(freshCycles);
      setFullFundReportAdjustmentsSummary(adjustmentsSummary);
      setIsFullFundReportOpen(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to load the complete Fund report.";
      setFullFundReportError(message);
      showDatabaseResult(message, "error");
    } finally {
      setIsLoadingFullFundReport(false);
    }
  }

  async function printFullFundReport() {
    const source = document.querySelector("[data-cfcf-full-fund-report]");
    if (!(source instanceof HTMLElement)) {
      setFullFundReportError("Full Fund report content is not ready. Please try again.");
      return;
    }

    let reportRoot: HTMLDivElement | null = null;
    try {
      setFullFundReportError("");
      const pdfModule = await import("html2pdf.js");
      reportRoot = document.createElement("div");
      reportRoot.style.cssText = "position:fixed;left:-10000px;top:0;width:794px;background:#fff;color:#0f172a;font-family:Arial,sans-serif;font-size:12px;line-height:1.45;padding:28px;box-sizing:border-box;overflow-wrap:anywhere";
      const style = document.createElement("style");
      style.textContent = "*{box-sizing:border-box}h1{font-size:22px;margin:0 0 6px}h2{font-size:15px;margin:18px 0 8px;break-after:avoid}h3{font-size:12px;margin:10px 0 5px}.report-section{margin-bottom:16px;break-inside:auto}.record{border:1px solid #cbd5e1;border-radius:7px;padding:9px;margin:6px 0;break-inside:avoid}.muted{color:#64748b}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}.metric{border:1px solid #cbd5e1;border-radius:6px;padding:8px;break-inside:avoid;min-width:0}.metric-label{font-size:9px;color:#64748b}.metric-value{font-size:12px;font-weight:700;margin-top:3px;overflow-wrap:anywhere;word-break:break-word}.pill{display:inline-block;border:1px solid #cbd5e1;border-radius:10px;padding:2px 6px;font-size:9px}p{margin:3px 0;overflow-wrap:anywhere;word-break:break-word}.entry-amount{font-weight:700}.entry-meta{font-size:9px;color:#64748b;overflow-wrap:anywhere;word-break:break-word}.disclaimer{border:1px solid #fcd34d;background:#fffbeb;padding:9px;border-radius:6px}.brand-header{text-align:center;font-size:18px;font-weight:800;letter-spacing:.35px;padding:0 0 12px;margin-bottom:14px;border-bottom:1px solid #cbd5e1}.report-footer{margin-top:20px;padding-top:8px;border-top:1px solid #cbd5e1;font-size:10px;color:#475569;text-align:center}.no-pdf{display:none!important}";
      reportRoot.appendChild(style);
      const header = document.createElement("header");
      header.className = "brand-header";
      header.textContent = "Powered by ClearFlow Automations";
      reportRoot.appendChild(header);
      const reportContent = source.cloneNode(true) as HTMLElement;
      reportContent.removeAttribute("data-cfcf-full-fund-report");
      reportRoot.appendChild(reportContent);
      const footer = document.createElement("footer");
      footer.className = "report-footer";
      footer.innerHTML = "<strong>Powered by ClearFlow Automations</strong><br>ClearFlow · Full Fund Report · Generated " + new Date().toLocaleString("en-IN");
      reportRoot.appendChild(footer);
      document.body.appendChild(reportRoot);

      await pdfModule.default().set({
        margin: [8, 8, 10, 8],
        filename: "ClearFlow-Full-Fund-Report.pdf",
        image: { type: "jpeg", quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, logging: false, backgroundColor: "#ffffff", windowWidth: 794 },
        jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
        pagebreak: { mode: ["css", "legacy"], avoid: [".record", ".metric", "h2"] },
      }).from(reportRoot).save();

      showDatabaseResult("Downloaded ClearFlow-Full-Fund-Report.pdf.");
    } catch (error) {
      setFullFundReportError(error instanceof Error
        ? "PDF download failed: " + error.message + ". Please try again."
        : "PDF download failed. Please try again.");
    } finally {
      reportRoot?.remove();
    }
  }
  function printFundReport() {
    const content = document.querySelector("[data-cfcf-fund-report]")?.innerHTML;
    if (!content) { showDatabaseResult("Fund report content is not ready to print."); return; }
    const printWindow = window.open("", "_blank", "width=900,height=700");
    if (!printWindow) { showDatabaseResult("Allow pop-ups to print or save the Fund report."); return; }
    printWindow.document.write("<!doctype html><html><head><title>ClearFlow Fund Summary</title><meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"><style>body{font-family:Arial,sans-serif;color:#0f172a;padding:24px;max-width:900px;margin:auto}.brand-header{text-align:center;font-size:13px;font-weight:700;letter-spacing:.3px;padding-bottom:10px;margin-bottom:16px;border-bottom:1px solid #cbd5e1}.brand-footer{text-align:center;margin-top:24px;padding-top:10px;border-top:1px solid #cbd5e1;font-size:10px;font-weight:700;color:#475569}button{display:none!important}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}section,article{break-inside:avoid}p,h3,h4{margin-top:8px;margin-bottom:8px}.border{border:1px solid #cbd5e1}.rounded-xl{border-radius:12px}.p-3,.p-4{padding:12px}.bg-slate-50{background:#f8fafc}.text-xs{font-size:12px}.text-sm{font-size:14px}.font-bold,.font-semibold{font-weight:700}</style></head><body><header class=\"brand-header\">Powered by ClearFlow Automations</header>" + content + "<footer class=\"brand-footer\">Powered by ClearFlow Automations</footer></body></html>");
    printWindow.document.close(); printWindow.focus(); printWindow.print();
  }

  function billedCycleNumbers(fundShares: CfcfShareRow[] = shares): number[] {
    const ids = new Set(fundShares.map((share) => share.share_id));
    const cycleById = new Map(cycleRows.map((cycle) => [cycle.cycle_id, cycle.cycle_number]));
    return [...new Set(bills.filter((bill) => ids.has(bill.share_id))
      .map((bill) => cycleById.get(bill.cycle_id))
      .filter((number): number is number => number !== undefined))]
      .sort((x, y) => x - y);
  }

  function savedCycleNumbers(): number[] {
    return cycleRows.map((cycle) => cycle.cycle_number).sort((a, b) => a - b);
  }

  function billForShareCycle(shareId: string, cycleNumber: number): CfcfBillRow | undefined {
    const cycle = cycleRows.find((row) => row.cycle_number === cycleNumber);
    return cycle ? bills.find((bill) => bill.share_id === shareId && bill.cycle_id === cycle.cycle_id) : undefined;
  }

  function highestCycleNumber(_fund: CfcfFundRow | null, _fundShares: CfcfShareRow[] = shares): number {
    return savedCycleNumbers().at(-1) ?? 0;
  }

  function openPayoutModal(share: CfcfShareRow) {
    // If this Share is already drawn, keep its recorded Cycle and actual withdrawn amount,
    // including an intentional zero. Otherwise default to the highest existing Cycle.
    const availableCycles = savedCycleNumbers();
    const cycle = share.payout_status === "drawn"
      && share.payout_cycle_number !== null
      && availableCycles.includes(share.payout_cycle_number)
      ? share.payout_cycle_number
      : Math.max(1, highestCycleNumber(selectedFund));
    const cyclePayout = cycleRows.find((row) => row.cycle_number === cycle)?.planned_payout_amount;
    setPayoutShare(share);
    setPayoutCycleNumber(String(cycle));
    setWithdrawnAmount(
      share.payout_status === "drawn"
        ? String(share.withdrawn_amount)
        : typeof cyclePayout === "number" ? String(cyclePayout) : "",
    );
    setPayoutError(null);
    setPayoutReview(false);
    setUndrawnReview(false);
  }

  async function handleSavePayout(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!payoutShare || !selectedFund || isSavingPayout) return;
    const cycle = Number(payoutCycleNumber);
    const amount = Number(withdrawnAmount);
    if (!Number.isSafeInteger(cycle) || cycle < 1 || cycle > MAX_CFCF_CYCLES) {
      setPayoutError("Choose a Cycle number from 1 to 100.");
      return;
    }
    if (!savedCycleNumbers().includes(cycle)) {
      setPayoutError("Choose an existing saved Cycle for this payout.");
      return;
    }
    if (withdrawnAmount.trim() === "" || !Number.isSafeInteger(amount) || amount < 0 || amount > 2147483647) {
      setPayoutError("Enter a whole-rupee withdrawn amount.");
      return;
    }
    if (!payoutReview) { setPayoutReview(true); setPayoutError(null); return; }
    if (!beginAction("share-payout")) return;
    setIsSavingPayout(true);
    setPayoutError(null);
    try {
      await setCfcfSharePayout(workspace.tenantId, selectedFund.fund_id, payoutShare.share_id, "drawn", cycle, amount);
      setPayoutShare(null);
      showDatabaseResult("Share marked drawn. No payment transaction was created.");
      setDetailReloadKey((current) => current + 1);
      setFundReloadKey((current) => current + 1);
    } catch (error) {
      setPayoutError(error instanceof Error ? error.message : "Unable to update payout status."); showDatabaseResult(error instanceof Error ? error.message : "Unable to update payout status.", "error");
    } finally {
      endAction("share-payout");
      setIsSavingPayout(false);
    }
  }

  async function handleMarkUndrawn() {
    if (!payoutShare || !selectedFund || isSavingPayout || payoutShare.payout_status !== "drawn") return;
    if (!undrawnReview) { setUndrawnReview(true); setPayoutReview(false); return; }
    if (!beginAction("share-payout")) return;
    setIsSavingPayout(true);
    setPayoutError(null);
    try {
      await setCfcfSharePayout(workspace.tenantId, selectedFund.fund_id, payoutShare.share_id, "undrawn", null, 0);
      setPayoutShare(null);
      showDatabaseResult("Share marked undrawn. The payout status was reset; existing Payment records were not changed.");
      setDetailReloadKey((current) => current + 1);
      setFundReloadKey((current) => current + 1);
    } catch (error) {
      setPayoutError(error instanceof Error ? error.message : "Unable to reset payout status."); showDatabaseResult(error instanceof Error ? error.message : "Unable to reset payout status.", "error");
    } finally {
      endAction("share-payout");
      setIsSavingPayout(false);
    }
  }

  function openCycleBilling(share: CfcfShareRow) {
    const cycle = selectedCycleNumber !== null && savedCycleNumbers().includes(selectedCycleNumber)
      ? selectedCycleNumber
      : highestCycleNumber(selectedFund);
    setBillingShare(share);
    setBillingEditEnabled(false);
    setBillingCycleNumber(String(cycle || 1));
    const existing = cycle ? billForShareCycle(share.share_id, cycle) : undefined;
    setBillingAmount(existing ? String(existing.amount) : "");
    setBillingError(cycle ? null : "Add a Cycle before entering bills.");
    setBillingReview(false);
  }

  async function handleSaveCycleBilling(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!billingShare || !selectedFund || isSavingBilling) return;
    const cycleNumber = Number(billingCycleNumber);
    const amount = Number(billingAmount);
    if (!Number.isSafeInteger(cycleNumber) || cycleNumber < 1 || cycleNumber > MAX_CFCF_CYCLES) {
      setBillingError("Choose a Cycle number from 1 to 100.");
      return;
    }
    if (!billingEditEnabled) { setBillingError("Choose Edit before changing this bill."); return; }
    if (billingAmount.trim() === "" || !Number.isSafeInteger(amount) || amount < 0 || amount > 2147483647) {
      setBillingError("Enter a whole-rupee billing amount of zero or more.");
      return;
    }
    if (!billingReview) { setBillingReview(true); setBillingError(null); return; }
    if (!beginAction("cycle-billing")) return;
    setIsSavingBilling(true);
    setBillingError(null);
    try {
      await recordCfcfCycleBilling(workspace.tenantId, selectedFund.fund_id, billingShare.share_id, cycleNumber, amount);
      setBillingShare(null);
      setBillingEditEnabled(false);
      showDatabaseResult("Cycle bill saved. No payment, credit, debit, or withdrawal was created.");
      setDetailReloadKey((current) => current + 1);
      setFundReloadKey((current) => current + 1);
    } catch (error) {
      setBillingError(error instanceof Error ? error.message : "Unable to save cycle billing."); showDatabaseResult(error instanceof Error ? error.message : "Unable to save cycle billing.", "error");
    } finally {
      endAction("cycle-billing");
      setIsSavingBilling(false);
    }
  }

  function openCycleEditor(cycleNumber: number) {
    setCycleReview(false);
    setCycleEditNumber(cycleNumber);
    setCycleEditEnabled(false);
    const cycle = cycleRows.find((row) => row.cycle_number === cycleNumber);
    setCyclePayoutInput(cycle?.planned_payout_amount == null ? "" : String(cycle.planned_payout_amount));
    setCycleCommissionInput(cycle?.commission_amount == null ? "" : String(cycle.commission_amount));
    const nextInputs: Record<string, string> = {};
    for (const share of shares) {
      const bill = billForShareCycle(share.share_id, cycleNumber);
      nextInputs[share.share_id] = bill ? String(bill.amount) : "";
    }
    setCycleBillInputs(nextInputs);
    setCycleEditError(null);
  }

  async function handleConfirmDeleteCycle() {
    if (!selectedFund || cycleDeleteTarget === null || isCycleBusy) return;
    if (!beginAction("delete-cycle")) return;
    setIsCycleBusy(true);
    setCycleDeleteError(null);
    try {
      await deleteHighestCfcfCycle(workspace.tenantId, selectedFund.fund_id, cycleDeleteTarget);
      const remaining = cycleRows.filter((row) => row.cycle_number !== cycleDeleteTarget);
      setCycleRows(remaining);
      setSelectedCycleNumber(remaining.at(-1)?.cycle_number ?? null);
      setCycleDeleteTarget(null);
      showDatabaseResult("Cycle deleted. Its bills, planned payout and commission were removed; withdrawals assigned to it were reset to Undrawn. Shareholder payment records were not changed.");
      setDetailReloadKey((value) => value + 1);
      setFundReloadKey((value) => value + 1);
    } catch (error) {
      setCycleDeleteError(error instanceof Error ? error.message : "Unable to delete Cycle."); showDatabaseResult(error instanceof Error ? error.message : "Unable to delete Cycle.", "error");
    } finally {
      endAction("delete-cycle");
      setIsCycleBusy(false);
    }
  }

  async function handleSaveCycleValues(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedFund || cycleEditNumber === null || isSavingCycle) return;
    if (!Number.isInteger(cycleEditNumber) || cycleEditNumber < 1 || cycleEditNumber > MAX_CFCF_CYCLES) {
      setCycleEditError("A Fund can have at most 100 Cycles.");
      return;
    }
    const payout = cyclePayoutInput.trim() === "" ? null : Number(cyclePayoutInput);
    const commission = cycleCommissionInput.trim() === "" ? null : Number(cycleCommissionInput);
    for (const [label, value] of [["Planned payout", payout], ["Commission", commission]] as const) {
      if (value !== null && (!Number.isSafeInteger(value) || value < 0 || value > 2147483647)) {
        setCycleEditError(label + " must be a whole rupee amount or left blank.");
        return;
      }
    }
    const cycleNumber = cycleEditNumber;
    const billPayload = shares
      .filter((share) => share.status === "active")
      .flatMap((share) => {
        const raw = cycleBillInputs[share.share_id] ?? "";
        const amount = raw.trim() === "" ? 0 : Number(raw);
        if (!Number.isSafeInteger(amount) || amount < 0 || amount > 2147483647) {
          return [{ share_id: share.share_id, amount: Number.NaN }];
        }
        return [{ share_id: share.share_id, amount }];
      });
    if (billPayload.some((bill) => !Number.isSafeInteger(bill.amount) || bill.amount < 0)) {
      setCycleEditError("Every Share must have a nonnegative whole-rupee bill. Blank amounts are saved as ₹0.");
      return;
    }
    if (!cycleReview) { setCycleReview(true); setCycleEditError(null); return; }
    if (!beginAction("save-cycle-workspace")) return;
    setIsSavingCycle(true);
    setCycleEditError(null);
    try {
      await saveCfcfCycleWorkspace(workspace.tenantId, selectedFund.fund_id, cycleNumber, payout, commission, billPayload);
      const freshBills = await listCfcfBills(workspace.tenantId, selectedFund.fund_id);
      const freshCycles = await listCfcfCycles(workspace.tenantId, selectedFund.fund_id);
      setBills(freshBills);
      setCycleRows(freshCycles);
      setSelectedCycleNumber(cycleNumber);
      setCycleEditNumber(null);
      setCycleEditEnabled(false);
      setCycleReview(false);
      showDatabaseResult("Cycle " + cycleNumber + " saved. Shareholder payments were not changed.");
      setFundReloadKey((n) => n + 1);
      setDetailReloadKey((n) => n + 1);
      if (isAdjustmentsLedgerOpen) void openAdjustmentsLedger();
    } catch (error) {
      setCycleEditError(error instanceof Error ? error.message : "Unable to save Cycle workspace."); showDatabaseResult(error instanceof Error ? error.message : "Unable to save Cycle workspace.", "error");
    } finally {
      endAction("save-cycle-workspace");
      setIsSavingCycle(false);
    }
  }

  async function handleSaveFundEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedFund || isSavingFundEdit) return;
    const rawCount = fundEditForm.numberOfCycles.trim();
    const count = rawCount === "" ? null : Number(rawCount);
    if (count !== null && (!Number.isSafeInteger(count) || count < 0 || count > MAX_CFCF_CYCLES)) {
      setFundEditError("Planned Cycle count must be between 0 and 100.");
      return;
    }
    if (!beginAction("edit-fund")) return;
    setIsSavingFundEdit(true);
    setFundEditError(null);
    try {
      await updateCfcfFundDetails(workspace.tenantId, selectedFund.fund_id, { fundName: fundEditForm.fundName, startDate: fundEditForm.startDate || null, numberOfCycles: count });
      setIsFundEditOpen(false);
      showDatabaseResult("Fund details saved. Stored financial values were not changed.");
      setFundReloadKey((n) => n + 1);
    } catch (error) {
      setFundEditError(error instanceof Error ? error.message : "Unable to save Fund details."); showDatabaseResult(error instanceof Error ? error.message : "Unable to save Fund details.", "error");
    } finally {
      endAction("edit-fund");
      setIsSavingFundEdit(false);
    }
  }

  async function openShareStatement(share: CfcfShareRow) {
    const requestId = ++statementRequestId.current;
    setStatementShare(share);
    setIsLoadingStatement(true);
    setStatementError(null);
    try {
      const [freshFunds, freshShares, freshContacts, freshBills, freshLedger, freshCycles] = await Promise.all([
        listCfcfFunds(workspace.tenantId),
        listCfcfShares(workspace.tenantId, share.fund_id),
        listCfcfContacts(workspace.tenantId),
        listCfcfBills(workspace.tenantId, share.fund_id),
        listCfcfLedgerItems(workspace.tenantId, share.fund_id),
        listCfcfCycles(workspace.tenantId, share.fund_id),
      ]);
      if (requestId !== statementRequestId.current) return;
      setFunds(freshFunds);
      setShares(freshShares);
      setContacts(freshContacts);
      setBills(freshBills);
      setLedgerItems(freshLedger);
      setCycleRows(freshCycles);
      setStatementShare(freshShares.find((row) => row.share_id === share.share_id) ?? share);
    } catch (error) {
      if (requestId === statementRequestId.current) setStatementError(error instanceof Error ? error.message : "Unable to refresh this Share statement.");
    } finally {
      if (requestId === statementRequestId.current) setIsLoadingStatement(false);
    }
  }

  async function openShareDelete(share: CfcfShareRow) {
    setDeleteStep(1);
    setDeleteAcknowledged(false);
    setDeleteTypedId("");
    setDeleteError(null);
    setShareDeleteRecords(null);
    setDeleteTarget({ kind: "share", id: share.share_id, label: contactById.get(share.contact_id)?.name ?? share.share_id, fundId: share.fund_id });
    setIsLoadingShareDeleteRecords(true);
    try {
      const [fundBills, fundLedger] = await Promise.all([listCfcfBills(workspace.tenantId, share.fund_id), listCfcfLedgerItems(workspace.tenantId, share.fund_id)]);
      setShareDeleteRecords({ bills: fundBills.filter((bill) => bill.share_id === share.share_id), payments: fundLedger.filter((item) => item.kind === "payment" && item.shareId === share.share_id) });
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : "Unable to load this Share's related records.");
    } finally {
      setIsLoadingShareDeleteRecords(false);
    }
  }
  async function handleConfirmDelete() {
    if (!deleteTarget || isDeleting || deleteStep !== 3 || !deleteAcknowledged || deleteTypedId.trim().toLowerCase() !== workspace.email.trim().toLowerCase()) return;
    if (!beginAction("delete-record")) return;
    setIsDeleting(true); setDeleteError(null);
    try {
      if (deleteTarget.kind === "share") {
        const result = await deleteCfcfShareWithHistory(workspace.tenantId, deleteTarget.fundId ?? selectedFundId, deleteTarget.id);
        showDatabaseResult("Share " + result.share_id + " deleted with " + result.deleted_bills + " bill record(s) and " + result.deleted_payments + " payment record(s). Fund totals refreshed.");
        setDeleteTarget(null); setDeleteStep(1); setDeleteAcknowledged(false); setDeleteTypedId(""); setDetailReloadKey((n) => n + 1); setFundReloadKey((n) => n + 1);
      } else {
        await deleteCfcfFundIfEmpty(workspace.tenantId, deleteTarget.id);
        showDatabaseResult("Empty Fund deleted."); setDeleteTarget(null); setDeleteStep(1); setDeleteAcknowledged(false); setDeleteTypedId(""); setSelectedFundId("");
        setFundReloadKey((n) => n + 1); setDetailReloadKey((n) => n + 1);
      }
    } catch (error) { setDeleteError(error instanceof Error ? error.message : "Unable to delete this record."); showDatabaseResult(error instanceof Error ? error.message : "Unable to delete this record.", "error"); }
    finally { endAction("delete-record"); setIsDeleting(false); }
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
    if (!beginAction("create-share")) return;
    setIsSavingShare(true);
    setShareFormError(null);
    try {
      await createCfcfShare(workspace.tenantId, selectedFund.fund_id, workspace.personId, newShareContactId);
      setIsShareModalOpen(false);
      showDatabaseResult("Share added to " + selectedFund.fund_name + ".");
      setDetailReloadKey((n) => n + 1);
      setFundReloadKey((n) => n + 1);
    } catch (error) {
      setShareFormError(error instanceof Error ? error.message : "Unable to add Share."); showDatabaseResult(error instanceof Error ? error.message : "Unable to add Share.", "error");
    } finally { endAction("create-share"); setIsSavingShare(false); }
  }

  function openPaymentModal(share: CfcfShareRow) {
    paymentRequestRef.current = null;
    setPaymentShare(share);
    setPaymentReview(false);
    setPaymentEntryType("credit");
    setPaymentAmount("");
    setPaymentDate(localDateInputValue());
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
    if (!paymentReview) { paymentRequestRef.current = crypto.randomUUID(); setPaymentReview(true); setPaymentError(null); return; }
    if (!beginAction("record-payment")) return;
    setIsSavingPayment(true); setPaymentError(null);
    try {
      const savedPayment = await recordCfcfSharePayment(workspace.tenantId, selectedFund.fund_id, paymentShare.share_id, workspace.personId, paymentEntryType, amount, paymentDate, paymentMode, paymentRemarks, paymentRequestRef.current ?? crypto.randomUUID());
      setPaymentShare(null);
      paymentRequestRef.current = null;
      showDatabaseResult((savedPayment.duplicate ? "Payment was already saved" : paymentEntryType === "credit" ? "Payment recorded" : "Debit correction recorded") + " successfully in Supabase. Payment ID: " + savedPayment.payment_id + (savedPayment.duplicate ? ". No duplicate was created." : "."));
      setDetailReloadKey((n) => n + 1); setFundReloadKey((n) => n + 1);
    } catch (error) { setPaymentError(error instanceof Error ? error.message : "Unable to record transaction."); showDatabaseResult(error instanceof Error ? error.message : "Unable to record transaction.", "error"); }
    finally { endAction("record-payment"); setIsSavingPayment(false); }
  }

  async function handleRecordFundEntry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedFund || isSavingFundEntry) return;
    const amount = Number(fundEntryAmount);
    if (!fundEntryAmount.trim() || !Number.isSafeInteger(amount) || amount <= 0 || amount > 2147483647) {
      setFundEntryError("Enter a positive whole-rupee amount.");
      return;
    }
    if (!fundEntryCategory) { setFundEntryError("Choose an adjustment category."); return; }
    if (!beginAction("fund-other-adjustment")) return;
    setIsSavingFundEntry(true);
    setFundEntryError(null);
    try {
      await recordCfcfFundOtherEntry(workspace.tenantId, selectedFund.fund_id, workspace.personId, fundEntryType, amount, fundEntryRemarks, fundEntryCategory);
      setIsFundEntryModalOpen(false);
      setFundEntryAmount("");
      setFundEntryRemarks("");
      setFundEntryCategory("");
      showDatabaseResult(fundEntryType === "credit" ? "Other adjustment credit recorded. Fund financials were not changed." : "Other adjustment debit recorded. Fund financials were not changed.");
      setDetailReloadKey((n) => n + 1);
    } catch (error) {
      setFundEntryError(error instanceof Error ? error.message : "Unable to record Fund adjustment."); showDatabaseResult(error instanceof Error ? error.message : "Unable to record Fund adjustment.", "error");
    } finally {
      endAction("fund-other-adjustment");
      setIsSavingFundEntry(false);
    }
  }

  function openShareWhatsApp(share: CfcfShareRow, mode: "reminder" | "report") {
    const contact = contactById.get(share.contact_id);
    if (!contact?.phone) { showDatabaseResult("This Contact has no saved phone number."); return; }
    if (!selectedFund) { showDatabaseResult("Select a Fund before opening WhatsApp."); return; }
    if (mode === "reminder" && share.total_pending <= 0) {
      showDatabaseResult("This Share has no outstanding amount to remind about.");
      return;
    }
    const rawPhone = contact.phone.replace(/\D/g, "");
    const phone = rawPhone.length === 10 ? "91" + rawPhone : rawPhone.length === 11 && rawPhone.startsWith("0") ? "91" + rawPhone.slice(1) : rawPhone;
    if (phone.length < 10) { showDatabaseResult("The selected Contact's phone number is invalid."); return; }
    const ownerName = workspace.displayName.trim() || workspace.email;
    const currentCycle = selectedFund.current_cycle;
    const currentBill = billForShareCycle(share.share_id, currentCycle);
    const lines = mode === "reminder"
      ? [
          "Dear " + contact.name,
          "Share ID: " + share.share_id,
          "Fund: " + selectedFund.fund_name,
          "Amount Due: " + formatINR(share.total_pending),
          "",
          "Thank you,",
          ownerName,
        ]
      : [
          "Dear " + contact.name,
          "Share ID: " + share.share_id,
          "Fund: " + selectedFund.fund_name,
          "Cycle Progress: " + currentCycle + " of " + (selectedFund.number_of_cycles ?? "—"),
          "Current Cycle Bill: " + (currentBill ? formatINR(currentBill.amount) : "Not billed"),
          "Total Billed: " + formatINR(share.share_total_billed_amount),
          "Total Paid: " + formatINR(share.share_net_payment_received),
          ...(share.total_pending > 0 ? ["Pending Amount: " + formatINR(share.total_pending)] : []),
          ...(share.total_advance > 0 ? ["Advance Amount: " + formatINR(share.total_advance)] : []),
          "Status: " + (share.payout_status === "drawn" ? "Drawn" : "Undrawn"),
          ...(share.payout_status === "drawn" ? [
            "Amount Withdrawn: " + formatINR(share.withdrawn_amount),
            ...(share.payout_cycle_number !== null ? ["Withdrawal Cycle: " + share.payout_cycle_number] : []),
          ] : []),
          "",
          "Thank you,",
          ownerName,
        ];
    window.open("https://wa.me/" + phone + "?text=" + encodeURIComponent(lines.join("\n")), "_blank", "noopener,noreferrer");
  }

  function currentBilledForShare(share: CfcfShareRow): number {
    const highest = billedCycleNumbers([share]).at(-1) ?? 0;
    return highest ? billForShareCycle(share.share_id, highest)?.amount ?? 0 : 0;
  }

  function openFundModal() {
    setFundForm(emptyFundForm);
    setFundFormError(null);
    setDatabaseResult(null);
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

    if (numberOfCycles !== null && (!Number.isSafeInteger(numberOfCycles) || numberOfCycles < 1 || numberOfCycles > MAX_CFCF_CYCLES)) {
      setFundFormError("Cycle count must be a whole number from 1 to 100.");
      return;
    }
     if (!fundForm.fundName.trim()) { setFundFormError("Enter a Fund name."); return; }
    if (!beginAction("create-fund")) return;
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
      setActiveTab("shares");
      showDatabaseResult("Fund created successfully. Its stored details are shown below.");
      setIsFundModalOpen(false);
      setFundForm(emptyFundForm);
    } catch (error) {
      setFundFormError(error instanceof Error ? error.message : "Unable to create fund."); showDatabaseResult(error instanceof Error ? error.message : "Unable to create fund.", "error");
    } finally {
      endAction("create-fund");
      setIsSavingFund(false);
    }
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
      <section aria-label="All funds workspace" className="flex min-w-0 items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h1 className="text-base font-bold leading-5 tracking-tight text-slate-950 sm:text-xl">All Funds Workspace</h1>
          <p className="mt-1 text-xs font-medium leading-4 text-slate-500 sm:text-sm">{new Date().toLocaleDateString("en-IN", { weekday: "short", day: "2-digit", month: "short", year: "numeric" })}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <button type="button" onClick={() => setFundReloadKey((current) => current + 1)} disabled={isLoadingFunds} aria-label="Refresh funds" className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 disabled:opacity-50">
            <RefreshCw size={17} className={isLoadingFunds ? "animate-spin" : ""} />
          </button>
          <button type="button" onClick={openFundModal} className="inline-flex min-h-10 items-center justify-center gap-1 rounded-xl bg-sky-600 px-2.5 text-xs font-semibold text-white transition hover:bg-sky-700 sm:gap-1.5 sm:px-3 sm:text-sm">
            <Plus size={15} /> New Fund
          </button>
        </div>
      </section>


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
          title="No funds yet"
          description="Create a Fund to get started."
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
          <section aria-label="Selected Fund workspace" className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              {funds.map((fund) => <button key={fund.fund_id} type="button" onClick={() => { setSelectedFundId(fund.fund_id); setSelectedShareId(null); setSelectedCycleNumber(null); }} aria-pressed={selectedFundId === fund.fund_id} className={["min-h-12 min-w-0 rounded-xl border px-2 py-2 text-sm font-semibold leading-4", selectedFundId === fund.fund_id ? "border-emerald-500 bg-emerald-100 text-emerald-950 ring-2 ring-emerald-200 shadow-sm" : "border-slate-200 bg-white text-slate-700"].join(" ")}><span className="line-clamp-2 break-words">{fund.fund_name}</span></button>)}
            </div>
            <div className="border-t-2 border-slate-300 pt-4">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Selected Fund · {selectedFund.fund_name}</p>
              <article className="rounded-2xl border border-sky-100 bg-white p-3 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <h3 className="break-words text-base font-bold text-slate-900">{selectedFund.fund_name}</h3>
                    <p className="mt-1 break-all text-xs text-slate-500">Fund ID · {selectedFund.fund_id} <span className="px-1">·</span> Start · {selectedFund.start_date ? formatDate(selectedFund.start_date) : "Not set"}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-xs font-medium text-slate-500">Pending</p>
                    <p className="text-[1.1rem] font-bold leading-tight tabular-nums text-rose-600">{formatINR(selectedFund.fund_total_pending_amount ?? 0)}</p>
                  </div>
                </div>
                <div className="mt-2 flex items-center justify-between gap-2 text-xs text-slate-600">
                  <span>Planned cycles: {selectedFund.number_of_cycles ?? "Not set"}</span>
                  <span>Cycle progress: {savedCycleNumbers().at(-1) ?? 0} / {selectedFund.number_of_cycles ?? "Not set"}</span>
                </div>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  <div className="rounded-lg bg-slate-50 px-2 py-2"><p className="text-[11px] text-slate-500">Advance</p><p className="mt-1 text-sm font-bold tabular-nums text-slate-900">{formatINR(selectedFund.fund_total_advance ?? 0)}</p></div>
                  <div className="rounded-lg bg-slate-50 px-2 py-2"><p className="text-[11px] text-slate-500">Withdrawn</p><p className="mt-1 text-sm font-bold tabular-nums text-slate-900">{formatINR(selectedFund.fund_total_withdrawn ?? 0)}</p></div>
                  <div className="rounded-lg bg-slate-50 px-2 py-2"><p className="text-[11px] text-slate-500">Net balance</p><p className={["mt-1 text-sm font-bold tabular-nums", (selectedFund.fund_net_balance ?? 0) < 0 ? "text-rose-600" : (selectedFund.fund_net_balance ?? 0) > 0 ? "text-emerald-700" : "text-slate-900"].join(" ")}>{(selectedFund.fund_net_balance ?? 0) > 0 ? "+" : (selectedFund.fund_net_balance ?? 0) < 0 ? "−" : ""}{formatINR(Math.abs(selectedFund.fund_net_balance ?? 0))}</p></div>
                </div>
                <div className="mt-2 flex items-center justify-between gap-2 text-xs text-slate-600"><span>Total Commission: {formatINR(selectedFund.fund_total_commissions ?? 0)}</span><span>Shares: {shares.length}</span></div>
                <div className="mt-3 grid grid-cols-2 gap-2 border-t border-slate-100 pt-3 sm:grid-cols-4">
                  <button type="button" onClick={() => setIsFundReportOpen(true)} className="inline-flex min-h-10 items-center justify-center gap-1 rounded-lg border border-sky-200 bg-sky-50 px-1 text-xs font-semibold text-sky-800"><FileText size={14}/> Fund Summary</button>
                  <button type="button" onClick={() => void openFullFundReport()} disabled={isLoadingFullFundReport} className="inline-flex min-h-10 items-center justify-center gap-1 rounded-lg border border-violet-200 bg-violet-50 px-1 text-xs font-semibold text-violet-800 disabled:opacity-50"><FileText size={14}/> {isLoadingFullFundReport ? "Loading…" : "Full Report"}</button>
                  <button type="button" onClick={() => void openAdjustmentsLedger()} className="inline-flex min-h-10 items-center justify-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-1 text-xs font-semibold text-emerald-800"><IndianRupee size={14}/> Adjustments</button>
                  <button type="button" onClick={() => { setFundEditForm({ fundName: selectedFund.fund_name ?? "", startDate: selectedFund.start_date ?? "", numberOfCycles: selectedFund.number_of_cycles == null ? "" : String(selectedFund.number_of_cycles) }); setFundEditError(null); setIsFundEditOpen(true); }} className="inline-flex min-h-10 items-center justify-center gap-1 rounded-lg border border-slate-200 px-1 text-xs font-semibold text-slate-700"><Pencil size={14}/> Edit Fund</button>
                </div>
              </article>
            {(() => { const cycleNumbers = savedCycleNumbers(); const currentCycle = selectedCycleNumber !== null && cycleNumbers.includes(selectedCycleNumber) ? selectedCycleNumber : (cycleNumbers.at(-1) ?? null); const row = cycleRows.find((item) => item.cycle_number === currentCycle); const payout = row?.planned_payout_amount; const commission = row?.commission_amount; return <article className="rounded-2xl border border-violet-200 bg-violet-50 p-3 shadow-sm">
              <div className="flex items-start justify-between gap-2"><div className="min-w-0"><h3 className="text-base font-bold text-slate-950">{currentCycle === null ? "No Cycles yet" : `Cycle ${currentCycle} / ${selectedFund.number_of_cycles ?? "Not set"}`}</h3><p className="mt-1 text-xs text-slate-600">{row ? `Created ${formatDate(row.created_at)}` : "Existing billing record"}</p></div><div className="flex shrink-0 items-center gap-1"><button type="button" aria-label="Previous Cycle" disabled={currentCycle === null || cycleNumbers.indexOf(currentCycle) <= 0} onClick={() => { if (currentCycle !== null) setSelectedCycleNumber(cycleNumbers[cycleNumbers.indexOf(currentCycle)-1]); }} className="grid h-9 w-9 place-items-center rounded-lg border border-violet-200 bg-white disabled:opacity-40"><ChevronLeft size={17}/></button><button type="button" aria-label="Latest Cycle" disabled={currentCycle === null || currentCycle === cycleNumbers.at(-1)} onClick={() => setSelectedCycleNumber(cycleNumbers.at(-1) ?? null)} className="grid h-9 w-9 place-items-center rounded-lg border border-violet-200 bg-white disabled:opacity-40"><RotateCcw size={16}/></button></div></div>
              <div className="mt-3 grid grid-cols-2 gap-2"><StoredValue label="Total billed" value={cycleSummary ? formatINR(cycleSummary.total_billed) : "—"}/><StoredValue label="Planned payout" value={displayStoredAmount(payout)}/><StoredValue label="Billed shares" value={cycleSummary ? String(cycleSummary.billed_shares) : "—"}/><StoredValue label="Not billed" value={cycleSummary ? String(cycleSummary.not_billed_shares) : "—"}/><StoredValue label="Total paid out" value={cycleSummary ? formatINR(cycleSummary.total_paid_out) : "—"}/><StoredValue label="Commission" value={displayStoredAmount(commission)}/></div>
              <div className="mt-3 grid grid-cols-2 gap-2"><button type="button" disabled={currentCycle === null || currentCycle !== Math.max(...cycleNumbers) || isCycleBusy} onClick={() => { if (currentCycle === null) return; setSelectedCycleNumber(currentCycle); setCycleDeleteTarget(currentCycle); setCycleDeleteError(null); }} className="min-h-10 rounded-xl border border-rose-200 bg-white px-2 text-sm font-semibold text-rose-700 disabled:opacity-40">Delete Cycle</button><button type="button" disabled={currentCycle === null} onClick={() => setIsCycleStatementOpen(true)} className="min-h-10 rounded-xl border border-violet-200 bg-white px-2 text-sm font-semibold text-violet-800 disabled:opacity-40">Cycle Statement</button><button type="button" disabled={currentCycle === null} onClick={() => { setPlannedPayoutCycle(currentCycle); setPlannedPayoutInput(payout == null ? "" : String(payout)); setPlannedPayoutError(null); }} className="min-h-10 rounded-xl border border-violet-200 bg-white px-2 text-sm font-semibold text-violet-800 disabled:opacity-40">Planned Payout</button><button type="button" disabled={currentCycle === null} onClick={() => currentCycle !== null && openCycleEditor(currentCycle)} className="min-h-10 rounded-xl bg-violet-700 px-2 text-sm font-semibold text-white disabled:opacity-40">Edit Cycle</button></div>
              {cycleError && <p role="alert" className="mt-2 text-sm text-rose-700">{cycleError}</p>}
            </article>; })()}
            <button type="button" disabled={isCycleBusy} onClick={async () => { setIsCycleBusy(true); setCycleError(null); try { const row = await addCfcfCycle(workspace.tenantId, selectedFund.fund_id); const savedBills = await listCfcfBills(workspace.tenantId, selectedFund.fund_id); setBills(savedBills); setCycleRows((rows) => [...rows, row].sort((a,b)=>a.cycle_number-b.cycle_number)); setSelectedCycleNumber(row.cycle_number); } catch (e) { setCycleError(e instanceof Error ? e.message : "Unable to add Cycle."); } finally { setIsCycleBusy(false); } }} className="min-h-12 w-full rounded-xl border border-violet-600 bg-violet-700 px-3 text-base font-bold text-white shadow-sm active:bg-violet-800 disabled:opacity-60">{isCycleBusy ? "Working…" : `Add Cycle ${Math.max(0,...cycleRows.map((row)=>row.cycle_number),...billedCycleNumbers())+1}`}</button>
            
            </div>
          </section>

          <section aria-label="Shares section" className="space-y-3">
            <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
              <div className="flex min-w-0 items-center gap-2">
                <h2 className="text-base font-bold text-slate-900">Shares</h2>
                <ChevronDown size={16} className="shrink-0 text-slate-500" aria-hidden="true" />
              </div>
              <div className="flex shrink-0 items-center gap-2 rounded-full bg-sky-50 px-3 py-1.5 text-sky-800">
                <span className="text-xs font-semibold">Total Shares</span>
                <span className="text-base font-bold tabular-nums">{shares.length}</span>
              </div>
            </div>

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
                <div className="mt-3 grid grid-cols-4 gap-1.5">
                  {shareFilterOptions.map((option) => <button key={option.id} type="button" aria-pressed={shareFilter === option.id} onClick={() => setShareFilter(option.id)} className={["min-h-10 min-w-0 whitespace-nowrap rounded-xl border px-1 text-[10px] font-semibold leading-tight sm:px-2 sm:text-xs",shareFilter===option.id?"border-slate-900 bg-slate-900 text-white":"border-slate-200 bg-white text-slate-600"].join(" ")}>{option.label} ({option.count})</button>)}
                </div>
              </section>
              {isLoadingDetails ? <LoadingCard message="Loading Shares…" /> : detailsError ? <ErrorCard message={detailsError} onRetry={() => setDetailReloadKey((n) => n + 1)} /> : filteredShares.length === 0 ? (
                <EmptyState icon={<UsersRound size={22} />} title={shares.length ? "No matching Shares" : "No Shares in this Fund yet"} description={shares.length ? "Clear the search or change the status filter." : "Add a Share by selecting an existing Contact in this Fund."} action={!shares.length ? <button type="button" onClick={openShareModal} className="min-h-11 rounded-xl bg-sky-600 px-4 text-sm font-semibold text-white"><Plus size={16} className="mr-1 inline" /> Add Share</button> : undefined} />
              ) : filteredShares.map((share) => {
                const contact = contactById.get(share.contact_id);
                // Current Cycle and bill amount are selected from database-returned Fund/Bill rows; no financial totals are computed here.
                const currentCycleBill = billForShareCycle(share.share_id, selectedFund.current_cycle);
                return <article key={share.share_id} className="min-w-0 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
                  <div className="flex min-w-0 items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <h3 className="break-words text-base font-semibold leading-tight text-slate-900">{contact?.name ?? "Contact unavailable"}</h3>
                      <p className="mt-1 text-xs text-slate-500">Share ID: <span className="font-mono">{share.share_id}</span></p>
                      <p className="mt-0.5 break-all text-xs text-slate-500">{contact?.phone ?? "No phone saved"}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {share.total_pending > 0 && <span aria-hidden="true" className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-600 motion-reduce:animate-none" />}
                        <span className="text-xs font-medium text-slate-500">Pending</span>
                      </div>
                      <p className={["mt-0.5 text-[1.1rem] font-bold tabular-nums",share.total_pending > 0?"text-red-600":"text-slate-700"].join(" ")}>{formatINR(share.total_pending)}</p>
                      <span className={["mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-semibold",share.payout_status==="drawn"?"bg-emerald-50 text-emerald-800":"bg-amber-50 text-amber-800"].join(" ")}>{share.payout_status==="drawn"?"Drawn":"Undrawn"}</span>
                    </div>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-x-2 gap-y-1.5 rounded-xl bg-slate-50 p-2">
                    <StoredValue label={"Current Cycle (" + selectedFund.current_cycle + ") Billing"} value={currentCycleBill === undefined ? "—" : displayStoredAmount(currentCycleBill.amount)}/>
                    <StoredValue label="Total Billed" value={formatINR(share.share_total_billed_amount)}/>
                    <StoredValue label="Total Paid" value={formatINR(share.share_net_payment_received)}/>
                    <StoredValue label="Advance Amount" value={formatINR(share.total_advance)}/>
                    {share.payout_status === "drawn" && <StoredValue label={"Withdrawn · Cycle " + (share.payout_cycle_number ?? "—")} value={formatINR(share.withdrawn_amount)}/>}
                  </div>
                  <div className="mt-2 flex gap-1">
                    <div className="grid min-w-0 flex-[65] grid-cols-2 gap-1">
                      <button type="button" onClick={() => openPayoutModal(share)} disabled={billedCycleNumbers().length === 0} className="inline-flex min-h-9 min-w-0 items-center justify-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-1.5 text-xs font-semibold text-amber-800 disabled:cursor-not-allowed disabled:opacity-50"><WalletCards size={14} className="shrink-0"/> Payout</button>
                      <button type="button" onClick={() => openCycleBilling(share)} className="inline-flex min-h-9 min-w-0 items-center justify-center gap-1 rounded-lg border border-violet-200 bg-violet-50 px-1.5 text-xs font-semibold text-violet-800"><CalendarDays size={14} className="shrink-0"/> Bills</button>
                    </div>
                    <button type="button" onClick={() => openPaymentModal(share)} className="inline-flex min-h-9 min-w-0 flex-[35] items-center justify-center gap-1 rounded-lg bg-emerald-800 px-1.5 text-xs font-semibold text-white"><CreditCard size={14} className="shrink-0"/> Record Payment</button>
                  </div>
                  <div className="mt-1 flex gap-1">
                    <button type="button" onClick={() => void openShareStatement(share)} className="inline-flex min-h-8 min-w-0 flex-1 items-center justify-center gap-1 rounded-lg border border-sky-200 bg-sky-50 px-1.5 text-xs font-semibold text-sky-800"><FileText size={14}/> Statement &amp; Ledger</button>
                    <button type="button" aria-label={"Delete Share " + share.share_id} title="Delete Share and its related bills/payments" onClick={() => void openShareDelete(share)} className="inline-flex min-h-8 w-9 shrink-0 items-center justify-center rounded-lg border border-rose-300 bg-rose-50 text-rose-700 hover:bg-rose-100"><Trash2 size={14}/></button>
                    <button type="button" onClick={() => openShareWhatsApp(share,"report")} className="inline-flex min-h-8 min-w-0 flex-1 items-center justify-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-1.5 text-xs font-semibold text-emerald-800"><MessageCircle size={13}/> Report</button>
                    <button type="button" onClick={() => openShareWhatsApp(share,"reminder")} disabled={share.total_pending <= 0} title={share.total_pending <= 0 ? "No outstanding amount" : "Open WhatsApp reminder"} className="inline-flex min-h-8 min-w-0 flex-1 items-center justify-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-1.5 text-xs font-semibold text-emerald-800 disabled:cursor-not-allowed disabled:opacity-40"><MessageCircle size={13}/> Reminder</button>
                  </div>
                </article>;
              })}
            </section>
          </section>

          {true && (
            <section id="cfcf-shares" className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-base font-semibold text-slate-900">Fund Ledger</h2>
                  <p className="text-sm text-slate-500">Share Payments and Fund adjustments are separate records.</p>
                </div>
              </div>
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
                      {item.kind === "payment" && item.shareId && (
                        <p className="mt-2 break-words text-xs font-medium text-sky-800">
                          Share {item.shareId}{(() => { const row = shares.find((share) => share.share_id === item.shareId); const contact = row ? contactById.get(row.contact_id) : undefined; return contact?.name ? " · " + contact.name : ""; })()}
                        </p>
                      )}
                      {item.remarks && <p className="mt-2 break-words text-sm leading-5 text-slate-600">{item.remarks}</p>}
                      <p className="mt-2 break-all text-[11px] text-slate-400">Entry ID · {item.id}</p>
                    </div>
                  </article>
                ))
              )}
            </section>
          )}
          <section className="mt-5 rounded-2xl border-2 border-rose-200 bg-rose-50/60 p-4">
            <p className="text-xs font-bold uppercase tracking-wider text-rose-800">Danger Zone</p>
            <h3 className="mt-1 text-base font-semibold text-slate-900">Permanent deletion</h3>
            <p className="mt-1 text-sm leading-5 text-slate-600">Only empty records can be deleted. Every request requires three confirmations and the database blocks records with financial history.</p>
            <button type="button" onClick={() => { if (!selectedFund) return; setDeleteStep(1); setDeleteAcknowledged(false); setDeleteTypedId(""); setDeleteError(null); setDeleteTarget({ kind: "fund", id: selectedFund.fund_id, label: selectedFund.fund_name }); }} disabled={!selectedFund} className="mt-3 min-h-11 w-full rounded-xl border border-rose-300 bg-white px-3 text-sm font-semibold text-rose-800 disabled:opacity-40">Delete selected Fund · {selectedFund.fund_name}</button>

          </section>
        </>
      ) : null}

      <Modal isOpen={plannedPayoutCycle !== null} title={plannedPayoutCycle === null ? "Planned Payout" : "Cycle " + plannedPayoutCycle + " Planned Payout"} description="Planned amount only; this does not record an actual withdrawal or shareholder payment." onClose={() => { if (!isCycleBusy) { setPlannedPayoutCycle(null); setPlannedPayoutReview(false); setPlannedPayoutError(null); } }}>
        <form id="planned-payout-form" onSubmit={async (event) => {
          event.preventDefault();
          if (!selectedFund || plannedPayoutCycle === null || isCycleBusy) return;
          const amount = plannedPayoutInput.trim() === "" ? null : Number(plannedPayoutInput);
          if (amount === null || !Number.isSafeInteger(amount) || amount < 0 || amount > 2147483647) { setPlannedPayoutError("Enter a whole-rupee amount of zero or more."); return; }
          if (!plannedPayoutReview) { setPlannedPayoutReview(true); setPlannedPayoutError(null); return; }
          if (!beginAction("planned-payout")) return;
          setIsCycleBusy(true); setPlannedPayoutError(null);
          try {
            const updated = await setCfcfCyclePlannedPayout(workspace.tenantId, selectedFund.fund_id, plannedPayoutCycle, amount);
            setCycleRows((rows) => rows.map((row) => row.cycle_number === plannedPayoutCycle ? { ...row, planned_payout_amount: updated.planned_payout_amount } : row));
            setPlannedPayoutCycle(null); setPlannedPayoutReview(false); showDatabaseResult("Planned payout saved. No payment or withdrawal was recorded."); setDetailReloadKey((v) => v + 1);
          } catch (error) { setPlannedPayoutError(error instanceof Error ? error.message : "Unable to save planned payout."); showDatabaseResult(error instanceof Error ? error.message : "Unable to save planned payout.", "error"); }
          finally { endAction("planned-payout"); setIsCycleBusy(false); }
        }} className="space-y-4">

          <label htmlFor="planned-payout-amount" className="block text-sm font-medium text-slate-700">Planned payout (₹)<input id="planned-payout-amount" type="number" inputMode="numeric" min="0" max="2147483647" step="1" required value={plannedPayoutInput} onChange={(event) => setPlannedPayoutInput(event.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-slate-200 px-3 text-sm"/></label>
          {plannedPayoutError && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{plannedPayoutError}</p>}
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-3"><button type="button" onClick={() => setPlannedPayoutCycle(null)} disabled={isCycleBusy} className="min-h-11 rounded-xl border border-slate-200 px-4 text-sm">Cancel</button><button type="submit" disabled={isCycleBusy} className="min-h-11 rounded-xl bg-violet-700 px-4 text-sm font-semibold text-white disabled:opacity-50">{isCycleBusy ? <><RefreshCw size={16} className="animate-spin" /> Waiting for Supabase…</> : plannedPayoutReview ? "Confirm planned payout" : "Review planned payout"}</button></div>
        </form>
      </Modal>

      <Modal isOpen={isCycleStatementOpen} title={"Cycle " + (selectedCycleNumber ?? cycleRows.at(-1)?.cycle_number ?? "") + " Statement"} description="Cycle billing and payout summary. Shareholder payments are excluded from this Cycle statement." onClose={() => setIsCycleStatementOpen(false)}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            <StoredValue label="Total billed" value={cycleSummary ? formatINR(cycleSummary.total_billed) : "Loading…"} />
            <StoredValue label="Planned payout" value={displayStoredAmount(cycleSummary?.planned_payout_amount)} />
            <StoredValue label="Billed Shares" value={cycleSummary ? cycleSummary.billed_shares : "Loading…"} />
            <StoredValue label="Not billed Shares" value={cycleSummary ? cycleSummary.not_billed_shares : "Loading…"} />
            <StoredValue label="Total withdrawn" value={cycleSummary ? formatINR(cycleSummary.total_paid_out) : "Loading…"} />
            <StoredValue label="Cycle created" value={cycleRows.find((row) => row.cycle_number === (selectedCycleNumber ?? cycleRows.at(-1)?.cycle_number))?.created_at ? formatDate(cycleRows.find((row) => row.cycle_number === (selectedCycleNumber ?? cycleRows.at(-1)?.cycle_number))!.created_at) : "Date unavailable"} />
          </div>
          <section className="space-y-2"><h4 className="text-sm font-bold text-slate-900">Withdrawn Shares</h4>
            {cycleSummary?.withdrawn_shares.length ? cycleSummary.withdrawn_shares.map((item) => <div key={item.share_id} className="flex min-w-0 items-start justify-between gap-3 rounded-xl border border-slate-200 p-3"><div className="min-w-0"><p className="break-words text-sm font-semibold text-slate-900">{item.contact_name || "Contact unavailable"}</p><p className="text-xs text-slate-500">Share {item.share_id}</p></div><strong className="shrink-0 text-sm text-slate-900">{formatINR(item.withdrawn_amount)}</strong></div>) : <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-500">{cycleSummary ? "No Shares have been withdrawn against this Cycle." : "Loading withdrawal details…"}</p>}
          </section>
          <p className="rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-600">Actual withdrawals are Share payout records linked to this Cycle. Shareholder payments received remain in the separate Payments ledger.</p>
          <div className="flex justify-end border-t border-slate-100 pt-3"><button type="button" onClick={() => setIsCycleStatementOpen(false)} className="min-h-11 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white">Close statement</button></div>
        </div>
      </Modal>

      <Modal
        isOpen={cycleDeleteTarget !== null}
        title={cycleDeleteTarget === null ? "Delete Cycle" : "Delete Cycle " + cycleDeleteTarget}
        description="Review the financial data that will be removed and withdrawals that will be reset before confirming."
        onClose={() => { if (!isCycleBusy) { setCycleDeleteTarget(null); setCycleDeleteError(null); } }}
      >
        {cycleDeleteTarget !== null && (
          <div className="space-y-4">
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-3">
              <p className="font-semibold text-rose-900">This operation cannot be undone.</p>
              <p className="mt-1 text-sm leading-5 text-rose-800">Cycle {cycleDeleteTarget} bills, its planned payout and commission will be deleted. Every Share currently marked Drawn against this Cycle will become Undrawn and its stored withdrawn amount will be reset to zero. Shareholder payments and Fund payment history will remain untouched.</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <StoredValue label="Cycle billing to remove" value={cycleSummary ? formatINR(cycleSummary.total_billed) : "Loading…"} />
              <StoredValue label="Planned payout to remove" value={displayStoredAmount(cycleSummary?.planned_payout_amount)} />
              <StoredValue label="Commission to remove" value={displayStoredAmount(cycleSummary?.commission_amount)} />
              <StoredValue label="Withdrawals to reset" value={cycleSummary ? String(cycleSummary.withdrawn_shares.length) : "Loading…"} />
            </div>
            <section className="space-y-2">
              <h4 className="text-sm font-semibold text-slate-900">Shares that will be set to Undrawn</h4>
              {cycleSummary?.withdrawn_shares.length ? cycleSummary.withdrawn_shares.map((item) => (
                <div key={item.share_id} className="flex items-start justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
                  <div className="min-w-0"><p className="break-words text-sm font-semibold text-slate-900">{item.contact_name || "Contact unavailable"}</p><p className="text-xs text-slate-600">Share {item.share_id}</p><p className="text-xs font-semibold text-amber-800">Drawn · Cycle {cycleDeleteTarget} → Undrawn</p></div>
                  <strong className="shrink-0 text-sm text-slate-900">{formatINR(item.withdrawn_amount)}</strong>
                </div>
              )) : cycleSummary ? <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600">No Shares are currently drawn against this Cycle.</p> : <p className="text-sm text-slate-500">Loading withdrawal details…</p>}
            </section>
            {cycleDeleteError && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{cycleDeleteError}</p>}
            <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
              <button type="button" onClick={() => setCycleDeleteTarget(null)} disabled={isCycleBusy} className="min-h-11 rounded-xl border border-slate-200 px-4 text-sm">Cancel</button>
              <button type="button" onClick={() => void handleConfirmDeleteCycle()} disabled={isCycleBusy || !cycleSummary} className="min-h-11 rounded-xl bg-rose-700 px-4 text-sm font-semibold text-white disabled:opacity-50">{isCycleBusy ? "Deleting…" : "Confirm and delete Cycle"}</button>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        isOpen={cycleEditNumber !== null}
        title={"Edit Cycle " + cycleEditNumber}
        description="Review every saved Share bill for this Cycle. Choose Edit to change bill amounts. Blank amounts are saved as ₹0; billing never creates payment transactions."
        onClose={() => { if (!isSavingCycle) { setCycleEditNumber(null); setCycleEditError(null); } }}
      >
        <form id="cycle-values-form" onSubmit={(event) => void handleSaveCycleValues(event)} className="space-y-4">

          <div className="flex items-center justify-between gap-2 rounded-xl bg-violet-50 p-3"><div className="text-sm font-semibold text-violet-900">Cycle {cycleEditNumber ?? ""} · {shares.filter((share) => share.status === "active").length} active Shares</div><button type="button" onClick={() => setCycleEditEnabled((value) => !value)} disabled={cycleReview || isSavingCycle} className="min-h-9 rounded-lg border border-violet-200 bg-white px-3 text-xs font-semibold text-violet-800">{cycleEditEnabled ? "Review" : "Edit"}</button></div>
          <div className="grid grid-cols-2 gap-2">
            <div><label htmlFor="cycle-edit-payout" className="mb-1.5 block text-xs font-semibold text-slate-700">Planned payout (₹)</label><input id="cycle-edit-payout" type="number" min="0" max="2147483647" step="1" value={cyclePayoutInput} onChange={(event) => setCyclePayoutInput(event.target.value)} disabled={!cycleEditEnabled || cycleReview || isSavingCycle} placeholder="Not set" className="min-h-11 w-full rounded-xl border border-slate-200 px-3 text-sm disabled:bg-slate-50 disabled:text-slate-500" /></div>
            <div><label htmlFor="cycle-edit-commission" className="mb-1.5 block text-xs font-semibold text-slate-700">Commission (₹)</label><input id="cycle-edit-commission" type="number" min="0" max="2147483647" step="1" value={cycleCommissionInput} onChange={(event) => setCycleCommissionInput(event.target.value)} disabled={!cycleEditEnabled} placeholder="Not set" className="min-h-11 w-full rounded-xl border border-slate-200 px-3 text-sm disabled:bg-slate-50 disabled:text-slate-500" /></div>
          </div>
          {(["withdrawn", "undrawn"] as const).map((section) => {
            const group = shares.filter((share) => share.status === "active" && (share.payout_status === "drawn" ? "withdrawn" : "undrawn") === section);
            return <section key={section} className="space-y-2">
              <h4 className="text-sm font-bold text-slate-800">{section === "withdrawn" ? "Withdrawn Shares" : "Undrawn Shares"} <span className="font-normal text-slate-500">({group.length})</span></h4>
              {group.length === 0 ? <p className="rounded-lg bg-slate-50 p-3 text-xs text-slate-500">No {section} Shares.</p> : group.map((share) => {
                const contact = contactById.get(share.contact_id);
                return <div key={share.share_id} className="grid grid-cols-[minmax(0,1fr)_112px] items-center gap-2 rounded-xl border border-slate-200 p-2.5">
                  <div className="min-w-0"><p className="break-words text-sm font-semibold text-slate-900">{contact?.name || "Contact unavailable"}</p><p className="text-xs text-slate-500">Share {share.share_id}{share.payout_status === "drawn" ? " · Drawn in Cycle " + (share.payout_cycle_number ?? "unknown") : " · Undrawn"}</p></div>
                  <div><label htmlFor={"cycle-bill-" + share.share_id} className="mb-1 block text-[11px] text-slate-500">Bill (₹)</label><input id={"cycle-bill-" + share.share_id} type="number" inputMode="numeric" min="0" max="2147483647" step="1" value={cycleBillInputs[share.share_id] ?? "0"} onChange={(event) => setCycleBillInputs((current) => ({ ...current, [share.share_id]: event.target.value }))} disabled={!cycleEditEnabled || cycleReview || isSavingCycle} placeholder="0" className="min-h-10 w-full rounded-lg border border-slate-200 px-2 text-sm disabled:bg-slate-50 disabled:text-slate-600" /></div>
                </div>;
              })}
            </section>;
          })}
          {cycleEditError && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{cycleEditError}</div>}
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
            <button type="button" onClick={() => setCycleEditNumber(null)} disabled={isSavingCycle} className="min-h-11 rounded-xl border border-slate-200 px-4 text-sm">Close</button>
            {cycleEditEnabled && <button type="submit" disabled={isSavingCycle || cycleReview} className="min-h-11 rounded-xl bg-sky-600 px-4 text-sm font-semibold text-white disabled:opacity-50">{isSavingCycle ? <><RefreshCw size={16} className="animate-spin" /> Waiting for Supabase…</> : cycleReview ? "Confirm and save Cycle" : "Review Cycle changes"}</button>}
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={Boolean(payoutShare)}
        title="Update Share payout"
        description="Select the Cycle and review its stored payout amount. This changes payout status only; record actual money separately under Payments. Mark Undrawn resets payout fields without deleting Payment history."
        onClose={() => { if (!isSavingPayout) { setPayoutShare(null); setPayoutError(null); } }}
      >
        <form id="share-payout-form" onSubmit={(event) => void handleSavePayout(event)} className="space-y-4">

          <div className={payoutReview ? "pointer-events-none opacity-60" : ""}>
            <label htmlFor="payout-cycle-number" className="mb-1.5 block text-sm font-medium text-slate-700">Payout Cycle</label>
            <select id="payout-cycle-number" value={payoutCycleNumber} onChange={(event) => {
              setPayoutCycleNumber(event.target.value);
              const savedPayout = cycleRows.find((row) => row.cycle_number === Number(event.target.value))?.planned_payout_amount;
              setWithdrawnAmount(typeof savedPayout === "number" ? String(savedPayout) : "");
            }} required disabled={savedCycleNumbers().length === 0} className="min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm disabled:bg-slate-100">
              {savedCycleNumbers().length === 0
                ? <option value="">No saved Cycles available</option>
                : savedCycleNumbers().map((cycle) => <option key={cycle} value={String(cycle)}>Cycle {cycle}</option>)}
            </select>
            {savedCycleNumbers().length === 0 && (
              <p className="mt-1.5 text-sm text-amber-700">Add a Cycle before recording a payout status.</p>
            )}
            {payoutShare?.payout_status === "drawn" && payoutShare.payout_cycle_number !== null && !savedCycleNumbers().includes(payoutShare.payout_cycle_number) && (
              <p className="mt-1.5 text-sm text-amber-700">Its previous payout Cycle is no longer saved. You can mark this Share Undrawn or choose an existing Cycle.</p>
            )}
          </div>
          <div className={"rounded-xl bg-slate-50 p-3 " + (payoutReview ? "opacity-60" : "")}>
            <p className="text-xs font-medium text-slate-500">Payout amount stored on Cycle {payoutCycleNumber}</p>
            <p className="mt-1 text-lg font-semibold text-slate-900">{displayStoredAmount(cycleRows.find((row) => row.cycle_number === Number(payoutCycleNumber))?.planned_payout_amount)}</p>
          </div>
          <div className={payoutReview ? "pointer-events-none opacity-60" : ""}>
            <label htmlFor="payout-withdrawn-amount" className="mb-1.5 block text-sm font-medium text-slate-700">Withdrawn amount (₹)</label>
            <input id="payout-withdrawn-amount" type="number" min="0" max="2147483647" step="1" required value={withdrawnAmount} onChange={(event) => setWithdrawnAmount(event.target.value)} className="min-h-11 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
            <p className="mt-1.5 text-xs text-slate-500">Prefilled from the Cycle payout amount, but editable to record the actual stored withdrawn amount.</p>
          </div>
          {payoutError && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-800">{payoutError}</div>}
          <div className="flex flex-wrap justify-between gap-2 border-t border-slate-100 pt-4">
            {payoutShare?.payout_status === "drawn" ? (
              <button type="button" onClick={() => void handleMarkUndrawn()} disabled={isSavingPayout} className="min-h-11 rounded-xl border border-rose-200 bg-rose-50 px-3 text-sm font-semibold text-rose-800 disabled:opacity-50">{isSavingPayout ? <><RefreshCw size={16} className="animate-spin" /> Waiting for Supabase…</> : undrawnReview ? "Confirm Undrawn" : "Review Undrawn"}</button>
            ) : <span />}
            <div className="flex gap-2">
              <button type="button" onClick={() => setPayoutShare(null)} disabled={isSavingPayout} className="min-h-11 rounded-xl border border-slate-200 px-4 text-sm">Cancel</button>
              <button type="submit" disabled={isSavingPayout || savedCycleNumbers().length === 0} className="min-h-11 rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white disabled:opacity-50">{isSavingPayout ? <><RefreshCw size={16} className="animate-spin" /> Waiting for Supabase…</> : payoutReview ? "Confirm and save payout" : "Review payout"}</button>
            </div>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={Boolean(billingShare)}
        title="Share bill · Existing Cycle"
        description={billingShare ? "Review this Share’s saved bill for an existing Cycle. Choose Edit to change it. This never creates a Cycle or a payment transaction." : "Review a saved Share bill."}
        onClose={() => { if (!isSavingBilling) { setBillingShare(null); setBillingError(null); } }}
      >
        <form id="share-cycle-billing-form" onSubmit={(event) => void handleSaveCycleBilling(event)} className="space-y-4">

          <section className="space-y-2 rounded-xl border border-slate-200 p-3">
            <h4 className="text-xs font-bold uppercase tracking-wide text-slate-500">Saved bills for this Share</h4>
            {savedCycleNumbers().length === 0 ? <p className="text-sm text-slate-500">No saved Cycles yet.</p> : savedCycleNumbers().map((cycle) => {
              const savedBill = billingShare ? billForShareCycle(billingShare.share_id, cycle) : undefined;
              return <button key={cycle} type="button" onClick={() => { if (!billingEditEnabled) { setBillingCycleNumber(String(cycle)); setBillingAmount(String(savedBill?.amount ?? 0)); } }} className={`flex min-h-10 w-full items-center justify-between gap-3 rounded-lg px-2 text-left text-sm ${Number(billingCycleNumber) === cycle ? "bg-sky-50 text-sky-800" : "bg-slate-50 text-slate-700"}`}>
                <span>Cycle {cycle}</span><span className="font-semibold tabular-nums">₹{savedBill?.amount ?? 0}{savedBill ? "" : " · default"}</span>
              </button>;
            })}
          </section>
          <div className={billingReview ? "pointer-events-none opacity-60" : ""}>
            <label htmlFor="cycle-billing-cycle" className="mb-1.5 block text-sm font-medium text-slate-700">Cycle</label>
            <select id="cycle-billing-cycle" value={billingCycleNumber} onChange={(event) => { setBillingCycleNumber(event.target.value); const saved = billForShareCycle(billingShare?.share_id ?? "", Number(event.target.value)); setBillingAmount(saved ? String(saved.amount) : "0"); setBillingEditEnabled(false); }} required disabled={savedCycleNumbers().length === 0 || billingEditEnabled} className="min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-100 disabled:bg-slate-100">
              {savedCycleNumbers().length === 0 ? <option value="">Add a Cycle first</option> : savedCycleNumbers().map((cycle) => <option key={cycle} value={String(cycle)}>Cycle {cycle}</option>)}
            </select>
            <p className="mt-1 text-xs text-slate-500">One current bill per Share per saved Cycle. Selecting an existing Cycle loads its current bill for editing.</p>
          </div>
          <div className={billingReview ? "pointer-events-none opacity-60" : ""}>
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
              disabled={!billingEditEnabled}
              placeholder="0"
              className="min-h-11 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-100 disabled:bg-slate-50 disabled:text-slate-600"
            />
            <p className="mt-1.5 text-xs leading-5 text-slate-500">₹0 is a saved bill amount. Changing a bill does not create a credit, debit, payment, or withdrawal.</p>
          </div>
          {billingError && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm leading-5 text-rose-800">{billingError}</div>}
          <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
            <button type="button" onClick={() => setBillingShare(null)} disabled={isSavingBilling} className="min-h-11 rounded-xl border border-slate-200 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">Close</button>
            {!billingEditEnabled ? <button type="button" disabled={savedCycleNumbers().length === 0} onClick={() => { setBillingEditEnabled(true); setBillingError(null); }} className="min-h-11 rounded-xl bg-sky-600 px-4 text-sm font-semibold text-white disabled:opacity-50">Edit bill</button> : <button type="submit" disabled={isSavingBilling || savedCycleNumbers().length === 0 || !billingAmount.trim() || !Number.isSafeInteger(Number(billingAmount)) || Number(billingAmount) < 0 || Number(billingAmount) > 2147483647} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-sky-600 px-4 text-sm font-semibold text-white hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"><CalendarDays size={16} /> {isSavingBilling ? <><RefreshCw size={16} className="animate-spin" /> Waiting for Supabase…</> : billingReview ? "Confirm and save bill" : "Review bill"}</button>}
          </div>
        </form>
      </Modal>


      <Modal isOpen={isShareModalOpen} title="Add Share to Fund" description={selectedFund ? `Fund: ${selectedFund.fund_name}. Select an existing Contact.` : "Select a Contact for this Fund."} onClose={() => { if (!isSavingShare) setIsShareModalOpen(false); }}>
        <form onSubmit={(event) => void handleCreateShare(event)} className="space-y-4">
          <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">Fund</p><p className="font-semibold">{selectedFund?.fund_name ?? "No Fund selected"}</p></div>
          <label className="block"><span className="mb-1.5 block text-sm font-medium">Contact</span><select required value={newShareContactId} onChange={(event) => setNewShareContactId(event.target.value)} className="min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm"><option value="">Choose Contact</option>{contacts.map((contact) => <option key={contact.contact_id} value={contact.contact_id}>{contact.name} · {contact.phone}</option>)}</select></label>
          {!contacts.length && <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">No Contacts are available. Add a Contact first.</p>}
          {shareFormError && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800">{shareFormError}</p>}
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4"><button type="button" onClick={() => setIsShareModalOpen(false)} disabled={isSavingShare} className="min-h-11 rounded-xl border border-slate-200 px-4 text-sm">Cancel</button><button type="submit" disabled={isSavingShare || !selectedFund || !newShareContactId || !contacts.length} className="min-h-11 rounded-xl bg-sky-600 px-4 text-sm font-semibold text-white disabled:opacity-50">{isSavingShare ? <><RefreshCw size={16} className="animate-spin" /> Waiting for Supabase…</> : "Add Share"}</button></div>
        </form>
      </Modal>

      <Modal isOpen={Boolean(paymentShare)} title="Record Payment / Correction" description="Actual transactions are stored separately from payout status. Saving updates the transaction and Share/Fund summaries atomically." onClose={() => { if (!isSavingPayment) { setPaymentShare(null); setPaymentReview(false); paymentRequestRef.current = null; } }}>
        <form id="share-payment-entry-form" onSubmit={(event) => void handleRecordPayment(event)} className="space-y-4">
          <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">Manager ID: {workspace.tenantId}</p><p className="mt-1 text-xs text-slate-500">Fund: {selectedFund?.fund_name}</p><p className="mt-1 text-xs text-slate-500">Share ID: {paymentShare?.share_id}</p><p className="mt-2 font-semibold">{contactById.get(paymentShare?.contact_id ?? "")?.name ?? "Member"}</p><p className="mt-1 text-sm text-slate-500">Current billed: {paymentShare ? formatINR(currentBilledForShare(paymentShare)) : "—"}</p></div>
          <div><span className="mb-1.5 block text-sm font-medium">Record type</span><div className="grid grid-cols-2 gap-2"><button type="button" aria-pressed={paymentEntryType==="credit"} onClick={() => setPaymentEntryType("credit")} className={["min-h-11 rounded-xl px-2 text-sm font-semibold",paymentEntryType==="credit"?"bg-emerald-600 text-white":"bg-slate-100 text-slate-700"].join(" ")}>Credit (Payment)</button><button type="button" aria-pressed={paymentEntryType==="debit"} onClick={() => setPaymentEntryType("debit")} className={["min-h-11 rounded-xl px-2 text-sm font-semibold",paymentEntryType==="debit"?"bg-rose-600 text-white":"bg-slate-100 text-slate-700"].join(" ")}>Debit (Correction)</button></div></div>
          <label className="block"><span className="mb-1.5 block text-sm font-medium">Amount (₹)</span><input type="number" min="1" max="2147483647" step="1" required value={paymentAmount} onChange={(event) => setPaymentAmount(event.target.value)} className="min-h-11 w-full rounded-xl border border-slate-200 px-3 text-sm" placeholder="Enter amount"/></label>
          <label className="block"><span className="mb-1.5 block text-sm font-medium">Payment / Adjustment mode</span><select value={paymentMode} onChange={(event) => setPaymentMode(event.target.value as "UPI"|"Cash"|"Other")} className="min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm"><option value="UPI">UPI / Google Pay / PhonePe</option><option value="Cash">Cash</option><option value="Other">Other</option></select></label>
          <label className="block"><span className="mb-1.5 block text-sm font-medium">Remarks (optional)</span><textarea rows={2} value={paymentRemarks} onChange={(event) => setPaymentRemarks(event.target.value)} maxLength={500} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" placeholder="Reference or correction reason"/></label>
          {paymentError && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800">{paymentError}</p>}
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4"><button type="button" onClick={() => { setPaymentShare(null); setPaymentReview(false); paymentRequestRef.current = null; }} disabled={isSavingPayment} className="min-h-11 rounded-xl border border-slate-200 px-4 text-sm">Cancel</button><button type="submit" disabled={isSavingPayment || !paymentShare || !selectedFund || !paymentAmount.trim() || !Number.isSafeInteger(Number(paymentAmount)) || Number(paymentAmount) <= 0 || Number(paymentAmount) > 2147483647} className="min-h-11 rounded-xl bg-sky-600 px-4 text-sm font-semibold text-white">{isSavingPayment ? <><RefreshCw size={16} className="animate-spin" /> Waiting for Supabase…</> : paymentReview ? "Confirm and record" : paymentEntryType==="credit" ? "Review payment" : "Review correction"}</button></div>
        </form>
      </Modal>

      <Modal isOpen={paymentReview && Boolean(paymentShare)} title="Confirm payment entry" description="Please verify this entry before it is recorded." onClose={() => { if (!isSavingPayment) { setPaymentReview(false); paymentRequestRef.current = null; } }}>
        <div className="space-y-3">
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <p className="font-semibold">{paymentEntryType === "credit" ? "Credit payment" : "Debit correction"}</p>
            <p className="mt-1">{contactById.get(paymentShare?.contact_id ?? "")?.name ?? "Contact"} · Fund {selectedFund?.fund_name} · Share {paymentShare?.share_id}</p>
            <p className="mt-1 text-lg font-semibold">{formatINR(Number(paymentAmount))} · {paymentMode}</p>
            <p className="mt-1 text-xs">No Cycle or payout association.</p>
          </div>
          {paymentRemarks.trim() && <p className="text-sm text-slate-600">Remarks: {paymentRemarks.trim()}</p>}
          {paymentError && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800">{paymentError}</p>}
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
            <button type="button" onClick={() => { setPaymentReview(false); paymentRequestRef.current = null; }} disabled={isSavingPayment} className="min-h-11 rounded-xl border border-slate-200 px-4 text-sm">Cancel</button>
            <button type="submit" form="share-payment-entry-form" disabled={isSavingPayment} className="min-h-11 rounded-xl bg-sky-600 px-4 text-sm font-semibold text-white disabled:opacity-50">{isSavingPayment ? <><RefreshCw size={16} className="animate-spin" /> Waiting for Supabase…</> : "Confirm and record"}</button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={plannedPayoutReview && plannedPayoutCycle !== null} title="" onClose={() => { if (!isCycleBusy) setPlannedPayoutReview(false); }}>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={() => setPlannedPayoutReview(false)} disabled={isCycleBusy} className="min-h-11 rounded-xl border border-slate-200 px-4 text-sm disabled:opacity-50">Cancel</button>
          <button type="submit" form="planned-payout-form" disabled={isCycleBusy} className="min-h-11 rounded-xl bg-sky-600 px-4 text-sm font-semibold text-white disabled:opacity-50">{isCycleBusy ? "Saving…" : "Confirm"}</button>
        </div>
      </Modal>

      <Modal isOpen={cycleReview && cycleEditNumber !== null} title="" onClose={() => { if (!isSavingCycle) setCycleReview(false); }}>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={() => setCycleReview(false)} disabled={isSavingCycle} className="min-h-11 rounded-xl border border-slate-200 px-4 text-sm disabled:opacity-50">Cancel</button>
          <button type="submit" form="cycle-values-form" disabled={isSavingCycle} className="min-h-11 rounded-xl bg-sky-600 px-4 text-sm font-semibold text-white disabled:opacity-50">{isSavingCycle ? "Saving…" : "Confirm"}</button>
        </div>
      </Modal>

      <Modal isOpen={payoutReview && Boolean(payoutShare)} title="" onClose={() => { if (!isSavingPayout) setPayoutReview(false); }}>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={() => setPayoutReview(false)} disabled={isSavingPayout} className="min-h-11 rounded-xl border border-slate-200 px-4 text-sm disabled:opacity-50">Cancel</button>
          <button type="submit" form="share-payout-form" disabled={isSavingPayout} className="min-h-11 rounded-xl bg-sky-600 px-4 text-sm font-semibold text-white disabled:opacity-50">{isSavingPayout ? "Saving…" : "Confirm"}</button>
        </div>
      </Modal>

      <Modal isOpen={undrawnReview && Boolean(payoutShare)} title="" onClose={() => { if (!isSavingPayout) setUndrawnReview(false); }}>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={() => setUndrawnReview(false)} disabled={isSavingPayout} className="min-h-11 rounded-xl border border-slate-200 px-4 text-sm disabled:opacity-50">Cancel</button>
          <button type="button" onClick={() => void handleMarkUndrawn()} disabled={isSavingPayout} className="min-h-11 rounded-xl bg-rose-600 px-4 text-sm font-semibold text-white disabled:opacity-50">{isSavingPayout ? "Saving…" : "Confirm"}</button>
        </div>
      </Modal>

      <Modal isOpen={billingReview && Boolean(billingShare)} title="" onClose={() => { if (!isSavingBilling) setBillingReview(false); }}>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={() => setBillingReview(false)} disabled={isSavingBilling} className="min-h-11 rounded-xl border border-slate-200 px-4 text-sm disabled:opacity-50">Cancel</button>
          <button type="submit" form="share-cycle-billing-form" disabled={isSavingBilling} className="min-h-11 rounded-xl bg-sky-600 px-4 text-sm font-semibold text-white disabled:opacity-50">{isSavingBilling ? "Saving…" : "Confirm"}</button>
        </div>
      </Modal>

      <Modal isOpen={isFundEntryModalOpen} title="Add Adjustments" description="This amount is not calculated or considered in Fund financials. These are separate Fund Other Adjustments only." onClose={() => { if (!isSavingFundEntry) setIsFundEntryModalOpen(false); }}>
        <form onSubmit={(event) => void handleRecordFundEntry(event)} className="space-y-4">
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3"><p className="text-sm font-semibold text-amber-900">Separate ledger only</p><p className="mt-1 text-xs leading-5 text-amber-800">These entries are not calculated or considered in Fund financials, Cycle totals, Share balances, payments, or payouts.</p></div>
          <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">Fund context</p><p className="font-semibold">{selectedFund?.fund_name ?? "No Fund selected"}</p></div>
          <div><span className="mb-1.5 block text-sm font-medium">Entry type</span><div className="grid grid-cols-2 gap-2">
            <button type="button" aria-pressed={fundEntryType === "credit"} onClick={() => setFundEntryType("credit")} className={["min-h-11 rounded-xl px-2 text-sm font-semibold", fundEntryType === "credit" ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-700"].join(" ")}>Credit (+)</button>
            <button type="button" aria-pressed={fundEntryType === "debit"} onClick={() => setFundEntryType("debit")} className={["min-h-11 rounded-xl px-2 text-sm font-semibold", fundEntryType === "debit" ? "bg-rose-600 text-white" : "bg-slate-100 text-slate-700"].join(" ")}>Debit (−)</button>
          </div></div>
          <label className="block"><span className="mb-1.5 block text-sm font-medium">Adjustment category *</span><select required value={fundEntryCategory} onChange={(event) => setFundEntryCategory(event.target.value as typeof fundEntryCategory)} className="min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm"><option value="">Select category</option><option value="outside_money">Outside money</option><option value="commission">Commission</option><option value="discount">Discount</option><option value="stationery">Stationery</option><option value="others">Others</option></select></label>
          <label className="block"><span className="mb-1.5 block text-sm font-medium">Amount (₹) *</span><input type="number" min="1" max="2147483647" step="1" required value={fundEntryAmount} onChange={(event) => setFundEntryAmount(event.target.value)} className="min-h-11 w-full rounded-xl border border-slate-200 px-3 text-sm" placeholder="Enter amount"/></label>
          <label className="block"><span className="mb-1.5 block text-sm font-medium">Remarks (optional)</span><textarea rows={2} maxLength={500} value={fundEntryRemarks} onChange={(event) => setFundEntryRemarks(event.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" placeholder="Optional note"/></label>
          {fundEntryError && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800">{fundEntryError}</p>}
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4"><button type="button" onClick={() => setIsFundEntryModalOpen(false)} disabled={isSavingFundEntry} className="min-h-11 rounded-xl border border-slate-200 px-4 text-sm">Cancel</button><button type="submit" disabled={isSavingFundEntry || !selectedFund || !fundEntryCategory || !fundEntryAmount.trim() || !Number.isSafeInteger(Number(fundEntryAmount)) || Number(fundEntryAmount) <= 0 || Number(fundEntryAmount) > 2147483647} className="min-h-11 rounded-xl bg-emerald-700 px-4 text-sm font-semibold text-white disabled:opacity-50">{isSavingFundEntry ? <><RefreshCw size={16} className="animate-spin" /> Waiting for Supabase…</> : "Add adjustment"}</button></div>
        </form>
      </Modal>

      <Modal isOpen={Boolean(statementShare)} title="Share Statement" description="Database-backed billing, payout and payment ledger. Refreshes when opened." size="large" onClose={() => { statementRequestId.current += 1; setStatementShare(null); setStatementError(null); setIsLoadingStatement(false); }}>
        {statementShare && (() => {
          const contact = contactById.get(statementShare.contact_id);
          const history = ledgerItems.filter((item) => item.kind === "payment" && item.shareId === statementShare.share_id).sort((a,b) => b.date.localeCompare(a.date));
          const shareBills = bills.filter((bill) => bill.share_id === statementShare.share_id).map((bill) => ({ ...bill, cycle_number: cycleRows.find((row) => row.cycle_id === bill.cycle_id)?.cycle_number ?? null })).filter((bill) => bill.cycle_number !== null).sort((a,b) => (a.cycle_number ?? 0) - (b.cycle_number ?? 0));
          const currentBill = bills.find((bill) => bill.share_id === statementShare.share_id && cycleRows.find((cycle) => cycle.cycle_id === bill.cycle_id)?.cycle_number === (selectedFund?.current_cycle ?? -1));
          return <div data-cfcf-share-statement className="space-y-4 text-slate-900">
            {(isLoadingStatement || statementError) && <div role={statementError ? "alert" : "status"} className={["rounded-xl p-3 text-sm",statementError ? "bg-rose-50 text-rose-800" : "bg-slate-100 text-slate-600"].join(" ")}>{statementError ?? "Refreshing statement from the database…"}</div>}
            <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4"><div><p className="text-xs font-bold uppercase tracking-wide text-slate-500">ClearFlow · Share Statement</p><h3 className="mt-1 text-lg font-bold">{selectedFund?.fund_name}</h3><p className="mt-1 text-sm">{contact?.name} · {contact?.phone ?? "No phone saved"}</p><p className="mt-1 break-all text-xs text-slate-500">Share ID: {statementShare.share_id}</p></div><button type="button" disabled={isLoadingStatement} onClick={() => void openShareStatement(statementShare)} className="min-h-10 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white disabled:opacity-50">Refresh</button></div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4"><StoredValue label="Current Cycle bill" value={currentBill ? formatINR(currentBill.amount) : "Not billed"}/><StoredValue label="Total billed" value={formatINR(statementShare.share_total_billed_amount)}/><StoredValue label="Total paid (net)" value={formatINR(statementShare.share_net_payment_received)}/><StoredValue label="Pending due" value={formatINR(statementShare.total_pending)}/><StoredValue label="Advance" value={formatINR(statementShare.total_advance)}/><StoredValue label="Cycle progress" value={(selectedFund?.current_cycle ?? 0) + " of " + (selectedFund?.number_of_cycles ?? "—")}/><StoredValue label="Payout status" value={statementShare.payout_status === "drawn" ? "Drawn" : "Undrawn"}/>{statementShare.payout_status === "drawn" ? <StoredValue label={"Amount withdrawn" + (statementShare.payout_cycle_number !== null ? " · Cycle " + statementShare.payout_cycle_number : "")} value={formatINR(statementShare.withdrawn_amount)}/> : <StoredValue label="Withdrawal" value="Not drawn yet"/>}</div>
            <section><h4 className="font-semibold">Cycle billing history</h4>{shareBills.length ? <div className="mt-2 divide-y divide-slate-200 rounded-xl border border-slate-200">{shareBills.map((bill)=><div key={bill.bill_id} className="flex justify-between gap-3 p-3 text-sm"><span>Cycle {bill.cycle_number}{bill.bill_date ? " · "+formatDate(bill.bill_date) : " · Date unavailable"}</span><strong>{formatINR(bill.amount)}</strong></div>)}</div> : <p className="mt-2 text-sm text-slate-500">No cycle billing recorded.</p>}</section>
            <section><h4 className="font-semibold">Payment ledger · Credits and debits</h4>{history.length ? <div className="mt-2 divide-y divide-slate-200 rounded-xl border border-slate-200">{history.map((item)=><div key={item.id} className="flex justify-between gap-3 p-3 text-sm"><div><p className="font-semibold capitalize">{item.entryType} · {item.date ? formatDate(item.date) : "Date unavailable"}</p><p className="text-xs text-slate-500">{item.paymentType ?? "—"}{item.remarks ? " · "+item.remarks : ""}</p></div><strong className={item.entryType === "credit" ? "text-emerald-700" : "text-rose-700"}>{item.entryType === "credit" ? "+" : "−"}{formatINR(item.amount)}</strong></div>)}</div> : <p className="mt-2 text-sm text-slate-500">No payment ledger entries recorded for this Share.</p>}</section>
            <button type="button" onClick={printShareStatement} className="min-h-11 w-full rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white">Print / Save Statement</button>
          </div>;
        })()}
      </Modal>

      <Modal isOpen={Boolean(deleteTarget)} title={deleteTarget?.kind === "fund" ? "Danger Zone · Delete Fund" : "Danger Zone · Delete Share"} description={"Step " + deleteStep + " of 3 · Permanent deletion review"} onClose={() => { if (!isDeleting) { setDeleteTarget(null); setDeleteError(null); setDeleteStep(1); setDeleteAcknowledged(false); setDeleteTypedId(""); setShareDeleteRecords(null); } }}>
        {deleteTarget && <div className="space-y-4">
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-3">
            <p className="text-sm font-semibold text-rose-900">{deleteTarget.label}</p>
            {deleteTarget.kind === "share" && <>
              <p className="mt-1 text-xs text-rose-800">Share ID: {deleteTarget.id}</p>
              <p className="mt-1 text-xs text-rose-800">Fund: {selectedFund?.fund_name ?? "Selected Fund"}</p>
              <p className="mt-1 text-xs text-rose-800">Phone: {(() => { const targetShare = shares.find((share) => share.share_id === deleteTarget.id); const targetContact = targetShare ? contactById.get(targetShare.contact_id) : undefined; return targetContact?.phone ?? "No phone saved"; })()}</p>
              {(() => { const targetShare = shares.find((share) => share.share_id === deleteTarget.id); if (!targetShare) return null; return <p className="mt-1 text-xs text-rose-800">Payout: {targetShare.payout_status === "drawn" ? "Drawn · " + formatINR(targetShare.withdrawn_amount) + (targetShare.payout_cycle_number !== null ? " · Cycle " + targetShare.payout_cycle_number : "") : "Undrawn"}</p>; })()}
            </>}
            <p className="mt-2 text-sm leading-5 text-rose-800">{deleteTarget.kind === "fund" ? "Fund deletion is blocked if it has any Shares, Payments, Fund adjustments, or saved Cycle payout/commission values." : "This permanently deletes this Share, its Cycle bill rows, shareholder payment ledger rows, and recorded payout data. The Fund, its Cycles, and other Shares remain."}</p>
            {deleteTarget.kind === "share" && <p className="mt-2 text-xs leading-5 text-rose-800">Audit records are retained to document the deletion. Only this Share and its related bill/payment rows are removed.</p>}
          </div>
          {deleteTarget.kind === "share" && <section className="space-y-2 rounded-xl border border-slate-200 p-3">
            <h3 className="text-sm font-semibold text-slate-900">Related records to be deleted</h3>
            {isLoadingShareDeleteRecords && <p className="text-sm text-slate-500">Loading related saved records…</p>}
            {!isLoadingShareDeleteRecords && shareDeleteRecords && <>
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-lg bg-slate-50 p-2"><p className="text-xs text-slate-500">Cycle bills</p><p className="text-base font-semibold">{shareDeleteRecords.bills.length}</p></div>
                <div className="rounded-lg bg-slate-50 p-2"><p className="text-xs text-slate-500">Payment entries</p><p className="text-base font-semibold">{shareDeleteRecords.payments.length}</p></div>
              </div>
              <div className="max-h-44 space-y-2 overflow-y-auto">
                {shareDeleteRecords.bills.map((bill) => <div key={"bill-" + bill.bill_id} className="flex items-start justify-between gap-2 rounded-lg bg-slate-50 p-2 text-xs"><span>Cycle {cycleRows.find((row) => row.cycle_id === bill.cycle_id)?.cycle_number ?? "—"} bill{bill.bill_date ? " · " + formatDate(bill.bill_date) : ""}</span><strong>{formatINR(bill.amount)}</strong></div>)}
                {shareDeleteRecords.payments.map((payment) => <div key={"payment-" + payment.id} className="flex items-start justify-between gap-2 rounded-lg bg-slate-50 p-2 text-xs"><span>{payment.entryType === "credit" ? "Credit" : "Debit"} · {payment.date || "Date unavailable"}{payment.paymentType ? " · " + payment.paymentType : ""}{payment.remarks ? " · " + payment.remarks : ""}</span><strong>{formatINR(payment.amount)}</strong></div>)}
                {shareDeleteRecords.bills.length === 0 && shareDeleteRecords.payments.length === 0 && <p className="text-xs text-slate-500">No bill/payment rows. The Share record and any saved payout data will still be deleted.</p>}
              </div>
            </>}
          </section>}
          {deleteStep === 1 && <div className="space-y-3">
            <p className="text-sm leading-5 text-slate-700">{deleteTarget.kind === "share" ? "Review the Share and every listed bill/payment record. This action cannot be undone." : "Review the Fund and its deletion restrictions."}</p>
            <button type="button" disabled={deleteTarget.kind === "share" && (isLoadingShareDeleteRecords || !shareDeleteRecords)} onClick={() => setDeleteStep(2)} className="min-h-11 w-full rounded-xl bg-rose-700 px-4 text-sm font-semibold text-white disabled:opacity-40">I reviewed these records</button>
          </div>}
          {deleteStep === 2 && <div className="space-y-3">
            <label className="flex items-start gap-3 rounded-xl border border-rose-200 p-3 text-sm leading-5 text-slate-700"><input type="checkbox" checked={deleteAcknowledged} onChange={(event) => setDeleteAcknowledged(event.target.checked)} className="mt-1 h-4 w-4 shrink-0"/><span>{deleteTarget.kind === "share" ? "I understand the Share, its bills, all credit/debit payment entries, and payout data will be permanently deleted. The Fund, Cycles, other Shares, and audit records remain." : "I understand Fund deletion is permanent and the database will block it if related records remain."}</span></label>
            <button type="button" disabled={!deleteAcknowledged} onClick={() => { setDeleteTypedId(""); setDeleteStep(3); }} className="min-h-11 w-full rounded-xl bg-rose-700 px-4 text-sm font-semibold text-white disabled:opacity-40">Continue to final confirmation</button>
          </div>}
          {deleteStep === 3 && <div className="space-y-3">
            <label className="block text-sm font-medium text-slate-700">To confirm, type the email address of the currently logged-in account<p className="mt-2 break-all rounded-lg bg-slate-100 p-3 text-sm font-semibold text-slate-800">{workspace.email}</p><input value={deleteTypedId} onChange={(event) => setDeleteTypedId(event.target.value)} autoComplete="email" spellCheck={false} inputMode="email" className="mt-2 min-h-11 w-full rounded-xl border border-slate-300 px-3 text-sm" placeholder="Enter your logged-in email address"/></label>
            <button type="button" onClick={() => void handleConfirmDelete()} disabled={isDeleting || !deleteAcknowledged || deleteTypedId.trim().toLowerCase() !== workspace.email.trim().toLowerCase() || (deleteTarget.kind === "share" && !shareDeleteRecords)} className="min-h-11 w-full rounded-xl bg-rose-800 px-4 text-sm font-semibold text-white disabled:opacity-40">{isDeleting ? "Deleting…" : deleteTarget.kind === "share" ? "Permanently delete Share + history" : "Permanently delete Fund"}</button>
          </div>}
          {deleteError && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800">{deleteError}</p>}
        </div>}
      </Modal>
      <Modal isOpen={isAdjustmentsLedgerOpen} title="Fund Other Adjustments" description="Separate, append-only ledger. These entries are not included in Fund financials." size="large" onClose={() => setIsAdjustmentsLedgerOpen(false)}>
        <div className="space-y-4">
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <p className="font-semibold">Separate ledger only</p>
            <p className="mt-1 text-xs leading-5">This amount is not calculated or considered in Fund financials. These are Fund Other Adjustments only. Credits and debits here do not change Cycle totals, Share balances, payments, payouts or Fund Net Balance.</p>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs text-slate-500">{selectedFund?.fund_name ?? "Fund"} · {adjustmentsSummary?.entry_count ?? 0} entries</div>
            <div className="flex gap-2">
              <button type="button" onClick={() => void openAdjustmentsLedger()} disabled={isLoadingAdjustmentsLedger} className="inline-flex min-h-10 items-center gap-1 rounded-lg border border-slate-200 px-3 text-sm font-semibold disabled:opacity-50"><RefreshCw size={14}/> Refresh</button>
              <button type="button" onClick={() => { setFundEntryType("debit"); setFundEntryAmount(""); setFundEntryRemarks(""); setFundEntryCategory(""); setFundEntryError(null); setIsFundEntryModalOpen(true); }} className="inline-flex min-h-10 items-center gap-1 rounded-lg bg-emerald-700 px-3 text-sm font-semibold text-white"><IndianRupee size={14}/> Add Adjustment</button>
            </div>
          </div>
          {adjustmentsLedgerError && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800">{adjustmentsLedgerError}</p>}
          {isLoadingAdjustmentsLedger && <p role="status" className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600">Loading latest adjustments from the database…</p>}
          {adjustmentsSummary && <div className="grid grid-cols-3 gap-2">
            <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-3"><p className="text-[11px] text-emerald-800">Total Credits</p><p className="mt-1 break-words text-sm font-bold tabular-nums text-emerald-800">{formatINR(adjustmentsSummary.total_credits)}</p></div>
            <div className="rounded-xl border border-rose-100 bg-rose-50 p-3"><p className="text-[11px] text-rose-800">Total Debits</p><p className="mt-1 break-words text-sm font-bold tabular-nums text-rose-800">{formatINR(adjustmentsSummary.total_debits)}</p></div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3"><p className="text-[11px] text-slate-600">Net Adjustments</p><p className={["mt-1 break-words text-sm font-bold tabular-nums", adjustmentsSummary.net_adjustments < 0 ? "text-rose-700" : adjustmentsSummary.net_adjustments > 0 ? "text-emerald-700" : "text-slate-900"].join(" ")}>{adjustmentsSummary.net_adjustments > 0 ? "+" : adjustmentsSummary.net_adjustments < 0 ? "−" : ""}{formatINR(Math.abs(adjustmentsSummary.net_adjustments))}</p></div>
          </div>}
          <div data-cfcf-adjustments-report className="space-y-3 text-slate-900">
            <section className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">ClearFlow · Fund Other Adjustments Ledger</p>
              <h3 className="mt-1 text-lg font-bold">{selectedFund?.fund_name ?? "Fund"}</h3>
              <p className="mt-1 break-all text-xs text-slate-500">Fund ID · {selectedFund?.fund_id ?? "—"}</p>
              <p className="mt-1 text-xs text-slate-500">Report generated · {new Date().toLocaleDateString("en-IN", { weekday: "long", day: "2-digit", month: "long", year: "numeric" })}</p>
              <p className="mt-2 text-xs font-semibold text-amber-800">Independent ledger — excluded from Fund financial calculations</p>
            </section>
            {adjustmentsSummary && <section className="grid grid-cols-3 gap-2">
              <div className="rounded-xl border border-slate-200 p-3"><p className="text-xs text-slate-500">Total Credits</p><p className="mt-1 font-bold">{formatINR(adjustmentsSummary.total_credits)}</p></div>
              <div className="rounded-xl border border-slate-200 p-3"><p className="text-xs text-slate-500">Total Debits</p><p className="mt-1 font-bold">{formatINR(adjustmentsSummary.total_debits)}</p></div>
              <div className="rounded-xl border border-slate-200 p-3"><p className="text-xs text-slate-500">Net Adjustments</p><p className="mt-1 font-bold">{formatINR(adjustmentsSummary.net_adjustments)}</p></div>
            </section>}
            <section>
              <h4 className="font-semibold">Dated entries</h4>
              {adjustmentsLedgerRows.length ? <div className="mt-2 space-y-2">
                {adjustmentsLedgerRows.slice().sort((a,b) => b.date.localeCompare(a.date)).map((item) => <article key={item.id} className="rounded-xl border border-slate-200 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0"><p className="text-xs text-slate-500">{formatDate(item.date)} · {adjustmentCategoryLabel(item.adjustmentCategory)}</p><p className="mt-1 break-words text-sm font-semibold text-slate-800">{item.remarks || "No remarks"}</p></div>
                    <div className="shrink-0 text-right"><p className={["text-xs font-semibold", item.entryType === "credit" ? "text-emerald-700" : "text-rose-700"].join(" ")}>{item.entryType === "credit" ? "Credit (+)" : "Debit (−)"}</p><p className={["mt-1 text-sm font-bold tabular-nums", item.entryType === "credit" ? "text-emerald-700" : "text-rose-700"].join(" ")}>{item.entryType === "debit" ? "−" : "+"}{formatINR(item.amount)}</p></div>
                  </div>
                  <p className="mt-2 break-all text-[10px] text-slate-400">Entry ID · {item.id}</p>
                </article>)}
              </div> : <p className="mt-2 rounded-xl bg-slate-50 p-3 text-sm text-slate-500">{isLoadingAdjustmentsLedger ? "Loading entries…" : "No Other Adjustments have been recorded for this Fund."}</p>}
            </section>
          </div>
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
            <button type="button" onClick={() => setIsAdjustmentsLedgerOpen(false)} className="min-h-11 rounded-xl border border-slate-200 px-4 text-sm">Close</button>
            <button type="button" disabled={!adjustmentsSummary} onClick={printAdjustmentsLedger} className="min-h-11 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white disabled:opacity-40">Print / Save HTML report</button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={isFullFundReportOpen} title="Full Fund Report" description="Download a report file and open the full report in a separate browser tab. The report is mobile-friendly; use its own Print / Save as PDF control only if you need a PDF." size="large" onClose={() => setIsFullFundReportOpen(false)}>
        <div className="space-y-4">
          <div className="sticky top-0 z-10 -mx-1 flex flex-wrap gap-2 border-b border-slate-100 bg-white px-1 py-2"><button type="button" onClick={printFullFundReport} disabled={!selectedFund || isLoadingFullFundReport || !!fullFundReportError} className="min-h-11 flex-1 rounded-xl bg-violet-700 px-4 text-sm font-semibold text-white disabled:opacity-40">Download PDF</button><button type="button" onClick={() => setIsFullFundReportOpen(false)} className="min-h-11 rounded-xl border border-slate-200 px-4 text-sm">Close</button></div>
          {fullFundReportError && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800">{fullFundReportError}</p>}
          {selectedFund && <div data-cfcf-full-fund-report className="space-y-4 text-slate-900">
            <section className="report-section rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">ClearFlow · Full Fund Report</p>
              <h1 className="mt-1 text-xl font-bold">{selectedFund.fund_name}</h1>
              <p className="break-all text-xs text-slate-500">Fund ID · {selectedFund.fund_id}</p>
              <p className="text-sm">Report date · {new Date().toLocaleDateString("en-IN", { weekday: "long", day: "2-digit", month: "long", year: "numeric" })}</p>
              <p className="text-sm">Start date · {selectedFund.start_date ? formatDate(selectedFund.start_date) : "Not set"} · Planned cycles · {selectedFund.number_of_cycles ?? "Not set"} · Saved cycles · {cycleRows.length}</p>
              <p className="text-xs text-slate-500">Share records · {shares.length} · Billing entries · {bills.length} · Payment entries · {ledgerItems.filter((item) => item.kind === "payment").length} · Other adjustment entries · {ledgerItems.filter((item) => item.kind === "fund-entry").length}</p>
            </section>
            <section className="report-section"><h2 className="text-base font-bold">Workspace / Tenant Details</h2><div className="grid grid-cols-2 gap-2"><StoredValue label="Tenant ID" value={workspace.tenantId}/><StoredValue label="Authorized person" value={workspace.displayName || "Not available"}/><StoredValue label="Person ID" value={workspace.personId}/><StoredValue label="Email" value={workspace.email || "Not available"}/></div></section>
            <section className="report-section">
              <h2 className="text-base font-bold">1. Fund Summary</h2>
              <div className="grid grid-cols-2 gap-2">
                <StoredValue label="Fund Net Balance (stored)" value={formatINR(selectedFund.fund_net_balance ?? 0)}/>
                <StoredValue label="Total billed (stored)" value={formatINR(selectedFund.fund_total_billed_amount ?? 0)}/>
                
                <StoredValue label="Pending (stored)" value={formatINR(selectedFund.fund_total_pending_amount ?? 0)}/>
                <StoredValue label="Advance (stored)" value={formatINR(selectedFund.fund_total_advance ?? 0)}/>
                <StoredValue label="Withdrawn (stored)" value={formatINR(selectedFund.fund_total_withdrawn ?? 0)}/>
                <StoredValue label="Commissions (stored)" value={formatINR(selectedFund.fund_total_commissions ?? 0)}/>
              </div>
            </section>
            <section className="report-section">
              <h2 className="text-base font-bold">2. Share-wise Summary</h2>
              {shares.length ? shares.map((share) => {
                const contact = contactById.get(share.contact_id);
                return <article key={share.share_id} className="record rounded-xl border border-slate-200 p-3">
                  <div className="flex items-start justify-between gap-2"><div className="min-w-0"><h3 className="break-words font-semibold">{contact?.name ?? "Contact unavailable"}</h3><p className="entry-meta break-all">Share ID · {share.share_id} · Contact ID · {share.contact_id}</p><p className="entry-meta">{contact?.phone ? "Phone · " + contact.phone : "Phone · Not recorded"} · Share status · {share.status}</p></div><span className="pill">{share.payout_status === "drawn" ? "Drawn" : "Undrawn"}</span></div>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <StoredValue label="Total billed (stored)" value={formatINR(share.share_total_billed_amount ?? 0)}/>
                    <StoredValue label="Total paid / net received (stored)" value={formatINR(share.share_net_payment_received ?? 0)}/>
                    <StoredValue label="Advance (stored)" value={formatINR(share.total_advance ?? 0)}/>
                    <StoredValue label="Pending (stored)" value={formatINR(share.total_pending ?? 0)}/>
                    <StoredValue label="Draw cycle" value={share.payout_status === "drawn" ? String(share.payout_cycle_number ?? "Not recorded") : "Not drawn"}/>
                    <StoredValue label="Recorded payout" value={share.payout_status === "drawn" ? formatINR(share.withdrawn_amount ?? 0) : "Not drawn"}/>
                  </div>
                </article>;
              }) : <p className="text-sm text-slate-500">No Share records were returned for this Fund.</p>}
            </section>
            <section className="report-section">
              <h2 className="text-base font-bold">3. Saved Cycle Register</h2>
              {cycleRows.length ? cycleRows.map((cycle) => <article key={cycle.cycle_id} className="record rounded-xl border border-slate-200 p-3"><h3 className="font-semibold">Cycle {cycle.cycle_number}</h3><p>Cycle ID · {cycle.cycle_id}</p><p>Planned payout · {displayStoredAmount(cycle.planned_payout_amount)}</p><p>Commission · {displayStoredAmount(cycle.commission_amount)}</p><p className="entry-meta">Created · {formatDate(cycle.created_at)} · Updated · {formatDate(cycle.updated_at)}</p></article>) : <p className="text-sm text-slate-500">No saved Cycles were returned for this Fund.</p>}
            </section>
            <section className="report-section">
              <h2 className="text-base font-bold">4. Cycle-wise Billing Details</h2>
              {cycleRows.length ? cycleRows.map((cycle) => {
                const cycleBills = bills.filter((bill) => bill.cycle_id === cycle.cycle_id).slice().sort((a, b) => a.share_id.localeCompare(b.share_id));
                return <article key={cycle.cycle_id} className="record rounded-xl border border-slate-200 p-3"><h3 className="font-semibold">Cycle {cycle.cycle_number} · {cycleBills.length} saved billing record(s)</h3>{cycleBills.length ? cycleBills.map((bill) => { const share = shares.find((item) => item.share_id === bill.share_id); const contact = share ? contactById.get(share.contact_id) : undefined; return <div key={bill.bill_id} className="mt-2 border-t border-slate-200 pt-2"><p className="font-semibold">{contact?.name ?? "Contact unavailable"} · {formatINR(bill.amount)}</p><p className="entry-meta">Share ID · {bill.share_id} · Billing ID · {bill.bill_id}</p><p className="entry-meta">Billing date · {bill.bill_date ? formatDate(bill.bill_date) : "Not recorded"} · Saved · {formatDate(bill.created_at)}</p></div>; }) : <p className="mt-2 text-sm text-slate-500">No billing entries recorded for this Cycle.</p>}</article>;
              }) : <p className="text-sm text-slate-500">No saved Cycle records were returned; any available billing rows are listed below.</p>}
              {!cycleRows.length && bills.map((bill) => <article key={bill.bill_id} className="record rounded-xl border border-slate-200 p-3"><p className="font-semibold">Share · {bill.share_id} · {formatINR(bill.amount)}</p><p className="entry-meta">Billing ID · {bill.bill_id} · Cycle ID · {bill.cycle_id} · Date · {bill.bill_date ? formatDate(bill.bill_date) : "Not recorded"}</p></article>)}
            </section>
            <section className="report-section">
              <h2 className="text-base font-bold">5. Complete Payment Ledger</h2>
              {ledgerItems.filter((item) => item.kind === "payment").length ? ledgerItems.filter((item) => item.kind === "payment").slice().sort((a, b) => a.date.localeCompare(b.date)).map((item) => { const share = shares.find((row) => row.share_id === item.shareId); const contact = share ? contactById.get(share.contact_id) : undefined; return <article key={item.id} className="record rounded-xl border border-slate-200 p-3"><p className="font-semibold">{formatDate(item.date)} · {item.entryType === "credit" ? "Credit" : "Debit"} · {formatINR(item.amount)}</p><p className="entry-meta">Payment ID · {item.id} · Share · {contact?.name ?? "Contact unavailable"} · Share ID · {item.shareId ?? "Not recorded"}</p><p>Mode · {item.paymentType ?? "Not recorded"} · Remarks · {item.remarks || "None"}</p></article>; }) : <p className="text-sm text-slate-500">No payment records were returned for this Fund.</p>}
            </section>
            <section className="report-section">
              <h2 className="text-base font-bold">6. Draw / Payout Register</h2>
              {shares.length ? shares.map((share) => { const contact = contactById.get(share.contact_id); return <article key={share.share_id} className="record rounded-xl border border-slate-200 p-3"><p className="font-semibold">{contact?.name ?? "Contact unavailable"} · {share.payout_status === "drawn" ? "Drawn" : "Undrawn"}</p><p className="entry-meta">Share ID · {share.share_id} · Cycle · {share.payout_status === "drawn" ? (share.payout_cycle_number ?? "Not recorded") : "Not drawn"}</p><p>Recorded payout · {share.payout_status === "drawn" ? formatINR(share.withdrawn_amount ?? 0) : "Not drawn"}</p></article>; }) : <p className="text-sm text-slate-500">No Share payout statuses were returned for this Fund.</p>}
            </section>
            <section className="report-section">
              <h2 className="text-base font-bold">7. Other Adjustments — Separate Ledger</h2>
              <div className="disclaimer rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm"><p className="font-bold">Not included in Fund financial calculations</p><p>Other Adjustments are an independent ledger. Credits and debits in this section do not change Fund Net Balance, Share balances, Cycle billing, payments or payouts.</p></div>
              {fullFundReportAdjustmentsSummary && <div className="mt-2 grid grid-cols-2 gap-2"><StoredValue label="Adjustment entries" value={fullFundReportAdjustmentsSummary.entry_count}/><StoredValue label="Total credits" value={formatINR(fullFundReportAdjustmentsSummary.total_credits)}/><StoredValue label="Total debits" value={formatINR(fullFundReportAdjustmentsSummary.total_debits)}/><StoredValue label="Net adjustments (separate)" value={formatINR(fullFundReportAdjustmentsSummary.net_adjustments)}/></div>}
              {ledgerItems.filter((item) => item.kind === "fund-entry").map((item) => <article key={item.id} className="record rounded-xl border border-slate-200 p-3"><p className="font-semibold">{formatDate(item.date)} · {item.entryType}</p><p className="entry-meta">Amount · {formatINR(item.amount)} · Entry ID · {item.id} · Category · {adjustmentCategoryLabel(item.adjustmentCategory)}</p><p>Remarks · {item.remarks || "None"}</p></article>)}
            </section>
            <section className="report-section"><h2 className="text-base font-bold">8. Report Notes</h2><p>All figures above are shown from saved Fund/Share fields and saved ledger records. No new financial totals are derived by this report.</p><p>Generated from the currently authorized ClearFlow workspace. Keep this report with the Fund's business records.</p></section>
          </div>}

        </div>
      </Modal>

      <Modal isOpen={isFundReportOpen} title="Fund Summary" description="A concise view of saved Fund and Share values. Other Adjustments are separate and are not included in Fund financials." size="large" onClose={() => setIsFundReportOpen(false)}>
        {selectedFund && <div className="space-y-4">
          <div data-cfcf-fund-report className="space-y-4 text-slate-900">
            <section className="rounded-xl border border-slate-200 bg-slate-50 p-4"><p className="text-xs font-bold uppercase tracking-wide text-slate-500">ClearFlow · Fund Summary</p><h3 className="mt-1 text-xl font-bold">{selectedFund.fund_name}</h3><p className="mt-1 break-all text-xs text-slate-500">Fund ID · {selectedFund.fund_id}</p><p className="mt-1 text-sm">Report date · {new Date().toLocaleDateString("en-IN", { weekday: "long", day: "2-digit", month: "long", year: "numeric" })}</p><p className="mt-1 text-sm">Start date · {selectedFund.start_date ? formatDate(selectedFund.start_date) : "Not set"} · Planned Cycles · {selectedFund.number_of_cycles ?? "Not set"}</p></section>
            <section><h4 className="font-semibold">Stored Fund ledger summary</h4><div className="mt-2 grid grid-cols-2 gap-2"><StoredValue label="Net balance" value={formatINR(selectedFund.fund_net_balance ?? 0)}/><StoredValue label="Total billed" value={formatINR(selectedFund.fund_total_billed_amount ?? 0)}/><StoredValue label="Pending" value={formatINR(selectedFund.fund_total_pending_amount ?? 0)}/><StoredValue label="Advance" value={formatINR(selectedFund.fund_total_advance ?? 0)}/><StoredValue label="Withdrawn" value={formatINR(selectedFund.fund_total_withdrawn ?? 0)}/><StoredValue label="Commissions" value={formatINR(selectedFund.fund_total_commissions ?? 0)}/></div></section>
            <section className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm"><p className="font-semibold">Other Adjustments are separate</p><p>Credits and debits recorded under Adjustments are not included in Fund financials or this summary. Open the separate Adjustments button to view that ledger.</p></section>
            <section><h4 className="font-semibold">Shares in this Fund</h4>{shares.length ? <div className="mt-2 space-y-2">{shares.map((share) => { const contact = contactById.get(share.contact_id); return <article key={share.share_id} className="rounded-xl border border-slate-200 p-3"><p className="font-semibold">{contact?.name ?? "Share"}</p><p className="break-all text-xs text-slate-500">Share ID · {share.share_id}</p><div className="mt-2 grid grid-cols-2 gap-2"><StoredValue label="Billed (stored)" value={formatINR(share.share_total_billed_amount ?? 0)}/><StoredValue label="Pending (stored)" value={formatINR(share.total_pending ?? 0)}/><StoredValue label="Advance (stored)" value={formatINR(share.total_advance ?? 0)}/><StoredValue label="Net received (stored)" value={formatINR(share.share_net_payment_received ?? 0)}/><StoredValue label="Payout status" value={share.payout_status ?? "Not set"}/></div></article>; })}</div> : <p className="mt-2 text-sm text-slate-500">No Shares are currently loaded for this Fund.</p>}</section>
          </div>
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-3"><button type="button" onClick={() => setIsFundReportOpen(false)} className="min-h-11 rounded-xl border border-slate-200 px-4 text-sm">Close</button><button type="button" onClick={printFundReport} className="min-h-11 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white">Print / Save Summary</button></div>
        </div>}
      </Modal>

      <Modal isOpen={isFundEditOpen} title="Edit Fund details" description="Only Fund name, start date and planned Cycle count can be changed. Financial history and stored ledger values are untouched." onClose={() => { if (!isSavingFundEdit) setIsFundEditOpen(false); }}>
        <form onSubmit={(event) => void handleSaveFundEdit(event)} className="space-y-4">
          <label className="block text-sm font-medium text-slate-700">Fund name<input required maxLength={120} value={fundEditForm.fundName} onChange={(event) => setFundEditForm((v) => ({ ...v, fundName: event.target.value }))} className="mt-1 min-h-11 w-full rounded-xl border border-slate-200 px-3 text-sm"/></label>
          <label className="block text-sm font-medium text-slate-700">Start date<input type="date" value={fundEditForm.startDate} onChange={(event) => setFundEditForm((v) => ({ ...v, startDate: event.target.value }))} className="mt-1 min-h-11 w-full rounded-xl border border-slate-200 px-3 text-sm"/></label>
          <label className="block text-sm font-medium text-slate-700">Planned Cycle count<input type="number" min="0" max={MAX_CFCF_CYCLES} step="1" value={fundEditForm.numberOfCycles} onChange={(event) => setFundEditForm((v) => ({ ...v, numberOfCycles: event.target.value }))} placeholder="Optional" className="mt-1 min-h-11 w-full rounded-xl border border-slate-200 px-3 text-sm"/></label>
          {fundEditError && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800">{fundEditError}</p>}
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-3"><button type="button" onClick={() => setIsFundEditOpen(false)} disabled={isSavingFundEdit} className="min-h-11 rounded-xl border border-slate-200 px-4 text-sm">Cancel</button><button type="submit" disabled={isSavingFundEdit || !fundEditForm.fundName.trim() || (fundEditForm.numberOfCycles.trim() !== "" && (!Number.isSafeInteger(Number(fundEditForm.numberOfCycles)) || Number(fundEditForm.numberOfCycles) < 0 || Number(fundEditForm.numberOfCycles) > MAX_CFCF_CYCLES))} className="min-h-11 rounded-xl bg-sky-600 px-4 text-sm font-semibold text-white disabled:opacity-50">{isSavingFundEdit ? <><RefreshCw size={16} className="animate-spin" /> Waiting for Supabase…</> : "Save details"}</button></div>
        </form>
      </Modal>

      <Modal
        isOpen={isFundModalOpen}
        title="Create a fund"
        description="Add the basic details for this Fund."
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
                max={MAX_CFCF_CYCLES}
                step="1"
                value={fundForm.numberOfCycles}
                onChange={(event) => setFundForm((current) => ({ ...current, numberOfCycles: event.target.value }))}
                placeholder="Optional"
                className="min-h-11 w-full min-w-0 rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
              />
            </div>
          </div>
          {fundFormError && (
            <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm leading-5 text-rose-800">
              {fundFormError}
            </div>
          )}
          <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
            <button type="button" onClick={closeFundModal} disabled={isSavingFund} className="min-h-11 rounded-xl border border-slate-200 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">
              Cancel
            </button>
            <button type="submit" disabled={isSavingFund || !fundForm.fundName.trim() || (fundForm.numberOfCycles.trim() !== "" && (!Number.isSafeInteger(Number(fundForm.numberOfCycles)) || Number(fundForm.numberOfCycles) < 1 || Number(fundForm.numberOfCycles) > MAX_CFCF_CYCLES))} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-sky-600 px-4 text-sm font-semibold text-white hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60">
              <Plus size={16} /> {isSavingFund ? "Saving…" : "Save fund"}
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={databaseResult !== null}
        closeOnOverlayClick={false}
        closeOnEscape={false}
        title={databaseResult?.status === "error" ? "Operation failed" : "Database acknowledgement"}
        description={databaseResult?.status === "error" ? "The operation was not confirmed as successful. Review the message below." : "The operation completed and the acknowledgement was received."}
        onClose={() => { setDatabaseResult(null); }}
      >
        <div role={databaseResult?.status === "error" ? "alert" : "status"} aria-live="assertive" className={databaseResult?.status === "error" ? "rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm leading-6 text-rose-900" : "rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm leading-6 text-emerald-900"}>
          <p className="break-words">{databaseResult?.message}</p>
        </div>
        <div className="mt-4 flex justify-end">
          <button type="button" autoFocus onClick={() => { setDatabaseResult(null); }} className="min-h-11 rounded-xl bg-slate-900 px-5 text-sm font-semibold text-white">Close</button>
        </div>
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

function adjustmentCategoryLabel(value: string | null): string {
  switch (value) {
    case "outside_money": return "Outside money";
    case "commission": return "Commission";
    case "discount": return "Discount";
    case "stationery": return "Stationery";
    case "others": return "Others";
    default: return "Uncategorised (legacy)";
  }
}

function displayStoredAmount(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) return formatINR(value);
  if (typeof value === "string" && value.trim()) return value;
  if (value && typeof value === "object") return "Stored details";
  return "Not entered";
}

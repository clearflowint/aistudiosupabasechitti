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
  Archive,
  Download,
} from "lucide-react";
import type { AuthorizedWorkspace } from "../../../core/workspace/workspace.types";
import { Modal } from "../../../components/ui/Modal";
import { createCfcfContact, listCfcfContacts } from "../services/contacts.service";
import {
  createCfcfFund,
  createCfcfShare,
  deleteCfcfShareWithHistory,
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
  listCfcfArchivedFunds,
  archiveCfcfFundWithReport,
  deleteCfcfArchivedFund,
  type CfcfArchivedFundRow,
  type CfcfLedgerItem,
  type CfcfFundOtherAdjustmentSummary,
} from "../services/workspace.service";
import type { CfcfBillRow, CfcfContactRow, CfcfFundRow, CfcfShareRow } from "../types/database.types";

type WorkspaceTab = "fund-summary" | "shares";
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
  const fallback: SavedWorkspaceView = { tab: "fund-summary", fundId: "" };
  try {
    const raw = window.localStorage.getItem("clearflow:cfcf-workspace-view:v2:" + tenantId);
    if (!raw) return fallback;
    const saved = JSON.parse(raw) as { tab?: unknown; fundId?: unknown };
    const validTabs: WorkspaceTab[] = ["fund-summary", "shares"];
    return {
      tab: typeof saved.tab === "string" && validTabs.includes(saved.tab as WorkspaceTab)
        ? saved.tab as WorkspaceTab
        : "fund-summary",
      fundId: typeof saved.fundId === "string" ? saved.fundId : "",
    };
  } catch {
    return fallback;
  }
}


export function WorkspacePage({ workspace }: WorkspacePageProps) {
  const [funds, setFunds] = useState<CfcfFundRow[]>([]);
  const [archivedFunds, setArchivedFunds] = useState<CfcfArchivedFundRow[]>([]);
  const [isLoadingArchivedFunds, setIsLoadingArchivedFunds] = useState(false);
  const [isArchivingFund, setIsArchivingFund] = useState(false);
  const [archiveStep, setArchiveStep] = useState(1);
  const [archiveAcknowledged, setArchiveAcknowledged] = useState(false);
  const [archiveTypedId, setArchiveTypedId] = useState("");
  const [isArchiveConfirmOpen, setIsArchiveConfirmOpen] = useState(false);
  const [archivingError, setArchivingError] = useState<string | null>(null);
  const [deletingArchivedId, setDeletingArchivedId] = useState<string | null>(null);
  const [archivedDeleteTarget, setArchivedDeleteTarget] = useState<CfcfArchivedFundRow | null>(null);
  const [archivedDeleteStep, setArchivedDeleteStep] = useState(1);
  const [archivedDeleteAcknowledged, setArchivedDeleteAcknowledged] = useState(false);
  const [archivedDeleteTypedId, setArchivedDeleteTypedId] = useState("");
  const [archivedDeleteError, setArchivedDeleteError] = useState<string | null>(null);
  const [initialSavedView] = useState(() => readSavedWorkspaceView(workspace.tenantId));
  const [selectedFundId, setSelectedFundId] = useState(initialSavedView.fundId);
  const [activeTab, setActiveTab] = useState<WorkspaceTab>("fund-summary");
  const [isArchivesView, setIsArchivesView] = useState(false);
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
  const detailsLoadedKey = useRef("");
  const [fundReloadKey, setFundReloadKey] = useState(0);
  const [detailReloadKey, setDetailReloadKey] = useState(0);
  const [isFundModalOpen, setIsFundModalOpen] = useState(false);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [shareFormError, setShareFormError] = useState<string | null>(null);
  const [isSavingShare, setIsSavingShare] = useState(false);
  const [shareContactSearch, setShareContactSearch] = useState("");
  const [shareAssignments, setShareAssignments] = useState<Record<string, number>>({});
  const [shareAssignmentReview, setShareAssignmentReview] = useState(false);
  const [isInlineContactOpen, setIsInlineContactOpen] = useState(false);
  const [inlineContactName, setInlineContactName] = useState("");
  const [inlineContactPhone, setInlineContactPhone] = useState("");
  const [inlineContactError, setInlineContactError] = useState<string | null>(null);
  const [isSavingInlineContact, setIsSavingInlineContact] = useState(false);
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
  const [isFundPaymentLedgerOpen, setIsFundPaymentLedgerOpen] = useState(false);
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
  const [cycleCreatedInFlow, setCycleCreatedInFlow] = useState(false);
  const [cycleBulkBillInputs, setCycleBulkBillInputs] = useState<Record<"withdrawn" | "undrawn", string>>({ withdrawn: "", undrawn: "" });
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
  const [payoutCycleNumber, setPayoutCycleNumber] = useState("");
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
  const [deleteTarget, setDeleteTarget] = useState<{ kind: "share"; id: string; label: string; fundId?: string } | null>(null);
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
  const [cycleDeleteStep, setCycleDeleteStep] = useState(1);
  const [cycleDeleteAcknowledged, setCycleDeleteAcknowledged] = useState(false);
  const [cycleDeleteTypedEmail, setCycleDeleteTypedEmail] = useState("");
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

  async function refreshArchivedFunds() {
    setIsLoadingArchivedFunds(true);
    try {
      const rows = await listCfcfArchivedFunds(workspace.tenantId);
      setArchivedFunds(rows);
      setArchivingError(null);
    } catch (error) {
      setArchivingError(error instanceof Error ? error.message : "Unable to load Archived Funds.");
    } finally {
      setIsLoadingArchivedFunds(false);
    }
  }

  useEffect(() => {
    void refreshArchivedFunds();
  }, [workspace.tenantId]);

  async function archiveSelectedFund() {
    if (!selectedFund || isArchivingFund) return;
    const source = document.querySelector("[data-cfcf-full-fund-report]");
    if (!(source instanceof HTMLElement)) {
      setFullFundReportError("Open the complete Fund report and wait for it to load before archiving.");
      return;
    }
    setArchiveStep(1);
    setArchiveAcknowledged(false);
    setArchiveTypedId("");
    setArchivingError(null);
    setIsArchiveConfirmOpen(true);
  }

  async function confirmArchiveSelectedFund() {
    if (!selectedFund || isArchivingFund || archiveStep !== 3 || !archiveAcknowledged) return;
    const typedId = archiveTypedId.trim();
    if (typedId.toLowerCase() !== workspace.email.trim().toLowerCase()) return;
    const source = document.querySelector("[data-cfcf-full-fund-report]");
    if (!(source instanceof HTMLElement)) {
      setFullFundReportError("Open the complete Fund report and wait for it to load before archiving.");
      return;
    }
    if (!beginAction("archive-fund")) return;
    setIsArchivingFund(true);
    setFullFundReportError(null);

    try {
      const reportMarkup = source.innerHTML;
      const safeTitle = selectedFund.fund_name.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      const reportHtml = "<!doctype html><html><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>ClearFlow Full Fund Report - " +
        safeTitle +
        "</title><style>body{font-family:Arial,sans-serif;color:#0f172a;padding:20px;max-width:900px;margin:auto;line-height:1.45}button{display:none!important}.report-section{margin-bottom:16px;break-inside:auto}section,article{break-inside:avoid}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.rounded-xl{border-radius:12px}.border{border:1px solid #cbd5e1}.p-3,.p-4{padding:12px}.bg-slate-50{background:#f8fafc}.text-xs{font-size:12px}.text-sm{font-size:14px}.text-base{font-size:16px}.text-xl{font-size:22px}.font-bold,.font-semibold{font-weight:700}.text-slate-500{color:#64748b}.text-slate-600{color:#475569}.text-slate-900{color:#0f172a}.break-all,.break-words{overflow-wrap:anywhere;word-break:break-word}h1,h2,h3,p{margin-top:8px;margin-bottom:8px}@media print{body{padding:0}.report-section{break-inside:auto}}</style></head><body><header style=\"text-align:center;font-weight:800;padding-bottom:12px;border-bottom:1px solid #cbd5e1\">Powered by ClearFlow Automations · Archived Full Fund Report</header>" +
        reportMarkup + "<footer style=\"margin-top:20px;padding-top:8px;border-top:1px solid #cbd5e1;text-align:center;font-size:10px\">ClearFlow · Archived on " + new Date().toLocaleString("en-IN") + "</footer></body></html>";
      await archiveCfcfFundWithReport(workspace.tenantId, selectedFund.fund_id, reportHtml);
      setIsArchiveConfirmOpen(false);
      setArchiveStep(1);
      setArchiveAcknowledged(false);
      setArchiveTypedId("");
      setIsFullFundReportOpen(false);
      setSelectedFundId("");
      setShares([]);
      setBills([]);
      setLedgerItems([]);
      setCycleRows([]);
      setFundReloadKey((current) => current + 1);
      await refreshArchivedFunds();
      showDatabaseResult("Fund archived. Its full report is saved under Archived Funds, and all operational financial records were deleted.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to archive this Fund.";
      setArchivingError(message);
      setFullFundReportError(message);
      showDatabaseResult(message, "error");
    } finally {
      endAction("archive-fund");
      setIsArchivingFund(false);
    }
  }

  async function downloadArchivedFundReport(archive: CfcfArchivedFundRow, reportResult = true): Promise<void> {
    let reportRoot: HTMLDivElement | null = null;
    try {
      const pdfModule = await import("html2pdf.js");
      const parsed = new DOMParser().parseFromString(archive.report_html, "text/html");
      reportRoot = document.createElement("div");
      reportRoot.style.cssText = "position:fixed;left:-10000px;top:0;width:794px;background:#fff;color:#0f172a;font-family:Arial,sans-serif;font-size:12px;line-height:1.45;padding:28px;box-sizing:border-box;overflow-wrap:anywhere";
      const storedStyle = parsed.querySelector("style");
      if (storedStyle) reportRoot.appendChild(storedStyle.cloneNode(true));
      const contentRoot = document.createElement("div");
      contentRoot.innerHTML = parsed.body.innerHTML;
      reportRoot.appendChild(contentRoot);
      document.body.appendChild(reportRoot);
      await pdfModule.default().set({
        margin: [8, 8, 10, 8],
        filename: "ClearFlow-Archived-Fund-" + archive.fund_id + ".pdf",
        image: { type: "jpeg", quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, logging: false, backgroundColor: "#ffffff", windowWidth: 794 },
        jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
        pagebreak: { mode: ["css", "legacy"], avoid: [".record", ".metric", "h2"] },
      }).from(reportRoot).save();
      if (reportResult) showDatabaseResult("Downloaded the archived Full Fund PDF report.");
    } catch (error) {
      if (!reportResult) throw error;
      showDatabaseResult(error instanceof Error ? "Archived PDF download failed: " + error.message : "Archived PDF download failed.", "error");
    } finally {
      reportRoot?.remove();
    }
  }

  function handleDeleteArchivedFund(archive: CfcfArchivedFundRow) {
    if (deletingArchivedId) return;
    setArchivedDeleteTarget(archive);
    setArchivedDeleteStep(1);
    setArchivedDeleteAcknowledged(false);
    setArchivedDeleteTypedId("");
    setArchivedDeleteError(null);
  }

  async function confirmDeleteArchivedFund() {
    const archive = archivedDeleteTarget;
    if (!archive || deletingArchivedId || archivedDeleteStep !== 3 || !archivedDeleteAcknowledged) return;
    const typedId = archivedDeleteTypedId.trim();
    if (typedId !== workspace.tenantId && typedId !== workspace.personId) return;
    if (!beginAction("delete-archived-fund")) return;
    setDeletingArchivedId(archive.archive_id);
    setArchivedDeleteError(null);
    try {
      // Preserve the only detailed financial record locally before deleting the archived report.
      // If PDF generation/download fails, do not proceed with the destructive database deletion.
      setArchivedDeleteError("Downloading the archive PDF before deletion…");
      await downloadArchivedFundReport(archive, false);
      setArchivedDeleteError("PDF download initiated. Deleting the archived report…");
      await deleteCfcfArchivedFund(workspace.tenantId, archive.archive_id);
      setArchivedFunds((current) => current.filter((item) => item.archive_id !== archive.archive_id));
      setArchivedDeleteTarget(null);
      setArchivedDeleteStep(1);
      setArchivedDeleteAcknowledged(false);
      setArchivedDeleteTypedId("");
      showDatabaseResult("Archive PDF download was initiated, then the archived report was permanently deleted. The archived Fund identity remains.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to delete archived report.";
      setArchivedDeleteError(message);
      showDatabaseResult(message, "error");
    } finally {
      endAction("delete-archived-fund");
      setDeletingArchivedId(null);
    }
  }

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

    // Only show the full-page Funds loading state on initial load.
    // Same-tenant refreshes after bill/payment operations update in place and
    // must not collapse the content above the current Share card.
    if (funds.length === 0) setIsLoadingFunds(true);
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
  }, [workspace.tenantId, fundReloadKey, funds.length]);

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
  }, [workspace.tenantId, selectedFundId]);

  // MIX: Clear fund-scoped data only when the tenant/Fund changes.
  // A same-Fund refresh must keep the existing Share list mounted so the mobile page
  // does not collapse and reset the user's scroll position to the top.
  useEffect(() => {
    const nextKey = workspace.tenantId + ":" + selectedFundId;
    if (detailsLoadedKey.current === nextKey) return;
    setShares([]);
    setBills([]);
    setContacts([]);
    setLedgerItems([]);
    setSelectedShareId(null);
    setDetailsError(null);
    setIsLoadingDetails(Boolean(selectedFundId));
  }, [workspace.tenantId, selectedFundId]);

  // CFCF PRODUCT: Refresh details without unmounting the current Fund's Share list.
  useEffect(() => {
    let isCurrent = true;
    const detailsKey = workspace.tenantId + ":" + selectedFundId;
    const alreadyLoadedForFund = detailsLoadedKey.current === detailsKey;

    if (!selectedFundId) {
      setIsLoadingDetails(false);
      return () => { isCurrent = false; };
    }

    if (!alreadyLoadedForFund) setIsLoadingDetails(true);
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
        detailsLoadedKey.current = detailsKey;
        setDetailsError(null);
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
    // Require an explicit Cycle choice every time the payout form opens.
    // Existing payout details remain visible in the Share card, but are not silently preselected.
    setPayoutShare(share);
    setPayoutCycleNumber("");
    setWithdrawnAmount(share.payout_status === "drawn" ? String(share.withdrawn_amount) : "");
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

  function openCycleEditor(cycleNumber: number, enableEditing = false, billRows: CfcfBillRow[] = bills, cycleRowsOverride: CfcfCycleRow[] = cycleRows) {
    setCycleReview(false);
    setCycleEditNumber(cycleNumber);
    setCycleCreatedInFlow(enableEditing);
    setCycleEditEnabled(enableEditing);
    setCycleBulkBillInputs({ withdrawn: "", undrawn: "" });
    const cycle = cycleRowsOverride.find((row) => row.cycle_number === cycleNumber);
    setCyclePayoutInput(cycle?.planned_payout_amount == null ? "" : String(cycle.planned_payout_amount));
    setCycleCommissionInput(cycle?.commission_amount == null ? "" : String(cycle.commission_amount));
    const nextInputs: Record<string, string> = {};
    for (const share of shares) {
      const bill = billRows.find((row) => row.share_id === share.share_id && row.cycle_id === cycle?.cycle_id);
      nextInputs[share.share_id] = bill ? String(bill.amount) : "";
    }
    setCycleBillInputs(nextInputs);
    setCycleEditError(null);
  }

  function applyCycleBillToGroup(section: "withdrawn" | "undrawn") {
    const raw = cycleBulkBillInputs[section].trim();
    const amount = Number(raw);
    if (raw === "" || !Number.isSafeInteger(amount) || amount < 0 || amount > 2147483647) {
      setCycleEditError("Enter a whole-rupee amount of zero or more before applying it.");
      return;
    }
    const group = shares.filter((share) => share.status === "active" && (share.payout_status === "drawn" ? "withdrawn" : "undrawn") === section);
    setCycleBillInputs((current) => {
      const next = { ...current };
      for (const share of group) next[share.share_id] = String(amount);
      return next;
    });
    setCycleEditError(null);
  }

  async function handleConfirmDeleteCycle() {
    if (!selectedFund || cycleDeleteTarget === null || isCycleBusy || cycleDeleteStep !== 3 || !cycleDeleteAcknowledged || cycleDeleteTypedEmail.trim().toLowerCase() !== workspace.email.trim().toLowerCase()) return;
    if (!beginAction("delete-cycle")) return;
    setIsCycleBusy(true);
    setCycleDeleteError(null);
    try {
      await deleteHighestCfcfCycle(workspace.tenantId, selectedFund.fund_id, cycleDeleteTarget);
      const remaining = cycleRows.filter((row) => row.cycle_number !== cycleDeleteTarget);
      setCycleRows(remaining);
      setSelectedCycleNumber(remaining.at(-1)?.cycle_number ?? null);
      setCycleDeleteTarget(null);
      setCycleDeleteStep(1); setCycleDeleteAcknowledged(false); setCycleDeleteTypedEmail("");
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
      let targetCycleNumber = cycleNumber;
      if (cycleCreatedInFlow) {
        const createdCycle = await addCfcfCycle(workspace.tenantId, selectedFund.fund_id);
        targetCycleNumber = createdCycle.cycle_number;
      }
      await saveCfcfCycleWorkspace(workspace.tenantId, selectedFund.fund_id, targetCycleNumber, payout, commission, billPayload);
      const freshBills = await listCfcfBills(workspace.tenantId, selectedFund.fund_id);
      const freshCycles = await listCfcfCycles(workspace.tenantId, selectedFund.fund_id);
      setBills(freshBills);
      setCycleRows(freshCycles);
      setSelectedCycleNumber(targetCycleNumber);
      setCycleEditNumber(null);
      setCycleEditEnabled(false);
      setCycleCreatedInFlow(false);
      setCycleBulkBillInputs({ withdrawn: "", undrawn: "" });
      setCycleReview(false);
      showDatabaseResult("Cycle " + targetCycleNumber + " saved. Shareholder payments were not changed.");
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
      }
    } catch (error) { setDeleteError(error instanceof Error ? error.message : "Unable to delete this record."); showDatabaseResult(error instanceof Error ? error.message : "Unable to delete this record.", "error"); }
    finally { endAction("delete-record"); setIsDeleting(false); }
  }

  function openShareModal() {
    setShareFormError(null); setShareContactSearch(""); setShareAssignments({});
    setShareAssignmentReview(false); setIsInlineContactOpen(false); setInlineContactName(""); setInlineContactPhone(""); setInlineContactError(null);
    setIsShareModalOpen(true);
  }

  async function handleCreateShare(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedFund || isSavingShare) return;
    const assignments = Object.entries(shareAssignments).filter(([, count]) => count > 0);
    if (!assignments.length) { setShareFormError("Select at least one Contact and assign one or more Shares."); return; }
    if (!shareAssignmentReview) { setShareAssignmentReview(true); setShareFormError(null); return; }
    if (!beginAction("create-share")) return;
    setIsSavingShare(true); setShareFormError(null);
    let created = 0;
    try {
      for (const [contactId, count] of assignments) {
        for (let n = 0; n < count; n += 1) {
          await createCfcfShare(workspace.tenantId, selectedFund.fund_id, workspace.personId, contactId);
          created += 1;
          setShareAssignments((current) => {
            const remaining = (current[contactId] ?? 0) - 1;
            const next = { ...current };
            if (remaining <= 0) delete next[contactId]; else next[contactId] = remaining;
            return next;
          });
        }
      }
      setIsShareModalOpen(false);
      showDatabaseResult("Added " + created + " new Share record(s) to " + selectedFund.fund_name + " for " + assignments.length + " Contact(s).");
      setDetailReloadKey((n) => n + 1); setFundReloadKey((n) => n + 1);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to add all Shares.";
      const total = assignments.reduce((sum, [, count]) => sum + count, 0);
      setShareFormError(created > 0 ? "Only " + created + " of " + total + " Shares were saved before an error. " + message + " Review the Fund before retrying to avoid duplicates." : message);
      showDatabaseResult(created > 0 ? "Partial result: " + created + " Share(s) saved. " + message : message, "error");
      if (created > 0) { setDetailReloadKey((n) => n + 1); setFundReloadKey((n) => n + 1); }
    } finally { endAction("create-share"); setIsSavingShare(false); }
  }

  async function handleCreateInlineContact(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (isSavingInlineContact) return;
    const digits = inlineContactPhone.replace(/\D/g, "");
    if (!inlineContactName.trim()) { setInlineContactError("Enter the contact full name."); return; }
    if (!/^[6-9]\d{9}$/.test(digits)) { setInlineContactError("Enter exactly 10 digits for an Indian mobile number."); return; }
    setIsSavingInlineContact(true); setInlineContactError(null);
    try {
      const existing = contacts.find((contact) => contact.phone.replace(/\D/g, "").replace(/^91/, "").replace(/^0/, "") === digits);
      const contact = existing ?? await createCfcfContact(workspace.tenantId, { name: inlineContactName.trim(), phone: digits });
      if (!existing) setContacts((current) => [...current, contact].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }) || a.phone.localeCompare(b.phone)));
      setShareAssignments((current) => ({ ...current, [contact.contact_id]: current[contact.contact_id] ?? 1 }));
      setShareContactSearch(""); setIsInlineContactOpen(false); setInlineContactName(""); setInlineContactPhone("");
      setShareFormError(null);
    } catch (error) { setInlineContactError(error instanceof Error ? error.message : "Unable to add Contact."); }
    finally { setIsSavingInlineContact(false); }
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
      setActiveTab("fund-summary");
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
    }).sort((a, b) => (contactById.get(a.contact_id)?.name ?? "").localeCompare(contactById.get(b.contact_id)?.name ?? "", undefined, { sensitivity: "base" }) || (contactById.get(a.contact_id)?.phone ?? "").localeCompare(contactById.get(b.contact_id)?.phone ?? "") || a.share_id.localeCompare(b.share_id));
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
          {isArchivesView ? (
            <button type="button" onClick={() => setIsArchivesView(false)} className="inline-flex min-h-10 items-center justify-center gap-1 rounded-xl border border-sky-200 bg-sky-50 px-2.5 text-xs font-semibold text-sky-900 transition hover:bg-sky-100 sm:px-3 sm:text-sm">
              <ChevronLeft size={15} /> Back to Funds
            </button>
          ) : (
            <button type="button" onClick={() => { setIsArchivesView(true); void refreshArchivedFunds(); }} aria-pressed={isArchivesView} className="inline-flex min-h-10 items-center justify-center gap-1 rounded-xl border border-amber-200 bg-amber-50 px-2.5 text-xs font-semibold text-amber-900 transition hover:bg-amber-100 sm:px-3 sm:text-sm">
              <Archive size={15} /> Archives
            </button>
          )}
          <button type="button" onClick={openFundModal} className="inline-flex min-h-10 items-center justify-center gap-1 rounded-xl bg-sky-600 px-2.5 text-xs font-semibold text-white transition hover:bg-sky-700 sm:gap-1.5 sm:px-3 sm:text-sm">
            <Plus size={15} /> New Fund
          </button>
        </div>
      </section>

      {!isArchivesView && selectedFund && (
        <section aria-label="Selected Fund navigation" className="-mt-4 min-w-0 space-y-0">
          <div className="flex min-w-0 items-center justify-between gap-3 rounded-t-xl border border-slate-200 bg-white px-3 py-2.5">
            <div className="min-w-0 flex-1">
              <h2 className="break-words text-sm font-bold leading-5 text-slate-900">{selectedFund.fund_name}</h2>
              <p className="mt-0.5 break-all text-[11px] leading-4 text-slate-500">Fund ID · {selectedFund.fund_id}</p>
              <p className="mt-0.5 text-xs leading-4 text-slate-600">Cycle {selectedFund.current_cycle} of {selectedFund.number_of_cycles ?? "—"}</p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-[11px] font-medium leading-4 text-slate-500">Pending</p>
              <p className="text-sm font-bold leading-5 text-amber-700">{formatINR(selectedFund.fund_total_pending_amount ?? 0)}</p>
            </div>
          </div>
          <div role="tablist" aria-label="Fund workspace sections" className="grid grid-cols-2 gap-0">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "fund-summary"}
              onClick={() => setActiveTab("fund-summary")}
              className={["min-h-11 rounded-none border border-t-0 px-3 text-sm font-semibold transition", activeTab === "fund-summary" ? "border-sky-700 bg-sky-700 text-white" : "border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100"].join(" ")}
            >
              Fund Summary
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "shares"}
              onClick={() => setActiveTab("shares")}
              className={["min-h-11 rounded-none border border-l-0 border-t-0 px-3 text-sm font-semibold transition", activeTab === "shares" ? "border-sky-700 bg-sky-700 text-white" : "border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100"].join(" ")}
            >
              Shares
            </button>
          </div>
        </section>
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
      ) : isArchivesView ? (
        <Modal isOpen={isFullFundReportOpen} title="Full Fund Report" description="Download a report file and open the full report in a separate browser tab. The report is mobile-friendly; use its own Print / Save as PDF control only if you need a PDF." size="large" onClose={() => setIsFullFundReportOpen(false)}>
        <div className="space-y-4">
          <div className="sticky top-0 z-10 -mx-1 flex flex-wrap gap-2 border-b border-slate-100 bg-white px-1 py-2"><button type="button" onClick={printFullFundReport} disabled={!selectedFund || isLoadingFullFundReport || !!fullFundReportError || isArchivingFund} className="min-h-11 flex-1 rounded-xl bg-violet-700 px-4 text-sm font-semibold text-white disabled:opacity-40">Download PDF</button><button type="button" onClick={() => void archiveSelectedFund()} disabled={!selectedFund || isLoadingFullFundReport || isArchivingFund || !!fullFundReportError} className="min-h-11 flex-1 rounded-xl bg-amber-600 px-4 text-sm font-semibold text-white disabled:opacity-40">{isArchivingFund ? "Archiving…" : "Archive Fund"}</button><button type="button" onClick={() => setIsFullFundReportOpen(false)} disabled={isArchivingFund} className="min-h-11 rounded-xl border border-slate-200 px-4 text-sm">Close</button></div>
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

      <Modal isOpen={isArchiveConfirmOpen} title="Danger Zone · Archive Fund" description={"Step " + archiveStep + " of 3 · Permanent archive and deletion review"} onClose={() => { if (!isArchivingFund) { setIsArchiveConfirmOpen(false); setArchiveStep(1); setArchiveAcknowledged(false); setArchiveTypedId(""); setArchivingError(null); } }}>
        {selectedFund && <div className="space-y-4">
          <div className="rounded-xl border border-amber-300 bg-amber-50 p-3">
            <p className="text-sm font-semibold text-amber-950">{selectedFund.fund_name}</p>
            <p className="mt-1 break-all text-xs text-amber-900">Fund ID: {selectedFund.fund_id}</p>
            <p className="mt-2 text-sm leading-5 text-amber-950">Archiving saves the full Fund report, then permanently deletes all operational Shares, Cycle bills, Cycles, payments, adjustments and related Fund financial records. Only the minimal archived Fund identity/status and saved report remain. The report expires after six months. This Fund cannot be restored.</p>
          </div>
          {archiveStep === 1 && <div className="space-y-3">
            <p className="text-sm leading-5 text-slate-700">Review the Fund identity and the permanent consequences before continuing.</p>
            <button type="button" onClick={() => setArchiveStep(2)} className="min-h-11 w-full rounded-xl bg-amber-700 px-4 text-sm font-semibold text-white">I reviewed the archive details</button>
          </div>}
          {archiveStep === 2 && <div className="space-y-3">
            <label className="flex items-start gap-3 rounded-xl border border-amber-300 p-3 text-sm leading-5 text-slate-700"><input type="checkbox" checked={archiveAcknowledged} onChange={(event) => setArchiveAcknowledged(event.target.checked)} className="mt-1 h-4 w-4 shrink-0"/><span>I understand this permanently deletes the Fund's operational financial records. The report is temporary, and the original Fund cannot be restored.</span></label>
            <button type="button" disabled={!archiveAcknowledged} onClick={() => { setArchiveTypedId(""); setArchiveStep(3); }} className="min-h-11 w-full rounded-xl bg-amber-700 px-4 text-sm font-semibold text-white disabled:opacity-40">Continue to final confirmation</button>
          </div>}
          {archiveStep === 3 && <div className="space-y-3">
            <p className="text-sm leading-5 text-slate-700">To confirm, type the email address of the currently logged-in person exactly as shown below.</p>
            <div className="space-y-2">
              <div><p className="text-xs font-medium text-slate-500">Logged-in email ID — type this exact address</p><p className="break-all rounded-lg bg-slate-100 p-3 text-sm font-semibold text-slate-800">{workspace.email}</p></div>
            </div>
            <input aria-label="Type logged-in email ID to confirm archiving" value={archiveTypedId} onChange={(event) => setArchiveTypedId(event.target.value)} autoComplete="email" spellCheck={false} inputMode="email" className="min-h-11 w-full rounded-xl border border-slate-300 px-3 text-sm" placeholder="Enter the email ID shown above"/>
            <button type="button" onClick={() => void confirmArchiveSelectedFund()} disabled={isArchivingFund || !archiveAcknowledged || archiveTypedId.trim().toLowerCase() !== workspace.email.trim().toLowerCase()} className="min-h-11 w-full rounded-xl bg-amber-800 px-4 text-sm font-semibold text-white disabled:opacity-40">{isArchivingFund ? "Archiving and deleting records…" : "Archive Fund and permanently delete records"}</button>
          </div>}
          {archivingError && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800">{archivingError}</p>}
        </div>}
      </Modal>

      <Modal isOpen={Boolean(archivedDeleteTarget)} title="Danger Zone · Delete Archived Fund" description={"Step " + archivedDeleteStep + " of 3 · Permanent report deletion review"} onClose={() => { if (!deletingArchivedId) { setArchivedDeleteTarget(null); setArchivedDeleteStep(1); setArchivedDeleteAcknowledged(false); setArchivedDeleteTypedId(""); setArchivedDeleteError(null); } }}>
        {archivedDeleteTarget && <div className="space-y-4">
          <div className="rounded-xl border border-rose-300 bg-rose-50 p-3">
            <p className="text-sm font-semibold text-rose-950">{archivedDeleteTarget.fund_name}</p>
            <p className="mt-1 break-all text-xs text-rose-900">Fund ID: {archivedDeleteTarget.fund_id}</p>
            <p className="mt-2 text-sm leading-5 text-rose-950">This permanently deletes the saved archived Fund report. The original operational Shares, Cycle bills, Cycles, payments and adjustments were already deleted when the Fund was archived. After deleting this report, its detailed financial history will no longer be available in ClearFlow. The minimal archived Fund identity remains. This cannot be undone.</p>
          </div>
          {archivedDeleteStep === 1 && <div className="space-y-3">
            <p className="text-sm leading-5 text-slate-700">Review the archived Fund identity and understand that the saved report is the remaining detailed financial record.</p>
            <button type="button" onClick={() => setArchivedDeleteStep(2)} className="min-h-11 w-full rounded-xl bg-rose-700 px-4 text-sm font-semibold text-white">I reviewed the archive details</button>
          </div>}
          {archivedDeleteStep === 2 && <div className="space-y-3">
            <label className="flex items-start gap-3 rounded-xl border border-rose-300 p-3 text-sm leading-5 text-slate-700"><input type="checkbox" checked={archivedDeleteAcknowledged} onChange={(event) => setArchivedDeleteAcknowledged(event.target.checked)} className="mt-1 h-4 w-4 shrink-0"/><span>I understand that deleting this report permanently removes the remaining detailed financial history available in ClearFlow and cannot be undone.</span></label>
            <button type="button" disabled={!archivedDeleteAcknowledged} onClick={() => { setArchivedDeleteTypedId(""); setArchivedDeleteStep(3); }} className="min-h-11 w-full rounded-xl bg-rose-700 px-4 text-sm font-semibold text-white disabled:opacity-40">Continue to final confirmation</button>
          </div>}
          {archivedDeleteStep === 3 && <div className="space-y-3">
            <p className="text-sm leading-5 text-slate-700">To confirm, type the logged-in person’s email address exactly as shown below.</p>
            <div className="space-y-2">
              <div><p className="text-xs font-medium text-slate-500">Logged-in email ID — type this exact address</p><p className="break-all rounded-lg bg-slate-100 p-3 text-sm font-semibold text-slate-800">{workspace.email}</p></div>
            </div>
            <input aria-label="Type logged-in email ID to confirm archived report deletion" value={archivedDeleteTypedId} onChange={(event) => setArchivedDeleteTypedId(event.target.value)} autoComplete="off" spellCheck={false} inputMode="email" className="min-h-11 w-full rounded-xl border border-slate-300 px-3 text-sm" placeholder="Enter the email ID shown above"/>
            <button type="button" onClick={() => void confirmDeleteArchivedFund()} disabled={!!deletingArchivedId || !archivedDeleteAcknowledged || archivedDeleteTypedId.trim().toLowerCase() !== workspace.email.trim().toLowerCase()} className="min-h-11 w-full rounded-xl bg-rose-800 px-4 text-sm font-semibold text-white disabled:opacity-40">{deletingArchivedId === archivedDeleteTarget.archive_id ? "Deleting archived report…" : "Permanently delete archived report"}</button>
          </div>}
          {archivedDeleteError && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800">{archivedDeleteError}</p>}
        </div>}
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
        isOpen={isFundPaymentLedgerOpen}
        title="Fund Payment Record Ledger"
        description="Showing up to 40 recent stored records. Share Payments and Fund adjustments remain separate records."
        onClose={() => setIsFundPaymentLedgerOpen(false)}
        size="large"
      >
        <div className="space-y-3">
          {isLoadingDetails ? (
            <LoadingCard message="Loading ledger entries…" />
          ) : detailsError ? (
            <ErrorCard message={detailsError} onRetry={() => setDetailReloadKey((current) => current + 1)} />
          ) : ledgerItems.length === 0 ? (
            <EmptyState
              icon={<CreditCard size={22} />}
              title={"No ledger entries yet"}
              description="Recorded payment rows and Fund adjustments will appear here."
            />
          ) : (
            [...ledgerItems]
              .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id))
              .slice(0, 40)
              .map((item) => (
                <article key={item.id} className="flex min-w-0 items-start gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                  <div className={[
                    "grid h-9 w-9 shrink-0 place-items-center rounded-lg",
                    item.entryType === "credit" ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700",
                  ].join(" ")}>
                    {item.entryType === "credit" ? <ArrowDownLeft size={17} /> : <ArrowUpRight size={17} />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-start justify-between gap-2">
                      <h3 className="break-words text-sm font-semibold capitalize text-slate-900">
                        {item.kind === "payment" ? "Payment" : "Fund adjustment"} · {item.entryType}
                      </h3>
                      <p className="shrink-0 text-sm font-bold text-slate-900">{formatINR(item.amount)}</p>
                    </div>
                    <p className="mt-1 break-words text-xs text-slate-500">
                      {formatDate(item.date)}{item.paymentType ? " · " + item.paymentType : ""}
                    </p>
                    {item.kind === "payment" && item.shareId && (
                      <p className="mt-1 break-words text-xs font-medium text-sky-800">
                        Share {item.shareId}{(() => { const row = shares.find((share) => share.share_id === item.shareId); const contact = row ? contactById.get(row.contact_id) : undefined; return contact?.name ? " · " + contact.name : ""; })()}
                      </p>
                    )}
                    {item.remarks && <p className="mt-1 break-words text-sm leading-5 text-slate-600">{item.remarks}</p>}
                    <p className="mt-1 break-all text-[10px] text-slate-400">Entry ID · {item.id}</p>
                  </div>
                </article>
              ))
          )}
          {!isLoadingDetails && !detailsError && ledgerItems.length > 40 && (
            <p className="text-center text-xs text-slate-500">Showing 40 of {selectedLedger.length} records.</p>
          )}
          <div className="border-t border-slate-100 pt-3">
            <button type="button" onClick={() => setIsFundPaymentLedgerOpen(false)} className="min-h-11 w-full rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white">Close ledger</button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={databaseResult !== null}
        closeOnOverlayClick={false}
        closeOnEscape={false}
        title={databaseResult?.status === "error" ? "Operation failed" : "Operation result"}
        description={databaseResult?.status === "error" ? "The operation could not be completed or confirmed. Review the message below." : "Review the result below."}
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

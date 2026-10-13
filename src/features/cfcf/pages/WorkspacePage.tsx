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
  RefreshCw,
  UsersRound,
  WalletCards,
} from "lucide-react";
import type { AuthorizedWorkspace } from "../../../core/workspace/workspace.types";
import { Modal } from "../../../components/ui/Modal";
import { listCfcfContacts } from "../services/contacts.service";
import {
  createCfcfFund,
  listCfcfFunds,
  listCfcfLedgerItems,
  listCfcfShares,
  type CfcfLedgerItem,
} from "../services/workspace.service";
import type { CfcfContactRow, CfcfFundRow, CfcfShareRow } from "../types/database.types";

type WorkspaceTab = "funds" | "cycles" | "shares" | "ledger";

interface WorkspacePageProps {
  workspace: AuthorizedWorkspace;
}

const emptyFundForm = { fundName: "", startDate: "", numberOfCycles: "", numberOfShares: "" };

interface SavedWorkspaceView {
  tab: WorkspaceTab;
  fundId: string;
}

function readSavedWorkspaceView(tenantId: string): SavedWorkspaceView {
  const fallback: SavedWorkspaceView = { tab: "funds", fundId: "" };
  try {
    const raw = window.localStorage.getItem("clearflow:cfcf-workspace-view:v1:" + tenantId);
    if (!raw) return fallback;
    const saved = JSON.parse(raw) as { tab?: unknown; fundId?: unknown };
    const validTabs: WorkspaceTab[] = ["funds", "cycles", "shares", "ledger"];
    return {
      tab: typeof saved.tab === "string" && validTabs.includes(saved.tab as WorkspaceTab)
        ? saved.tab as WorkspaceTab
        : "funds",
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
  const [selectedFundId, setSelectedFundId] = useState(() => readSavedWorkspaceView(workspace.tenantId).fundId);
  const [activeTab, setActiveTab] = useState<WorkspaceTab>(() => readSavedWorkspaceView(workspace.tenantId).tab);
  const [isLoadingFunds, setIsLoadingFunds] = useState(true);
  const [fundsError, setFundsError] = useState<string | null>(null);
  const [shares, setShares] = useState<CfcfShareRow[]>([]);
  const [contacts, setContacts] = useState<CfcfContactRow[]>([]);
  const [ledgerItems, setLedgerItems] = useState<CfcfLedgerItem[]>([]);
  const [selectedShareId, setSelectedShareId] = useState<string | null>(null);
  const [expandedBillingShareId, setExpandedBillingShareId] = useState<string | null>(null);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [fundReloadKey, setFundReloadKey] = useState(0);
  const [detailReloadKey, setDetailReloadKey] = useState(0);
  const [isFundModalOpen, setIsFundModalOpen] = useState(false);
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
      setExpandedBillingShareId(null);
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
        "clearflow:cfcf-workspace-view:v1:" + workspace.tenantId,
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
    setExpandedBillingShareId(null);
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
    const numberOfShares = fundForm.numberOfShares.trim() ? Number(fundForm.numberOfShares) : null;

    if (numberOfCycles !== null && (!Number.isSafeInteger(numberOfCycles) || numberOfCycles < 1)) {
      setFundFormError("Cycle count must be a positive whole number.");
      return;
    }
    if (numberOfShares !== null && (!Number.isSafeInteger(numberOfShares) || numberOfShares < 1)) {
      setFundFormError("Share count must be a positive whole number.");
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
                onChange={(event) => setSelectedFundId(event.target.value)}
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
                  Cycle cards display the values stored on the fund record; no payout or commission is calculated here.
                </p>
              </section>
              {(selectedFund.number_of_cycles ?? 0) > 0 ? (
                Array.from({ length: Math.min(selectedFund.number_of_cycles ?? 0, 500) }, (_, index) => {
                  const cycleNumber = index + 1;
                  const payout = selectedFund.cycle_payout_amounts?.[index];
                  const commission = selectedFund.cycle_commissions?.[index];
                  return (
                    <article key={cycleNumber} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Cycle {cycleNumber}</p>
                          <h3 className="mt-1 text-base font-semibold text-slate-900">
                            {cycleNumber === selectedFund.current_cycle ? "Current cycle" : "Cycle details"}
                          </h3>
                        </div>
                        {cycleNumber === selectedFund.current_cycle && (
                          <span className="shrink-0 rounded-full bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-700">Current</span>
                        )}
                      </div>
                      <div className="mt-4 grid grid-cols-2 gap-2">
                        <StoredValue label="Stored payout" value={displayStoredAmount(payout)} />
                        <StoredValue label="Stored commission" value={displayStoredAmount(commission)} />
                      </div>
                      <button
                        type="button"
                        onClick={() => setActiveTab("shares")}
                        className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        View fund shares <ChevronRight size={16} />
                      </button>
                    </article>
                  );
                })
              ) : (
                <EmptyState icon={<CalendarDays size={22} />} title="No cycles configured" description="This fund does not currently have a positive cycle count saved." />
              )}
              {(selectedFund.number_of_cycles ?? 0) > 500 && (
                <p className="rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-800">
                  Showing the first 500 configured cycles for this screen. The saved cycle count is unchanged.
                </p>
              )}
            </section>
          )}

          {activeTab === "shares" && (
            <section className="space-y-3">
              {isLoadingDetails ? (
                <LoadingCard message="Loading shares…" />
              ) : detailsError ? (
                <ErrorCard message={detailsError} onRetry={() => setDetailReloadKey((current) => current + 1)} />
              ) : shares.length === 0 ? (
                <EmptyState icon={<UsersRound size={22} />} title="No shares in this fund yet" description="When shares are created, each share will appear here with its contact, saved billing entries, payment status, and payout details." />
              ) : (
                shares.map((share) => {
                  const contact = contactById.get(share.contact_id);
                  const billingEntries = Object.entries(share.billing_entries ?? {});
                  const isBillingExpanded = expandedBillingShareId === share.share_id;
                  return (
                    <article key={share.share_id} className="min-w-0 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
                      <div className="flex min-w-0 items-start gap-2">
                        <div className="min-w-0 flex-1">
                          <h3 className="break-words text-sm font-bold leading-5 text-slate-900">{contact?.name || "Contact not found"}</h3>
                          <p className="mt-0.5 break-all text-xs text-slate-500">{contact?.phone || "No phone saved"}</p>
                          <p className="mt-0.5 break-all text-[10px] text-slate-400">{share.share_id}</p>
                        </div>
                        <span className={[
                          "shrink-0 rounded-full px-2 py-1 text-[10px] font-bold capitalize",
                          share.status === "active" ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600",
                        ].join(" ")}>{share.status}</span>
                      </div>

                      <div className="mt-3 grid grid-cols-2 gap-2 rounded-xl bg-slate-50 p-2.5">
                        <StoredValue label="Total billed" value={formatINR(share.share_total_billed_amount)} />
                        <StoredValue label="Paid" value={formatINR(share.share_net_payment_received)} />
                        <StoredValue label="Pending" value={formatINR(share.total_pending)} />
                        <StoredValue label="Advance" value={formatINR(share.total_advance)} />
                        <StoredValue label="Withdrawn" value={formatINR(share.withdrawn_amount)} />
                        <StoredValue label="Payout" value={share.payout_status || "—"} />
                      </div>

                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => setExpandedBillingShareId(isBillingExpanded ? null : share.share_id)}
                          className="inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-xl border border-violet-200 bg-violet-50 px-2.5 text-xs font-semibold text-violet-800 hover:bg-violet-100"
                        >
                          <CalendarDays size={14} />
                          {isBillingExpanded ? "Hide billing" : "Billing (" + billingEntries.length + ")"}
                        </button>
                        <button
                          type="button"
                          onClick={() => { setSelectedShareId(share.share_id); setActiveTab("ledger"); }}
                          className="inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-xl bg-sky-600 px-2.5 text-xs font-semibold text-white hover:bg-sky-700"
                        >
                          <CreditCard size={14} /> Ledger <ChevronRight size={14} />
                        </button>
                      </div>

                      {isBillingExpanded && (
                        <div className="mt-3 rounded-xl border border-violet-100 bg-violet-50/60 p-2.5">
                          <p className="text-[10px] font-bold uppercase tracking-wide text-violet-800">Saved billing entries</p>
                          {billingEntries.length > 0 ? (
                            <div className="mt-2 grid grid-cols-2 gap-2">
                              {billingEntries.map(([cycle, value]) => (
                                <div key={cycle} className="min-w-0 rounded-lg border border-slate-200 bg-white p-2">
                                  <p className="truncate text-[10px] text-slate-500">{cycle}</p>
                                  <p className="mt-0.5 break-words text-xs font-semibold text-slate-900">{displayStoredAmount(value)}</p>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="mt-2 text-xs text-slate-500">No billing entries saved.</p>
                          )}
                        </div>
                      )}
                    </article>
                  );
                })
              )}
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
          <div className="grid grid-cols-2 gap-3">
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
            <div className="min-w-0">
              <label htmlFor="fund-share-count" className="mb-1.5 block text-sm font-medium text-slate-700">Share count</label>
              <input
                id="fund-share-count"
                type="number"
                inputMode="numeric"
                min="1"
                step="1"
                value={fundForm.numberOfShares}
                onChange={(event) => setFundForm((current) => ({ ...current, numberOfShares: event.target.value }))}
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

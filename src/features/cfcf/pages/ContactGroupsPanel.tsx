// CFCF PRODUCT: Contact Group management and bulk campaign composer.
// MIX: Receives authorized workspace identity and existing Contacts; campaign dispatch goes through the authenticated Edge Function.

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { FolderPlus, Pencil, Trash2, UsersRound, Megaphone, MessageCircle, Mail, Smartphone, RefreshCw, CheckCircle2 } from "lucide-react";
import { Modal } from "../../../components/ui/Modal";
import type { AuthorizedWorkspace } from "../../../core/workspace/workspace.types";
import type { CfcfContactRow } from "../types/database.types";
import {
  addCfcfContactToGroup,
  createCfcfContactGroup,
  deleteCfcfContactGroup,
  listCfcfContactGroups,
  listCfcfGroupMembers,
  dispatchCfcfCampaign,
  removeCfcfContactFromGroup,
  renameCfcfContactGroup,
  type CfcfCampaignChannel,
  type CfcfCampaignDispatchReceipt,
  type CfcfContactGroupMemberRow,
  type CfcfContactGroupRow,
} from "../services/contact-groups.service";

interface ContactGroupsPanelProps {
  workspace: AuthorizedWorkspace;
  contacts: CfcfContactRow[];
  contactsLoaded: boolean;
}

const buttonClass = "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50";
const inputClass = "w-full min-w-0 rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-100";

// CFCF PRODUCT: Keep campaign launch disabled until the n8n webhook and callback have been configured and tested.
const CAMPAIGN_AUTOMATION_ENABLED = false;

export function ContactGroupsPanel({ workspace, contacts, contactsLoaded }: ContactGroupsPanelProps) {
  const [groups, setGroups] = useState<CfcfContactGroupRow[]>([]);
  const [members, setMembers] = useState<CfcfContactGroupMemberRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const loadRequestId = useRef(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [acknowledgement, setAcknowledgement] = useState<{ title: string; message: string } | null>(null);
  const [groupName, setGroupName] = useState("");
  const [editingGroup, setEditingGroup] = useState<CfcfContactGroupRow | null>(null);
  const [isSavingGroup, setIsSavingGroup] = useState(false);
  const [groupFormError, setGroupFormError] = useState<string | null>(null);
  const [membershipGroup, setMembershipGroup] = useState<CfcfContactGroupRow | null>(null);
  const [membershipSearch, setMembershipSearch] = useState("");
  const [busyContactId, setBusyContactId] = useState<string | null>(null);
  const [deletingGroup, setDeletingGroup] = useState<CfcfContactGroupRow | null>(null);
  const [isDeletingGroup, setIsDeletingGroup] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);
  const [isCampaignOpen, setIsCampaignOpen] = useState(false);
  const [campaignGroupIds, setCampaignGroupIds] = useState<string[]>([]);
  const [channels, setChannels] = useState<CfcfCampaignChannel[]>(["whatsapp"]);
  const [message, setMessage] = useState("");
  const [isPreparingCampaign, setIsPreparingCampaign] = useState(false);
  const [campaignError, setCampaignError] = useState<string | null>(null);
  const [preparedCampaign, setPreparedCampaign] = useState<CfcfCampaignDispatchReceipt | null>(null);

  async function loadGroups(showRefresh = false) {
    const requestId = ++loadRequestId.current;
    if (showRefresh) setIsRefreshing(true);
    else setIsLoading(true);
    setError(null);
    try {
      const rows = await listCfcfContactGroups(workspace.tenantId);
      const memberRows = await listCfcfGroupMembers(workspace.tenantId, rows.map((group) => group.group_id));
      if (requestId !== loadRequestId.current) return;
      setGroups(rows);
      setMembers(memberRows);
    } catch (loadFailure) {
      if (requestId === loadRequestId.current) {
        setError(loadFailure instanceof Error ? loadFailure.message : "Unable to load Contact Groups.");
      }
    } finally {
      if (requestId === loadRequestId.current) {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    }
  }

  useEffect(() => {
    setGroups([]);
    setMembers([]);
    setNotice(null);
    void loadGroups();
    // The authorized tenant is the only trigger for reloading group data.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace.tenantId]);

  // MIX: Keep membership UI aligned when a Contact is deleted from the directory.
  useEffect(() => {
    if (!contactsLoaded) return;
    const existingContactIds = new Set(contacts.map((contact) => contact.contact_id));
    setMembers((current) => current.filter((member) => existingContactIds.has(member.contact_id)));
  }, [contacts, contactsLoaded]);

  const memberCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const member of members) counts.set(member.group_id, (counts.get(member.group_id) ?? 0) + 1);
    return counts;
  }, [members]);

  const filteredMembershipContacts = useMemo(() => {
    const query = membershipSearch.trim().toLowerCase();
    if (!query) return contacts;
    return contacts.filter((contact) =>
      [contact.name, contact.phone, contact.email ?? ""].some((value) => value.toLowerCase().includes(query)),
    );
  }, [contacts, membershipSearch]);

  function openCreateGroup() {
    setEditingGroup(null);
    setGroupName("");
    setGroupFormError(null);
    setNotice(null);
    setIsGroupModalOpen(true);
  }

  function openRenameGroup(group: CfcfContactGroupRow) {
    setEditingGroup(group);
    setGroupName(group.group_name);
    setGroupFormError(null);
    setNotice(null);
    setIsGroupModalOpen(true);
  }

  async function handleSaveGroup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setGroupFormError(null);
    setIsSavingGroup(true);
    try {
      if (editingGroup) {
        const updated = await renameCfcfContactGroup(workspace.tenantId, editingGroup.group_id, groupName);
        setGroups((current) => current.map((group) => group.group_id === updated.group_id ? updated : group)
          .sort((a, b) => a.group_name.localeCompare(b.group_name)));
        setNotice(null);
        setAcknowledgement({ title: "Group renamed", message: "Supabase returned the updated Contact Group record. Your change is saved." });
      } else {
        const created = await createCfcfContactGroup(workspace.tenantId, workspace.personId, groupName);
        setGroups((current) => [...current, created].sort((a, b) => a.group_name.localeCompare(b.group_name)));
        setNotice(null);
        setAcknowledgement({ title: "Group created", message: "Supabase returned the new Contact Group record. The group is saved." });
      }
      setIsGroupModalOpen(false);
    } catch (saveFailure) {
      setGroupFormError(saveFailure instanceof Error ? saveFailure.message : "Unable to save Contact Group.");
    } finally {
      setIsSavingGroup(false);
    }
  }

  async function handleToggleMember(contactId: string, checked: boolean) {
    if (!membershipGroup || busyContactId) return;
    const groupId = membershipGroup.group_id;
    setBusyContactId(contactId);
    setError(null);
    try {
      if (checked) {
        await addCfcfContactToGroup(workspace.tenantId, groupId, contactId);
        setMembers((current) => current.some((member) => member.group_id === groupId && member.contact_id === contactId)
          ? current
          : [...current, {
            group_id: groupId,
            contact_id: contactId,
            product_id: "CFCF",
            tenant_id: workspace.tenantId,
            created_at: new Date().toISOString(),
          }]);
        setAcknowledgement({ title: "Contact added to group", message: "Supabase confirmed the membership change." });
      } else {
        await removeCfcfContactFromGroup(workspace.tenantId, groupId, contactId);
        setMembers((current) => current.filter((member) => !(member.group_id === groupId && member.contact_id === contactId)));
        setAcknowledgement({ title: "Contact removed from group", message: "Supabase confirmed the membership change." });
      }
    } catch (memberFailure) {
      setError(memberFailure instanceof Error ? memberFailure.message : "Unable to update group membership.");
    } finally {
      setBusyContactId(null);
    }
  }

  async function handleDeleteGroup() {
    if (!deletingGroup || isDeletingGroup) return;
    setIsDeletingGroup(true);
    setDeleteError(null);
    try {
      await deleteCfcfContactGroup(workspace.tenantId, deletingGroup.group_id);
      setGroups((current) => current.filter((group) => group.group_id !== deletingGroup.group_id));
      setMembers((current) => current.filter((member) => member.group_id !== deletingGroup.group_id));
      setCampaignGroupIds((current) => current.filter((id) => id !== deletingGroup.group_id));
      setNotice(null);
      setDeletingGroup(null);
      setAcknowledgement({ title: "Group deleted", message: "Supabase confirmed the delete request. The Contact records themselves were not deleted." });
    } catch (deleteFailure) {
      setDeleteError(deleteFailure instanceof Error ? deleteFailure.message : "Unable to delete Contact Group.");
    } finally {
      setIsDeletingGroup(false);
    }
  }

  function openCampaign() {
    setCampaignGroupIds([]);
    setChannels(["whatsapp"]);
    setMessage("");
    setCampaignError(null);
    setPreparedCampaign(null);
    setIsCampaignOpen(true);
  }

  function toggleChannel(channel: CfcfCampaignChannel, checked: boolean) {
    setChannels((current) => checked
      ? [...new Set([...current, channel])]
      : current.filter((value) => value !== channel));
  }

  const campaignRecipientIds = useMemo(() => {
    const selected = new Set(campaignGroupIds);
    return [...new Set(members.filter((member) => selected.has(member.group_id)).map((member) => member.contact_id))];
  }, [campaignGroupIds, members]);

  const campaignRecipientCount = campaignRecipientIds.length;
  const campaignMissingEmailCount = useMemo(() => {
    if (!channels.includes("email")) return 0;
    const emailByContactId = new Map(contacts.map((contact) => [contact.contact_id, contact.email]));
    return campaignRecipientIds.filter((contactId) => !emailByContactId.get(contactId)?.trim()).length;
  }, [campaignRecipientIds, channels, contacts]);

  const campaignEligibleRecipientCount = channels.includes("whatsapp") || channels.includes("sms")
    ? campaignRecipientCount
    : campaignRecipientCount - campaignMissingEmailCount;

  async function handlePrepareCampaign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!CAMPAIGN_AUTOMATION_ENABLED) {
      setCampaignError("Campaign launch is disabled until the n8n webhook and delivery callback are configured and tested. No messages have been sent.");
      return;
    }
    setCampaignError(null);
    setPreparedCampaign(null);
    setIsPreparingCampaign(true);
    try {
      const receipt = await dispatchCfcfCampaign(
        workspace.tenantId,
        campaignGroupIds,
        channels,
        message,
      );
      setPreparedCampaign(receipt);
      setNotice("n8n acknowledged campaign " + receipt.campaign_id + ". Delivery is processing; final results will appear in Notifications.");
    } catch (prepareFailure) {
      setCampaignError(prepareFailure instanceof Error ? prepareFailure.message : "Unable to prepare this campaign.");
    } finally {
      setIsPreparingCampaign(false);
    }
  }

  return (
    <section className="min-w-0 space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div className="flex items-start gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-violet-50 text-violet-700"><UsersRound size={20} /></div>
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-slate-950">Contact Groups</h2>
            <p className="mt-1 text-sm leading-5 text-slate-500">Organize Contacts into reusable audiences for bulk campaigns.</p>
          </div>
        </div>
        <div className="grid w-full min-w-0 grid-cols-[44px_minmax(0,1fr)_minmax(0,1fr)] gap-2 sm:w-auto">
          <button
            type="button"
            onClick={() => void loadGroups(true)}
            disabled={isLoading || isRefreshing}
            aria-label="Refresh contact groups"
            title="Refresh contact groups"
            className="inline-flex min-h-10 min-w-0 items-center justify-center rounded-xl border border-slate-200 px-2 py-2 text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCw size={17} className={isRefreshing ? "animate-spin" : ""} />
          </button>
          <button
            type="button"
            onClick={openCampaign}
            disabled={groups.length === 0 || !CAMPAIGN_AUTOMATION_ENABLED}
            title={!CAMPAIGN_AUTOMATION_ENABLED ? "Campaign automation is not configured yet" : undefined}
            className={buttonClass + " min-w-0 gap-1.5 whitespace-nowrap bg-emerald-600 px-2 text-xs text-white hover:bg-emerald-700"}
          >
            <Megaphone size={15} className="shrink-0" /> <span>Launch campaign</span>
          </button>
          <button
            type="button"
            onClick={openCreateGroup}
            className={buttonClass + " min-w-0 gap-1.5 whitespace-nowrap bg-violet-600 px-2 text-xs text-white hover:bg-violet-700"}
          >
            <FolderPlus size={15} className="shrink-0" /> <span>New group</span>
          </button>
        </div>
      </div>

      {!CAMPAIGN_AUTOMATION_ENABLED && <div role="status" className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm leading-5 text-amber-900"><strong>Campaign automation is not enabled yet.</strong> Contact Groups and the campaign integration are prepared, but Launch campaign stays disabled until the n8n webhook and delivery callback are configured and tested. No messages will be sent before then.</div>}
      {notice && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-800">{notice}</div>}
      {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-800">{error}</div>}

      {isLoading ? (
        <div aria-live="polite" className="flex items-center justify-center gap-2 rounded-xl bg-slate-50 px-4 py-8 text-center text-sm text-slate-500"><RefreshCw size={17} className="animate-spin" /> Loading Contact Groups from Supabase…</div>
      ) : groups.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 px-5 py-8 text-center">
          <FolderPlus className="mx-auto text-violet-600" size={25} />
          <p className="mt-2 font-semibold text-slate-900">No Contact Groups yet</p>
          <p className="mt-1 text-sm text-slate-500">Create a group such as “Monthly Customers” or “Festival Offers”, then add Contacts.</p>
          <button type="button" onClick={openCreateGroup} className={buttonClass + " mt-4 bg-violet-600 text-white hover:bg-violet-700"}><FolderPlus size={16} /> Create first group</button>
        </div>
      ) : (
        <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {groups.map((group) => (
            <article key={group.group_id} className="min-w-0 rounded-xl border border-slate-200 p-3 sm:p-4">
              <div className="flex items-start gap-3">
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-violet-50 text-violet-700"><UsersRound size={18} /></div>
                <div className="min-w-0 flex-1">
                  <h3 className="break-words font-semibold text-slate-900">{group.group_name}</h3>
                  <p className="mt-1 text-sm text-slate-500">{memberCounts.get(group.group_id) ?? 0} contacts</p>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button type="button" onClick={() => { setMembershipGroup(group); setMembershipSearch(""); }} className={buttonClass + " border border-violet-200 bg-violet-50 text-violet-800 hover:bg-violet-100"}><UsersRound size={15} /> Members</button>
                <button type="button" onClick={() => openRenameGroup(group)} className={buttonClass + " border border-slate-200 text-slate-700 hover:bg-slate-50"}><Pencil size={14} /> Rename</button>
                <button type="button" onClick={() => { setDeleteError(null); setDeletingGroup(group); }} className={buttonClass + " col-span-2 border border-rose-200 bg-rose-50 text-rose-800 hover:bg-rose-100"}><Trash2 size={14} /> Delete group</button>
              </div>
            </article>
          ))}
        </div>
      )}

      <Modal isOpen={isGroupModalOpen} title={editingGroup ? "Rename Contact Group" : "Create Contact Group"} description="Group names are private to this authorized workspace." onClose={() => { if (!isSavingGroup) setIsGroupModalOpen(false); }}>
        <form onSubmit={(event) => void handleSaveGroup(event)} className="space-y-4">
          <div>
            <label htmlFor="contact-group-name" className="mb-1.5 block text-sm font-medium text-slate-700">Group name</label>
            <input id="contact-group-name" className={inputClass} value={groupName} onChange={(event) => setGroupName(event.target.value)} maxLength={120} required autoFocus placeholder="e.g. Monthly Customers" />
          </div>
          {groupFormError && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800">{groupFormError}</p>}
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
            <button type="button" onClick={() => setIsGroupModalOpen(false)} disabled={isSavingGroup} className={buttonClass + " border border-slate-200 text-slate-700"}>Cancel</button>
            <button type="submit" disabled={isSavingGroup || !groupName.trim()} className={buttonClass + " bg-violet-600 text-white hover:bg-violet-700"}>{isSavingGroup ? <><RefreshCw size={15} className="animate-spin" /> Waiting for Supabase…</> : editingGroup ? "Save name" : "Create group"}</button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={Boolean(membershipGroup)} title={membershipGroup ? "Manage members · " + membershipGroup.group_name : "Manage members"} description="Changes are saved one Contact at a time. A Contact can belong to multiple groups." size="large" onClose={() => { if (!busyContactId) setMembershipGroup(null); }}>
        <div className="space-y-3">
          <input value={membershipSearch} onChange={(event) => setMembershipSearch(event.target.value)} placeholder="Search contacts by name, phone or email" className={inputClass} />
          <div className="max-h-[55vh] space-y-1 overflow-y-auto rounded-xl border border-slate-200 p-2">
            {filteredMembershipContacts.length === 0 ? <p className="p-4 text-center text-sm text-slate-500">No matching contacts.</p> : filteredMembershipContacts.map((contact) => {
              const checked = members.some((member) => member.group_id === membershipGroup?.group_id && member.contact_id === contact.contact_id);
              return (
                <label key={contact.contact_id} className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-slate-50">
                  <input type="checkbox" checked={checked} disabled={busyContactId === contact.contact_id} onChange={(event) => void handleToggleMember(contact.contact_id, event.target.checked)} className="h-4 w-4 rounded border-slate-300 text-violet-600 focus:ring-violet-500" />
                  <span className="min-w-0 flex-1">
                    <span className="block break-words text-sm font-medium text-slate-900">{contact.name}</span>
                    <span className="block break-all text-xs text-slate-500">{contact.phone}{contact.email ? " · " + contact.email : ""}</span>
                  </span>
                  {busyContactId === contact.contact_id && <RefreshCw size={15} className="animate-spin text-violet-600" />}
                </label>
              );
            })}
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-slate-100 pt-3">
            <p className="text-sm text-slate-500">{membershipGroup ? memberCounts.get(membershipGroup.group_id) ?? 0 : 0} selected</p>
            <button type="button" onClick={() => setMembershipGroup(null)} disabled={Boolean(busyContactId)} className={buttonClass + " bg-slate-900 text-white hover:bg-slate-700"}>Done</button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={Boolean(deletingGroup)} title="Delete Contact Group?" description="This deletes the group and its membership rows, not the Contacts." onClose={() => { if (!isDeletingGroup) setDeletingGroup(null); }}>
        <div className="space-y-4">
          <p className="text-sm leading-6 text-slate-600">Delete <strong className="text-slate-900">{deletingGroup?.group_name}</strong>? Contacts and existing Share records remain unchanged.</p>
          {deleteError && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800">{deleteError}</p>}
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
            <button type="button" onClick={() => setDeletingGroup(null)} disabled={isDeletingGroup} className={buttonClass + " border border-slate-200 text-slate-700"}>Cancel</button>
            <button type="button" onClick={() => void handleDeleteGroup()} disabled={isDeletingGroup} className={buttonClass + " bg-rose-600 text-white hover:bg-rose-700"}>{isDeletingGroup ? <RefreshCw size={15} className="animate-spin" /> : <Trash2 size={15} />} {isDeletingGroup ? "Waiting for Supabase…" : "Delete group"}</button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={Boolean(acknowledgement)}
        title={acknowledgement?.title ?? "Database confirmation"}
        description="Confirmed by Supabase"
        onClose={() => setAcknowledgement(null)}
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-900">
            <CheckCircle2 size={22} className="mt-0.5 shrink-0" />
            <p className="text-sm leading-6">{acknowledgement?.message}</p>
          </div>
          <div className="flex justify-end border-t border-slate-100 pt-4">
            <button type="button" autoFocus onClick={() => setAcknowledgement(null)} className={buttonClass + " bg-sky-600 text-white hover:bg-sky-700"}>OK</button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={isCampaignOpen} title="Launch Campaign" description={CAMPAIGN_AUTOMATION_ENABLED ? "Select an audience, choose delivery channels and write your message." : "Preview the campaign setup. Sending is disabled until n8n is configured."} size="large" onClose={() => { if (!isPreparingCampaign) setIsCampaignOpen(false); }}>
        <form onSubmit={(event) => void handlePrepareCampaign(event)} className="space-y-5">
          {!CAMPAIGN_AUTOMATION_ENABLED && <div role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm leading-5 text-amber-900"><strong>Automation not enabled — no messages will be sent.</strong> Configure the n8n webhook and callback secret, test the workflow, then enable the campaign feature flag in this file.</div>}
          <fieldset>
            <legend className="mb-2 text-sm font-semibold text-slate-800">Delivery channels</legend>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {([
                { value: "whatsapp" as const, label: "WhatsApp", icon: MessageCircle, color: "emerald" },
                { value: "sms" as const, label: "SMS", icon: Smartphone, color: "blue" },
                { value: "email" as const, label: "Email", icon: Mail, color: "violet" },
              ]).map((channel) => {
                const checked = channels.includes(channel.value);
                const Icon = channel.icon;
                return (
                  <label key={channel.value} className={"flex cursor-pointer items-center gap-2 rounded-xl border p-3 text-sm font-medium " + (checked ? "border-sky-300 bg-sky-50 text-sky-900" : "border-slate-200 text-slate-700")}>
                    <input type="checkbox" checked={checked} onChange={(event) => toggleChannel(channel.value, event.target.checked)} className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500" />
                    <Icon size={17} /> {channel.label}
                  </label>
                );
              })}
            </div>
          </fieldset>
          <fieldset>
            <legend className="mb-2 text-sm font-semibold text-slate-800">Target Contact Groups</legend>
            <div className="max-h-44 space-y-1 overflow-y-auto rounded-xl border border-slate-200 p-2">
              {groups.map((group) => (
                <label key={group.group_id} className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 hover:bg-slate-50">
                  <input type="checkbox" checked={campaignGroupIds.includes(group.group_id)} onChange={(event) => setCampaignGroupIds((current) => event.target.checked ? [...new Set([...current, group.group_id])] : current.filter((id) => id !== group.group_id))} className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500" />
                  <span className="min-w-0 flex-1 break-words text-sm font-medium text-slate-800">{group.group_name}</span>
                  <span className="shrink-0 text-xs text-slate-500">{memberCounts.get(group.group_id) ?? 0} contacts</span>
                </label>
              ))}
            </div>
            <p className="mt-2 text-sm text-slate-500">Unique recipients: <strong className="text-slate-900">{campaignRecipientCount}</strong> (overlapping Contacts are counted once).</p>
            {campaignMissingEmailCount > 0 && (
              <p role="status" className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
                {campaignMissingEmailCount} selected {campaignMissingEmailCount === 1 ? "Contact has" : "Contacts have"} no email address. The future n8n workflow should skip these recipients for Email delivery.
              </p>
            )}
            <p className="mt-1 text-xs text-slate-500">Recipients eligible for the selected channels: {campaignEligibleRecipientCount}</p>
          </fieldset>
          <div>
            <label htmlFor="campaign-message" className="mb-1.5 block text-sm font-semibold text-slate-800">Message</label>
            <textarea id="campaign-message" value={message} onChange={(event) => setMessage(event.target.value)} rows={4} maxLength={5000} required placeholder="Write the message to send to selected Contacts…" className={inputClass + " resize-y"} />
            <p className="mt-1 text-right text-xs text-slate-400">{message.length}/5000</p>
          </div>
          {campaignError && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{campaignError}</p>}
          {preparedCampaign && (
            <div role="status" className="space-y-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
              <div className="flex items-center gap-2 font-semibold"><CheckCircle2 size={17} /> n8n acknowledged receipt</div>
              <p>{preparedCampaign.recipient_count} unique recipients queued across {preparedCampaign.channels.join(", ")}. This is an acceptance receipt, not a delivery confirmation.</p>
              <p className="break-all text-xs text-emerald-800">Campaign ID: {preparedCampaign.campaign_id}</p>
              <p className="text-xs text-emerald-800">Final delivery status will be recorded in Notifications when n8n calls the delivery callback.</p>
            </div>
          )}
          <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
            <button type="button" onClick={() => setIsCampaignOpen(false)} disabled={isPreparingCampaign} className={buttonClass + " border border-slate-200 text-slate-700"}>Close</button>
            <button type="submit" disabled={!CAMPAIGN_AUTOMATION_ENABLED || isPreparingCampaign || campaignGroupIds.length === 0 || channels.length === 0 || !message.trim() || campaignEligibleRecipientCount === 0} className={buttonClass + " bg-emerald-600 text-white hover:bg-emerald-700"}>
              {isPreparingCampaign ? <RefreshCw size={16} className="animate-spin" /> : <Megaphone size={16} />} {isPreparingCampaign ? "Waiting for n8n acknowledgement…" : CAMPAIGN_AUTOMATION_ENABLED ? "Send campaign" : "Campaign launch disabled"}
            </button>
          </div>
        </form>
      </Modal>
    </section>
  );
}

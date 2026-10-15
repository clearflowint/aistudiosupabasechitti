-- Destructive archive semantics: preserve only the Fund identity and the downloadable report.
alter table public.cfcf_funds alter column person_id drop not null;
alter table public.cfcf_funds alter column fund_name drop not null;

alter table public.cfcf_funds drop constraint if exists cfcf_funds_status_check;
alter table public.cfcf_funds add constraint cfcf_funds_status_check
  check (status = any (array['active'::text, 'inactive'::text, 'closed'::text, 'archived'::text]));

create or replace function public.cfcf_archive_fund_with_report(
  p_tenant_id text,
  p_fund_id text,
  p_report_html text
) returns public.cfcf_archived_funds
language plpgsql
set search_path to 'public'
as $function$
declare
  v_fund public.cfcf_funds%rowtype;
  v_archive public.cfcf_archived_funds%rowtype;
begin
  if not public.is_active_tenant_owner('CFCF', p_tenant_id) then
    raise exception 'Only the active tenant owner can archive a Fund.';
  end if;
  if p_report_html is null or length(trim(p_report_html)) < 100 then
    raise exception 'The complete Fund report is not ready to archive.';
  end if;

  select * into v_fund
  from public.cfcf_funds
  where product_id = 'CFCF' and tenant_id = p_tenant_id and fund_id = p_fund_id
  for update;

  if not found then raise exception 'Fund not found or access denied.'; end if;
  if v_fund.archived_at is not null or v_fund.status = 'archived' then
    raise exception 'This Fund is already archived.';
  end if;

  -- Save the complete report first. All following deletes and the status update
  -- run in this same transaction; any error rolls the entire archive back.
  insert into public.cfcf_archived_funds (product_id, tenant_id, fund_id, fund_name, report_html)
  values ('CFCF', p_tenant_id, v_fund.fund_id, v_fund.fund_name, p_report_html)
  returning * into v_archive;

  -- Remove audit rows directly linked to this Fund and its owned financial records.
  delete from public.cfcf_activity_log
  where product_id = 'CFCF' and tenant_id = p_tenant_id
    and (
      entity_id = p_fund_id
      or entity_id in (select s.share_id from public.cfcf_shares s where s.product_id='CFCF' and s.tenant_id=p_tenant_id and s.fund_id=p_fund_id)
      or entity_id in (select c.cycle_id::text from public.cfcf_cycles c where c.product_id='CFCF' and c.tenant_id=p_tenant_id and c.fund_id=p_fund_id)
      or entity_id in (select b.bill_id::text from public.cfcf_bills b where b.product_id='CFCF' and b.tenant_id=p_tenant_id and b.fund_id=p_fund_id)
      or entity_id in (select p.payment_id from public.cfcf_payments p where p.product_id='CFCF' and p.tenant_id=p_tenant_id and p.fund_id=p_fund_id)
      or entity_id in (select e.entry_id from public.cfcf_fund_other_entries e where e.product_id='CFCF' and e.tenant_id=p_tenant_id and e.fund_id=p_fund_id)
    );

  -- Delete children before their referenced Share/Cycle rows.
  delete from public.cfcf_bills
    where product_id='CFCF' and tenant_id=p_tenant_id and fund_id=p_fund_id;
  delete from public.cfcf_payments
    where product_id='CFCF' and tenant_id=p_tenant_id and fund_id=p_fund_id;
  delete from public.cfcf_fund_other_entries
    where product_id='CFCF' and tenant_id=p_tenant_id and fund_id=p_fund_id;
  delete from public.cfcf_shares
    where product_id='CFCF' and tenant_id=p_tenant_id and fund_id=p_fund_id;
  delete from public.cfcf_cycles
    where product_id='CFCF' and tenant_id=p_tenant_id and fund_id=p_fund_id;

  -- Keep the stable Fund ID and tenant/product keys only; remove its other data.
  update public.cfcf_funds
  set person_id = null,
      fund_name = null,
      start_date = null,
      number_of_cycles = null,
      number_of_shares = null,
      current_cycle = 0,
      cycle_payout_amounts = '[]'::jsonb,
      cycle_commissions = '[]'::jsonb,
      fund_net_balance = 0,
      fund_total_billed_amount = 0,
      fund_total_pending_amount = 0,
      fund_total_advance = 0,
      fund_total_withdrawn = 0,
      fund_total_commissions = 0,
      other_amount = 0,
      status = 'archived',
      archived_at = now(),
      updated_at = now()
  where product_id='CFCF' and tenant_id=p_tenant_id and fund_id=p_fund_id;

  return v_archive;
end;
$function$;

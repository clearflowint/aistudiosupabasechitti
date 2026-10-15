-- Preserve all operational records when archiving a CFCF Fund.
-- Permanent deletion is intentionally kept separate for a later design decision.
alter table public.cfcf_funds add column if not exists archived_at timestamptz;

create or replace function public.cfcf_archive_fund_with_report(
  p_tenant_id text,
  p_fund_id text,
  p_report_html text
) returns public.cfcf_archived_funds
language plpgsql
security invoker
set search_path = public
as $$
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
  if v_fund.archived_at is not null then raise exception 'This Fund is already archived.'; end if;

  insert into public.cfcf_archived_funds (product_id, tenant_id, fund_id, fund_name, report_html)
  values ('CFCF', p_tenant_id, v_fund.fund_id, v_fund.fund_name, p_report_html)
  returning * into v_archive;

  update public.cfcf_funds
  set archived_at = now(), updated_at = now()
  where product_id = 'CFCF' and tenant_id = p_tenant_id and fund_id = p_fund_id;

  return v_archive;
end;
$$;

-- CFCF Fund archiving: save the complete report before removing operational records.
create extension if not exists pg_cron with schema pg_catalog;

create table if not exists public.cfcf_archived_funds (
  archive_id uuid primary key default gen_random_uuid(),
  product_id text not null default 'CFCF' check (product_id = 'CFCF'),
  tenant_id text not null,
  fund_id text not null,
  fund_name text not null,
  archived_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '6 months'),
  report_html text not null check (length(trim(report_html)) > 0),
  constraint cfcf_archived_funds_tenant_fk
    foreign key (tenant_id, product_id) references public.tenants (tenant_id, product_id) on delete cascade
);

create index if not exists cfcf_archived_funds_tenant_archived_idx
  on public.cfcf_archived_funds (tenant_id, archived_at desc);
create index if not exists cfcf_archived_funds_expiry_idx
  on public.cfcf_archived_funds (expires_at);

alter table public.cfcf_archived_funds enable row level security;

drop policy if exists cfcf_archived_funds_owner_select on public.cfcf_archived_funds;
create policy cfcf_archived_funds_owner_select on public.cfcf_archived_funds
  for select to authenticated
  using (public.is_active_tenant_owner('CFCF', tenant_id));

drop policy if exists cfcf_archived_funds_owner_insert on public.cfcf_archived_funds;
create policy cfcf_archived_funds_owner_insert on public.cfcf_archived_funds
  for insert to authenticated
  with check (public.is_active_tenant_owner('CFCF', tenant_id));

drop policy if exists cfcf_archived_funds_owner_delete on public.cfcf_archived_funds;
create policy cfcf_archived_funds_owner_delete on public.cfcf_archived_funds
  for delete to authenticated
  using (public.is_active_tenant_owner('CFCF', tenant_id));

revoke all on public.cfcf_archived_funds from anon;
grant select, insert, delete on public.cfcf_archived_funds to authenticated;

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

  insert into public.cfcf_archived_funds (product_id, tenant_id, fund_id, fund_name, report_html)
  values ('CFCF', p_tenant_id, v_fund.fund_id, v_fund.fund_name, p_report_html)
  returning * into v_archive;

  -- Keep this in the same transaction as the report insert: a failure rolls everything back.
  delete from public.cfcf_fund_other_entries where product_id = 'CFCF' and tenant_id = p_tenant_id and fund_id = p_fund_id;
  delete from public.cfcf_payments where product_id = 'CFCF' and tenant_id = p_tenant_id and fund_id = p_fund_id;
  delete from public.cfcf_bills where product_id = 'CFCF' and tenant_id = p_tenant_id and fund_id = p_fund_id;
  delete from public.cfcf_cycles where product_id = 'CFCF' and tenant_id = p_tenant_id and fund_id = p_fund_id;
  delete from public.cfcf_shares where product_id = 'CFCF' and tenant_id = p_tenant_id and fund_id = p_fund_id;
  delete from public.cfcf_funds where product_id = 'CFCF' and tenant_id = p_tenant_id and fund_id = p_fund_id;

  return v_archive;
end;
$$;
revoke all on function public.cfcf_archive_fund_with_report(text, text, text) from public, anon;
grant execute on function public.cfcf_archive_fund_with_report(text, text, text) to authenticated;

create or replace function public.cfcf_delete_archived_fund(p_tenant_id text, p_archive_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if not public.is_active_tenant_owner('CFCF', p_tenant_id) then
    raise exception 'Only the active tenant owner can delete an archived Fund.';
  end if;
  delete from public.cfcf_archived_funds
  where archive_id = p_archive_id and tenant_id = p_tenant_id and product_id = 'CFCF';
  if not found then raise exception 'Archived Fund not found or access denied.'; end if;
end;
$$;
revoke all on function public.cfcf_delete_archived_fund(text, uuid) from public, anon;
grant execute on function public.cfcf_delete_archived_fund(text, uuid) to authenticated;

create or replace function public.cfcf_cleanup_expired_archived_funds()
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare v_deleted bigint;
begin
  delete from public.cfcf_archived_funds where expires_at <= now();
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;
revoke all on function public.cfcf_cleanup_expired_archived_funds() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'cfcf-cleanup-expired-archived-funds';
    perform cron.schedule(
      'cfcf-cleanup-expired-archived-funds',
      '17 3 * * *',
      'select public.cfcf_cleanup_expired_archived_funds();'
    );
  end if;
end;
$$;

-- CFCF PRODUCT: Guarded deletion only for records with no financial history.
-- SKELETON: Tenant isolation remains enforced by the shared owner authorization and table RLS policies.
-- Never cascade-delete payments, billing entries, payout history, or Fund adjustments.

create or replace function public.cfcf_delete_share_if_empty(
  p_tenant_id text, p_fund_id text, p_share_id text
) returns void
language plpgsql security invoker set search_path = public
as $$
begin
  if not public.is_active_tenant_owner('CFCF', p_tenant_id) then
    raise exception 'Active tenant owner access is required' using errcode='42501';
  end if;
  if not exists (
    select 1 from public.cfcf_funds f
    where f.fund_id=p_fund_id and f.tenant_id=p_tenant_id and f.product_id='CFCF'
  ) then
    raise exception 'Fund not found or access denied' using errcode='42501';
  end if;
  if not exists (
    select 1 from public.cfcf_shares s
    where s.share_id=p_share_id and s.fund_id=p_fund_id and s.tenant_id=p_tenant_id and s.product_id='CFCF'
  ) then
    raise exception 'Share not found in this Fund';
  end if;
  if exists (
    select 1 from public.cfcf_payments p
    where p.share_id=p_share_id and p.fund_id=p_fund_id and p.tenant_id=p_tenant_id and p.product_id='CFCF'
  ) or exists (
    select 1 from public.cfcf_shares s
    where s.share_id=p_share_id and (
      s.payout_status <> 'undrawn' or s.withdrawn_amount <> 0 or s.payout_cycle_number is not null
      or s.share_total_billed_amount <> 0 or s.share_net_payment_received <> 0
      or s.total_pending <> 0 or s.total_advance <> 0
      or s.billing_entries <> '{}'::jsonb
    )
  ) then
    raise exception 'This Share has financial history. Deletion is blocked to preserve the ledger.';
  end if;
  delete from public.cfcf_shares
  where share_id=p_share_id and fund_id=p_fund_id and tenant_id=p_tenant_id and product_id='CFCF';
  if not found then
    raise exception 'Share could not be deleted; verify owner access.' using errcode='42501';
  end if;
end;
$$;

create or replace function public.cfcf_delete_fund_if_empty(
  p_tenant_id text, p_fund_id text
) returns void
language plpgsql security invoker set search_path = public
as $$
begin
  if not public.is_active_tenant_owner('CFCF', p_tenant_id) then
    raise exception 'Active tenant owner access is required' using errcode='42501';
  end if;
  if not exists (
    select 1 from public.cfcf_funds f
    where f.fund_id=p_fund_id and f.tenant_id=p_tenant_id and f.product_id='CFCF'
  ) then
    raise exception 'Fund not found or access denied' using errcode='42501';
  end if;
  if exists (
    select 1 from public.cfcf_shares s
    where s.fund_id=p_fund_id and s.tenant_id=p_tenant_id and s.product_id='CFCF'
  ) or exists (
    select 1 from public.cfcf_payments p
    where p.fund_id=p_fund_id and p.tenant_id=p_tenant_id and p.product_id='CFCF'
  ) or exists (
    select 1 from public.cfcf_fund_other_entries e
    where e.fund_id=p_fund_id and e.tenant_id=p_tenant_id and e.product_id='CFCF'
  ) or exists (
    select 1
    from public.cfcf_funds f
    cross join lateral jsonb_array_elements_text(coalesce(f.cycle_payout_amounts, '[]'::jsonb)) as v(value)
    where f.fund_id=p_fund_id and v.value is not null and lower(v.value) <> 'null' and btrim(v.value) <> ''
  ) or exists (
    select 1
    from public.cfcf_funds f
    cross join lateral jsonb_array_elements_text(coalesce(f.cycle_commissions, '[]'::jsonb)) as v(value)
    where f.fund_id=p_fund_id and v.value is not null and lower(v.value) <> 'null' and btrim(v.value) <> ''
  ) then
    raise exception 'Fund contains Shares, transactions, adjustments, or saved Cycle values. Deletion is blocked to preserve history.';
  end if;
  delete from public.cfcf_funds
  where fund_id=p_fund_id and tenant_id=p_tenant_id and product_id='CFCF';
  if not found then
    raise exception 'Fund could not be deleted; verify owner access.' using errcode='42501';
  end if;
end;
$$;

revoke all on function public.cfcf_delete_share_if_empty(text,text,text) from public, anon;
revoke all on function public.cfcf_delete_fund_if_empty(text,text) from public, anon;
grant execute on function public.cfcf_delete_share_if_empty(text,text,text) to authenticated;
grant execute on function public.cfcf_delete_fund_if_empty(text,text) to authenticated;

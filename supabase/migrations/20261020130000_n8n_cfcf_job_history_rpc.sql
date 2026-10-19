-- Tenant-owner-only read model for the CFCF global WhatsApp job history.
-- This exposes a narrow scoped summary, not direct registry table access.
create or replace function public.n8n_list_cfcf_whatsapp_jobs(
  p_tenant_id text,
  p_limit integer default 50
)
returns table (
  n8n_global_job_id integer,
  product_id text,
  tenant_id text,
  person_id text,
  job_type text,
  source_table text,
  source_record_id text,
  job_status text,
  communication_type text,
  message_text text,
  created_at timestamptz,
  updated_at timestamptz,
  completed_at timestamptz,
  last_error text,
  recipient_count bigint,
  queued_count bigint,
  sent_to_server_count bigint,
  failed_count bigint,
  uncertain_count bigint,
  skipped_count bigint
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_email text := lower(btrim(coalesce(auth.jwt() ->> 'email', '')));
begin
  if coalesce(auth.role(), '') <> 'authenticated'
     or auth.uid() is null
     or v_email = ''
     or p_tenant_id is null
     or length(btrim(p_tenant_id)) = 0 then
    raise exception 'Authenticated CFCF tenant owner and tenant ID are required'
      using errcode = '42501';
  end if;

  if p_limit is null or p_limit < 1 or p_limit > 100 then
    raise exception 'p_limit must be between 1 and 100' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.global_access_list a
    join public.tenants t
      on t.tenant_id = a.tenant_id
     and t.product_id = a.product_id
    where a.product_id = 'CFCF'
      and a.tenant_id = p_tenant_id
      and a.access_type = 'tenantowner'
      and a.status = 'active'
      and lower(a.email) = v_email
      and t.status = 'active'
  ) then
    raise exception 'Active CFCF tenant-owner access required'
      using errcode = '42501';
  end if;

  return query
  select
    j.n8n_global_job_id,
    j.product_id,
    j.tenant_id,
    j.person_id,
    j.job_type,
    j.source_table,
    j.source_record_id,
    j.status as job_status,
    c.communication_type,
    c.message_text,
    j.created_at,
    j.updated_at,
    j.completed_at,
    j.last_error,
    count(d.n8n_whatsapp_delivery_id) as recipient_count,
    count(d.n8n_whatsapp_delivery_id) filter (where d.status = 'queued') as queued_count,
    count(d.n8n_whatsapp_delivery_id) filter (where d.status = 'sent_to_server') as sent_to_server_count,
    count(d.n8n_whatsapp_delivery_id) filter (where d.status = 'failed') as failed_count,
    count(d.n8n_whatsapp_delivery_id) filter (where d.status = 'uncertain') as uncertain_count,
    count(d.n8n_whatsapp_delivery_id) filter (where d.status = 'skipped') as skipped_count
  from public.n8n_global_jobs j
  left join public.n8n_whatsapp_communications c
    on c.n8n_global_job_id = j.n8n_global_job_id
   and c.tenant_id = j.tenant_id
   and c.product_id = j.product_id
  left join public.n8n_whatsapp_deliveries d
    on d.n8n_whatsapp_communication_id = c.n8n_whatsapp_communication_id
   and d.tenant_id = j.tenant_id
   and d.product_id = j.product_id
  where j.product_id = 'CFCF'
    and j.tenant_id = p_tenant_id
  group by j.n8n_global_job_id, c.n8n_whatsapp_communication_id
  order by j.created_at desc, j.n8n_global_job_id desc
  limit p_limit;
end;
$$;

revoke all on function public.n8n_list_cfcf_whatsapp_jobs(text, integer) from public, anon, authenticated;
grant execute on function public.n8n_list_cfcf_whatsapp_jobs(text, integer) to authenticated;

comment on function public.n8n_list_cfcf_whatsapp_jobs(text, integer) is
  'Returns a bounded registry history for the authenticated active CFCF tenant owner; direct table access remains service-role-only.';

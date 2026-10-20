-- Ensure browser-created manual campaigns reference an active Fund in the same tenant.
drop policy if exists n8n_global_jobs_cfcf_manual_campaign_insert on public.n8n_global_jobs;

create policy n8n_global_jobs_cfcf_manual_campaign_insert
  on public.n8n_global_jobs
  for insert to authenticated
  with check (
    product_id = 'CFCF'
    and public.is_active_tenant_owner(product_id, tenant_id)
    and source_type = 'pwa'
    and job_type in ('pending_reminder_campaign', 'share_report_campaign')
    and status = 'queued'
    and request_id is not null
    and length(trim(request_id)) between 1 and 100
    and scheduled_at is null
    and jsonb_typeof(job_data) = 'object'
    and (job_data - array['fund_id', 'campaign_kind', 'execution_mode']) = '{}'::jsonb
    and jsonb_typeof(job_data -> 'fund_id') = 'string'
    and length(trim(job_data ->> 'fund_id')) between 1 and 100
    and job_data ->> 'campaign_kind' = job_type
    and job_data ->> 'execution_mode' = 'manual_send'
    and exists (
      select 1
      from public.cfcf_funds as fund
      where fund.fund_id = job_data ->> 'fund_id'
        and fund.product_id = 'CFCF'
        and fund.tenant_id = public.n8n_global_jobs.tenant_id
        and fund.status = 'active'
    )
  );

comment on policy n8n_global_jobs_cfcf_manual_campaign_insert on public.n8n_global_jobs is
  'PWA can enqueue only manual CFCF reminder/report requests for an active Fund owned by the authenticated tenant owner; n8n revalidates before delivery.';

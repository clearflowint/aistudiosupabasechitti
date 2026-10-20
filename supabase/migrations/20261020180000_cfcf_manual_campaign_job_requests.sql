-- Allow an authenticated CFCF tenant owner to enqueue only manual campaign requests.
-- Private job_data remains unreadable to browser roles; there are no browser update/delete grants.
-- n8n remains the trusted processor and must revalidate tenant + Fund ownership before delivery.

grant insert (
  product_id, tenant_id, source_type, job_type, status, request_id, scheduled_at, job_data
) on table public.n8n_global_jobs to authenticated;

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
  );

comment on policy n8n_global_jobs_cfcf_manual_campaign_insert on public.n8n_global_jobs is
  'PWA can enqueue only manual CFCF reminder/report requests for a tenant it owns; n8n validates the Fund before processing.';

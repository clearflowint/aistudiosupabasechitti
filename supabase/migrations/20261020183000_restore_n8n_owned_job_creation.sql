-- Restore the agreed ownership boundary: only n8n creates job records.
-- The PWA may read safe status fields, but cannot insert/update/delete registry rows.
drop policy if exists n8n_global_jobs_cfcf_manual_campaign_insert on public.n8n_global_jobs;
revoke insert (
  product_id, tenant_id, source_type, job_type, status, request_id, scheduled_at, job_data
) on table public.n8n_global_jobs from authenticated;

comment on table public.n8n_global_jobs is
  'n8n owns job creation and lifecycle updates. PWA clients submit authenticated action requests to n8n and read safe status metadata only.';

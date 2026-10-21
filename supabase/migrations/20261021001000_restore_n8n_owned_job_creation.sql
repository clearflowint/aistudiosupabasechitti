-- Restore the agreed ownership boundary: n8n creates and updates global job rows.
-- The earlier manual-campaign INSERT policy is retained in migration history but must not
-- remain enabled in environments that apply this corrective migration.
drop policy if exists n8n_global_jobs_cfcf_manual_campaign_insert
  on public.n8n_global_jobs;

revoke insert (
  product_id,
  tenant_id,
  source_type,
  job_type,
  status,
  request_id,
  scheduled_at,
  job_data
) on table public.n8n_global_jobs from authenticated;

comment on table public.n8n_global_jobs is
  'Shared automation job storage. Trusted n8n/server-side integrations own job creation and lifecycle updates; browser clients may read only permitted safe status fields.';

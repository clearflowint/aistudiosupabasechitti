-- CFCF PRODUCT: expose only compact outcome counts for the manager progress UI.
-- Keep the raw job_data JSON (which may contain message/recipient details) private.
-- The view filters by the same active CFCF tenant-owner check used by the registry policy.
create or replace view public.cfcf_job_progress_summary as
select
  job_id,
  product_id,
  tenant_id,
  source_type,
  job_type,
  status,
  scheduled_at,
  created_at,
  updated_at,
  completed_at,
  case
    when jsonb_typeof(job_data #> '{delivery_result,recipient_count}') = 'number'
      then greatest(0, (job_data #>> '{delivery_result,recipient_count}')::integer)
    else null
  end as recipient_count,
  case
    when jsonb_typeof(job_data #> '{delivery_result,sent_to_server}') = 'number'
      then greatest(0, (job_data #>> '{delivery_result,sent_to_server}')::integer)
    else null
  end as sent_count,
  case
    when jsonb_typeof(job_data #> '{delivery_result,rejection_confirmed}') = 'number'
      then greatest(0, (job_data #>> '{delivery_result,rejection_confirmed}')::integer)
    else null
  end as failed_count,
  case
    when jsonb_typeof(job_data #> '{delivery_result,uncertain}') = 'number'
      then greatest(0, (job_data #>> '{delivery_result,uncertain}')::integer)
    else null
  end as uncertain_count
from public.n8n_global_jobs
where product_id = 'CFCF'
  and public.is_active_tenant_owner(product_id, tenant_id);

revoke all on public.cfcf_job_progress_summary from public, anon;
grant select on public.cfcf_job_progress_summary to authenticated;

comment on view public.cfcf_job_progress_summary is
  'CFCF manager-only job progress metadata and aggregate message counts; never exposes job_data or recipient/message content.';

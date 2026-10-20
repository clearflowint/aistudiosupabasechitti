-- Global ClearFlow job registry: one row per job, recipient progress inside JSONB.
-- Draft migration only. Do not apply until approved non-production validation is complete.
-- Does not create automation RPCs/schedule tables or alter existing PWA notification objects.

create table public.n8n_global_jobs (
  job_id bigint generated always as identity (start with 100 increment by 1) primary key,
  product_id text not null,
  tenant_id text not null,
  job_type text not null check (length(btrim(job_type)) > 0),
  status text not null default 'queued'
    check (status in ('queued', 'processing', 'completed', 'partial', 'failed', 'uncertain', 'cancelled')),
  job_data jsonb not null default '{}'::jsonb
    check (jsonb_typeof(job_data) = 'object'),
  progress_summary jsonb generated always as (
    jsonb_build_object(
      'recipient_count', case when coalesce(job_data #>> '{progress,recipient_count}', '') ~ '^[0-9]{1,9}$' then (job_data #>> '{progress,recipient_count}')::integer end,
      'processed_count', case when coalesce(job_data #>> '{progress,processed_count}', '') ~ '^[0-9]{1,9}$' then (job_data #>> '{progress,processed_count}')::integer end,
      'accepted_count', case when coalesce(job_data #>> '{progress,accepted_count}', '') ~ '^[0-9]{1,9}$' then (job_data #>> '{progress,accepted_count}')::integer end,
      'failed_count', case when coalesce(job_data #>> '{progress,failed_count}', '') ~ '^[0-9]{1,9}$' then (job_data #>> '{progress,failed_count}')::integer end,
      'uncertain_count', case when coalesce(job_data #>> '{progress,uncertain_count}', '') ~ '^[0-9]{1,9}$' then (job_data #>> '{progress,uncertain_count}')::integer end,
      'skipped_count', case when coalesce(job_data #>> '{progress,skipped_count}', '') ~ '^[0-9]{1,9}$' then (job_data #>> '{progress,skipped_count}')::integer end,
      'pending_count', case when coalesce(job_data #>> '{progress,pending_count}', '') ~ '^[0-9]{1,9}$' then (job_data #>> '{progress,pending_count}')::integer end,
      'submitting_count', case when coalesce(job_data #>> '{progress,submitting_count}', '') ~ '^[0-9]{1,9}$' then (job_data #>> '{progress,submitting_count}')::integer end
    )
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint n8n_global_jobs_tenant_product_fk
    foreign key (tenant_id, product_id)
    references public.tenants (tenant_id, product_id)
    on delete restrict,
  constraint n8n_global_jobs_campaign_limit
    check (
      job_type not in ('campaign', 'manual_campaign')
      or case
        when jsonb_typeof(job_data -> 'recipients') = 'array'
          then jsonb_array_length(job_data -> 'recipients') between 1 and 100
        else false
      end
    ),
  constraint n8n_global_jobs_event_history_limit
    check (
      not (job_data ? 'events')
      or case
        when jsonb_typeof(job_data -> 'events') = 'array'
          then jsonb_array_length(job_data -> 'events') <= 500
        else false
      end
    )
);

create index n8n_global_jobs_tenant_recent_idx
  on public.n8n_global_jobs (product_id, tenant_id, created_at desc);
create index n8n_global_jobs_queue_idx
  on public.n8n_global_jobs (status, created_at)
  where status in ('queued', 'processing');

create unique index n8n_global_jobs_request_id_unique_idx
  on public.n8n_global_jobs (product_id, tenant_id, (job_data ->> 'request_id'))
  where nullif(btrim(job_data ->> 'request_id'), '') is not null;

create unique index n8n_global_jobs_inbound_event_unique_idx
  on public.n8n_global_jobs (
    product_id, tenant_id,
    (job_data ->> 'provider_name'),
    (job_data ->> 'session_name'),
    (job_data ->> 'provider_event_id')
  )
  where job_type = 'whatsapp_inbound'
    and nullif(btrim(job_data ->> 'provider_name'), '') is not null
    and nullif(btrim(job_data ->> 'session_name'), '') is not null
    and nullif(btrim(job_data ->> 'provider_event_id'), '') is not null;

alter table public.n8n_global_jobs enable row level security;
revoke all on table public.n8n_global_jobs from anon, authenticated;
grant select (
  job_id, product_id, tenant_id, job_type, status,
  created_at, updated_at, completed_at, progress_summary
) on table public.n8n_global_jobs to authenticated;
grant all on table public.n8n_global_jobs to service_role;

create policy n8n_global_jobs_tenant_owner_read
  on public.n8n_global_jobs
  for select to authenticated
  using (public.is_active_tenant_owner(product_id, tenant_id));

create view public.n8n_global_job_progress
with (security_invoker = true)
as
select
  job_id, product_id, tenant_id, job_type, status,
  created_at, updated_at as last_safe_update_at, completed_at,
  progress_summary,
  (status in ('uncertain', 'partial')) as needs_review
from public.n8n_global_jobs;

grant select on public.n8n_global_job_progress to authenticated;

comment on table public.n8n_global_jobs is
  'Global ClearFlow job registry. One row per job; private request data, recipients, events and errors are stored in job_data JSONB.';
comment on column public.n8n_global_jobs.job_data is
  'Private JSONB job document. Do not grant this column to manager/browser clients.';
comment on view public.n8n_global_job_progress is
  'Read-only manager progress projection. Uses security_invoker and the underlying tenant-owner RLS policy.';

-- Draft-only minimal job storage for ClearFlow automation.
-- Keep workflow decisions in n8n and product code; this table stores job data/status.
-- Do not apply until an approved non-production test is explicitly authorized.
-- Existing PWA notification tables, functions, data, and cron jobs are untouched.

create table public.n8n_global_jobs (
  job_id bigint generated always as identity (start with 100 increment by 1) primary key,
  product_id text not null,
  tenant_id text not null,
  -- Open-ended request channel for PWA, WhatsApp, AI, API, system, or future sources.
  source_type text not null default 'system',
  job_type text not null,
  status text not null default 'queued'
    check (status in ('queued', 'processing', 'completed', 'failed', 'cancelled')),
  request_id text,
  -- NULL means execute as soon as accepted; otherwise wait until this instant.
  scheduled_at timestamptz,
  job_data jsonb not null default '{}'::jsonb
    check (jsonb_typeof(job_data) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint n8n_global_jobs_tenant_product_fk
    foreign key (tenant_id, product_id)
    references public.tenants (tenant_id, product_id)
    on delete restrict
);

create index n8n_global_jobs_tenant_recent_idx
  on public.n8n_global_jobs (product_id, tenant_id, created_at desc);

-- One shared n8n dispatcher can efficiently find queued jobs whose requested time has arrived.
create index n8n_global_jobs_due_idx
  on public.n8n_global_jobs (scheduled_at)
  where status = 'queued' and scheduled_at is not null;

-- One shared n8n dispatcher can efficiently find queued jobs whose requested time has arrived.
create index n8n_global_jobs_due_idx
  on public.n8n_global_jobs (scheduled_at)
  where status = 'queued' and scheduled_at is not null;

-- Browser managers can read only safe status metadata, never the private job_data JSON.
alter table public.n8n_global_jobs enable row level security;
revoke all on table public.n8n_global_jobs from public, anon, authenticated;
grant select (
  job_id, product_id, tenant_id, source_type, job_type, status, request_id,
  scheduled_at, created_at, updated_at, completed_at
) on table public.n8n_global_jobs to authenticated;
grant all on table public.n8n_global_jobs to service_role;

create policy n8n_global_jobs_tenant_owner_read
  on public.n8n_global_jobs
  for select to authenticated
  using (public.is_active_tenant_owner(product_id, tenant_id));

comment on table public.n8n_global_jobs is
  'Simple ClearFlow automation job storage. Workflow logic remains in n8n/product code; private request and result data are stored in job_data JSONB.';
comment on column public.n8n_global_jobs.source_type is
  'Open-ended request channel such as pwa, whatsapp, ai, api, or system. n8n validates the source.';
comment on column public.n8n_global_jobs.scheduled_at is
  'Optional requested execution instant. A shared n8n dispatcher handles due jobs; no per-job scheduler is created.';
comment on column public.n8n_global_jobs.source_type is
  'Open-ended request channel such as pwa, whatsapp, ai, api, or system. n8n validates the source.';
comment on column public.n8n_global_jobs.scheduled_at is
  'Optional requested execution instant. A shared n8n dispatcher handles due jobs; no per-job scheduler is created.';
comment on column public.n8n_global_jobs.job_data is
  'Private job payload/result JSON. Do not grant this column to browser clients.';

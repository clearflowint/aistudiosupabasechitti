-- Draft-only minimal job storage for ClearFlow automation.
-- Keep workflow decisions in n8n and product code; this table stores job data/status.
-- Do not apply until an approved non-production test is explicitly authorized.
-- Existing PWA notification tables, functions, data, and cron jobs are untouched.

create table public.n8n_global_jobs (
  job_id bigint generated always as identity (start with 100 increment by 1) primary key,
  product_id text not null,
  tenant_id text not null,
  job_type text not null,
  status text not null default 'queued'
    check (status in ('queued', 'processing', 'completed', 'failed', 'cancelled')),
  request_id text,
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

-- Browser managers can read only safe status metadata, never the private job_data JSON.
alter table public.n8n_global_jobs enable row level security;
revoke all on table public.n8n_global_jobs from public, anon, authenticated;
grant select (
  job_id, product_id, tenant_id, job_type, status, request_id,
  created_at, updated_at, completed_at
) on table public.n8n_global_jobs to authenticated;
grant all on table public.n8n_global_jobs to service_role;

create policy n8n_global_jobs_tenant_owner_read
  on public.n8n_global_jobs
  for select to authenticated
  using (public.is_active_tenant_owner(product_id, tenant_id));

comment on table public.n8n_global_jobs is
  'Simple ClearFlow automation job storage. Workflow logic remains in n8n/product code; private request and result data are stored in job_data JSONB.';
comment on column public.n8n_global_jobs.job_data is
  'Private job payload/result JSON. Do not grant this column to browser clients.';


-- On-demand job creation: the caller explicitly requests work; this is not a scheduler.
-- SECURITY DEFINER is narrowly scoped: verify the authenticated tenant owner and active person,
-- then return only safe status fields. n8n remains responsible for executing the job.
create or replace function public.create_n8n_global_job(
  p_product_id text,
  p_tenant_id text,
  p_person_id text,
  p_job_type text,
  p_request_id text default null,
  p_job_data jsonb default '{}'::jsonb
)
returns table (job_id bigint, status text, created_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if nullif(btrim(p_product_id), '') is null
     or nullif(btrim(p_tenant_id), '') is null
     or nullif(btrim(p_person_id), '') is null
     or nullif(btrim(p_job_type), '') is null then
    raise exception 'Product, tenant, person, and job type are required'
      using errcode = '22023';
  end if;

  if p_job_data is null or jsonb_typeof(p_job_data) <> 'object' then
    raise exception 'Job data must be a JSON object' using errcode = '22023';
  end if;

  if not public.is_active_tenant_owner(p_product_id, p_tenant_id) then
    raise exception 'Active tenant-owner access required' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.persons p
    where p.person_id = p_person_id
      and p.tenant_id = p_tenant_id
      and p.product_id = p_product_id
      and p.status = 'active'
  ) then
    raise exception 'Active person does not belong to this product and tenant'
      using errcode = '42501';
  end if;

  return query
    insert into public.n8n_global_jobs (
      product_id, tenant_id, job_type, status, request_id, job_data
    )
    values (
      p_product_id, p_tenant_id, p_job_type, 'queued',
      nullif(btrim(p_request_id), ''), p_job_data
    )
    returning n8n_global_jobs.job_id,
              n8n_global_jobs.status,
              n8n_global_jobs.created_at;
end;
$function$;

revoke all on function public.create_n8n_global_job(text, text, text, text, text, jsonb)
  from public, anon;
grant execute on function public.create_n8n_global_job(text, text, text, text, text, jsonb)
  to authenticated;

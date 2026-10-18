-- CFCF recurring automation schedules and durable job history.
-- n8n owns orchestration, recipient processing, delivery pacing and retries.
-- Supabase stores configuration/history and exposes atomic claims; no client-role table access.

create table if not exists public.cfcf_automation_schedules (
  schedule_id uuid primary key default gen_random_uuid(),
  product_id text not null default 'CFCF' check (product_id = 'CFCF'),
  tenant_id text not null references public.tenants(tenant_id) on delete cascade,
  fund_id text not null,
  job_type text not null check (job_type in ('pending_due_reminder', 'report')),
  slot_number smallint not null,
  day_of_month smallint not null check (day_of_month between 1 and 31),
  time_of_day time not null,
  timezone text not null default 'Asia/Kolkata',
  is_enabled boolean not null default true,
  next_run_at timestamptz,
  last_run_at timestamptz,
  claimed_until timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cfcf_automation_schedule_slot_check check (
    (job_type = 'pending_due_reminder' and slot_number between 1 and 3)
    or (job_type = 'report' and slot_number between 1 and 2)
  ),
  constraint cfcf_automation_schedule_fund_slot_unique
    unique (product_id, tenant_id, fund_id, job_type, slot_number)
);

create index if not exists cfcf_automation_schedules_due_idx
  on public.cfcf_automation_schedules (next_run_at)
  where is_enabled = true;

create table if not exists public.cfcf_automation_jobs (
  job_id uuid primary key default gen_random_uuid(),
  product_id text not null default 'CFCF' check (product_id = 'CFCF'),
  tenant_id text not null references public.tenants(tenant_id) on delete cascade,
  tenant_name text not null,
  tenant_email text not null,
  tenant_phone text not null,
  fund_id text,
  fund_name text,
  job_type text not null check (job_type in ('pending_due_reminder', 'report', 'campaign')),
  trigger_type text not null check (trigger_type in ('manual', 'scheduled')),
  schedule_id uuid references public.cfcf_automation_schedules(schedule_id) on delete set null,
  scheduled_for timestamptz,
  idempotency_key text not null unique,
  status text not null default 'queued'
    check (status in ('queued', 'accepted', 'processing', 'delayed', 'completed', 'partial', 'failed', 'cancelled')),
  n8n_execution_id text,
  recipient_count integer not null default 0 check (recipient_count >= 0),
  processed_count integer not null default 0 check (processed_count >= 0),
  success_count integer not null default 0 check (success_count >= 0),
  failed_count integer not null default 0 check (failed_count >= 0),
  skipped_count integer not null default 0 check (skipped_count >= 0),
  progress_message text,
  error_summary text,
  result_summary jsonb not null default '{}'::jsonb,
  output_url text,
  claimed_until timestamptz,
  attempts integer not null default 0 check (attempts >= 0),
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists cfcf_automation_jobs_tenant_recent_idx
  on public.cfcf_automation_jobs (product_id, tenant_id, created_at desc);

create index if not exists cfcf_automation_jobs_queue_idx
  on public.cfcf_automation_jobs (status, created_at)
  where status in ('queued', 'delayed');

alter table public.cfcf_automation_schedules enable row level security;
alter table public.cfcf_automation_jobs enable row level security;
revoke all on table public.cfcf_automation_schedules from anon, authenticated;
revoke all on table public.cfcf_automation_jobs from anon, authenticated;
grant all on table public.cfcf_automation_schedules to service_role;
grant all on table public.cfcf_automation_jobs to service_role;

comment on table public.cfcf_automation_schedules is
  'Manager-configured recurring CFCF schedules. n8n calculates due dates; database stores next_run_at and guards duplicate slots.';
comment on table public.cfcf_automation_jobs is
  'Durable CFCF automation job history. n8n orchestrates delivery; Supabase persists state and idempotency.';

-- Atomic schedule claim for n8n. Claims expire so a crashed execution can be recovered.
create or replace function public.cfcf_claim_due_automation_schedules(p_limit integer default 25)
returns setof public.cfcf_automation_schedules
language sql
security definer
set search_path = public, pg_temp
as $$
  with due as (
    select schedule_id
    from public.cfcf_automation_schedules
    where product_id = 'CFCF'
      and is_enabled = true
      and next_run_at is not null
      and next_run_at <= now()
      and (claimed_until is null or claimed_until < now())
    order by next_run_at, created_at
    limit greatest(1, least(coalesce(p_limit, 25), 100))
    for update skip locked
  )
  update public.cfcf_automation_schedules s
  set claimed_until = now() + interval '5 minutes',
      updated_at = now()
  from due
  where s.schedule_id = due.schedule_id
  returning s.*;
$$;

revoke all on function public.cfcf_claim_due_automation_schedules(integer) from public, anon, authenticated;
grant execute on function public.cfcf_claim_due_automation_schedules(integer) to service_role;

-- Atomic claim for queued manual or scheduled jobs.
create or replace function public.cfcf_claim_automation_jobs(p_limit integer default 25)
returns setof public.cfcf_automation_jobs
language sql
security definer
set search_path = public, pg_temp
as $$
  with due as (
    select job_id
    from public.cfcf_automation_jobs
    where product_id = 'CFCF'
      and status in ('queued', 'delayed')
      and (claimed_until is null or claimed_until < now())
    order by created_at
    limit greatest(1, least(coalesce(p_limit, 25), 100))
    for update skip locked
  )
  update public.cfcf_automation_jobs j
  set status = 'processing',
      claimed_until = now() + interval '5 minutes',
      attempts = j.attempts + 1,
      started_at = coalesce(j.started_at, now()),
      updated_at = now()
  from due
  where j.job_id = due.job_id
  returning j.*;
$$;

revoke all on function public.cfcf_claim_automation_jobs(integer) from public, anon, authenticated;
grant execute on function public.cfcf_claim_automation_jobs(integer) to service_role;

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
    unique (product_id, tenant_id, fund_id, job_type, slot_number),
  constraint cfcf_automation_schedule_fund_fk
    foreign key (fund_id, tenant_id, product_id)
    references public.cfcf_funds(fund_id, tenant_id, product_id) on delete cascade
);

create index if not exists cfcf_automation_schedules_due_idx
  on public.cfcf_automation_schedules (next_run_at)
  where is_enabled = true;

create table if not exists public.cfcf_automation_jobs (
  job_id uuid primary key default gen_random_uuid(),
  product_id text not null default 'CFCF' check (product_id = 'CFCF'),
  tenant_id text not null references public.tenants(tenant_id) on delete cascade,
  fund_id text,
  fund_name text,
  job_type text not null check (job_type in ('pending_due_reminder', 'report')),
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
      and (next_run_at is null or next_run_at <= now())
      and (claimed_until is null or claimed_until < now())
    order by next_run_at nulls first, created_at
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
      and (status in ('queued', 'delayed') or (status = 'processing' and claimed_until < now()))
      and (claimed_until is null or claimed_until < now())
      and attempts < 8
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

-- Terminalize jobs that have exhausted retries so they do not remain queued forever.
-- The worker should call this before claiming the next batch.
create or replace function public.cfcf_fail_exhausted_automation_jobs(p_limit integer default 100)
returns setof public.cfcf_automation_jobs
language sql
security definer
set search_path = public, pg_temp
as $$
  with exhausted as (
    select job_id
    from public.cfcf_automation_jobs
    where product_id = 'CFCF'
      and status in ('queued', 'delayed', 'processing')
      and attempts >= 8
      and (claimed_until is null or claimed_until < now())
    order by updated_at
    limit greatest(1, least(coalesce(p_limit, 100), 500))
    for update skip locked
  )
  update public.cfcf_automation_jobs j
  set status = 'failed',
      error_summary = coalesce(j.error_summary, 'Maximum retry attempts exhausted'),
      progress_message = 'Failed after maximum retry attempts',
      completed_at = coalesce(j.completed_at, now()),
      claimed_until = null,
      updated_at = now()
  from exhausted
  where j.job_id = exhausted.job_id
  returning j.*;
$$;

revoke all on function public.cfcf_fail_exhausted_automation_jobs(integer) from public, anon, authenticated;
grant execute on function public.cfcf_fail_exhausted_automation_jobs(integer) to service_role;



-- Atomically create one scheduled job and advance its recurrence.
-- n8n calculates the next monthly timestamp; Supabase enforces idempotency and ownership.
create or replace function public.cfcf_enqueue_scheduled_automation_job(
  p_schedule_id uuid,
  p_scheduled_for timestamptz,
  p_next_run_at timestamptz
)
returns public.cfcf_automation_jobs
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_schedule public.cfcf_automation_schedules%rowtype;
  v_job public.cfcf_automation_jobs%rowtype;
  v_key text;
begin
  if p_schedule_id is null or p_scheduled_for is null or p_next_run_at is null
     or p_next_run_at <= p_scheduled_for then
    raise exception 'Scheduled run timestamps are invalid' using errcode = '22023';
  end if;

  select * into v_schedule
  from public.cfcf_automation_schedules
  where schedule_id = p_schedule_id
  for update;

  if not found then
    raise exception 'Automation schedule not found' using errcode = 'P0002';
  end if;

  v_key := 'schedule:' || v_schedule.schedule_id::text || ':' ||
    to_char(p_scheduled_for at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"');

  -- An n8n timeout/retry after a successful commit returns the existing job.
  select * into v_job from public.cfcf_automation_jobs
  where idempotency_key = v_key;
  if found then
    return v_job;
  end if;

  if not v_schedule.is_enabled
     or v_schedule.next_run_at is distinct from p_scheduled_for
     or v_schedule.claimed_until is null
     or v_schedule.claimed_until < now() then
    raise exception 'Schedule is not currently claimed for this occurrence' using errcode = '40001';
  end if;

  insert into public.cfcf_automation_jobs (
    product_id, tenant_id, fund_id, fund_name, job_type, trigger_type,
    schedule_id, scheduled_for, idempotency_key, status, accepted_at
  )
  select
    v_schedule.product_id, v_schedule.tenant_id, v_schedule.fund_id,
    coalesce(f.fund_name, ''), v_schedule.job_type, 'scheduled',
    v_schedule.schedule_id, p_scheduled_for, v_key, 'queued', now()
  from public.cfcf_funds f
  where f.product_id = v_schedule.product_id
    and f.tenant_id = v_schedule.tenant_id
    and f.fund_id = v_schedule.fund_id
  returning * into v_job;

  if not found then
    raise exception 'Fund for automation schedule no longer exists' using errcode = 'P0002';
  end if;

  update public.cfcf_automation_schedules
  set last_run_at = p_scheduled_for,
      next_run_at = p_next_run_at,
      claimed_until = null,
      last_error = null,
      updated_at = now()
  where schedule_id = v_schedule.schedule_id;

  return v_job;
end;
$$;

revoke all on function public.cfcf_enqueue_scheduled_automation_job(uuid, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.cfcf_enqueue_scheduled_automation_job(uuid, timestamptz, timestamptz) to service_role;

-- Manager-facing RPCs: browser users never receive service_role access.
create or replace function public.cfcf_save_automation_schedule(
  p_tenant_id text,
  p_fund_id text,
  p_job_type text,
  p_slot_number smallint,
  p_day_of_month smallint,
  p_time_of_day time,
  p_timezone text default 'Asia/Kolkata',
  p_is_enabled boolean default true
)
returns public.cfcf_automation_schedules
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_schedule public.cfcf_automation_schedules%rowtype;
begin
  if auth.uid() is null or not public.is_active_tenant_owner('CFCF', p_tenant_id) then
    raise exception 'Workspace owner access is required' using errcode = '42501';
  end if;

  if p_fund_id is null or not exists (
    select 1 from public.cfcf_funds f
    where f.product_id = 'CFCF' and f.tenant_id = p_tenant_id and f.fund_id = p_fund_id
  ) then
    raise exception 'Fund not found in this workspace' using errcode = '42501';
  end if;

  if p_job_type is null or p_job_type not in ('pending_due_reminder', 'report')
     or p_slot_number is null
     or (p_job_type = 'pending_due_reminder' and p_slot_number not between 1 and 3)
     or (p_job_type = 'report' and p_slot_number not between 1 and 2)
     or p_day_of_month is null or p_day_of_month not between 1 and 31
     or p_time_of_day is null
     or nullif(btrim(p_timezone), '') is null then
    raise exception 'Schedule settings are invalid' using errcode = '22023';
  end if;

  -- Validate timezone names before saving a schedule that n8n cannot evaluate.
  perform now() at time zone p_timezone;

  insert into public.cfcf_automation_schedules (
    product_id, tenant_id, fund_id, job_type, slot_number,
    day_of_month, time_of_day, timezone, is_enabled, next_run_at,
    claimed_until, last_error, updated_at
  )
  values (
    'CFCF', p_tenant_id, p_fund_id, p_job_type, p_slot_number,
    p_day_of_month, p_time_of_day, p_timezone, coalesce(p_is_enabled, true), null,
    null, null, now()
  )
  on conflict (product_id, tenant_id, fund_id, job_type, slot_number)
  do update set
    day_of_month = excluded.day_of_month,
    time_of_day = excluded.time_of_day,
    timezone = excluded.timezone,
    is_enabled = excluded.is_enabled,
    next_run_at = null,
    claimed_until = null,
    last_error = null,
    updated_at = now()
  returning * into v_schedule;

  return v_schedule;
end;
$$;

create or replace function public.cfcf_list_automation_schedules(
  p_tenant_id text,
  p_fund_id text
)
returns setof public.cfcf_automation_schedules
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or not public.is_active_tenant_owner('CFCF', p_tenant_id) then
    raise exception 'Workspace owner access is required' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.cfcf_funds f
    where f.product_id = 'CFCF' and f.tenant_id = p_tenant_id and f.fund_id = p_fund_id
  ) then
    raise exception 'Fund not found in this workspace' using errcode = '42501';
  end if;

  return query
  select s.* from public.cfcf_automation_schedules s
  where s.product_id = 'CFCF' and s.tenant_id = p_tenant_id and s.fund_id = p_fund_id
  order by case s.job_type when 'pending_due_reminder' then 1 else 2 end, s.slot_number;
end;
$$;

create or replace function public.cfcf_list_automation_jobs(
  p_tenant_id text,
  p_fund_id text,
  p_limit integer default 30
)
returns setof public.cfcf_automation_jobs
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or not public.is_active_tenant_owner('CFCF', p_tenant_id) then
    raise exception 'Workspace owner access is required' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.cfcf_funds f
    where f.product_id = 'CFCF' and f.tenant_id = p_tenant_id and f.fund_id = p_fund_id
  ) then
    raise exception 'Fund not found in this workspace' using errcode = '42501';
  end if;

  return query
  select j.* from public.cfcf_automation_jobs j
  where j.product_id = 'CFCF' and j.tenant_id = p_tenant_id and j.fund_id = p_fund_id
  order by j.created_at desc
  limit greatest(1, least(coalesce(p_limit, 30), 100));
end;
$$;

create or replace function public.cfcf_create_manual_automation_job(
  p_tenant_id text,
  p_fund_id text,
  p_job_type text
)
returns public.cfcf_automation_jobs
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_fund public.cfcf_funds%rowtype;
  v_job public.cfcf_automation_jobs%rowtype;
  v_idempotency_key text;
begin
  if auth.uid() is null or not public.is_active_tenant_owner('CFCF', p_tenant_id) then
    raise exception 'Workspace owner access is required' using errcode = '42501';
  end if;
  if p_job_type is null or p_job_type not in ('pending_due_reminder', 'report') then
    raise exception 'Manual job type is invalid' using errcode = '22023';
  end if;

  -- Serialize same-fund, same-type manual requests to enforce one per hour.
  perform pg_advisory_xact_lock(hashtext(p_tenant_id), hashtext(p_fund_id || ':' || p_job_type));

  if not exists (
    select 1 from public.tenants t
    where t.tenant_id = p_tenant_id and t.product_id = 'CFCF' and t.status = 'active'
  ) then
    raise exception 'Active CFCF workspace not found' using errcode = '42501';
  end if;

  select * into v_fund from public.cfcf_funds f
  where f.product_id = 'CFCF' and f.tenant_id = p_tenant_id and f.fund_id = p_fund_id;
  if not found then
    raise exception 'Fund not found in this workspace' using errcode = '42501';
  end if;

  if exists (
    select 1 from public.cfcf_automation_jobs j
    where j.product_id = 'CFCF' and j.tenant_id = p_tenant_id
      and j.fund_id = p_fund_id and j.job_type = p_job_type
      and j.trigger_type = 'manual' and j.created_at > now() - interval '1 hour'
  ) then
    raise exception 'This manual action is limited to once per hour for this Fund' using errcode = 'P0001';
  end if;

  v_idempotency_key := 'manual:' || p_tenant_id || ':' || p_fund_id || ':' ||
    p_job_type || ':' || floor(extract(epoch from clock_timestamp()))::bigint::text;

  insert into public.cfcf_automation_jobs (
    product_id, tenant_id, fund_id, fund_name, job_type, trigger_type,
    idempotency_key, status
  )
  values (
    'CFCF', p_tenant_id, v_fund.fund_id, coalesce(v_fund.fund_name, ''),
    p_job_type, 'manual', v_idempotency_key, 'queued'
  )
  returning * into v_job;

  return v_job;
end;
$$;

revoke all on function public.cfcf_save_automation_schedule(text, text, text, smallint, smallint, time, text, boolean) from public, anon;
revoke all on function public.cfcf_list_automation_schedules(text, text) from public, anon;
revoke all on function public.cfcf_list_automation_jobs(text, text, integer) from public, anon;
revoke all on function public.cfcf_create_manual_automation_job(text, text, text) from public, anon;
grant execute on function public.cfcf_save_automation_schedule(text, text, text, smallint, smallint, time, text, boolean) to authenticated;
grant execute on function public.cfcf_list_automation_schedules(text, text) to authenticated;
grant execute on function public.cfcf_list_automation_jobs(text, text, integer) to authenticated;
grant execute on function public.cfcf_create_manual_automation_job(text, text, text) to authenticated;


-- Initialize a newly enabled schedule only while this execution still owns its lease.
-- This avoids a stale evaluator overwriting a schedule edited by the Manager.
create or replace function public.cfcf_initialize_automation_schedule(
  p_schedule_id uuid,
  p_next_run_at timestamptz
)
returns setof public.cfcf_automation_schedules
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_schedule_id is null or p_next_run_at is null or p_next_run_at <= now() then
    raise exception 'Initial schedule timestamp must be in the future' using errcode = '22023';
  end if;

  return query
  update public.cfcf_automation_schedules s
  set next_run_at = p_next_run_at,
      claimed_until = null,
      last_error = null,
      updated_at = now()
  where s.schedule_id = p_schedule_id
    and s.product_id = 'CFCF'
    and s.is_enabled = true
    and s.next_run_at is null
    and s.claimed_until > now()
  returning s.*;
end;
$$;

revoke all on function public.cfcf_initialize_automation_schedule(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.cfcf_initialize_automation_schedule(uuid, timestamptz) to service_role;

-- Explicit failure recovery hook for n8n Error Workflows.
-- A stale error handler cannot clear a lease that has already expired or been reclaimed.
create or replace function public.cfcf_release_automation_schedule_claim(
  p_schedule_id uuid,
  p_error text default null
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_updated integer;
begin
  if p_schedule_id is null then
    return false;
  end if;

  update public.cfcf_automation_schedules
  set claimed_until = null,
      last_error = left(nullif(btrim(p_error), ''), 1000),
      updated_at = now()
  where schedule_id = p_schedule_id
    and product_id = 'CFCF'
    and claimed_until > now();

  get diagnostics v_updated = row_count;
  return v_updated = 1;
end;
$$;

revoke all on function public.cfcf_release_automation_schedule_claim(uuid, text) from public, anon, authenticated;
grant execute on function public.cfcf_release_automation_schedule_claim(uuid, text) to service_role;

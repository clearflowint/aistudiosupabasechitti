-- Global n8n job handoff registry and WhatsApp communication/delivery records.
-- This migration is intentionally separate from all ClearFlow PWA push-notification tables.
-- It does not alter cfcf_automation_jobs, cfcf_automation_schedules, or campaign notifications.

create table if not exists public.n8n_global_jobs (
  n8n_global_job_id uuid primary key default gen_random_uuid(),
  tenant_id text not null references public.tenants(tenant_id) on delete cascade,
  product_id text not null,
  person_id text not null references public.persons(person_id) on delete restrict,
  job_type not null,
  source_table text not null,
  source_record_id text not null,
  status text not null default 'registered'
    check (status in ('registered', 'picked_up', 'completed', 'failed', 'timed_out')),
  idempotency_key text not null unique,
  picked_up_at timestamptz,
  completed_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint n8n_global_jobs_type_nonblank check (length(btrim(job_type)) > 0),
  constraint n8n_global_jobs_source_table_nonblank check (length(btrim(source_table)) > 0),
  constraint n8n_global_jobs_source_record_nonblank check (length(btrim(source_record_id)) > 0),
  constraint n8n_global_jobs_idempotency_nonblank check (length(btrim(idempotency_key)) > 0),
  constraint n8n_global_jobs_scope_unique unique (n8n_global_job_id, tenant_id, product_id)
);

create index if not exists n8n_global_jobs_queue_idx
  on public.n8n_global_jobs (status, created_at)
  where status = 'registered';

create index if not exists n8n_global_jobs_tenant_recent_idx
  on public.n8n_global_jobs (product_id, tenant_id, created_at desc);

create table if not exists public.n8n_whatsapp_communications (
  n8n_whatsapp_communication_id uuid primary key default gen_random_uuid(),
  n8n_global_job_id uuid not null unique,
  tenant_id text not null,
  product_id text not null,
  communication_type text not null
    check (communication_type in ('pending_reminder', 'report', 'campaign', 'custom')),
  message_text text,
  message_payload jsonb not null default '{}'::jsonb,
  requested_channels text[] not null default array['whatsapp']::text[],
  requested_by_person_id text references public.persons(person_id) on delete set null,
  created_at timestamptz not null default now(),
  scheduled_at timestamptz,
  constraint n8n_whatsapp_communications_scope_fk
    foreign key (n8n_global_job_id, tenant_id, product_id)
    references public.n8n_global_jobs(n8n_global_job_id, tenant_id, product_id)
    on delete cascade,
  constraint n8n_whatsapp_communications_channels_check
    check (requested_channels <@ array['whatsapp']::text[] and cardinality(requested_channels) > 0),
  constraint n8n_whatsapp_communications_scope_unique
    unique (n8n_whatsapp_communication_id, tenant_id, product_id)
);

create index if not exists n8n_whatsapp_communications_tenant_recent_idx
  on public.n8n_whatsapp_communications (product_id, tenant_id, created_at desc);

create table if not exists public.n8n_whatsapp_deliveries (
  n8n_whatsapp_delivery_id uuid primary key default gen_random_uuid(),
  n8n_whatsapp_communication_id uuid not null
    references public.n8n_whatsapp_communications(n8n_whatsapp_communication_id) on delete cascade,
  tenant_id text not null,
  product_id text not null,
  recipient_person_id text references public.persons(person_id) on delete set null,
  recipient_contact_id text,
  recipient_phone text not null,
  session_name text,
  status text not null default 'queued'
    check (status in ('queued', 'sent_to_server', 'failed', 'uncertain', 'skipped')),
  provider_message_id text,
  error_code text,
  error_message text,
  attempted_at timestamptz,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint n8n_whatsapp_deliveries_scope_fk
    foreign key (n8n_whatsapp_communication_id, tenant_id, product_id)
    references public.n8n_whatsapp_communications(n8n_whatsapp_communication_id, tenant_id, product_id)
    on delete cascade,
  constraint n8n_whatsapp_deliveries_phone_nonblank check (length(btrim(recipient_phone)) > 0),
  constraint n8n_whatsapp_deliveries_session_nonblank check (session_name is null or length(btrim(session_name)) > 0),
  constraint n8n_whatsapp_deliveries_recipient_unique
    unique (n8n_whatsapp_communication_id, recipient_contact_id, recipient_phone)
);

create unique index if not exists n8n_whatsapp_deliveries_phone_unique
  on public.n8n_whatsapp_deliveries (n8n_whatsapp_communication_id, recipient_phone);

create index if not exists n8n_whatsapp_deliveries_communication_status_idx
  on public.n8n_whatsapp_deliveries (n8n_whatsapp_communication_id, status);

create index if not exists n8n_whatsapp_deliveries_tenant_recent_idx
  on public.n8n_whatsapp_deliveries (product_id, tenant_id, created_at desc);

-- Keep tenant/product/person relationships valid for any product using the global registry.
create or replace function public.n8n_validate_global_job_scope()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not exists (
    select 1 from public.tenants t
    where t.tenant_id = new.tenant_id
      and t.product_id = new.product_id
      and t.status = 'active'
  ) then
    raise exception 'Active tenant/product scope not found for n8n global job'
      using errcode = '23503';
  end if;

  if new.person_id is not null and not exists (
    select 1 from public.persons p
    where p.person_id = new.person_id
      and p.tenant_id = new.tenant_id
      and p.product_id = new.product_id
      and p.status = 'active'
  ) then
    raise exception 'Person must be active and belong to the same tenant/product'
      using errcode = '23503';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists n8n_validate_global_job_scope_trg on public.n8n_global_jobs;
create trigger n8n_validate_global_job_scope_trg
before insert or update
on public.n8n_global_jobs
for each row execute function public.n8n_validate_global_job_scope();

create or replace function public.n8n_validate_whatsapp_communication_scope()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not exists (
    select 1
    from public.n8n_global_jobs j
    where j.n8n_global_job_id = new.n8n_global_job_id
      and j.tenant_id = new.tenant_id
      and j.product_id = new.product_id
  ) then
    raise exception 'WhatsApp communication must match its global job tenant/product'
      using errcode = '23503';
  end if;

  if new.requested_by_person_id is not null and not exists (
    select 1 from public.persons p
    where p.person_id = new.requested_by_person_id
      and p.tenant_id = new.tenant_id
      and p.product_id = new.product_id
      and p.status = 'active'
  ) then
    raise exception 'Requested-by person must be active in the same tenant/product'
      using errcode = '23503';
  end if;

  return new;
end;
$$;

drop trigger if exists n8n_validate_whatsapp_communication_scope_trg on public.n8n_whatsapp_communications;
create trigger n8n_validate_whatsapp_communication_scope_trg
before insert or update
on public.n8n_whatsapp_communications
for each row execute function public.n8n_validate_whatsapp_communication_scope();

create or replace function public.n8n_validate_whatsapp_delivery_scope()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not exists (
    select 1
    from public.n8n_whatsapp_communications c
    where c.n8n_whatsapp_communication_id = new.n8n_whatsapp_communication_id
      and c.tenant_id = new.tenant_id
      and c.product_id = new.product_id
  ) then
    raise exception 'WhatsApp delivery must match its communication tenant/product'
      using errcode = '23503';
  end if;

  if new.recipient_person_id is not null and not exists (
    select 1 from public.persons p
    where p.person_id = new.recipient_person_id
      and p.tenant_id = new.tenant_id
      and p.product_id = new.product_id
      and p.status = 'active'
  ) then
    raise exception 'Recipient person must be active in the same tenant/product'
      using errcode = '23503';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists n8n_validate_whatsapp_delivery_scope_trg on public.n8n_whatsapp_deliveries;
create trigger n8n_validate_whatsapp_delivery_scope_trg
before insert or update
on public.n8n_whatsapp_deliveries
for each row execute function public.n8n_validate_whatsapp_delivery_scope();

alter table public.n8n_global_jobs enable row level security;
alter table public.n8n_whatsapp_communications enable row level security;
alter table public.n8n_whatsapp_deliveries enable row level security;

revoke all on table public.n8n_global_jobs from anon, authenticated;
revoke all on table public.n8n_whatsapp_communications from anon, authenticated;
revoke all on table public.n8n_whatsapp_deliveries from anon, authenticated;
grant all on table public.n8n_global_jobs to service_role;
grant all on table public.n8n_whatsapp_communications to service_role;
grant all on table public.n8n_whatsapp_deliveries to service_role;

revoke all on function public.n8n_validate_global_job_scope() from public, anon, authenticated;
revoke all on function public.n8n_validate_whatsapp_communication_scope() from public, anon, authenticated;
revoke all on function public.n8n_validate_whatsapp_delivery_scope() from public, anon, authenticated;

comment on table public.n8n_global_jobs is
  'Global n8n handoff registry. Business records remain in their product-owned source tables.';
comment on table public.n8n_whatsapp_communications is
  'WhatsApp communication request details for one n8n global job; independent of PWA push notifications.';
comment on table public.n8n_whatsapp_deliveries is
  'Per-recipient WhatsApp provider outcome and actual WAHA session; sent_to_server is not device delivery/read.';

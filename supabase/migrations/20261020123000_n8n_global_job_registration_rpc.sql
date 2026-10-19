-- Atomic registration and lifecycle RPCs for the global n8n WhatsApp registry.
-- This migration does not touch PWA push notification objects or existing CFCF queues.

create or replace function public.n8n_register_whatsapp_job(
  p_product_id text,
  p_tenant_id text,
  p_person_id text,
  p_job_type text,
  p_source_table text,
  p_source_record_id text,
  p_idempotency_key text,
  p_communication_type text,
  p_message_text text default null,
  p_message_payload jsonb default '{}'::jsonb,
  p_recipients jsonb default '[]'::jsonb,
  p_scheduled_at timestamptz default null
)
returns table (n8n_global_job_id uuid, n8n_whatsapp_communication_id uuid, was_existing boolean)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_job_id uuid;
  v_communication_id uuid;
  v_existing public.n8n_global_jobs%rowtype;
  v_recipient jsonb;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;

  if p_product_id is null or length(btrim(p_product_id)) = 0
     or p_tenant_id is null or length(btrim(p_tenant_id)) = 0
     or p_person_id is null or length(btrim(p_person_id)) = 0
     or p_job_type is null or length(btrim(p_job_type)) = 0
     or p_source_table is null or length(btrim(p_source_table)) = 0
     or p_source_record_id is null or length(btrim(p_source_record_id)) = 0
     or p_idempotency_key is null or length(btrim(p_idempotency_key)) = 0 then
    raise exception 'Product, tenant, person, job type, source and idempotency key are required'
      using errcode = '22023';
  end if;

  if p_communication_type not in ('pending_reminder', 'report', 'campaign', 'custom') then
    raise exception 'Unsupported WhatsApp communication type' using errcode = '22023';
  end if;

  if p_message_payload is null or jsonb_typeof(p_message_payload) <> 'object' then
    raise exception 'message_payload must be a JSON object' using errcode = '22023';
  end if;

  if p_recipients is null or jsonb_typeof(p_recipients) <> 'array' then
    raise exception 'recipients must be a JSON array' using errcode = '22023';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_recipients) r
    where jsonb_typeof(r) <> 'object'
       or nullif(btrim(r->>'recipient_phone'), '') is null
  ) then
    raise exception 'Every recipient must be an object with recipient_phone'
      using errcode = '22023';
  end if;

  -- Serialize registrations sharing the same idempotency key. Without this
  -- transaction-scoped lock, two simultaneous first attempts could race at the
  -- unique constraint and one caller would receive an avoidable conflict.
  perform pg_advisory_xact_lock(hashtextextended(p_idempotency_key, 0));

  -- Idempotent browser/webhook retries return the original job only when the
  -- same idempotency key is reused for the exact same logical source/scope.
  select * into v_existing
  from public.n8n_global_jobs
  where idempotency_key = p_idempotency_key
  for update;

  if found then
    if v_existing.product_id <> p_product_id
       or v_existing.tenant_id <> p_tenant_id
       or v_existing.person_id <> p_person_id
       or v_existing.job_type <> p_job_type
       or v_existing.source_table <> p_source_table
       or v_existing.source_record_id <> p_source_record_id then
      raise exception 'Idempotency key is already bound to a different job'
        using errcode = '23505';
    end if;

    select c.n8n_whatsapp_communication_id into v_communication_id
    from public.n8n_whatsapp_communications c
    where c.n8n_global_job_id = v_existing.n8n_global_job_id;

    if v_communication_id is null then
      raise exception 'Existing global job is missing its communication record'
        using errcode = '23514';
    end if;

    return query select v_existing.n8n_global_job_id, v_communication_id, true;
    return;
  end if;

  insert into public.n8n_global_jobs (
    product_id, tenant_id, person_id, job_type, source_table,
    source_record_id, idempotency_key
  ) values (
    p_product_id, p_tenant_id, p_person_id, p_job_type, p_source_table,
    p_source_record_id, p_idempotency_key
  )
  returning public.n8n_global_jobs.n8n_global_job_id into v_job_id;

  insert into public.n8n_whatsapp_communications (
    n8n_global_job_id, tenant_id, product_id, communication_type,
    message_text, message_payload, requested_by_person_id, scheduled_at
  ) values (
    v_job_id, p_tenant_id, p_product_id, p_communication_type,
    p_message_text, p_message_payload, p_person_id, p_scheduled_at
  )
  returning public.n8n_whatsapp_communications.n8n_whatsapp_communication_id
    into v_communication_id;

  for v_recipient in select value from jsonb_array_elements(p_recipients)
  loop
    insert into public.n8n_whatsapp_deliveries (
      n8n_whatsapp_communication_id, tenant_id, product_id,
      recipient_person_id, recipient_contact_id, recipient_phone
    ) values (
      v_communication_id,
      p_tenant_id,
      p_product_id,
      nullif(v_recipient->>'recipient_person_id', ''),
      nullif(v_recipient->>'recipient_contact_id', ''),
      btrim(v_recipient->>'recipient_phone')
    )
    on conflict do nothing;
  end loop;

  return query select v_job_id, v_communication_id, false;
end;
$$;

create or replace function public.n8n_claim_global_jobs(p_limit integer default 25)
returns setof public.n8n_global_jobs
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;

  if p_limit is null or p_limit < 1 or p_limit > 100 then
    raise exception 'p_limit must be between 1 and 100' using errcode = '22023';
  end if;

  -- A prior pickup that exceeded 15 minutes is marked timed_out, never silently
  -- resent. A human/operator can inspect and explicitly re-register if needed.
  update public.n8n_global_jobs
  set status = 'timed_out',
      last_error = coalesce(last_error, 'n8n pickup exceeded 15-minute processing window'),
      completed_at = now(),
      updated_at = now()
  where status = 'picked_up'
    and picked_up_at < now() - interval '15 minutes';

  return query
  with picked as (
    select j.n8n_global_job_id
    from public.n8n_global_jobs j
    where j.status = 'registered'
    order by j.created_at, j.n8n_global_job_id
    for update skip locked
    limit p_limit
  )
  update public.n8n_global_jobs j
  set status = 'picked_up',
      picked_up_at = now(),
      updated_at = now()
  from picked
  where j.n8n_global_job_id = picked.n8n_global_job_id
  returning j.*;
end;
$$;

create or replace function public.n8n_finish_global_job(
  p_n8n_global_job_id uuid,
  p_status text,
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
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;

  if p_status not in ('completed', 'failed', 'timed_out') then
    raise exception 'Final status must be completed, failed or timed_out'
      using errcode = '22023';
  end if;

  update public.n8n_global_jobs
  set status = p_status,
      last_error = case when p_status = 'completed' then null else left(p_error, 2000) end,
      completed_at = now(),
      updated_at = now()
  where n8n_global_job_id = p_n8n_global_job_id
    and status = 'picked_up';

  get diagnostics v_updated = row_count;
  return v_updated = 1;
end;
$$;

revoke all on function public.n8n_register_whatsapp_job(text,text,text,text,text,text,text,text,text,jsonb,jsonb,timestamptz) from public, anon, authenticated;
revoke all on function public.n8n_claim_global_jobs(integer) from public, anon, authenticated;
revoke all on function public.n8n_finish_global_job(uuid,text,text) from public, anon, authenticated;
grant execute on function public.n8n_register_whatsapp_job(text,text,text,text,text,text,text,text,text,jsonb,jsonb,timestamptz) to service_role;
grant execute on function public.n8n_claim_global_jobs(integer) to service_role;
grant execute on function public.n8n_finish_global_job(uuid,text,text) to service_role;

comment on function public.n8n_register_whatsapp_job(text,text,text,text,text,text,text,text,text,jsonb,jsonb,timestamptz) is
  'Atomically registers one global n8n job, one WhatsApp communication and recipient delivery rows; service-role only.';
comment on function public.n8n_claim_global_jobs(integer) is
  'Atomically claims registered global n8n jobs; stale picked-up jobs time out instead of being blindly resent.';
comment on function public.n8n_finish_global_job(uuid,text,text) is
  'Marks a picked-up global n8n job completed, failed or timed_out; service-role only.';

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
     or (p_person_id is not null and length(btrim(p_person_id)) = 0)
     or p_job_type is null or length(btrim(p_job_type)) = 0
     or p_source_table is null or length(btrim(p_source_table)) = 0
     or p_source_record_id is null or length(btrim(p_source_record_id)) = 0
     or p_idempotency_key is null or length(btrim(p_idempotency_key)) = 0 then
    raise exception 'Product, job type, source and idempotency key are required; person is optional'
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

  if exists (
    select 1
    from jsonb_array_elements(p_recipients) r
    group by btrim(r->>'recipient_phone')
    having count(distinct jsonb_build_array(
      nullif(r->>'recipient_person_id', ''),
      nullif(r->>'recipient_contact_id', '')
    )) > 1
  ) then
    raise exception 'A recipient phone cannot map to conflicting person/contact identities in one request'
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
       or v_existing.person_id is distinct from p_person_id
       or v_existing.job_type <> p_job_type
       or v_existing.source_table <> p_source_table
       or v_existing.source_record_id <> p_source_record_id then
      raise exception 'Idempotency key is already bound to a different job'
        using errcode = '23505';
    end if;

    select c.n8n_whatsapp_communication_id into v_communication_id
    from public.n8n_whatsapp_communications c
    where c.n8n_global_job_id = v_existing.n8n_global_job_id
      and c.communication_type = p_communication_type
      and c.message_text is not distinct from p_message_text
      and c.message_payload = p_message_payload
      and c.scheduled_at is not distinct from p_scheduled_at;

    if v_communication_id is null then
      raise exception 'Idempotency key was reused with different communication details or the communication record is missing'
        using errcode = '23505';
    end if;

    -- A duplicate request must describe the same recipient set. Compare distinct
    -- phones because the table intentionally permits only one delivery per phone
    -- in a communication, even if the input accidentally repeats a phone.
    if exists (
      select 1
      from (
        select distinct btrim(r->>'recipient_phone') as phone
        from jsonb_array_elements(p_recipients) r
      ) incoming
      where not exists (
        select 1
        from public.n8n_whatsapp_deliveries d
        where d.n8n_whatsapp_communication_id = v_communication_id
          and d.recipient_phone = incoming.phone
          and exists (
            select 1
            from jsonb_array_elements(p_recipients) r
            where btrim(r->>'recipient_phone') = incoming.phone
              and d.recipient_person_id is not distinct from nullif(r->>'recipient_person_id', '')
              and d.recipient_contact_id is not distinct from nullif(r->>'recipient_contact_id', '')
          )
      )
    ) or exists (
      select 1
      from public.n8n_whatsapp_deliveries d
      where d.n8n_whatsapp_communication_id = v_communication_id
        and not exists (
          select 1
          from jsonb_array_elements(p_recipients) r
          where btrim(r->>'recipient_phone') = d.recipient_phone
        )
    ) then
      raise exception 'Idempotency key was reused with a different recipient set'
        using errcode = '23505';
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

  -- A prior pickup that exceeded 90 minutes is marked timed_out, never silently
  -- resent. A human/operator can inspect and explicitly re-register if needed.
  update public.n8n_global_jobs
  set status = 'timed_out',
      last_error = coalesce(last_error, 'n8n pickup exceeded 90-minute processing window'),
      completed_at = now(),
      updated_at = now()
  where status = 'picked_up'
    and picked_up_at < now() - interval '90 minutes';

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

create or replace function public.n8n_record_whatsapp_delivery_result(
  p_n8n_whatsapp_delivery_id uuid,
  p_status text,
  p_provider_message_id text default null,
  p_error_code text default null,
  p_error_message text default null,
  p_session_name text default null
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $
declare
  v_current_status text;
  v_updated integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;

  if p_status not in ('sent_to_server', 'failed', 'uncertain', 'skipped') then
    raise exception 'Unsupported recipient delivery result' using errcode = '22023';
  end if;

  if p_status = 'sent_to_server' and nullif(btrim(p_session_name), '') is null then
    raise exception 'A confirmed send result must include the actual WAHA session name'
      using errcode = '22023';
  end if;

  select d.status into v_current_status
  from public.n8n_whatsapp_deliveries d
  where d.n8n_whatsapp_delivery_id = p_n8n_whatsapp_delivery_id
  for update;

  if not found then
    return false;
  end if;

  -- Repeated identical callbacks are harmless. A later positive server
  -- acknowledgement may resolve an uncertain result, but never triggers resend.
  if v_current_status = p_status then
    update public.n8n_whatsapp_deliveries
    set provider_message_id = coalesce(provider_message_id, p_provider_message_id),
        error_code = coalesce(error_code, p_error_code),
        error_message = coalesce(error_message, left(p_error_message, 2000)),
        session_name = coalesce(session_name, nullif(btrim(p_session_name), '')),
        accepted_at = case when p_status = 'sent_to_server' then coalesce(accepted_at, now()) else accepted_at end,
        updated_at = now()
    where n8n_whatsapp_delivery_id = p_n8n_whatsapp_delivery_id;
    return true;
  end if;

  if v_current_status <> 'queued'
     and not (v_current_status = 'uncertain' and p_status = 'sent_to_server') then
    raise exception 'Invalid delivery status transition from % to %', v_current_status, p_status
      using errcode = '23514';
  end if;

  update public.n8n_whatsapp_deliveries
  set status = p_status,
      provider_message_id = coalesce(p_provider_message_id, provider_message_id),
      error_code = case when p_status = 'sent_to_server' then null else left(p_error_code, 200) end,
      error_message = case when p_status = 'sent_to_server' then null else left(p_error_message, 2000) end,
      session_name = coalesce(nullif(btrim(p_session_name), ''), session_name),
      attempted_at = coalesce(attempted_at, now()),
      accepted_at = case when p_status = 'sent_to_server' then now() else accepted_at end,
      updated_at = now()
  where n8n_whatsapp_delivery_id = p_n8n_whatsapp_delivery_id;

  get diagnostics v_updated = row_count;
  return v_updated = 1;
end;
$;

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

  if p_status = 'completed' and exists (
    select 1
    from public.n8n_whatsapp_communications c
    join public.n8n_whatsapp_deliveries d
      on d.n8n_whatsapp_communication_id = c.n8n_whatsapp_communication_id
    where c.n8n_global_job_id = p_n8n_global_job_id
      and d.status = 'queued'
  ) then
    raise exception 'Cannot complete a global job while recipient deliveries remain queued'
      using errcode = '23514';
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
revoke all on function public.n8n_record_whatsapp_delivery_result(uuid,text,text,text,text,text) from public, anon, authenticated;
grant execute on function public.n8n_record_whatsapp_delivery_result(uuid,text,text,text,text,text) to service_role;
revoke all on function public.n8n_finish_global_job(uuid,text,text) from public, anon, authenticated;
grant execute on function public.n8n_register_whatsapp_job(text,text,text,text,text,text,text,text,text,jsonb,jsonb,timestamptz) to service_role;
grant execute on function public.n8n_claim_global_jobs(integer) to service_role;
grant execute on function public.n8n_finish_global_job(uuid,text,text) to service_role;

comment on function public.n8n_register_whatsapp_job(text,text,text,text,text,text,text,text,text,jsonb,jsonb,timestamptz) is
  'Atomically registers one global n8n job, one WhatsApp communication and recipient delivery rows; service-role only.';
comment on function public.n8n_claim_global_jobs(integer) is
  'Atomically claims registered global n8n jobs; stale picked-up jobs time out instead of being blindly resent.';
comment on function public.n8n_record_whatsapp_delivery_result(uuid,text,text,text,text,text) is
  'Records one recipient outcome with guarded status transitions; uncertain may become sent_to_server only on positive provider acknowledgement; service-role only.';
comment on function public.n8n_finish_global_job(uuid,text,text) is
  'Marks a picked-up global n8n job completed, failed or timed_out; service-role only.';

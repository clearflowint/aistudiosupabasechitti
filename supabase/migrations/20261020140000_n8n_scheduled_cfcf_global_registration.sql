-- Batch 49: bridge recurring CFCF schedule slots directly into the global WhatsApp registry.
-- The legacy cfcf_automation_jobs queue is intentionally not used by the global worker.
-- This migration is PR-only until validated in a non-billable disposable test database.

create or replace function public.n8n_register_scheduled_cfcf_job(
  p_schedule_id uuid,
  p_scheduled_for timestamptz,
  p_next_run_at timestamptz,
  p_claimed_until timestamptz
)
returns table (
  n8n_global_job_id integer,
  n8n_whatsapp_communication_id integer,
  was_existing boolean,
  recipient_count integer,
  skipped_no_recipients boolean
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_schedule public.cfcf_automation_schedules%rowtype;
  v_fund public.cfcf_funds%rowtype;
  v_tenant public.tenants%rowtype;
  v_recipients jsonb;
  v_contact_names jsonb;
  v_shares_by_contact jsonb;
  v_message_payload jsonb;
  v_sender_name text;
  v_job_type text;
  v_communication_type text;
  v_automation text;
  v_idempotency_key text;
  v_registered record;
  v_recipient_count integer := 0;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service-role access is required for scheduled registration' using errcode = '42501';
  end if;

  if p_schedule_id is null or p_scheduled_for is null or p_next_run_at is null
     or p_claimed_until is null or p_next_run_at <= p_scheduled_for then
    raise exception 'Scheduled run timestamps or claim are invalid' using errcode = '22023';
  end if;

  select * into v_schedule
  from public.cfcf_automation_schedules
  where schedule_id = p_schedule_id
  for update;

  if not found then
    raise exception 'Automation schedule not found' using errcode = 'P0002';
  end if;

  if not v_schedule.is_enabled
     or v_schedule.product_id <> 'CFCF'
     or v_schedule.next_run_at is distinct from p_scheduled_for
     or v_schedule.claimed_until is distinct from p_claimed_until
     or v_schedule.claimed_until <= now() then
    raise exception 'Schedule is not currently claimed for this occurrence' using errcode = '40001';
  end if;

  select * into v_fund
  from public.cfcf_funds f
  where f.product_id = 'CFCF'
    and f.tenant_id = v_schedule.tenant_id
    and f.fund_id = v_schedule.fund_id;

  if not found then
    raise exception 'Fund for automation schedule no longer exists' using errcode = 'P0002';
  end if;

  select * into v_tenant
  from public.tenants t
  where t.product_id = 'CFCF'
    and t.tenant_id = v_schedule.tenant_id
    and t.status = 'active';

  if not found then
    raise exception 'Active CFCF workspace for schedule no longer exists' using errcode = '42501';
  end if;

  v_job_type := case when v_schedule.job_type = 'pending_due_reminder' then 'pending_reminder' else 'report' end;
  v_communication_type := v_job_type;
  v_automation := case when v_schedule.job_type = 'pending_due_reminder' then 'pending-reminder-all' else 'report-all' end;
  v_idempotency_key := 'cfcf-schedule:' || v_schedule.schedule_id::text || ':' ||
    to_char(p_scheduled_for at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"');

  -- Use current saved balances and current saved Contact phones at due time.
  -- Pending reminders include only Shares with a positive stored pending balance.
  select coalesce(jsonb_agg(jsonb_build_object(
    'recipient_contact_id', eligible.contact_id,
    'recipient_phone', eligible.phone
  ) order by eligible.contact_id), '[]'::jsonb)
  into v_recipients
  from (
    select distinct c.contact_id, btrim(c.phone) as phone
    from public.cfcf_shares s
    join public.contacts c
      on c.product_id = s.product_id
     and c.tenant_id = s.tenant_id
     and c.contact_id = s.contact_id
    where s.product_id = 'CFCF'
      and s.tenant_id = v_schedule.tenant_id
      and s.fund_id = v_schedule.fund_id
      and nullif(btrim(c.phone), '') is not null
      and (v_schedule.job_type <> 'pending_due_reminder' or coalesce(s.total_pending, 0) > 0)
  ) eligible;

  v_recipient_count := jsonb_array_length(v_recipients);

  if v_recipient_count = 0 then
    -- No current eligible recipient: consume this monthly occurrence without
    -- creating an empty communication or retrying the same occurrence forever.
    update public.cfcf_automation_schedules
    set last_run_at = p_scheduled_for,
        next_run_at = p_next_run_at,
        claimed_until = null,
        last_error = null,
        updated_at = now()
    where schedule_id = v_schedule.schedule_id;

    return query select null::integer, null::integer, false, 0, true;
    return;
  end if;

  select coalesce(jsonb_object_agg(contact_data.contact_id, contact_data.contact_name), '{}'::jsonb)
  into v_contact_names
  from (
    select distinct c.contact_id, coalesce(nullif(btrim(c.name), ''), 'there') as contact_name
    from public.cfcf_shares s
    join public.contacts c
      on c.product_id = s.product_id
     and c.tenant_id = s.tenant_id
     and c.contact_id = s.contact_id
    where s.product_id = 'CFCF'
      and s.tenant_id = v_schedule.tenant_id
      and s.fund_id = v_schedule.fund_id
      and nullif(btrim(c.phone), '') is not null
      and (v_schedule.job_type <> 'pending_due_reminder' or coalesce(s.total_pending, 0) > 0)
  ) contact_data;

  select coalesce(jsonb_object_agg(share_data.contact_id, share_data.shares), '{}'::jsonb)
  into v_shares_by_contact
  from (
    select c.contact_id,
      jsonb_agg(jsonb_build_object(
        'share_id', s.share_id,
        'pending_amount', coalesce(s.total_pending, 0),
        'advance_amount', coalesce(s.total_advance, 0)
      ) order by s.share_id) as shares
    from public.cfcf_shares s
    join public.contacts c
      on c.product_id = s.product_id
     and c.tenant_id = s.tenant_id
     and c.contact_id = s.contact_id
    where s.product_id = 'CFCF'
      and s.tenant_id = v_schedule.tenant_id
      and s.fund_id = v_schedule.fund_id
      and nullif(btrim(c.phone), '') is not null
      and (v_schedule.job_type <> 'pending_due_reminder' or coalesce(s.total_pending, 0) > 0)
    group by c.contact_id
  ) share_data;

  v_sender_name := coalesce(
    nullif(btrim(v_tenant.business_name), ''),
    nullif(btrim(v_tenant.name), ''),
    'Fund Manager'
  );

  v_message_payload := jsonb_build_object(
    'automation', v_automation,
    'fund_id', v_fund.fund_id,
    'fund_name', v_fund.fund_name,
    'current_cycle', coalesce(v_fund.current_cycle, 0),
    'number_of_cycles', v_fund.number_of_cycles,
    'sender_name', v_sender_name,
    'contact_names_by_id', v_contact_names,
    'shares_by_contact', v_shares_by_contact
  );

  select registered.n8n_global_job_id, registered.n8n_whatsapp_communication_id, registered.was_existing
  into v_registered
  from public.n8n_register_whatsapp_job(
    'CFCF',
    v_schedule.tenant_id,
    null,
    v_job_type,
    'cfcf_funds',
    v_schedule.fund_id,
    v_idempotency_key,
    v_communication_type,
    null,
    v_message_payload,
    v_recipients,
    p_scheduled_for
  ) as registered;

  if v_registered.n8n_global_job_id is null or v_registered.n8n_whatsapp_communication_id is null then
    raise exception 'Global WhatsApp registry did not return job IDs' using errcode = 'P0001';
  end if;

  -- Registration and recurrence advance share one transaction: no legacy queue
  -- entry is created and a schedule occurrence cannot be registered twice.
  update public.cfcf_automation_schedules
  set last_run_at = p_scheduled_for,
      next_run_at = p_next_run_at,
      claimed_until = null,
      last_error = null,
      updated_at = now()
  where schedule_id = v_schedule.schedule_id;

  return query select
    v_registered.n8n_global_job_id::integer,
    v_registered.n8n_whatsapp_communication_id::integer,
    v_registered.was_existing::boolean,
    v_recipient_count,
    false;
end;
$$;

revoke all on function public.n8n_register_scheduled_cfcf_job(uuid, timestamptz, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.n8n_register_scheduled_cfcf_job(uuid, timestamptz, timestamptz, timestamptz) to service_role;

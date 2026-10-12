-- CFCF PRODUCT: Atomically append/update campaign lifecycle notifications for authenticated ClearFlow workflows.
create or replace function public.cfcf_upsert_campaign_notification(
  p_tenant_id text,
  p_notification jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_current jsonb;
  v_existing jsonb;
  v_incoming_status text;
  v_existing_status text;
  v_campaign_id text;
begin
  if jsonb_typeof(p_notification) <> 'object' then
    raise exception 'notification must be a JSON object';
  end if;
  v_campaign_id := nullif(trim(p_notification->>'campaign_id'), '');
  v_incoming_status := lower(coalesce(p_notification->>'status', ''));
  if v_campaign_id is null then raise exception 'campaign_id is required'; end if;
  if v_incoming_status not in ('submitting', 'ack_timeout', 'accepted', 'sent', 'partial', 'failed') then
    raise exception 'unsupported campaign notification status';
  end if;
  if not exists (
    select 1 from public.tenants t
    where t.tenant_id = p_tenant_id and t.product_id = 'CFCF' and t.status = 'active'
  ) then raise exception 'active CFCF tenant not found'; end if;

  insert into public.cfcf_product_data (product_id, tenant_id, person_id, notifications)
  values ('CFCF', p_tenant_id, nullif(p_notification->>'person_id', ''), '[]'::jsonb)
  on conflict (product_id, tenant_id) do nothing;

  select coalesce(d.notifications, '[]'::jsonb)
  into v_current
  from public.cfcf_product_data d
  where d.product_id = 'CFCF' and d.tenant_id = p_tenant_id
  for update;

  select item into v_existing
  from jsonb_array_elements(v_current) as n(item)
  where item->>'campaign_id' = v_campaign_id
  limit 1;

  if found then
    v_existing_status := lower(coalesce(v_existing->>'status', ''));
    if v_existing_status in ('sent', 'partial', 'failed') and v_incoming_status in ('submitting', 'ack_timeout', 'accepted') then
      return v_existing;
    end if;
    if v_existing_status in ('sent', 'partial', 'failed')
       and v_incoming_status in ('sent', 'partial', 'failed')
       and v_existing_status <> v_incoming_status then
      raise exception 'campaign already has a different terminal status';
    end if;
    select coalesce(jsonb_agg(
      case when item->>'campaign_id' = v_campaign_id then item || p_notification else item end
      order by ordinality
    ), '[]'::jsonb)
    into v_current
    from jsonb_array_elements(v_current) with ordinality as n(item, ordinality);
  else
    v_current := v_current || jsonb_build_array(p_notification);
  end if;

  if jsonb_array_length(v_current) > 100 then
    select coalesce(jsonb_agg(item order by ordinality), '[]'::jsonb)
    into v_current
    from (
      select item, ordinality
      from jsonb_array_elements(v_current) with ordinality as n(item, ordinality)
      order by ordinality desc
      limit 100
    ) recent;
  end if;

  update public.cfcf_product_data
  set notifications = v_current,
      person_id = coalesce(nullif(p_notification->>'person_id', ''), person_id),
      updated_at = now()
  where product_id = 'CFCF' and tenant_id = p_tenant_id;

  return p_notification;
end;
$function$;

revoke all on function public.cfcf_upsert_campaign_notification(text, jsonb) from public, anon, authenticated;
grant execute on function public.cfcf_upsert_campaign_notification(text, jsonb) to service_role;

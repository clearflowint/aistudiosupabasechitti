-- Complete, scoped delivery snapshot for the inactive n8n global worker draft.
-- Returns the exact row count and all matching delivery rows in one JSON response,
-- avoiding REST pagination truncation before finalization checks.

create or replace function public.n8n_read_scoped_whatsapp_deliveries(
  p_communication_id integer,
  p_tenant_id text,
  p_product_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_deliveries jsonb;
  v_count integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service role is required' using errcode = '42501';
  end if;

  if p_communication_id is null or p_communication_id < 100
     or nullif(btrim(p_tenant_id), '') is null
     or p_product_id <> 'CFCF' then
    raise exception 'Scoped communication parameters are invalid' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.n8n_whatsapp_communications c
    where c.n8n_whatsapp_communication_id = p_communication_id
      and c.tenant_id = p_tenant_id
      and c.product_id = p_product_id
  ) then
    raise exception 'Communication not found in requested scope' using errcode = '42501';
  end if;

  select count(*)::integer,
         coalesce(
           jsonb_agg(
             jsonb_build_object(
               'n8n_whatsapp_delivery_id', d.n8n_whatsapp_delivery_id,
               'n8n_whatsapp_communication_id', d.n8n_whatsapp_communication_id,
               'tenant_id', d.tenant_id,
               'product_id', d.product_id,
               'recipient_person_id', d.recipient_person_id,
               'recipient_contact_id', d.recipient_contact_id,
               'recipient_phone', d.recipient_phone,
               'session_name', d.session_name,
               'status', d.status
             )
             order by d.n8n_whatsapp_delivery_id
           ),
           '[]'::jsonb
         )
    into v_count, v_deliveries
  from public.n8n_whatsapp_deliveries d
  where d.n8n_whatsapp_communication_id = p_communication_id
    and d.tenant_id = p_tenant_id
    and d.product_id = p_product_id;

  return jsonb_build_object(
    'expectedDeliveryCount', v_count,
    'deliveries', v_deliveries,
    'complete', true
  );
end;
$$;

revoke all on function public.n8n_read_scoped_whatsapp_deliveries(integer, text, text) from public, anon, authenticated;
grant execute on function public.n8n_read_scoped_whatsapp_deliveries(integer, text, text) to service_role;

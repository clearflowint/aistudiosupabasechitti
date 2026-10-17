alter table public.clearflow_push_outbox
  drop constraint if exists clearflow_push_outbox_event_unique;

create unique index if not exists clearflow_push_outbox_event_unique
  on public.clearflow_push_outbox (product_id, tenant_id, origin_id, event_key);

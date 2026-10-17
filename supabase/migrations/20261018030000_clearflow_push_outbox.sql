-- Batch 4: server-side notification outbox for idempotent ClearFlow push delivery.
-- Producers enqueue an event; a trusted dispatcher delivers it to active device subscriptions.

CREATE TABLE IF NOT EXISTS public.clearflow_push_outbox (
  notification_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id text NOT NULL REFERENCES public.products(product_id) ON UPDATE CASCADE ON DELETE RESTRICT,
  tenant_id text NOT NULL,
  origin_id bigint NOT NULL REFERENCES public.clearflow_product_origins(origin_id) ON DELETE RESTRICT,
  event_key text NOT NULL,
  notification_type text NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  target_person_id text,
  target_auth_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  target_url text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  delivery_status text NOT NULL DEFAULT 'pending'
    CHECK (delivery_status IN ('pending', 'processing', 'sent', 'partial', 'failed', 'cancelled')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  available_at timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz,
  sent_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT clearflow_push_outbox_event_unique UNIQUE (product_id, tenant_id, event_key),
  CONSTRAINT clearflow_push_outbox_title_length CHECK (length(title) BETWEEN 1 AND 120),
  CONSTRAINT clearflow_push_outbox_body_length CHECK (length(body) BETWEEN 1 AND 500),
  CONSTRAINT clearflow_push_outbox_url_local CHECK (
    target_url IS NULL OR (target_url LIKE '/%' AND target_url NOT LIKE '//%')
  )
);

CREATE INDEX IF NOT EXISTS clearflow_push_outbox_pending_idx
  ON public.clearflow_push_outbox (available_at, created_at)
  WHERE delivery_status IN ('pending', 'partial', 'failed');

CREATE INDEX IF NOT EXISTS clearflow_push_outbox_tenant_idx
  ON public.clearflow_push_outbox (product_id, tenant_id, created_at DESC);

COMMENT ON TABLE public.clearflow_push_outbox IS
  'Private, idempotent server-side queue for ClearFlow push events; never directly accessible by client roles.';
COMMENT ON COLUMN public.clearflow_push_outbox.event_key IS
  'Producer-supplied idempotency key to prevent duplicate notifications for the same event.';

ALTER TABLE public.clearflow_push_outbox ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.clearflow_push_outbox FROM anon, authenticated;
GRANT ALL ON TABLE public.clearflow_push_outbox TO service_role;

-- Track active manager alert keys so scheduled evaluation only pushes newly appearing alerts.
CREATE TABLE IF NOT EXISTS public.clearflow_push_alert_state (
  product_id text NOT NULL,
  tenant_id text NOT NULL,
  origin_id bigint NOT NULL REFERENCES public.clearflow_product_origins(origin_id) ON DELETE CASCADE,
  active_alert_keys text[] NOT NULL DEFAULT '{}'::text[],
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (product_id, tenant_id, origin_id)
);

ALTER TABLE public.clearflow_push_alert_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.clearflow_push_alert_state FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.clearflow_push_alert_state TO service_role;
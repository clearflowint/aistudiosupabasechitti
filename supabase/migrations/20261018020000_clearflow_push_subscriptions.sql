-- Batch 3: private device subscription registry for shared ClearFlow push.
-- Client apps cannot read or write these records directly; Edge Functions validate access.

CREATE TABLE IF NOT EXISTS public.clearflow_push_subscriptions (
  subscription_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id text NOT NULL REFERENCES public.products(product_id) ON UPDATE CASCADE ON DELETE RESTRICT,
  tenant_id text NOT NULL,
  person_id text,
  origin_id bigint NOT NULL REFERENCES public.clearflow_product_origins(origin_id) ON DELETE RESTRICT,
  endpoint text NOT NULL,
  p256dh text NOT NULL,
  auth_secret text NOT NULL,
  user_agent text,
  is_active boolean NOT NULL DEFAULT true,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  CONSTRAINT clearflow_push_subscriptions_endpoint_unique UNIQUE (endpoint),
  CONSTRAINT clearflow_push_subscriptions_endpoint_https CHECK (endpoint ~ '^https://'),
  CONSTRAINT clearflow_push_subscriptions_key_lengths CHECK (
    length(p256dh) BETWEEN 20 AND 256 AND length(auth_secret) BETWEEN 8 AND 256
  ),
  CONSTRAINT clearflow_push_subscriptions_revocation_consistent CHECK (
    (is_active AND revoked_at IS NULL) OR (NOT is_active AND revoked_at IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS clearflow_push_subscriptions_delivery_idx
  ON public.clearflow_push_subscriptions (product_id, tenant_id, origin_id)
  WHERE is_active = true;
CREATE INDEX IF NOT EXISTS clearflow_push_subscriptions_user_idx
  ON public.clearflow_push_subscriptions (auth_user_id, product_id, tenant_id)
  WHERE is_active = true;

COMMENT ON TABLE public.clearflow_push_subscriptions IS
  'Server-only web-push endpoint and encryption keys, scoped to a verified auth user, product, tenant and approved origin.';
COMMENT ON COLUMN public.clearflow_push_subscriptions.auth_secret IS
  'Web Push subscription auth key; private server-side credential material. Never return from APIs or expose through client reads.';

ALTER TABLE public.clearflow_push_subscriptions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.clearflow_push_subscriptions FROM anon, authenticated;
GRANT ALL ON TABLE public.clearflow_push_subscriptions TO service_role;

-- Restore the minimum read privileges required by trusted Edge Functions.
-- RLS policies still govern client-facing access; these grants are for service_role only.

GRANT SELECT ON TABLE public.global_access_list TO service_role;
GRANT SELECT ON TABLE public.tenants TO service_role;
GRANT SELECT ON TABLE public.products TO service_role;

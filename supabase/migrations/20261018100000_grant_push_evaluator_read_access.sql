-- The trusted push evaluator needs read-only access to saved CFCF alert source tables.
GRANT SELECT ON TABLE public.cfcf_funds TO service_role;
GRANT SELECT ON TABLE public.cfcf_shares TO service_role;
GRANT SELECT ON TABLE public.cfcf_bills TO service_role;
GRANT SELECT ON TABLE public.cfcf_cycles TO service_role;
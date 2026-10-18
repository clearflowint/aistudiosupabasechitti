-- Restore the owner-checked archive RPC's intended privilege boundary.
-- The Oct 18 summary migration replaced the function body without retaining SECURITY DEFINER,
-- so its activity-log cleanup ran as the authenticated caller and failed RLS/table privileges.
ALTER FUNCTION public.cfcf_archive_fund_with_report(text, text, text) SECURITY DEFINER;
ALTER FUNCTION public.cfcf_archive_fund_with_report(text, text, text)
  SET search_path = pg_catalog, public;
REVOKE ALL ON FUNCTION public.cfcf_archive_fund_with_report(text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cfcf_archive_fund_with_report(text, text, text) TO authenticated;

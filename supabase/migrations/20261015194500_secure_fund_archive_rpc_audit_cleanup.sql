-- Archive is a single owner-authorized transaction. Run its multi-table cleanup with the function owner's privileges, rather than granting direct audit-log deletion to app users.
alter function public.cfcf_archive_fund_with_report(text, text, text) security definer;
alter function public.cfcf_archive_fund_with_report(text, text, text) set search_path = pg_catalog, public;
revoke all on function public.cfcf_archive_fund_with_report(text, text, text) from public, anon;
grant execute on function public.cfcf_archive_fund_with_report(text, text, text) to authenticated;

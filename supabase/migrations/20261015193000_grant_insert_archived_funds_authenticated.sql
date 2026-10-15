-- Restore the table-level INSERT privilege required by the archive RPC.
-- Row Level Security still restricts inserts to active CFCF tenant owners.
grant insert on table public.cfcf_archived_funds to authenticated;

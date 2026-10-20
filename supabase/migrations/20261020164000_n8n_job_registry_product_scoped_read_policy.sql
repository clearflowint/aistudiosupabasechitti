-- Keep global job status access tenant-scoped and product-specific.
-- CFCF remains manager-only; other products use their own active tenant access model.
drop policy if exists n8n_global_jobs_tenant_owner_read on public.n8n_global_jobs;
drop policy if exists n8n_global_jobs_product_scoped_read on public.n8n_global_jobs;

create policy n8n_global_jobs_product_scoped_read
  on public.n8n_global_jobs
  for select to authenticated
  using (
    case
      when product_id = 'CFCF'
        then public.is_active_tenant_owner(product_id, tenant_id)
      else public.has_active_access(product_id, tenant_id)
    end
  );

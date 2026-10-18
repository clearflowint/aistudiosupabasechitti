-- Keep automation job ownership aligned with the shared ClearFlow tenant model.
-- These constraints make cross-tenant/product targets impossible even if an n8n
-- workflow accidentally supplies mismatched IDs. NULL fund_id remains allowed
-- for future non-fund jobs; current CFCF job RPCs still require a real fund.

ALTER TABLE public.cfcf_automation_jobs
  ADD CONSTRAINT cfcf_automation_jobs_tenant_product_fk
  FOREIGN KEY (tenant_id, product_id)
  REFERENCES public.tenants (tenant_id, product_id)
  ON DELETE CASCADE;

ALTER TABLE public.cfcf_automation_jobs
  ADD CONSTRAINT cfcf_automation_jobs_fund_tenant_product_fk
  FOREIGN KEY (fund_id, tenant_id, product_id)
  REFERENCES public.cfcf_funds (fund_id, tenant_id, product_id)
  ON DELETE CASCADE;

COMMENT ON CONSTRAINT cfcf_automation_jobs_tenant_product_fk
  ON public.cfcf_automation_jobs IS
  'Ensures each automation job belongs to a tenant registered for the same ClearFlow product.';

COMMENT ON CONSTRAINT cfcf_automation_jobs_fund_tenant_product_fk
  ON public.cfcf_automation_jobs IS
  'Ensures any fund targeted by an automation job belongs to the same tenant and product as the job.';

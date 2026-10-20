-- CFCF PRODUCT: Contact Group names are unique within a tenant, case-insensitively.
-- Trimming is applied for comparison so "Farmers", " farmers ", and "FARMERS" conflict.
-- The same name remains available in a different tenant.
create unique index if not exists contactgroups_tenant_product_name_unique_idx
  on public.contactgroups (tenant_id, product_id, lower(btrim(group_name)));

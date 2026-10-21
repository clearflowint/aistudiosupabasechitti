-- CFCF PRODUCT: Repair Contact Group membership table privileges for authenticated tenant owners.
-- The membership UI saves only explicitly selected contacts. Keep writes constrained by RLS.
grant select, insert, update, delete on table public.contact_group_members to authenticated;
revoke all on table public.contact_group_members from anon;

drop policy if exists contact_group_members_update_owner on public.contact_group_members;
create policy contact_group_members_update_owner on public.contact_group_members
  for update to authenticated
  using (public.is_active_tenant_owner(product_id, tenant_id))
  with check (
    public.is_active_tenant_owner(product_id, tenant_id)
    and exists (
      select 1 from public.contactgroups g
      where g.group_id = contact_group_members.group_id
        and g.tenant_id = contact_group_members.tenant_id
        and g.product_id = contact_group_members.product_id
    )
    and exists (
      select 1 from public.contacts c
      where c.contact_id = contact_group_members.contact_id
        and c.tenant_id = contact_group_members.tenant_id
        and c.product_id = contact_group_members.product_id
    )
  );

comment on table public.contact_group_members is
  'CFCF Contact Group membership. Authenticated mutations require active tenant-owner RLS policies; anonymous access is revoked.';

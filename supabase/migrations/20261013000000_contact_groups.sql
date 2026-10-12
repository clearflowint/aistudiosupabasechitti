-- CFCF PRODUCT: Relational Contact Groups and membership, tenant-scoped and protected by RLS.
-- Applied to Supabase project dpokiryjtyikfspvfjwu on 2026-10-13.
create table if not exists public.contactgroups (
  group_id text primary key,
  product_id text not null default 'CFCF' check (product_id = 'CFCF'),
  tenant_id text not null,
  person_id text not null,
  group_name text not null check (length(trim(group_name)) between 1 and 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint contactgroups_group_tenant_product_key unique (group_id, tenant_id, product_id),
  constraint contactgroups_tenant_product_fkey
    foreign key (tenant_id, product_id)
    references public.tenants (tenant_id, product_id) on delete cascade,
  constraint contactgroups_person_tenant_product_fkey
    foreign key (person_id, tenant_id, product_id)
    references public.persons (person_id, tenant_id, product_id) on delete restrict
);

create index if not exists contactgroups_tenant_product_name_idx
  on public.contactgroups (tenant_id, product_id, lower(group_name));

create table if not exists public.contact_group_members (
  group_id text not null,
  contact_id text not null,
  product_id text not null default 'CFCF' check (product_id = 'CFCF'),
  tenant_id text not null,
  created_at timestamptz not null default now(),
  constraint contact_group_members_pkey primary key (group_id, contact_id),
  constraint contact_group_members_group_fkey
    foreign key (group_id, tenant_id, product_id)
    references public.contactgroups (group_id, tenant_id, product_id) on delete cascade,
  constraint contact_group_members_contact_fkey
    foreign key (contact_id, tenant_id, product_id)
    references public.contacts (contact_id, tenant_id, product_id) on delete cascade,
  constraint contact_group_members_tenant_fkey
    foreign key (tenant_id, product_id)
    references public.tenants (tenant_id, product_id) on delete cascade
);

create index if not exists contact_group_members_tenant_product_contact_idx
  on public.contact_group_members (tenant_id, product_id, contact_id);
create index if not exists contact_group_members_tenant_product_group_idx
  on public.contact_group_members (tenant_id, product_id, group_id);

drop trigger if exists contactgroups_updated_at on public.contactgroups;
create trigger contactgroups_updated_at
  before update on public.contactgroups
  for each row execute function public.set_updated_at();

alter table public.contactgroups enable row level security;
alter table public.contact_group_members enable row level security;

drop policy if exists contactgroups_select_authorized on public.contactgroups;
create policy contactgroups_select_authorized on public.contactgroups
  for select to authenticated
  using (public.has_active_access(product_id, tenant_id));

drop policy if exists contactgroups_insert_owner on public.contactgroups;
create policy contactgroups_insert_owner on public.contactgroups
  for insert to authenticated
  with check (
    public.is_active_tenant_owner(product_id, tenant_id)
    and exists (
      select 1 from public.persons p
      where p.person_id = contactgroups.person_id
        and p.tenant_id = contactgroups.tenant_id
        and p.product_id = contactgroups.product_id
        and p.status = 'active'
    )
  );

drop policy if exists contactgroups_update_owner on public.contactgroups;
create policy contactgroups_update_owner on public.contactgroups
  for update to authenticated
  using (public.is_active_tenant_owner(product_id, tenant_id))
  with check (
    public.is_active_tenant_owner(product_id, tenant_id)
    and exists (
      select 1 from public.persons p
      where p.person_id = contactgroups.person_id
        and p.tenant_id = contactgroups.tenant_id
        and p.product_id = contactgroups.product_id
        and p.status = 'active'
    )
  );

drop policy if exists contactgroups_delete_owner on public.contactgroups;
create policy contactgroups_delete_owner on public.contactgroups
  for delete to authenticated
  using (public.is_active_tenant_owner(product_id, tenant_id));

drop policy if exists contact_group_members_select_authorized on public.contact_group_members;
create policy contact_group_members_select_authorized on public.contact_group_members
  for select to authenticated
  using (public.has_active_access(product_id, tenant_id));

drop policy if exists contact_group_members_insert_owner on public.contact_group_members;
create policy contact_group_members_insert_owner on public.contact_group_members
  for insert to authenticated
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

drop policy if exists contact_group_members_delete_owner on public.contact_group_members;
create policy contact_group_members_delete_owner on public.contact_group_members
  for delete to authenticated
  using (public.is_active_tenant_owner(product_id, tenant_id));

grant select, insert, update, delete on public.contactgroups to authenticated;
grant select, insert, delete on public.contact_group_members to authenticated;
revoke all on public.contactgroups from anon;
revoke all on public.contact_group_members from anon;

create table if not exists public.catalog_products (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  name text not null,
  display_title text not null,
  description text not null default '',
  net_price text not null default '$0.00',
  status text not null default 'Disponible'
    check (status in ('Disponible', 'Agotado', 'Próximamente')),
  is_new boolean not null default false,
  is_promotion boolean not null default false,
  is_secure boolean not null default false,
  image_urls text[] not null default '{}',
  sort_order integer not null default 0,
  updated_at timestamptz not null default now(),
  constraint catalog_products_category_name_key unique (category, name)
);

create table if not exists public.catalog_editors (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique
);

alter table public.catalog_products enable row level security;
alter table public.catalog_editors enable row level security;

create or replace function public.is_catalog_editor()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.catalog_editors
    where user_id = (select auth.uid())
  );
$$;

revoke all on function public.is_catalog_editor() from public;
grant execute on function public.is_catalog_editor() to authenticated;

grant usage on schema public to anon, authenticated;
grant select on public.catalog_products to anon, authenticated;
grant insert, update, delete on public.catalog_products to authenticated;
grant select on public.catalog_editors to authenticated;

drop policy if exists "Anyone can view catalog products" on public.catalog_products;
create policy "Anyone can view catalog products"
  on public.catalog_products for select
  to anon, authenticated
  using (true);

drop policy if exists "Authorized editors can add products" on public.catalog_products;
create policy "Authorized editors can add products"
  on public.catalog_products for insert
  to authenticated
  with check ((select public.is_catalog_editor()));

drop policy if exists "Authorized editors can update products" on public.catalog_products;
create policy "Authorized editors can update products"
  on public.catalog_products for update
  to authenticated
  using ((select public.is_catalog_editor()))
  with check ((select public.is_catalog_editor()));

drop policy if exists "Authorized editors can delete products" on public.catalog_products;
create policy "Authorized editors can delete products"
  on public.catalog_products for delete
  to authenticated
  using ((select public.is_catalog_editor()));

drop policy if exists "Editors can view own membership" on public.catalog_editors;
create policy "Editors can view own membership"
  on public.catalog_editors for select
  to authenticated
  using (user_id = (select auth.uid()));

insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do update set public = true;

drop policy if exists "Anyone can view product images" on storage.objects;
create policy "Anyone can view product images"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'product-images');

drop policy if exists "Authorized editors can upload product images" on storage.objects;
create policy "Authorized editors can upload product images"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'product-images'
    and (storage.foldername(name))[1] = 'products'
    and (select public.is_catalog_editor())
  );

drop policy if exists "Authorized editors can update product images" on storage.objects;
create policy "Authorized editors can update product images"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'product-images'
    and (storage.foldername(name))[1] = 'products'
    and (select public.is_catalog_editor())
  )
  with check (
    bucket_id = 'product-images'
    and (storage.foldername(name))[1] = 'products'
    and (select public.is_catalog_editor())
  );

drop policy if exists "Authorized editors can delete product images" on storage.objects;
create policy "Authorized editors can delete product images"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'product-images'
    and (storage.foldername(name))[1] = 'products'
    and (select public.is_catalog_editor())
  );

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'catalog_products'
  ) then
    alter publication supabase_realtime add table public.catalog_products;
  end if;
end;
$$;

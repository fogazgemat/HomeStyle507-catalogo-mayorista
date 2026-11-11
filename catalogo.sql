create table if not exists public.catalog_products (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  name text not null,
  display_title text not null,
  description text not null default '',
  net_price text not null default '$0.00',
  status text not null default 'Disponible'
    check (status in ('Disponible', 'Agotado', 'Próximamente')),
  priority_level text not null default 'Prioridad 3'
    check (priority_level in ('Prioridad 1', 'Prioridad 2', 'Prioridad 3')),
  all_available boolean not null default false,
  is_new boolean not null default false,
  is_promotion boolean not null default false,
  is_secure boolean not null default true,
  image_urls text[] not null default '{}',
  sort_order integer not null default 0,
  updated_at timestamptz not null default now(),
  constraint catalog_products_category_name_key unique (category, name)
);

alter table public.catalog_products
  add column if not exists priority_level text not null default 'Prioridad 3',
  add column if not exists all_available boolean not null default false,
  add column if not exists is_secure boolean not null default true;

alter table public.catalog_products
  alter column priority_level set default 'Prioridad 3',
  alter column all_available set default false,
  alter column is_secure set default true;

create table if not exists public.catalog_migrations (
  version text primary key,
  applied_at timestamptz not null default now()
);
revoke all on public.catalog_migrations from public, anon, authenticated;

do $$
begin
  if not exists (
    select 1 from public.catalog_migrations where version = '2026-11-product-defaults'
  ) then
    update public.catalog_products
    set priority_level = 'Prioridad 3',
        all_available = false,
        is_secure = true;

    insert into public.catalog_migrations (version)
    values ('2026-11-product-defaults');
  end if;
end;
$$;

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

alter table public.catalog_migrations enable row level security;
grant select, insert on public.catalog_migrations to authenticated;
grant select on public.catalog_migrations to anon;
drop policy if exists "Public can view static catalog marker" on public.catalog_migrations;
create policy "Public can view static catalog marker"
  on public.catalog_migrations for select
  to anon
  using (version = '2026-11-static-catalog');
drop policy if exists "Authorized editors can view catalog migrations" on public.catalog_migrations;
create policy "Authorized editors can view catalog migrations"
  on public.catalog_migrations for select
  to authenticated
  using ((select public.is_catalog_editor()));
drop policy if exists "Authorized editors can record catalog migrations" on public.catalog_migrations;
create policy "Authorized editors can record catalog migrations"
  on public.catalog_migrations for insert
  to authenticated
  with check ((select public.is_catalog_editor()));

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

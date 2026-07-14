create table public.user_barcode_products (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  barcode text not null,
  name text not null,
  default_quantity numeric not null,
  default_unit text not null,
  default_location text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_barcode_products_user_barcode_unique unique (user_id, barcode),
  constraint user_barcode_products_barcode_digits check (barcode ~ '^[0-9]+$'),
  constraint user_barcode_products_barcode_length check (char_length(barcode) in (8, 12, 13, 14)),
  constraint user_barcode_products_name_not_empty check (char_length(btrim(name)) > 0),
  constraint user_barcode_products_name_length check (char_length(name) <= 120),
  constraint user_barcode_products_quantity_positive check (default_quantity > 0 and default_quantity <> 'Infinity'::numeric and default_quantity <> '-Infinity'::numeric),
  constraint user_barcode_products_unit_check check (default_unit in ('ud', 'g', 'kg', 'ml', 'l')),
  constraint user_barcode_products_location_check check (default_location is null or default_location in ('pantry', 'fridge', 'freezer'))
);

create index user_barcode_products_user_id_idx
on public.user_barcode_products (user_id);

alter table public.user_barcode_products enable row level security;

revoke all on table public.user_barcode_products from public, anon, authenticated;
grant select, insert, update, delete on table public.user_barcode_products to authenticated;

drop trigger if exists set_user_barcode_products_updated_at on public.user_barcode_products;
create trigger set_user_barcode_products_updated_at
before update on public.user_barcode_products
for each row
execute function public.set_updated_at();

drop policy if exists "Users can view own barcode products" on public.user_barcode_products;
create policy "Users can view own barcode products"
on public.user_barcode_products
for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users can create own barcode products" on public.user_barcode_products;
create policy "Users can create own barcode products"
on public.user_barcode_products
for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update own barcode products" on public.user_barcode_products;
create policy "Users can update own barcode products"
on public.user_barcode_products
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete own barcode products" on public.user_barcode_products;
create policy "Users can delete own barcode products"
on public.user_barcode_products
for delete
to authenticated
using ((select auth.uid()) = user_id);

create table public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  location text not null,
  quantity numeric not null,
  unit text not null,
  expires_at date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint inventory_items_name_not_empty check (char_length(btrim(name)) > 0),
  constraint inventory_items_location_check check (location in ('pantry', 'fridge', 'freezer')),
  constraint inventory_items_quantity_positive check (quantity > 0),
  constraint inventory_items_unit_not_empty check (char_length(btrim(unit)) > 0)
);

alter table public.inventory_items enable row level security;

revoke all on table public.inventory_items from anon;
revoke all on table public.inventory_items from authenticated;
grant select, insert, update, delete on table public.inventory_items to authenticated;

create index inventory_items_user_id_idx
on public.inventory_items (user_id);

drop trigger if exists set_inventory_items_updated_at on public.inventory_items;
create trigger set_inventory_items_updated_at
before update on public.inventory_items
for each row
execute function public.set_updated_at();

drop policy if exists "Users can view own inventory items" on public.inventory_items;
create policy "Users can view own inventory items"
on public.inventory_items
for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users can create own inventory items" on public.inventory_items;
create policy "Users can create own inventory items"
on public.inventory_items
for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update own inventory items" on public.inventory_items;
create policy "Users can update own inventory items"
on public.inventory_items
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete own inventory items" on public.inventory_items;
create policy "Users can delete own inventory items"
on public.inventory_items
for delete
to authenticated
using ((select auth.uid()) = user_id);

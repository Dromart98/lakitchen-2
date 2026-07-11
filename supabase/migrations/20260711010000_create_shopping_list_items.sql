create table public.shopping_list_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  quantity numeric not null default 1,
  unit text not null default 'ud',
  is_purchased boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint shopping_list_items_name_not_empty check (char_length(btrim(name)) > 0),
  constraint shopping_list_items_name_max_length check (char_length(name) <= 120),
  constraint shopping_list_items_quantity_positive check (quantity > 0),
  constraint shopping_list_items_unit_check check (unit in ('ud', 'g', 'kg', 'ml', 'l'))
);

alter table public.shopping_list_items enable row level security;

revoke all on table public.shopping_list_items from anon;
revoke all on table public.shopping_list_items from authenticated;
grant select, insert, update, delete on table public.shopping_list_items to authenticated;

create index shopping_list_items_user_purchased_created_at_idx
on public.shopping_list_items (user_id, is_purchased, created_at desc);

drop trigger if exists set_shopping_list_items_updated_at on public.shopping_list_items;
create trigger set_shopping_list_items_updated_at
before update on public.shopping_list_items
for each row
execute function public.set_updated_at();

drop policy if exists "Users can view own shopping list items" on public.shopping_list_items;
create policy "Users can view own shopping list items"
on public.shopping_list_items
for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users can create own shopping list items" on public.shopping_list_items;
create policy "Users can create own shopping list items"
on public.shopping_list_items
for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update own shopping list items" on public.shopping_list_items;
create policy "Users can update own shopping list items"
on public.shopping_list_items
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete own shopping list items" on public.shopping_list_items;
create policy "Users can delete own shopping list items"
on public.shopping_list_items
for delete
to authenticated
using ((select auth.uid()) = user_id);

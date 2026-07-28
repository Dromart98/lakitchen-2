-- Phase 1.3B3: preserve owner-scoped food identity through shopping-list transfer.
alter table public.shopping_list_items
  add column food_catalog_item_id uuid null;

alter table public.shopping_list_items
  add constraint shopping_list_items_food_owner_fk
  foreign key (food_catalog_item_id, user_id)
  references public.food_catalog_items (id, user_id)
  on delete set null (food_catalog_item_id);

create index shopping_list_items_food_owner_idx
  on public.shopping_list_items (food_catalog_item_id, user_id);

-- Browser clients may edit shopping-list fields, but food identity remains
-- server-authoritative (the transfer RPC and rename trigger still manage it).
revoke insert, update on table public.shopping_list_items from authenticated;
grant insert (user_id, name, quantity, unit, is_purchased)
  on table public.shopping_list_items to authenticated;
grant update (name, quantity, unit, is_purchased)
  on table public.shopping_list_items to authenticated;

create or replace function public.clear_shopping_list_food_identity_on_rename()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.name is distinct from old.name then
    new.food_catalog_item_id := null;
  end if;
  return new;
end;
$$;

create trigger clear_shopping_list_food_identity_on_rename
before update of name on public.shopping_list_items
for each row execute function public.clear_shopping_list_food_identity_on_rename();

create or replace function public.transfer_purchased_shopping_item_to_inventory(
  p_item_id uuid,
  p_location text,
  p_expires_at date default null
)
returns uuid
language plpgsql
security invoker
set search_path = public, auth
as $$
declare
  v_user_id uuid := auth.uid();
  v_item record;
  v_inventory_item_id uuid;
  v_deleted_count integer;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  if p_location not in ('pantry', 'fridge', 'freezer') then raise exception 'Invalid inventory location'; end if;

  select id, name, quantity, unit, food_catalog_item_id
    into v_item
  from public.shopping_list_items
  where id = p_item_id and user_id = v_user_id and is_purchased = true
  for update;

  if not found then raise exception 'Shopping list item is not available for transfer'; end if;

  insert into public.inventory_items (
    user_id, name, quantity, unit, location, expires_at, food_catalog_item_id
  ) values (
    v_user_id, v_item.name, v_item.quantity, v_item.unit, p_location, p_expires_at,
    v_item.food_catalog_item_id
  ) returning id into v_inventory_item_id;

  delete from public.shopping_list_items
  where id = v_item.id and user_id = v_user_id;
  get diagnostics v_deleted_count = row_count;
  if v_deleted_count <> 1 then raise exception 'Shopping list item transfer could not be completed'; end if;

  return v_inventory_item_id;
end;
$$;

revoke execute on function public.transfer_purchased_shopping_item_to_inventory(uuid, text, date) from public, anon;
grant execute on function public.transfer_purchased_shopping_item_to_inventory(uuid, text, date) to authenticated;

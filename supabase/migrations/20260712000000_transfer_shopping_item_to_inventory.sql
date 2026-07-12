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
  current_user_id uuid;
  shopping_item record;
  created_inventory_item_id uuid;
  deleted_count integer;
begin
  current_user_id := auth.uid();

  if current_user_id is null then
    raise exception 'Authenticated user required'
      using errcode = '28000';
  end if;

  if p_location not in ('pantry', 'fridge', 'freezer') then
    raise exception 'Invalid inventory location'
      using errcode = '22023';
  end if;

  select id, name, quantity, unit
  into shopping_item
  from public.shopping_list_items
  where id = p_item_id
    and user_id = current_user_id
    and is_purchased = true
  for update;

  if not found then
    raise exception 'Purchased shopping list item not found'
      using errcode = 'P0002';
  end if;

  insert into public.inventory_items (user_id, name, quantity, unit, location, expires_at)
  values (current_user_id, shopping_item.name, shopping_item.quantity, shopping_item.unit, p_location, p_expires_at)
  returning id into created_inventory_item_id;

  delete from public.shopping_list_items
  where id = p_item_id
    and user_id = current_user_id;

  get diagnostics deleted_count = row_count;

  if deleted_count <> 1 then
    raise exception 'Purchased shopping list item could not be removed'
      using errcode = 'P0002';
  end if;

  return created_inventory_item_id;
end;
$$;

revoke all on function public.transfer_purchased_shopping_item_to_inventory(uuid, text, date) from public;
revoke all on function public.transfer_purchased_shopping_item_to_inventory(uuid, text, date) from anon;
grant execute on function public.transfer_purchased_shopping_item_to_inventory(uuid, text, date) to authenticated;

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
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if p_location not in ('pantry', 'fridge', 'freezer') then
    raise exception 'Invalid inventory location';
  end if;

  select id, name, quantity, unit
    into v_item
  from public.shopping_list_items
  where id = p_item_id
    and user_id = v_user_id
    and is_purchased = true
  for update;

  if not found then
    raise exception 'Shopping list item is not available for transfer';
  end if;

  insert into public.inventory_items (user_id, name, quantity, unit, location, expires_at)
  values (v_user_id, v_item.name, v_item.quantity, v_item.unit, p_location, p_expires_at)
  returning id into v_inventory_item_id;

  delete from public.shopping_list_items
  where id = v_item.id
    and user_id = v_user_id;

  get diagnostics v_deleted_count = row_count;

  if v_deleted_count <> 1 then
    raise exception 'Shopping list item transfer could not be completed';
  end if;

  return v_inventory_item_id;
end;
$$;

revoke execute on function public.transfer_purchased_shopping_item_to_inventory(uuid, text, date) from public;
revoke execute on function public.transfer_purchased_shopping_item_to_inventory(uuid, text, date) from anon;
grant execute on function public.transfer_purchased_shopping_item_to_inventory(uuid, text, date) to authenticated;

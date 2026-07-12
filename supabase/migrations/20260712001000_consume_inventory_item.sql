create or replace function public.consume_inventory_item(
  p_item_id uuid,
  p_quantity numeric
)
returns numeric
language plpgsql
security invoker
set search_path = public, auth
as $$
declare
  v_user_id uuid := auth.uid();
  v_current_quantity numeric;
  v_remaining_quantity numeric;
begin
  if v_user_id is null then
    raise exception using errcode = '28000', message = 'Authentication required';
  end if;

  if p_quantity is null or p_quantity <= 0 then
    raise exception using errcode = '22023', message = 'Quantity must be greater than zero';
  end if;

  select quantity
    into v_current_quantity
  from public.inventory_items
  where id = p_item_id
    and user_id = v_user_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Inventory item not found';
  end if;

  if p_quantity > v_current_quantity then
    raise exception using errcode = '22003', message = 'Quantity exceeds available stock';
  end if;

  v_remaining_quantity := v_current_quantity - p_quantity;

  if v_remaining_quantity = 0 then
    delete from public.inventory_items
    where id = p_item_id
      and user_id = v_user_id;
  else
    update public.inventory_items
    set quantity = v_remaining_quantity
    where id = p_item_id
      and user_id = v_user_id;
  end if;

  return v_remaining_quantity;
end;
$$;

revoke execute on function public.consume_inventory_item(uuid, numeric) from public;
revoke execute on function public.consume_inventory_item(uuid, numeric) from anon;
grant execute on function public.consume_inventory_item(uuid, numeric) to authenticated;

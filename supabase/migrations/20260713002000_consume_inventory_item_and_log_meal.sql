create or replace function public.consume_inventory_item_and_log_meal(
  p_item_id uuid,
  p_consumed_quantity numeric,
  p_meal_type text
)
returns numeric
language plpgsql
security invoker
set search_path = public, auth
as $$
declare
  v_user_id uuid := auth.uid();
  v_item public.inventory_items%rowtype;
  v_factor numeric;
  v_remaining_quantity numeric;
begin
  if v_user_id is null then
    raise exception using errcode = '28000', message = 'Authentication required';
  end if;

  if p_consumed_quantity is null
    or p_consumed_quantity = 'NaN'::numeric
    or p_consumed_quantity <= 0 then
    raise exception using errcode = '22023', message = 'Invalid consumed quantity';
  end if;

  if p_meal_type is null
    or p_meal_type not in ('breakfast', 'lunch', 'snack', 'dinner', 'other') then
    raise exception using errcode = '22023', message = 'Invalid meal type';
  end if;

  select *
    into v_item
  from public.inventory_items
  where id = p_item_id
    and user_id = v_user_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Inventory item not found';
  end if;

  if p_consumed_quantity > v_item.quantity then
    raise exception using errcode = '22003', message = 'Quantity exceeds available stock';
  end if;

  if v_item.calories is null
    or v_item.protein_g is null
    or v_item.carbs_g is null
    or v_item.fat_g is null
    or v_item.calories = 'NaN'::numeric
    or v_item.protein_g = 'NaN'::numeric
    or v_item.carbs_g = 'NaN'::numeric
    or v_item.fat_g = 'NaN'::numeric
    or v_item.calories < 0
    or v_item.protein_g < 0
    or v_item.carbs_g < 0
    or v_item.fat_g < 0 then
    raise exception using errcode = '22023', message = 'Incomplete inventory nutrition';
  end if;

  if v_item.nutrition_basis = 'per_100g' and v_item.unit = 'g' then
    v_factor := p_consumed_quantity / 100;
  elsif v_item.nutrition_basis = 'per_100g' and v_item.unit = 'kg' then
    v_factor := p_consumed_quantity * 10;
  elsif v_item.nutrition_basis = 'per_unit' and v_item.unit = 'ud' then
    v_factor := p_consumed_quantity;
  else
    raise exception using errcode = '22023', message = 'Incompatible inventory nutrition unit';
  end if;

  insert into public.daily_meal_logs (
    user_id,
    name,
    meal_type,
    calories,
    protein_g,
    carbs_g,
    fat_g,
    consumed_on
  ) values (
    v_user_id,
    v_item.name,
    p_meal_type,
    round(v_item.calories * v_factor)::integer,
    round(v_item.protein_g * v_factor)::integer,
    round(v_item.carbs_g * v_factor)::integer,
    round(v_item.fat_g * v_factor)::integer,
    current_date
  );

  v_remaining_quantity := v_item.quantity - p_consumed_quantity;

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

revoke execute on function public.consume_inventory_item_and_log_meal(uuid, numeric, text) from public;
revoke execute on function public.consume_inventory_item_and_log_meal(uuid, numeric, text) from anon;
grant execute on function public.consume_inventory_item_and_log_meal(uuid, numeric, text) to authenticated;
